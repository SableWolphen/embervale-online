(()=>{
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const TOKEN_KEY='embervale-online-token-v3', NAME_KEY='embervale-online-name-v3';
const SKILLS={combat:['⚔️','Combat'],wood:['🪓','Woodcutting'],mine:['⛏️','Mining'],fish:['🎣','Fishing'],gather:['🌿','Gathering'],smith:['🔥','Smithing'],cook:['🍳','Cooking'],fletch:['🏹','Fletching']};
const ITEM_META={logs:['🪵','Logs'],copper:['🪨','Copper Ore'],rawFish:['🐟','Raw Fish'],herbs:['🌿','Herbs'],bars:['🔥','Bronze Bars'],food:['🍗','Cooked Food'],moon:['💎','Moonstone']};
const SHIRTS=['#587cc8','#a55f79','#5e9c78','#9c724f','#745f9e','#b86f4c'];
const canvas=$('#gameCanvas'),ctx=canvas.getContext('2d');
const heroCanvas=$('#heroCanvas'),hctx=heroCanvas.getContext('2d');
let ws=null, joined=false, me=null, zone=null, staticNodes=[], world={players:[],nodes:[],monsters:[]}, chat=[], events=[];
let toastTimer=null, selected=null, clickTarget=null, pendingInteract=null, lastMoveSend=0, activeModal=null;
let keys=new Set(), mobileDir={x:0,y:0}, camera={x:0,y:0}, particles=[], lastFrame=performance.now(), reconnectTimer=null;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const xpNeeded=lv=>Math.round(100*Math.pow(1.28,lv-1));
const send=o=>{if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(o))};
function toast(text){if(!text)return;const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2100)}
function log(text){if(!text)return;events.unshift({text,time:Date.now()});events=events.slice(0,16);renderEvents()}
function setNet(ok){const el=$('#netStatus');el.classList.toggle('online',ok);el.classList.toggle('offline',!ok);el.textContent=ok?'● Connected':'● Reconnecting'}

function connect(){
  clearTimeout(reconnectTimer);const proto=location.protocol==='https:'?'wss:':'ws:';ws=new WebSocket(`${proto}//${location.host}`);
  ws.addEventListener('open',()=>{setNet(true);const token=localStorage.getItem(TOKEN_KEY),name=localStorage.getItem(NAME_KEY);if(token&&name)send({type:'join',token,name})});
  ws.addEventListener('close',()=>{setNet(false);joined=false;reconnectTimer=setTimeout(connect,1500)});
  ws.addEventListener('message',ev=>{let m;try{m=JSON.parse(ev.data)}catch{return}
    if(m.type==='joined'){localStorage.setItem(TOKEN_KEY,m.token);joined=true;$('#joinPanel').classList.add('hidden');$('#game').classList.remove('hidden');$('#viewport').focus({preventScroll:true})}
    if(m.type==='state'){me=m.player;if(m.message){toast(m.message);log(m.message)}if(m.fx)addFx(m.fx);if(m.panel)openPanel(m.panel);renderUI()}
    if(m.type==='zone'){zone=m.zone;staticNodes=m.nodes||[];selected=null;clickTarget=null;pendingInteract=null;$('#zoneName').textContent=zone.name;$('#zoneSubtitle').textContent=zone.subtitle;renderUI()}
    if(m.type==='world'){if(!zone||m.zone!==zone.id)return;world=m;renderUI(false)}
    if(m.type==='chatHistory'){chat=m.chat||[];renderChat()}
    if(m.type==='chat'){chat.push(m.message);chat=chat.slice(-80);renderChat()}
    if(m.type==='event'){if(zone&&m.zone===zone.id){log(m.message);if(m.x!=null)addFx({x:m.x,y:m.y,kind:m.kind||'event'})}}
    if(m.type==='error')toast(m.message);
  });
}

function addFx(fx){
  const text=fx.damage?`-${fx.damage}`:fx.kind==='defeat'?'✦':fx.kind==='tree'?'🪵':fx.kind==='rock'?'🪨':fx.kind==='fish'?'🐟':fx.kind==='herb'?'🌿':'✦';
  particles.push({x:fx.x||me?.x||0,y:fx.y||me?.y||0,text,born:performance.now(),life:900});
}

