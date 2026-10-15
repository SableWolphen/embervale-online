import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,extname,resolve} from 'node:path';
import {randomUUID,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
const ROOT=resolve('public'), DBFILE=resolve('data/dating.json'), PORT=Number(process.env.PORT||3000);
let db={users:[],likes:[],messages:[],blocks:[],reports:[]};let queue=Promise.resolve();
try{db={...db,...JSON.parse(await readFile(DBFILE,'utf8'))}}catch(e){if(e.code!=='ENOENT')throw e}
const save=()=>{queue=queue.catch(()=>{}).then(async()=>{await mkdir(resolve('data'),{recursive:true});await writeFile(DBFILE,JSON.stringify(db));});return queue};
const sessions=new Map(), attempts=new Map();
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))};
const clean=(x,max=150)=>String(x??'').trim().slice(0,max);
const hash=p=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex')};
const verify=(p,v)=>{try{const [salt,h]=v.split(':');return timingSafeEqual(scryptSync(p,salt,64),Buffer.from(h,'hex'))}catch{return false}};
const publicUser=u=>({id:u.id,name:u.name,age:u.age,city:u.city,bio:u.bio,interests:u.interests,lookingFor:u.lookingFor,photo:u.photo,pronouns:u.pronouns});
const tokenUser=req=>{const token=(req.headers.authorization||'').replace(/^Bearer /,'');const s=sessions.get(token);if(!s||s.exp<Date.now()){sessions.delete(token);return null}return db.users.find(u=>u.id===s.id)};
const parse=async req=>{let s='';for await(const chunk of req){s+=chunk;if(s.length>20000)throw Error('Request too large')}return JSON.parse(s||'{}')};
const pair=(a,b)=>[a,b].sort().join(':');
const blocked=(a,b)=>db.blocks.some(x=>(x.by===a&&x.target===b)||(x.by===b&&x.target===a));
const mutual=(a,b)=>db.likes.some(l=>l.from===a&&l.to===b)&&db.likes.some(l=>l.from===b&&l.to===a);
const ipLimit=req=>{const key=req.socket.remoteAddress||'local',now=Date.now(),item=attempts.get(key)||{n:0,until:now+60000};if(item.until<now){item.n=0;item.until=now+60000}item.n++;attempts.set(key,item);return item.n>100};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{
  if(ipLimit(req))return json(res,429,{error:'Too many requests. Try again shortly.'});
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
    const method=req.method,route=url.pathname;
    if(method==='POST'&&route==='/api/register'){
      const b=await parse(req),email=clean(b.email,200).toLowerCase(),name=clean(b.name,40),age=Number(b.age),password=String(b.password||'');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||!Number.isInteger(age)||age<18||age>110||password.length<10)return json(res,400,{error:'Use a valid email, name, age 18+, and a password of at least 10 characters.'});
      if(db.users.some(u=>u.email===email))return json(res,409,{error:'Email already registered.'});
      const u={id:randomUUID(),email,password:hash(password),name,age,city:'',bio:'',interests:[],lookingFor:'Connection',photo:'',pronouns:'',created:Date.now()};
      db.users.push(u);await save();const token=randomBytes(32).toString('hex');sessions.set(token,{id:u.id,exp:Date.now()+86400000});return json(res,201,{token,user:publicUser(u)});
    }
    if(method==='POST'&&route==='/api/login'){
      const b=await parse(req),u=db.users.find(u=>u.email===clean(b.email,200).toLowerCase());
      if(!u||!verify(String(b.password||''),u.password))return json(res,401,{error:'Incorrect email or password.'});
      const token=randomBytes(32).toString('hex');sessions.set(token,{id:u.id,exp:Date.now()+86400000});return json(res,200,{token,user:publicUser(u)});
    }
    const me=tokenUser(req);if(!me)return json(res,401,{error:'Please sign in.'});
    if(method==='POST'&&route==='/api/logout'){sessions.delete((req.headers.authorization||'').slice(7));return json(res,200,{ok:true})}
    if(method==='GET'&&route==='/api/me')return json(res,200,{user:publicUser(me)});
    if(method==='PUT'&&route==='/api/me'){
      const b=await parse(req);for(const [field,max] of [['name',40],['city',80],['bio',600],['lookingFor',80],['pronouns',40]])if(field in b)me[field]=clean(b[field],max);
      if(Array.isArray(b.interests))me.interests=b.interests.slice(0,12).map(i=>clean(i,30)).filter(Boolean);
      if('photo' in b){const p=clean(b.photo,500);if(p&&!/^https:\/\/[^ ]+$/i.test(p))return json(res,400,{error:'Photo must use an HTTPS URL.'});me.photo=p}
      if(!me.name)return json(res,400,{error:'Name is required.'});await save();return json(res,200,{user:publicUser(me)});
    }
    if(method==='GET'&&route==='/api/discover'){
      const skip=new Set([me.id,...db.likes.filter(l=>l.from===me.id).map(l=>l.to)]);
      return json(res,200,{profiles:db.users.filter(u=>!skip.has(u.id)&&!blocked(me.id,u.id)).map(publicUser).slice(0,50)});
    }
    if(method==='POST'&&route==='/api/like'){
      const b=await parse(req),target=db.users.find(u=>u.id===b.id);
      if(!target||target.id===me.id||blocked(me.id,target.id))return json(res,400,{error:'Profile unavailable.'});
      if(!db.likes.some(l=>l.from===me.id&&l.to===target.id))db.likes.push({from:me.id,to:target.id,at:Date.now()});
      await save();return json(res,200,{matched:mutual(me.id,target.id)});
    }
    if(method==='GET'&&route==='/api/matches')return json(res,200,{matches:db.users.filter(u=>u.id!==me.id&&!blocked(me.id,u.id)&&mutual(me.id,u.id)).map(publicUser)});
    if(method==='GET'&&route==='/api/messages'){
      const other=clean(url.searchParams.get('with'),80);
      if(!mutual(me.id,other)||blocked(me.id,other))return json(res,403,{error:'Messages are only available to mutual matches.'});
      return json(res,200,{messages:db.messages.filter(m=>pair(m.from,m.to)===pair(me.id,other)).slice(-100)});
    }
    if(method==='POST'&&route==='/api/messages'){
      const b=await parse(req),to=clean(b.to,80),body=clean(b.body,1500);
      if(!body)return json(res,400,{error:'Message cannot be empty.'});
      if(!mutual(me.id,to)||blocked(me.id,to))return json(res,403,{error:'Messages are only available to mutual matches.'});
      const recent=db.messages.filter(m=>m.from===me.id&&m.at>Date.now()-60000).length;
      if(recent>=20)return json(res,429,{error:'Please slow down.'});
      const m={id:randomUUID(),from:me.id,to,body,at:Date.now()};db.messages.push(m);await save();return json(res,201,{message:m});
    }
    if(method==='POST'&&route==='/api/block'){
      const b=await parse(req),target=clean(b.id,80);
      if(target===me.id||!db.users.some(u=>u.id===target))return json(res,400,{error:'Invalid profile.'});
      if(!db.blocks.some(x=>x.by===me.id&&x.target===target))db.blocks.push({by:me.id,target,at:Date.now()});
      await save();return json(res,200,{ok:true});
    }
    if(method==='POST'&&route==='/api/report'){
      const b=await parse(req),target=clean(b.id,80),reason=clean(b.reason,300);
      if(!reason||target===me.id||!db.users.some(u=>u.id===target))return json(res,400,{error:'Choose a profile and provide a reason.'});
      db.reports.push({id:randomUUID(),by:me.id,target,reason,at:Date.now()});await save();return json(res,200,{ok:true});
    }
    return json(res,404,{error:'Not found.'});
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed.'});
  const route=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,'');
  const path=resolve(ROOT,route);if(!path.startsWith(ROOT+'/')&&path!==ROOT)return json(res,403,{error:'Forbidden'});
  const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'"});res.end(req.method==='HEAD'?undefined:data);
}catch(e){if(e.code==='ENOENT')return json(res,404,{error:'Not found.'});console.error(e);json(res,500,{error:'Unexpected server error.'})}});
server.listen(PORT,()=>console.log('Embervale dating on '+PORT));
process.on('SIGTERM',async()=>{await queue;server.close()});
