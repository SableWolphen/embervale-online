import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const directory = process.env.DATA_DIR || join(process.cwd(), 'data');
const filename = join(directory, 'world.json');
const pool = process.env.DATABASE_URL ? new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000,
}) : null;
if (process.env.NODE_ENV === 'production' && !pool) {
  throw new Error('DATABASE_URL is required in production to preserve character progress.');
}
pool?.on('error', error => console.error('Database connection error:', error.code || error.name));
let queue = Promise.resolve();
let previous = null;

export async function loadSavedWorld() {
  if (pool) {
    await pool.query('CREATE TABLE IF NOT EXISTS embervale_world (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
    const result = await pool.query('SELECT data FROM embervale_world WHERE id = 1');
    return result.rows[0]?.data || { players: [] };
  }
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { players: [] }; throw error; }
}

export function persistWorld(data) {
  const serialized = JSON.stringify(data);
  queue = queue.catch(() => {}).then(async () => {
    if (serialized === previous) return;
    if (pool) {
      await pool.query('INSERT INTO embervale_world (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [serialized]);
    } else {
      await mkdir(directory, { recursive: true });
      await writeFile(filename + '.tmp', serialized, 'utf8');
      await rename(filename + '.tmp', filename);
    }
    previous = serialized;
  });
  return queue;
}

export async function closeStorage() { await queue; await pool?.end(); }