function renderUI(full=true){
  if(!me)return;
  $('#playerName').textContent=me.name;$('#heroName').textContent=me.name;$('#coins').textContent=me.coins;$('#hp').textContent=me.hp;$('#maxHp').textContent=me.maxHp;$('#totalLevel').textContent=me.total;$('#skillTotal').textContent=me.total;$('#foodQuick').textContent=me.inv.food;
  $('#weaponName').textContent=me.gear.weapon==='moon'?'Moonstone Blade':me.gear.weapon==='bronze'?'Bronze Sword':me.gear.weapon==='oakbow'?'Oak Shortbow':'Rusty Sword';
  $('#armorName').textContent=me.gear.armor==='bronze'?'Bronze Armor':'Traveler Clothes';
  $('#heroStats').textContent=`Combat ${me.skills.combat.lv} · Total ${me.total}`;
  $('#avatarChip').textContent=me.gear.pet?'🐾':'⚔️';
  $('#onlineCount').textContent=world.players.length;const nearby=world.players.filter(p=>me&&p.zone===me.zone);$('#nearbyCount').textContent=`${nearby.length} nearby`;$('#playerCountText').textContent=nearby.length;
  if(full){renderBag();renderSkills();renderQuests();renderPeople();renderHero();renderSwatches()}
  else renderPeople();
  refreshTarget();
}
function renderBag(){if(!me)return;$('#bagGrid').innerHTML=Object.entries(ITEM_META).map(([k,[icon,label]])=>`<div class="item-card"><div class="icon">${icon}</div><small>${label}</small><strong>${me.inv[k]??0}</strong></div>`).join('')+(me.gear.pet?'<div class="item-card"><div class="icon">🐾</div><small>Companion</small><strong>Ember Fox</strong></div>':'')}
function renderSkills(){if(!me)return;$('#skillsGrid').innerHTML=Object.entries(me.skills).map(([k,s])=>{const n=xpNeeded(s.lv),pct=clamp(s.xp/n*100,0,100);return `<div class="skill-card"><div class="skill-row"><strong>${SKILLS[k][0]} ${SKILLS[k][1]}</strong><strong>Lv. ${s.lv}</strong></div><small>${s.xp} / ${n} XP</small><div class="bar"><span style="width:${pct}%"></span></div></div>`}).join('')}
function renderQuests(){
  if(!me)return;
  const book=Array.isArray(me.questBook)?me.questBook:[];
  const done=book.filter(q=>q.done).length;
  const regions=['Greenmeadow','Iron Hills','Ashen Ruins'];
  const blocks=regions.map(region=>{
    const qs=book.filter(q=>q.region===region);if(!qs.length)return '';
    const completed=qs.filter(q=>q.done).length;
    return `<div class="quest-region"><div class="quest-region-head"><div><strong>${esc(region)}</strong><small>${completed}/${qs.length} complete</small></div><span>${region==='Greenmeadow'?'🌿':region==='Iron Hills'?'⛰️':'🔥'}</span></div>${qs.map(q=>`<article class="quest-card ${q.done?'done':q.ready?'ready':''}"><div class="quest-kicker">${esc(q.type)} · ${q.done?'Complete':q.stage===0?'Available':q.ready?'Ready to turn in':'In progress'}</div><h3>${esc(q.icon||'📜')} ${esc(q.title)}</h3><p><strong>${esc(q.chapter||'Quest')}</strong><br>${esc(q.description||'')}</p><small>${esc(q.status||'')}</small></article>`).join('')}</div>`;
  }).join('');
  $('#questList').innerHTML=`<div class="quest-summary"><div><strong>${done} / ${book.length}</strong><span>quests complete</span></div><div class="quest-progress"><span style="width:${book.length?Math.round(done/book.length*100):0}%"></span></div></div>${blocks}`;
}
function renderPeople(){if(!me)return;const nearby=world.players.filter(p=>p.zone===me.zone);$('#nearbyPlayers').innerHTML=nearby.length?nearby.map(p=>`<div class="person-row"><div><strong>${p.token===me.token?'★ ':''}${esc(p.name)}</strong><br><small>Combat ${p.combat} · Total ${p.total}</small></div><small>❤️ ${p.hp}/${p.maxHp}</small></div>`).join(''):'<div class="person-row"><small>No one nearby yet.</small></div>'}
function renderEvents(){$('#eventLog').innerHTML=events.length?events.map(e=>`<div>${esc(e.text)}</div>`).join(''):'<div>The road is quiet… for now.</div>'}
function renderChat(){const el=$('#chatLog');el.innerHTML=chat.length?chat.slice(-60).map(m=>`<div class="chat-msg"><strong>${esc(m.name)}</strong><small>${zone&&m.zone===zone.id?zone.name:`Zone ${m.zone+1}`}</small><div>${esc(m.text)}</div></div>`).join(''):'<div class="chat-msg">No one has spoken yet. Say hello.</div>';el.scrollTop=el.scrollHeight}
function renderSwatches(){if(!me)return;const el=$('#shirtColors');if(el.childElementCount)return;SHIRTS.forEach(c=>{const b=document.createElement('button');b.className='swatch';b.type='button';b.style.background=c;b.setAttribute('aria-label',`Choose tunic color ${c}`);b.addEventListener('click',()=>send({type:'appearance',shirt:c}));el.appendChild(b)});updateSwatches()}
function updateSwatches(){if(!me)return;$$('.swatch').forEach(b=>b.classList.toggle('active',rgbToHex(b.style.backgroundColor)===me.appearance.shirt.toLowerCase()))}
function rgbToHex(v){if(v.startsWith('#'))return v.toLowerCase();const m=v.match(/\d+/g);if(!m)return v;return '#'+m.slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join('')}

