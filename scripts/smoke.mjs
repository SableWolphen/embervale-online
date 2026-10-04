import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const data = await mkdtemp(join(tmpdir(), 'embervale-test-'));
const port = 3187;
let server;
let output = '';
async function start() {
  server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: '', DATA_DIR: data, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', value => { output += value; });
  server.stderr.on('data', value => { output += value; });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`http://localhost:${port}/healthz`)).ok) return; } catch {}
    if (server.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server did not start');
}
async function stop() {
  const exited = new Promise(resolve => server.once('exit', resolve));
  server.kill();
  await exited;
}
async function joinPlayer(name, token = '') {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(String(raw))));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ type: 'join', name, token }));
  for (let i = 0; i < 100; i++) {
    if (messages.some(message => message.type === 'state') && messages.some(message => message.type === 'zone')) return { ws, messages };
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Player did not join');
}
try {
  await start();
  assert.match(await (await fetch(`http://localhost:${port}`)).text(), /Embervale/);
  const first = await joinPlayer('SmokeOne');
  const token = first.messages.find(message => message.type === 'joined').token;
  const player = first.messages.find(message => message.type === 'state').player;
  assert.equal(player.questBook.length, 30);
  assert.notEqual(player.token, token, 'Public player ID must not reveal reconnect credential');
  const second = await joinPlayer('SmokeTwo');
  await new Promise(resolve => setTimeout(resolve, 250));
  const snapshots = second.messages.filter(message => message.type === 'world');
  assert(snapshots.some(message => message.players.length === 2), 'Both players share the world');
  first.ws.close(); second.ws.close();
  await new Promise(resolve => setTimeout(resolve, 700));
  await stop(); await start();
  const returning = await joinPlayer('SmokeOne', token);
  assert.equal(returning.messages.find(message => message.type === 'state').player.token, player.token);
  assert.equal(returning.messages.find(message => message.type === 'state').player.questBook.length, 30);
  returning.ws.close();
  console.log('PASS: HTTP, health, two-player WebSocket join, 30 quests, credential privacy, saved-character restart.');
} finally {
  if (server?.exitCode === null) await stop();
  await rm(data, { recursive: true, force: true });
}
