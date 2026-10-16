import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const root=resolve(),dir=await mkdtemp(join(tmpdir(),'embervale-test-'));await mkdir(join(dir,'public'));await cp(join(root,'public','index.html'),join(dir,'public','index.html'));
const port=20000+Math.floor(Math.random()*25000);
const child=spawn(process.execPath,[join(root,'dating-server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port)},stdio:'ignore'});
async function request(path,method='GET',body,token){const r=await fetch('http://127.0.0.1:'+port+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()}}
try{
 let ready=false;for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/');if(r.status===200){ready=true;break}}catch{}await delay(80)}
 assert.ok(ready,'server starts');
 await test('accounts, mutual likes, filters, planning and safety',async()=>{
 const x=await request('/register','POST',{email:'alex@example.test',password:'Password12345!',name:'Alex',age:31});
 const y=await request('/register','POST',{email:'sam@example.test',password:'Password12345!',name:'Sam',age:34});
 assert.equal(x.status,201);assert.equal(y.status,201);
 const a=x.token,b=y.token;
 assert.equal((await request('/me','PUT',{interests:['Music','Hiking'],prompts:['Best weekend?'],voice:'https://example.org/intro.mp3',preferences:{minAge:30,maxAge:40,slow:true,hidden:false}},a)).status,200);
 let discovery=await request('/discover','GET',null,a);assert.equal(discovery.profiles.length,1);assert.equal(discovery.profiles[0].id,y.user.id);
 assert.equal((await request('/messages','POST',{to:y.user.id,body:'Hello'},a)).status,403);
 assert.equal((await request('/like','POST',{id:y.user.id},a)).matched,false);
 assert.equal((await request('/like','POST',{id:x.user.id},b)).matched,true);
 assert.equal((await request('/messages','POST',{to:y.user.id,body:'Hi!'},a)).status,201);
 assert.equal((await request('/messages?with='+y.user.id,'GET',null,a)).messages.length,1);
 const inbox=await request('/conversations','GET',null,a);assert.equal(inbox.status,200);assert.equal(inbox.conversations[0].user.id,y.user.id);assert.equal(inbox.conversations[0].last.body,'Hi!');
 const p=await request('/plans','POST',{to:y.user.id,title:'Coffee',place:'Cafe',when:'2027-01-01T18:00'},a);assert.equal(p.status,201);
 assert.equal((await request('/plans/respond','POST',{id:p.plan.id,status:'accepted'},b)).status,200);
 assert.equal((await request('/plans/respond','POST',{id:p.plan.id,status:'declined'},a)).status,400);
 const c=await request('/checkins','POST',{when:'2027-01-01T20:00',message:'Text friend'},a);assert.equal(c.status,201);
 assert.equal((await request('/checkins/done','POST',{id:c.checkin.id},a)).status,200);
 assert.equal((await request('/relationship','POST',{to:y.user.id},a)).status,201);
 const invite=(await request('/relationships','GET',null,b)).invitations[0];assert.equal((await request('/relationship/respond','POST',{id:invite.id,status:'accepted'},b)).status,200);
 assert.equal((await request('/me','GET',null,a)).user.mode,'relationship');
 assert.equal((await request('/relationship/leave','POST',{},a)).status,200);
 assert.equal((await request('/block','POST',{id:x.user.id},b)).status,200);
 assert.equal((await request('/messages','POST',{to:y.user.id,body:'blocked'},a)).status,403);
 });
}finally{child.kill('SIGTERM');await delay(100);await rm(dir,{recursive:true,force:true})}