function openPanel(panel){
  activeModal=panel;
  $('#modalEyebrow').textContent=panel.type==='dialog'?(panel.quest||'Conversation'):panel.type==='shop'?'Merchant':'Bank';
  $('#modalTitle').textContent=panel.title||'Embervale';
  const body=$('#modalBody');
  if(panel.type==='dialog')renderDialogue(panel,body);
  if(panel.type==='shop'){
    body.innerHTML=`${panel.greeting?`<div class="npc-greeting"><span>“</span><p>${esc(panel.greeting)}</p></div>`:''}<div class="shop-grid"><div class="shop-item"><strong>🍗 Cooked Fish</strong><small>12 coins · restores 14 HP</small><button class="primary" data-buy="food">Buy</button></div><div class="shop-item"><strong>🔥 Bronze Bar</strong><small>18 coins · crafting material</small><button data-buy="bar">Buy</button></div><div class="shop-item"><strong>🗡️ Bronze Sword</strong><small>180 coins · +3 damage</small><button data-buy="bronze">Buy</button></div><div class="shop-item"><strong>🛡️ Bronze Armor</strong><small>240 coins · +15 max HP</small><button data-buy="armor">Buy</button></div></div><div class="sell-box"><button id="sellBasic" class="primary" type="button">Sell all basic resources</button></div>`;
  }
  if(panel.type==='bank')renderBankModal(body,panel);
  if(!$('#modal').open)$('#modal').showModal();
  $$('[data-buy]').forEach(b=>b.addEventListener('click',()=>send({type:'shopBuy',item:b.dataset.buy})));
  const sell=$('#sellBasic');if(sell)sell.addEventListener('click',()=>send({type:'sellBasic'}));
}
function renderDialogue(panel,body=$('#modalBody')){
  const raw=Array.isArray(panel.lines)&&panel.lines.length?panel.lines:[{speaker:panel.title||'NPC',text:panel.text||'...'}];
  let index=0;
  const draw=()=>{
    const line=raw[index]||raw[raw.length-1],last=index>=raw.length-1;
    body.innerHTML=`<div class="dialog-scene"><div class="dialog-portrait" aria-hidden="true">${dialogPortrait(panel.title)}</div><div class="dialog-main"><div class="dialog-speaker">${esc(line.speaker||panel.title||'NPC')}</div><div class="dialog-copy dialog-line">${esc(line.text)}</div><div class="dialog-progress">${index+1} / ${raw.length}</div></div></div>${panel.chapter?`<div class="story-chapter"><span>Story chapter</span><strong>${esc(panel.chapter)}</strong></div>`:''}${panel.objective?`<div class="dialog-objective"><strong>${esc(panel.objective)}</strong>${panel.status?`<span>${esc(panel.status)}</span>`:''}</div>`:''}${panel.reward?`<div class="story-reward"><span>Reward</span><strong>${esc(panel.reward)}</strong></div>`:''}<div class="dialog-controls"><button type="button" id="dialogNext" class="primary">${last?'Close':'Continue'}</button></div>`;
    $('#dialogNext').addEventListener('click',()=>{if(last){$('#modal').close();return}index++;draw()});
  };
  draw();
}
function dialogPortrait(name=''){
  const n=String(name).toLowerCase();
  if(n.includes('mira'))return '🧙‍♀️';
  if(n.includes('arden'))return '🛡️';
  if(n.includes('elowen'))return '🔮';
  if(n.includes('jory'))return '🎣';
  if(n.includes('nessa'))return '🏹';
  if(n.includes('cael'))return '👻';
  return '💬';
}
function renderBankModal(body=$('#modalBody'),panel={}){if(!me)return;body.innerHTML=`${panel.greeting?`<div class="npc-greeting"><span>“</span><p>${esc(panel.greeting)}</p></div>`:''}<div class="bank-grid">`+Object.entries(ITEM_META).map(([k,[icon,label]])=>`<div class="bank-row"><div><strong>${icon} ${label}</strong><small>Bag ${me.inv[k]} · Bank ${me.bank[k]}</small></div><button type="button" data-bank="deposit" data-key="${k}">Deposit</button><button type="button" data-bank="withdraw" data-key="${k}">Withdraw</button></div>`).join('')+'</div>';$$('[data-bank]').forEach(b=>b.addEventListener('click',()=>send({type:'bank',mode:b.dataset.bank,key:b.dataset.key,amount:9999}))) }

function refreshTarget(){
  if(!selected||!me){$('#targetCard').classList.add('hidden');return}
  const obj=getObjectBySelection(selected);if(!obj){selected=null;$('#targetCard').classList.add('hidden');return}
  const meta=objectMeta(obj,selected.kind);$('#targetType').textContent=meta.type;$('#targetName').textContent=meta.name;$('#targetAction').textContent=selected.kind==='monster'?'Attack':'Interact';$('#targetCard').classList.remove('hidden');
}
function getObjectBySelection(sel){if(!zone)return null;if(sel.kind==='node')return staticNodes.find(n=>n.id===sel.id);if(sel.kind==='npc')return zone.npcs.find(n=>n.id===sel.id);if(sel.kind==='monster')return world.monsters.find(m=>m.id===sel.id&&m.alive);return null}
function objectMeta(obj,kind){if(kind==='node'){const m={tree:['Resource','Oak Tree'],rock:['Resource','Copper Rock'],fish:['Resource','Fishing Spot'],herb:['Resource','Herb Patch']};return {type:m[obj.type][0],name:m[obj.type][1]}}if(kind==='monster')return {type:`Combat Lv. ${obj.lv}`,name:obj.name};if(kind==='npc')return {type:obj.type==='gate'?'Travel':obj.type==='quest'?'Story Quest':obj.type==='shop'?'Merchant':obj.type==='bank'?'Banker':'Local',name:obj.name};return {type:'Target',name:'Unknown'}}
function selectObject(kind,id,auto=true){selected={kind,id};const obj=getObjectBySelection(selected);if(!obj)return;refreshTarget();if(auto&&kind!=='monster'){clickTarget={x:obj.x,y:obj.y};pendingInteract={kind,id}}else if(auto&&kind==='monster'){clickTarget={x:obj.x,y:obj.y}}}
function nearestMonster(range=105){if(!me)return null;return world.monsters.filter(m=>m.alive).sort((a,b)=>dist(me,a)-dist(me,b)).find(m=>dist(me,m)<=range)}
function doInteract(){if(!selected){const n=nearestInteractable();if(n)selectObject(n.kind,n.id,false);else{toast('Nothing nearby to interact with.');return}}if(selected.kind==='monster')return doAttack(false);send({type:'interact',id:selected.id})}
function doAttack(heavy=false){let m=selected?.kind==='monster'?getObjectBySelection(selected):nearestMonster();if(!m){toast('Select a nearby creature first.');return}selected={kind:'monster',id:m.id};refreshTarget();send({type:'attack',id:m.id,heavy})}
function nearestInteractable(){if(!me||!zone)return null;const list=[];for(const n of staticNodes){const state=world.nodes.find(x=>x.id===n.id);if(state?.active!==false)list.push({kind:'node',id:n.id,x:n.x,y:n.y})}for(const n of zone.npcs)list.push({kind:'npc',id:n.id,x:n.x,y:n.y});list.sort((a,b)=>dist(me,a)-dist(me,b));return list.find(o=>dist(me,o)<95)||null}

