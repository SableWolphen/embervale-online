import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,extname,resolve} from 'node:path';
import {randomUUID,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
const ROOT=resolve('public'), DBFILE=resolve('data/dating.json'), PORT=Number(process.env.PORT||3000);
let db={users:[],likes:[],messages:[],blocks:[],reports:[],passes:[],plans:[],checkins:[],relationships:[],reactions:[],notes:[],events:[]};let queue=Promise.resolve();
try{db={...db,...JSON.parse(await readFile(DBFILE,'utf8'))}}catch(e){if(e.code!=='ENOENT')throw e}
const save=()=>{queue=queue.catch(()=>{}).then(async()=>{await mkdir(resolve('data'),{recursive:true});await writeFile(DBFILE,JSON.stringify(db));});return queue};
const sessions=new Map(), attempts=new Map();
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))};
const clean=(x,max=150)=>String(x??'').trim().slice(0,max);
const hash=p=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex')};
const verify=(p,v)=>{try{const [salt,h]=v.split(':');return timingSafeEqual(scryptSync(p,salt,64),Buffer.from(h,'hex'))}catch{return false}};
const publicUser=u=>({id:u.id,name:u.name,age:u.age,city:u.city,bio:u.bio,interests:u.interests,lookingFor:u.lookingFor,photo:u.photo,pronouns:u.pronouns,voice:u.voice||'',prompts:u.prompts||[],mode:u.mode||'dating',verified:false,vibes:u.vibes||[],quiz:u.quiz||{},dealbreakers:u.dealbreakers||[],readReceipts:!!u.readReceipts,activeVisible:!!u.activeVisible,eventsVisible:u.eventsVisible!==false});
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
      const b=await parse(req);for(const [field,max] of [['name',40],['city',80],['bio',600],['lookingFor',80],['pronouns',40],['mode',20]])if(field in b)me[field]=clean(b[field],max);
      if(Array.isArray(b.vibes))me.vibes=b.vibes.slice(0,8).map(x=>clean(x,32));
      if(Array.isArray(b.dealbreakers))me.dealbreakers=b.dealbreakers.slice(0,12).map(x=>clean(x,48));
      if(b.quiz&&typeof b.quiz==='object'){me.quiz=Object.fromEntries(['communication','weekend','affection','social','planning'].map(k=>[k,clean(b.quiz[k],40)]));}
      if('readReceipts' in b)me.readReceipts=!!b.readReceipts;
      if('activeVisible' in b)me.activeVisible=!!b.activeVisible;
      if('eventsVisible' in b)me.eventsVisible=!!b.eventsVisible;
      if(Array.isArray(b.prompts))me.prompts=b.prompts.slice(0,3).map(x=>clean(x,180));
      if('voice' in b){const v=clean(b.voice,500);if(v&&!/^https:\/\/[^ ]+$/i.test(v))return json(res,400,{error:'Voice introduction must be an HTTPS link.'});me.voice=v}
      if(b.preferences&&typeof b.preferences==='object'){const p=b.preferences;me.preferences={minAge:Math.max(18,Math.min(110,Number(p.minAge)||18)),maxAge:Math.max(18,Math.min(110,Number(p.maxAge)||110)),intent:clean(p.intent,80),slow:!!p.slow,hidden:!!p.hidden};}
      if(Array.isArray(b.interests))me.interests=b.interests.slice(0,12).map(i=>clean(i,30)).filter(Boolean);
      if('photo' in b){const p=clean(b.photo,500);if(p&&!/^https:\/\/[^ ]+$/i.test(p))return json(res,400,{error:'Photo must use an HTTPS URL.'});me.photo=p}
      if(!me.name)return json(res,400,{error:'Name is required.'});await save();return json(res,200,{user:publicUser(me)});
    }
    if(method==='GET'&&route==='/api/discover'){
      const vibe=clean(url.searchParams.get('vibe'),32);
      const skip=new Set([me.id,...db.likes.filter(l=>l.from===me.id).map(l=>l.to),...db.passes.filter(x=>x.from===me.id && Date.now()-x.at<30*86400000).map(x=>x.to)]);
      return json(res,200,{profiles:db.users.filter(u=>!skip.has(u.id)&&!blocked(me.id,u.id)&&u.mode!=='relationship'&&!u.preferences?.hidden&&(!vibe||(u.vibes||[]).includes(vibe))&&u.age>=(me.preferences?.minAge||18)&&u.age<=(me.preferences?.maxAge||110)&&(!me.preferences?.intent||u.lookingFor===me.preferences.intent)).sort((a,b)=>{const common=u=>u.interests.filter(i=>me.interests.some(x=>x.toLowerCase()===i.toLowerCase())).length;return common(b)-common(a)}).map(u=>({...publicUser(u),sharedInterests:u.interests.filter(i=>me.interests.some(x=>x.toLowerCase()===i.toLowerCase())),sharedVibes:(u.vibes||[]).filter(v=>(me.vibes||[]).includes(v)),sharedQuiz:Object.keys(me.quiz||{}).filter(k=>me.quiz[k]&&me.quiz[k]===u.quiz?.[k])})).slice(0,me.preferences?.slow?5:50)});
    }
    if(method==='POST'&&route==='/api/pass'){const b=await parse(req),to=clean(b.id,80);if(!db.users.some(u=>u.id===to)||to===me.id)return json(res,400,{error:'Profile unavailable'});db.passes.push({from:me.id,to,at:Date.now()});await save();return json(res,200,{ok:true})}
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
      const messages=db.messages.filter(m=>pair(m.from,m.to)===pair(me.id,other)).slice(-100);return json(res,200,{messages});
    }
    if(method==='POST'&&route==='/api/messages'){
      const b=await parse(req),to=clean(b.to,80),body=clean(b.body,1500);
      if(!body)return json(res,400,{error:'Message cannot be empty.'});
      if(!mutual(me.id,to)||blocked(me.id,to))return json(res,403,{error:'Messages are only available to mutual matches.'});
      const recent=db.messages.filter(m=>m.from===me.id&&m.at>Date.now()-60000).length;
      if(recent>=20)return json(res,429,{error:'Please slow down.'});
      const m={id:randomUUID(),from:me.id,to,body,at:Date.now()};db.messages.push(m);await save();return json(res,201,{message:m});
    }
    if(method==='GET'&&route==='/api/conversations'){
      return json(res,200,{conversations:db.users.filter(u=>u.id!==me.id&&!blocked(me.id,u.id)&&mutual(me.id,u.id)).map(u=>{const msgs=db.messages.filter(m=>pair(m.from,m.to)===pair(me.id,u.id));const last=msgs[msgs.length-1];return {user:publicUser(u),last:last?{body:last.body,at:last.at,from:last.from}:null}}).sort((a,b)=>(b.last?.at||0)-(a.last?.at||0))});
    }
    if(method==='GET'&&route==='/api/preferences')return json(res,200,{preferences:me.preferences||{minAge:18,maxAge:110,intent:'',slow:false,hidden:false}});
    if(method==='GET'&&route==='/api/plans')return json(res,200,{plans:db.plans.filter(p=>(p.from===me.id||p.to===me.id)&&!blocked(p.from,p.to))});
    if(method==='POST'&&route==='/api/plans'){
      const b=await parse(req),to=clean(b.to,80),title=clean(b.title,100),place=clean(b.place,140),when=clean(b.when,80);
      if(!mutual(me.id,to)||blocked(me.id,to)||!title||!when)return json(res,400,{error:'Choose a mutual match, date and activity.'});
      const p={id:randomUUID(),from:me.id,to,title,place,when,status:'proposed',at:Date.now()};db.plans.push(p);await save();return json(res,201,{plan:p});
    }
    if(method==='POST'&&route==='/api/plans/respond'){
      const b=await parse(req),p=db.plans.find(x=>x.id===b.id&&x.to===me.id&&!blocked(x.from,x.to));
      if(!p||p.status!=='proposed'||!['accepted','declined'].includes(b.status))return json(res,400,{error:'Plan unavailable'});
      p.status=b.status;await save();return json(res,200,{plan:p});
    }
    if(method==='GET'&&route==='/api/checkins')return json(res,200,{checkins:db.checkins.filter(x=>x.by===me.id)});
    if(method==='POST'&&route==='/api/checkins'){
      const b=await parse(req),message=clean(b.message,250),when=clean(b.when,80);
      if(!when)return json(res,400,{error:'Choose a check-in time'});
      const c={id:randomUUID(),by:me.id,when,message,done:false,at:Date.now()};db.checkins.push(c);await save();return json(res,201,{checkin:c});
    }
    if(method==='POST'&&route==='/api/checkins/done'){
      const b=await parse(req),c=db.checkins.find(x=>x.id===b.id&&x.by===me.id);
      if(!c)return json(res,404,{error:'Check-in unavailable'});c.done=true;await save();return json(res,200,{ok:true});
    }
    if(method==='POST'&&route==='/api/relationship'){
      const b=await parse(req),to=clean(b.to,80);
      if(!mutual(me.id,to)||blocked(me.id,to))return json(res,400,{error:'Only mutual matches can receive this invitation.'});
      if(db.relationships.some(x=>x.from===me.id&&x.to===to&&x.status==='pending'))return json(res,409,{error:'Already invited'});
      db.relationships.push({id:randomUUID(),from:me.id,to,status:'pending',at:Date.now()});await save();return json(res,201,{ok:true});
    }
    if(method==='GET'&&route==='/api/relationships')return json(res,200,{invitations:db.relationships.filter(x=>x.to===me.id||x.from===me.id)});
    if(method==='POST'&&route==='/api/relationship/respond'){
      const b=await parse(req),x=db.relationships.find(x=>x.id===b.id&&x.to===me.id&&x.status==='pending');
      if(!x||!['accepted','declined'].includes(b.status))return json(res,400,{error:'Invitation unavailable'});
      x.status=b.status;if(b.status==='accepted'){me.mode='relationship';const other=db.users.find(u=>u.id===x.from);if(other)other.mode='relationship'}await save();return json(res,200,{ok:true});
    }
    if(method==='POST'&&route==='/api/relationship/leave'){me.mode='dating';for(const x of db.relationships.filter(x=>x.status==='accepted'&&(x.from===me.id||x.to===me.id)))x.status='ended';await save();return json(res,200,{ok:true})}
    if(method==='GET'&&route==='/api/likes')return json(res,200,{likes:db.users.filter(u=>u.id!==me.id&&!blocked(me.id,u.id)&&db.likes.some(l=>l.from===u.id&&l.to===me.id)).map(publicUser)});
    if(method==='POST'&&route==='/api/unmatch'){const b=await parse(req),other=clean(b.id,80);db.likes=db.likes.filter(l=>!((l.from===me.id&&l.to===other)||(l.from===other&&l.to===me.id)));await save();return json(res,200,{ok:true})}
    if(method==='POST'&&route==='/api/reactions'){const b=await parse(req),other=clean(b.to,80),messageId=clean(b.messageId,80),emoji=clean(b.emoji,8);if(!['❤️','😂','👍','✨'].includes(emoji)||!mutual(me.id,other)||blocked(me.id,other)||!db.messages.some(m=>m.id===messageId&&pair(m.from,m.to)===pair(me.id,other)))return json(res,400,{error:'Reaction unavailable'});db.reactions=db.reactions.filter(x=>!(x.by===me.id&&x.messageId===messageId));db.reactions.push({by:me.id,messageId,emoji});await save();return json(res,200,{ok:true})}
    if(method==='GET'&&route==='/api/reactions'){const other=clean(url.searchParams.get('with'),80);if(!mutual(me.id,other)||blocked(me.id,other))return json(res,403,{error:'Not matched'});const ids=new Set(db.messages.filter(m=>pair(m.from,m.to)===pair(me.id,other)).map(m=>m.id));return json(res,200,{reactions:db.reactions.filter(r=>ids.has(r.messageId))})}
    if(method==='GET'&&route==='/api/notes')return json(res,200,{notes:db.notes.filter(n=>n.by===me.id)});
    if(method==='PUT'&&route==='/api/notes'){const b=await parse(req),to=clean(b.to,80),body=clean(b.body,500);if(!mutual(me.id,to)||blocked(me.id,to))return json(res,403,{error:'Not matched'});db.notes=db.notes.filter(n=>!(n.by===me.id&&n.to===to));if(body)db.notes.push({by:me.id,to,body});await save();return json(res,200,{ok:true})}
    if(method==='GET'&&route==='/api/notifications'){const incoming=db.likes.filter(l=>l.to===me.id&&!blocked(me.id,l.from)).length,pending=db.relationships.filter(x=>x.to===me.id&&x.status==='pending').length,plans=db.plans.filter(p=>p.to===me.id&&p.status==='proposed').length;return json(res,200,{incomingLikes:incoming,pendingInvites:pending,dateProposals:plans})}
    if(method==='GET'&&route==='/api/events')return json(res,200,{events:db.events.filter(e=>e.owner===me.id)});
    if(method==='POST'&&route==='/api/events'){const b=await parse(req),title=clean(b.title,100),when=clean(b.when,80),place=clean(b.place,120);if(!title||!when)return json(res,400,{error:'Title and time required'});const e={id:randomUUID(),owner:me.id,title,when,place,at:Date.now()};db.events.push(e);await save();return json(res,201,{event:e})}
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