function setupControls(){
  $('#joinForm').addEventListener('submit',e=>{e.preventDefault();const name=$('#nameInput').value.trim().slice(0,18)||'Wanderer';localStorage.setItem(NAME_KEY,name);if(ws?.readyState===WebSocket.OPEN)send({type:'join',token:localStorage.getItem(TOKEN_KEY)||'',name});else toast('Still connecting to the server.')});
  const prior=localStorage.getItem(NAME_KEY);if(prior)$('#nameInput').value=prior;
  $('#interactBtn').addEventListener('click',doInteract);$('#targetAction').addEventListener('click',doInteract);$('#attackBtn').addEventListener('click',()=>doAttack(false));$('#heavyBtn').addEventListener('click',()=>doAttack(true));$('#eatBtn').addEventListener('click',()=>send({type:'eat'}));$('#mobileEat').addEventListener('click',()=>send({type:'eat'}));$('#mobileAction').addEventListener('click',doInteract);$('#restBtn').addEventListener('click',()=>send({type:'rest'}));
  $$('[data-craft]').forEach(b=>b.addEventListener('click',()=>send({type:'craft',recipe:b.dataset.craft})));
  $$('.tab').forEach(b=>b.addEventListener('click',()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===b));$$('.panel-screen').forEach(x=>x.classList.remove('active-panel'));$(`#panel-${b.dataset.tab}`).classList.add('active-panel');if(b.dataset.tab==='character')renderHero()}));
  $('#chatForm').addEventListener('submit',e=>{e.preventDefault();const input=$('#chatInput'),text=input.value.trim();if(text){send({type:'chat',text});input.value=''}});
  $('#modalClose').addEventListener('click',()=>$('#modal').close());$('#modal').addEventListener('close',()=>activeModal=null);
  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){keys.add(key);e.preventDefault()}if(key==='e'){doInteract();e.preventDefault()}if(key==='f'){send({type:'eat'});e.preventDefault()}if(e.code==='Space'){doAttack(false);e.preventDefault()}});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  $$('.mobile-pad button').forEach(b=>{const dir=b.dataset.move;const set=on=>{mobileDir={x:0,y:0};if(on){if(dir==='up')mobileDir.y=-1;if(dir==='down')mobileDir.y=1;if(dir==='left')mobileDir.x=-1;if(dir==='right')mobileDir.x=1}};b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture?.(e.pointerId);set(true)});b.addEventListener('pointerup',()=>set(false));b.addEventListener('pointercancel',()=>set(false))});
  canvas.addEventListener('pointerdown',onCanvasPointer);
}
function onCanvasPointer(e){if(!me||!zone)return;const rect=canvas.getBoundingClientRect(),sx=(e.clientX-rect.left),sy=(e.clientY-rect.top),wx=sx+camera.x,wy=sy+camera.y;const pick=pickObject(wx,wy);if(pick){selectObject(pick.kind,pick.id,true)}else{selected=null;refreshTarget();clickTarget={x:clamp(wx,30,zone.w-30),y:clamp(wy,30,zone.h-30)};pendingInteract=null}$('#viewport').focus({preventScroll:true})}
function pickObject(x,y){const picks=[];for(const m of world.monsters)if(m.alive&&Math.hypot(x-m.x,y-m.y)<34)picks.push({kind:'monster',id:m.id,d:Math.hypot(x-m.x,y-m.y)});for(const n of zone?.npcs||[])if(Math.hypot(x-n.x,y-n.y)<36)picks.push({kind:'npc',id:n.id,d:Math.hypot(x-n.x,y-n.y)});for(const n of staticNodes){const state=world.nodes.find(s=>s.id===n.id);if(state?.active===false&&n.type!=='tree')continue;const r=n.type==='tree'?42:30;if(Math.hypot(x-n.x,y-n.y)<r)picks.push({kind:'node',id:n.id,d:Math.hypot(x-n.x,y-n.y)})}return picks.sort((a,b)=>a.d-b.d)[0]||null}

function movementVector(){let x=mobileDir.x,y=mobileDir.y;if(keys.has('a')||keys.has('arrowleft'))x-=1;if(keys.has('d')||keys.has('arrowright'))x+=1;if(keys.has('w')||keys.has('arrowup'))y-=1;if(keys.has('s')||keys.has('arrowdown'))y+=1;if(x||y){clickTarget=null;pendingInteract=null;const m=Math.hypot(x,y);return {x:x/m,y:y/m}}if(clickTarget&&me){const dx=clickTarget.x-me.x,dy=clickTarget.y-me.y,d=Math.hypot(dx,dy);if(d<18){clickTarget=null;if(pendingInteract){send({type:'interact',id:pendingInteract.id});pendingInteract=null}return {x:0,y:0}}return {x:dx/d,y:dy/d}}return {x:0,y:0}}
function tickMovement(now){if(!joined||!me)return;const v=movementVector();if((v.x||v.y)&&now-lastMoveSend>60){send({type:'move',dx:v.x,dy:v.y});lastMoveSend=now}if(pendingInteract&&selected){const obj=getObjectBySelection(selected);if(obj&&dist(me,obj)<85){clickTarget=null;send({type:'interact',id:pendingInteract.id});pendingInteract=null}}}

function resizeCanvas(){const r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);const w=Math.max(320,Math.floor(r.width*dpr)),h=Math.max(260,Math.floor(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}}
function noise(x,y){let n=(x*374761393+y*668265263)>>>0;n=(n^(n>>13))*1274126177;n=(n^(n>>16))>>>0;return n/4294967295}
function theme(){return zone?.theme||'meadow'}
function drawWorld(){
  resizeCanvas();const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),vw=rect.width,vh=rect.height;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,vw,vh);
  if(!zone||!me){ctx.fillStyle='#0b141a';ctx.fillRect(0,0,vw,vh);ctx.fillStyle='#9aabba';ctx.font='14px system-ui';ctx.fillText('Entering Embervale…',20,30);return}
  camera.x=clamp(me.x-vw/2,0,Math.max(0,zone.w-vw));camera.y=clamp(me.y-vh/2,0,Math.max(0,zone.h-vh));ctx.save();ctx.translate(-camera.x,-camera.y);
  drawGround(ctx,zone);drawTerrain(ctx,zone);drawBuildings(ctx,zone);drawNodes(ctx);drawNpcs(ctx);drawMonsters(ctx);drawPlayers(ctx);drawParticles(ctx);drawSelection(ctx);ctx.restore();drawMinimap(ctx,vw,vh);drawVignette(ctx,vw,vh);
}
function drawGround(c,z){const palette=z.theme==='meadow'?['#233d2b','#274632','#2b4a34']:z.theme==='hills'?['#403a31','#484036','#514638']:['#26272b','#2d2c31','#343137'];c.fillStyle=palette[0];c.fillRect(0,0,z.w,z.h);const tile=64;for(let y=0;y<z.h;y+=tile)for(let x=0;x<z.w;x+=tile){const n=noise(x/tile,y/tile);c.fillStyle=palette[n>.66?2:n>.33?1:0];c.globalAlpha=.36;c.fillRect(x,y,tile,tile);c.globalAlpha=1;if(n>.72){c.strokeStyle=z.theme==='meadow'?'#4d6a4f':z.theme==='hills'?'#6b5d4b':'#51494f';c.globalAlpha=.28;c.beginPath();c.moveTo(x+14,y+44);c.lineTo(x+19,y+34);c.moveTo(x+20,y+44);c.lineTo(x+26,y+36);c.stroke();c.globalAlpha=1}}}
function drawTerrain(c,z){for(const w of z.water||[]){c.fillStyle=w.lava?'#5a2b20':'#20495b';roundRect(c,w.x,w.y,w.w,w.h,18,true);for(let y=w.y+18;y<w.y+w.h;y+=30){c.strokeStyle=w.lava?'rgba(239,118,62,.45)':'rgba(117,185,203,.25)';c.lineWidth=2;c.beginPath();c.moveTo(w.x+12,y);c.bezierCurveTo(w.x+w.w*.3,y-6,w.x+w.w*.6,y+6,w.x+w.w-12,y);c.stroke()}}if(z.theme==='meadow'){c.fillStyle='#8b6f45';c.fillRect(630,490,165,120);for(let x=638;x<788;x+=22){c.strokeStyle='#59442e';c.beginPath();c.moveTo(x,490);c.lineTo(x,610);c.stroke()}}if(z.theme==='hills'){for(let i=0;i<8;i++){const x=760+i*115,y=360+(i%2)*90;c.fillStyle='#5a5044';c.beginPath();c.moveTo(x-80,y+80);c.lineTo(x,y-70);c.lineTo(x+90,y+80);c.closePath();c.fill();c.fillStyle='#6a5e4e';c.beginPath();c.moveTo(x-20,y-35);c.lineTo(x,y-70);c.lineTo(x+25,y-28);c.closePath();c.fill()}}if(z.theme==='ruins'){c.strokeStyle='rgba(211,112,79,.23)';c.lineWidth=4;for(let i=0;i<11;i++){const x=300+i*130;c.beginPath();c.moveTo(x,80+(i%3)*60);c.lineTo(x+35,170+(i%2)*90);c.lineTo(x-15,260+(i%4)*40);c.stroke()}}}
function drawBuildings(c,z){for(const b of z.buildings||[]){c.fillStyle='rgba(0,0,0,.25)';roundRect(c,b.x+8,b.y+12,b.w,b.h,12,true);c.fillStyle=z.theme==='ruins'?'#454047':'#5a4b3a';roundRect(c,b.x,b.y,b.w,b.h,12,true);c.fillStyle=z.theme==='ruins'?'#6a6268':'#7d664b';c.fillRect(b.x+12,b.y+14,b.w-24,34);c.fillStyle='#1a2027';c.fillRect(b.x+b.w/2-25,b.y+b.h-48,50,48);c.fillStyle='#d7b46d';c.font='700 12px system-ui';c.textAlign='center';c.fillText(b.label,b.x+b.w/2,b.y+38);c.textAlign='left'}}
function nodeState(id){return world.nodes.find(n=>n.id===id)}
function drawNodes(c){for(const n of staticNodes){const state=nodeState(n.id),active=state?.active!==false;if(n.type==='tree')drawTree(c,n.x,n.y,active);if(n.type==='rock')drawRock(c,n.x,n.y,active);if(n.type==='fish')drawFishSpot(c,n.x,n.y,active);if(n.type==='herb')drawHerb(c,n.x,n.y,active)}}
function drawTree(c,x,y,active=true){c.save();c.translate(x,y);c.fillStyle='rgba(0,0,0,.22)';c.beginPath();c.ellipse(0,19,34,13,0,0,Math.PI*2);c.fill();c.fillStyle='#68482f';c.fillRect(-8,-2,16,35);if(active){const t=performance.now()/800;const sway=Math.sin(t+x*.01)*2;c.translate(sway,0);const green=theme()==='ruins'?'#48564a':theme()==='hills'?'#566849':'#4f8156';c.fillStyle=green;for(const [dx,dy,r] of [[0,-34,28],[-22,-23,24],[24,-20,25],[0,-54,23]]){c.beginPath();c.arc(dx,dy,r,0,Math.PI*2);c.fill()}c.fillStyle='rgba(255,255,255,.08)';c.beginPath();c.arc(-8,-55,8,0,Math.PI*2);c.fill()}else{c.fillStyle='#8d6542';c.fillRect(-12,18,24,9)}c.restore()}
function drawRock(c,x,y,active=true){c.save();c.translate(x,y);c.fillStyle='rgba(0,0,0,.2)';c.beginPath();c.ellipse(0,15,30,10,0,0,Math.PI*2);c.fill();if(!active){c.fillStyle='#343b40';c.beginPath();c.arc(0,8,9,0,Math.PI*2);c.fill();c.restore();return}c.fillStyle=theme()==='ruins'?'#69636c':'#707780';c.beginPath();c.moveTo(-28,12);c.lineTo(-17,-18);c.lineTo(8,-29);c.lineTo(27,-10);c.lineTo(24,15);c.closePath();c.fill();c.strokeStyle='#8e98a2';c.beginPath();c.moveTo(-11,-12);c.lineTo(8,-23);c.lineTo(17,-7);c.stroke();c.restore()}
function drawFishSpot(c,x,y,active=true){c.save();c.translate(x,y);c.strokeStyle=active?'rgba(151,218,231,.8)':'rgba(105,150,159,.35)';c.lineWidth=2;for(let i=0;i<3;i++){c.beginPath();c.ellipse(0,0,12+i*8,5+i*3,0,0,Math.PI*2);c.stroke()}if(active){c.fillStyle='#d7eff5';c.beginPath();c.moveTo(-8,-4);c.lineTo(6,-8);c.lineTo(13,-2);c.lineTo(6,4);c.closePath();c.fill()}c.restore()}
function drawHerb(c,x,y,active=true){c.save();c.translate(x,y);if(!active){c.fillStyle='#44503f';c.fillRect(-3,4,6,8);c.restore();return}c.strokeStyle='#4a744e';c.lineWidth=4;for(let i=-2;i<=2;i++){c.beginPath();c.moveTo(0,10);c.quadraticCurveTo(i*6,-1,i*8,-14);c.stroke()}c.fillStyle='#78a969';for(let i=-2;i<=2;i++){c.beginPath();c.ellipse(i*7,-9-Math.abs(i)*2,5,3,i*.2,0,Math.PI*2);c.fill()}c.restore()}
function questMarker(n){
  if(n.type!=='quest'||!me)return '';
  const q=(me.questBook||[]).find(x=>x.id===n.quest);
  if(!q||q.done)return '';
  if(q.stage===0)return '!';
  return q.ready?'?':'…';
}
function drawNpcs(c){for(const n of zone?.npcs||[]){if(n.type==='gate')drawGate(c,n);else{const looks={sage:{shirt:'#765f9e',hair:'#d8d8df',skin:'#d9a075'},merchant:{shirt:'#b06f46',hair:'#6e442e',skin:'#e0ad84'},banker:{shirt:'#4d7d88',hair:'#33261f',skin:'#bc7e59'},guard:{shirt:'#6b7783',hair:'#2d2624',skin:'#d0936d'},fisher:{shirt:'#527f84',hair:'#8a6340',skin:'#d9a075'},scout:{shirt:'#557559',hair:'#382c28',skin:'#bc7e59'},ghost:{shirt:'#7d8fa3',hair:'#ccd8df',skin:'#a9c2ca'}};drawCharacter(c,n.x,n.y,{name:n.name,appearance:looks[n.look]||looks.merchant,gear:{weapon:['guard','scout'].includes(n.look)?'bronze':'rusty',armor:n.look==='guard'?'bronze':'traveler'},dir:'down'},false);const nameColor=n.type==='quest'?'#f2cd7c':n.type==='talk'?'#a7d7dd':'#d7dfe5';drawName(c,n.name,n.x,n.y-53,nameColor);const mark=questMarker(n);if(mark){c.font='900 20px system-ui';c.textAlign='center';c.fillStyle=mark==='🔒'?'#aeb9c3':'#f5d27c';c.fillText(mark,n.x,n.y-72);c.textAlign='left'}}}}
function drawGate(c,n){c.save();c.translate(n.x,n.y);c.fillStyle='rgba(0,0,0,.22)';c.fillRect(-34,24,68,10);c.fillStyle='#725a3c';c.fillRect(-34,-36,12,64);c.fillRect(22,-36,12,64);c.fillRect(-34,-36,68,12);c.fillStyle='#d2af69';c.font='16px system-ui';c.textAlign='center';c.fillText('✦',0,-48);c.font='700 11px system-ui';c.fillText(n.name,0,47);c.textAlign='left';c.restore()}
function drawMonsters(c){for(const m of world.monsters){if(!m.alive)continue;drawMonster(c,m);drawName(c,`${m.name} · Lv ${m.lv}`,m.x,m.y-44,'#e8c0b0');const pct=m.hp/m.maxHp;c.fillStyle='#26191a';c.fillRect(m.x-25,m.y-34,50,5);c.fillStyle='#c86362';c.fillRect(m.x-25,m.y-34,50*pct,5)}}
function drawMonster(c,m){c.save();c.translate(m.x,m.y);c.fillStyle='rgba(0,0,0,.25)';c.beginPath();c.ellipse(0,18,24,9,0,0,Math.PI*2);c.fill();if(m.kind==='rat'){c.fillStyle='#8d827a';c.beginPath();c.ellipse(0,0,20,13,0,0,Math.PI*2);c.fill();c.beginPath();c.arc(14,-7,9,0,Math.PI*2);c.fill();c.fillStyle='#d28c94';c.beginPath();c.arc(8,-14,5,0,Math.PI*2);c.fill();c.strokeStyle='#b89280';c.beginPath();c.moveTo(-18,2);c.quadraticCurveTo(-35,-4,-38,8);c.stroke()}else if(m.kind==='fox'||m.kind==='wolf'){c.fillStyle=m.kind==='fox'?'#b96d45':'#747d86';c.beginPath();c.ellipse(0,4,23,14,0,0,Math.PI*2);c.fill();c.beginPath();c.arc(17,-8,11,0,Math.PI*2);c.fill();c.beginPath();c.moveTo(10,-16);c.lineTo(13,-29);c.lineTo(20,-17);c.fill();c.beginPath();c.moveTo(19,-17);c.lineTo(27,-28);c.lineTo(28,-13);c.fill();c.fillStyle='#e7e5d5';c.fillRect(22,-10,3,3)}else if(m.kind==='goblin'){c.fillStyle='#67935d';c.beginPath();c.arc(0,-9,13,0,Math.PI*2);c.fill();c.fillRect(-11,2,22,24);c.beginPath();c.moveTo(-9,-14);c.lineTo(-25,-10);c.lineTo(-10,-4);c.fill();c.beginPath();c.moveTo(9,-14);c.lineTo(25,-10);c.lineTo(10,-4);c.fill();c.fillStyle='#7b4f39';c.fillRect(-13,10,26,8)}else if(m.kind==='skeleton'){c.strokeStyle='#ded8c5';c.lineWidth=5;c.beginPath();c.arc(0,-15,11,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(0,-4);c.lineTo(0,23);c.moveTo(-13,5);c.lineTo(13,5);c.moveTo(0,23);c.lineTo(-10,36);c.moveTo(0,23);c.lineTo(10,36);c.stroke();c.fillStyle='#0b0d10';c.fillRect(-5,-18,3,3);c.fillRect(3,-18,3,3)}else{const boss=m.kind==='warden';c.fillStyle=boss?'#5c3d48':'#684e4b';c.beginPath();c.arc(0,-12,boss?20:17,0,Math.PI*2);c.fill();c.fillRect(boss?-18:-15,4,boss?36:30,boss?34:29);c.fillStyle='#d66f56';c.beginPath();c.arc(-7,-15,3,0,Math.PI*2);c.fill();c.beginPath();c.arc(7,-15,3,0,Math.PI*2);c.fill();if(boss){c.strokeStyle='#c6a05d';c.lineWidth=4;c.beginPath();c.moveTo(-13,-30);c.lineTo(-21,-45);c.moveTo(13,-30);c.lineTo(21,-45);c.stroke()}}c.restore()}
function drawPlayers(c){for(const p of world.players){drawCharacter(c,p.x,p.y,p,p.token===me?.token);drawName(c,(p.token===me?.token?'★ ':'')+p.name,p.x,p.y-53,p.token===me?.token?'#f6d88c':'#d7e2ea');if(p.gear?.pet)drawPet(c,p.x-28,p.y+14)}}
function drawCharacter(c,x,y,p,isMe=false){const a=p.appearance||{shirt:'#587cc8',hair:'#3c2d25',skin:'#d9a075'};c.save();c.translate(x,y);c.fillStyle='rgba(0,0,0,.28)';c.beginPath();c.ellipse(0,20,18,7,0,0,Math.PI*2);c.fill();if(isMe){c.strokeStyle='rgba(242,205,124,.65)';c.lineWidth=2;c.beginPath();c.ellipse(0,20,23,10,0,0,Math.PI*2);c.stroke()}c.fillStyle='#3b2e28';c.fillRect(-10,14,7,11);c.fillRect(3,14,7,11);if(p.gear?.armor==='bronze'){c.fillStyle='#9a7043';roundRect(c,-13,-10,26,29,7,true);c.fillStyle='#c39555';c.fillRect(-10,-6,20,7)}else{c.fillStyle=a.shirt;roundRect(c,-12,-8,24,27,7,true)}c.fillStyle=a.skin;c.beginPath();c.arc(0,-20,11,0,Math.PI*2);c.fill();c.fillStyle=a.hair;c.beginPath();c.arc(0,-24,11,Math.PI,Math.PI*2);c.fill();c.fillRect(-11,-25,4,9);if(p.dir==='left'||p.dir==='right'){c.fillStyle='#1a2026';c.fillRect(p.dir==='right'?5:-8,-21,3,3)}else{c.fillStyle='#1a2026';c.fillRect(-5,-21,3,3);c.fillRect(3,-21,3,3)}if(p.gear?.weapon&&p.gear.weapon!=='rusty'){c.save();c.rotate(p.dir==='left'?-0.7:0.7);c.fillStyle=p.gear.weapon==='moon'?'#b18ad8':'#d3b172';c.fillRect(15,-15,3,31);c.fillStyle='#76552f';c.fillRect(10,11,13,3);c.restore()}else{c.strokeStyle='#9ba4ab';c.lineWidth=2;c.beginPath();c.moveTo(14,-4);c.lineTo(22,18);c.stroke()}c.restore()}
function drawPet(c,x,y){c.save();c.translate(x,y);c.fillStyle='#b86e45';c.beginPath();c.ellipse(0,0,11,7,0,0,Math.PI*2);c.fill();c.beginPath();c.arc(8,-5,6,0,Math.PI*2);c.fill();c.beginPath();c.moveTo(5,-10);c.lineTo(7,-17);c.lineTo(11,-10);c.fill();c.strokeStyle='#b86e45';c.lineWidth=4;c.beginPath();c.moveTo(-10,0);c.quadraticCurveTo(-21,-10,-17,-17);c.stroke();c.restore()}
function drawName(c,text,x,y,color){c.font='700 11px system-ui';c.textAlign='center';const w=c.measureText(text).width+10;c.fillStyle='rgba(7,11,15,.7)';roundRect(c,x-w/2,y-12,w,17,6,true);c.fillStyle=color;c.fillText(text,x,y);c.textAlign='left'}
function drawParticles(c){const now=performance.now();particles=particles.filter(p=>now-p.born<p.life);for(const p of particles){const t=(now-p.born)/p.life;c.globalAlpha=1-t;c.fillStyle=p.text.startsWith('-')?'#ffb0a4':'#ffe2a1';c.font='800 16px system-ui';c.textAlign='center';c.fillText(p.text,p.x,p.y-30-t*30);c.textAlign='left';c.globalAlpha=1}}
function drawSelection(c){if(!selected)return;const o=getObjectBySelection(selected);if(!o)return;c.strokeStyle='#f1cd7a';c.lineWidth=2;c.setLineDash([6,5]);c.beginPath();c.ellipse(o.x,o.y+12,32,13,0,0,Math.PI*2);c.stroke();c.setLineDash([])}
function drawMinimap(c,vw,vh){if(!zone||vw<520)return;const mw=145,mh=98,x=vw-mw-12,y=76;c.fillStyle='rgba(7,12,17,.76)';roundRect(c,x,y,mw,mh,12,true);c.strokeStyle='rgba(255,255,255,.13)';c.strokeRect(x+6,y+6,mw-12,mh-12);const sx=(mw-18)/zone.w,sy=(mh-18)/zone.h;for(const n of zone.npcs||[]){c.fillStyle=n.type==='gate'?'#e0ad55':'#cbd5dc';c.fillRect(x+9+n.x*sx-1,y+9+n.y*sy-1,3,3)}for(const m of world.monsters)if(m.alive){c.fillStyle='#d66e70';c.fillRect(x+9+m.x*sx-1,y+9+m.y*sy-1,3,3)}for(const p of world.players){c.fillStyle=p.token===me.token?'#f5d781':'#76a9df';c.beginPath();c.arc(x+9+p.x*sx,y+9+p.y*sy,p.token===me.token?3:2,0,Math.PI*2);c.fill()}c.fillStyle='#aeb9c3';c.font='700 9px system-ui';c.fillText('MAP',x+10,y+15)}
function drawVignette(c,w,h){const g=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.max(w,h)*.72);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.25)');c.fillStyle=g;c.fillRect(0,0,w,h)}
function roundRect(c,x,y,w,h,r,fill=false){const rr=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+rr,y);c.arcTo(x+w,y,x+w,y+h,rr);c.arcTo(x+w,y+h,x,y+h,rr);c.arcTo(x,y+h,x,y,rr);c.arcTo(x,y,x+w,y,rr);c.closePath();if(fill)c.fill()}

function renderHero(){if(!me)return;const w=heroCanvas.width,h=heroCanvas.height;hctx.clearRect(0,0,w,h);const g=hctx.createRadialGradient(w/2,h/2,10,w/2,h/2,100);g.addColorStop(0,'#26394a');g.addColorStop(1,'#101820');hctx.fillStyle=g;hctx.fillRect(0,0,w,h);hctx.save();hctx.translate(0,15);hctx.scale(2.2,2.2);drawCharacter(hctx,50,54,{...me,x:50,y:54,dir:'down'},true);if(me.gear.pet)drawPet(hctx,25,70);hctx.restore();updateSwatches()}

function frame(now){const dt=Math.min(50,now-lastFrame);lastFrame=now;tickMovement(now,dt);drawWorld();requestAnimationFrame(frame)}
setupControls();connect();requestAnimationFrame(frame);
})();
