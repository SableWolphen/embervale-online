(()=>{'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(path,method='GET',data)=>{const t=sessionStorage.getItem('embervale-date-token');if(!t)throw Error('Please sign in');const r=await fetch('/api'+path,{method,headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error||'Unable to complete request');return j};
const message=s=>{const el=$('#toast');el.textContent=s;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),4000)};
const prompts=['What does your perfect weekend look like?','What is a tiny thing that always makes your day better?','Which place would you love to explore together?','What kind of music instantly puts you in a good mood?','What is something you could happily talk about for hours?','Coffee and a bookstore, or a sunset walk?','What is your most unexpectedly useful skill?'];
let promptAt=0;$('#newSpark').onclick=()=>{$('#sparkPrompt').textContent=prompts[promptAt++%prompts.length]};$('#newSpark').click();
const safeDate=s=>{if(!s)return 'Not specified';const d=new Date(s);return Number.isNaN(d.getTime())?esc(s):d.toLocaleString()};
function getForm(id){return Object.fromEntries(new FormData($(id)).entries())}
function checkTime(s){return s&&new Date(s).getTime()>Date.now()}
async function syncProfile(){try{const {user}=await api('/me');const f=$('#profileForm');f.elements.voice.value=user.voice||'';for(let i=0;i<3;i++)f.elements['prompt'+(i+1)].value=(user.prompts||[])[i]||''}catch{}}
async function updateLists(){
 const ms=(await api('/matches')).matches;
 const opts='<option value="">Choose a match</option>'+ms.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join('');
 document.querySelectorAll('.matchSelect').forEach(x=>{const prev=x.value;x.innerHTML=opts;if(ms.some(m=>m.id===prev))x.value=prev});
 const ps=(await api('/plans')).plans;
 $('#plansList').innerHTML=ps.length?'<h3>Your date ideas</h3>'+ps.map(p=>'<div class="mini"><b>'+esc(p.title)+'</b> · '+safeDate(p.when)+'<div>'+esc(p.place)+' · '+esc(p.status)+'</div>'+(p.status==='proposed'&&p.to!==(sessionStorage.getItem('embervale-user-id')||'')?'<button type="button" data-plan="'+esc(p.id)+'" data-response="accepted">Accept</button><button type="button" data-plan="'+esc(p.id)+'" data-response="declined">Decline</button>':'')+'</div>').join(''):'<p class="fine">No date ideas yet.</p>';
 const cs=(await api('/checkins')).checkins;
 $('#checkinsList').innerHTML=cs.length?'<h3>Private check-ins</h3>'+cs.map(c=>'<div class="mini">'+safeDate(c.when)+' · '+esc(c.message)+' · '+(c.done?'Completed':'Pending')+(c.done?'':' <button type="button" data-checkin="'+esc(c.id)+'">Mark done</button>')+'</div>').join(''):'<p class="fine">No reminders saved.</p>';
 const rs=(await api('/relationships')).invitations;
 const me=(await api('/me')).user;
 sessionStorage.setItem('embervale-user-id',me.id);
 $('#relationshipsList').innerHTML=rs.length?rs.map(r=>'<div class="mini">'+(r.to===me.id?'Incoming invitation':'Sent invitation')+' · '+esc(r.status)+(r.to===me.id&&r.status==='pending'?'<div><button type="button" data-relationship="'+esc(r.id)+'" data-answer="accepted">Accept</button><button type="button" data-relationship="'+esc(r.id)+'" data-answer="declined">Decline</button></div>':'')+'</div>').join(''):'<p class="fine">No invitations yet.</p>';
 $('#leaveRelationship').classList.toggle('hidden',me.mode!=='relationship');
 // Remove controls for outgoing date proposals: only the invited person may respond.
 $('#plansList').querySelectorAll('[data-plan]').forEach(button=>{const p=ps.find(x=>x.id===button.dataset.plan);if(p?.to!==me.id)button.remove()});
}
async function load(){try{const {preferences:p}=await api('/preferences');const f=$('#preferencesForm');for(const k of ['minAge','maxAge','intent'])f.elements[k].value=p[k]??'';f.elements.slow.checked=!!p.slow;f.elements.hidden.checked=!!p.hidden;await syncProfile();await updateLists()}catch(e){message(e.message)}}
document.querySelector('[data-tab="sparkTools"]').addEventListener('click',load);
document.querySelector('[data-tab="profile"]').addEventListener('click',syncProfile);
$('#preferencesForm').onsubmit=async e=>{e.preventDefault();const b=getForm('#preferencesForm');b.slow=$('#preferencesForm').elements.slow.checked;b.hidden=$('#preferencesForm').elements.hidden.checked;if(Number(b.minAge)>Number(b.maxAge))return message('Minimum age cannot exceed maximum age');try{await api('/me','PUT',{preferences:b});message('Your preferences are saved ♡')}catch(e){message(e.message)}};
$('#planForm').onsubmit=async e=>{e.preventDefault();const b=getForm('#planForm');if(!checkTime(b.when))return message('Choose a future date');if(!b.to)return message('Choose a match');try{await api('/plans','POST',b);e.target.reset();message('Date idea sent for their approval');await updateLists()}catch(e){message(e.message)}};
$('#checkinForm').onsubmit=async e=>{e.preventDefault();const b=getForm('#checkinForm');if(!checkTime(b.when))return message('Choose a future check-in');try{await api('/checkins','POST',b);e.target.reset();message('Private check-in saved — this is not an automatic emergency alert');await updateLists()}catch(e){message(e.message)}};
$('#invitePartner').onclick=async()=>{const to=$('#partnerSelect').value;if(!to)return message('Choose a match first');if(!confirm('Invite this match to Relationship Mode? Your profiles will be hidden from discovery only after they accept.'))return;try{await api('/relationship','POST',{to});message('Invitation sent ♡');await updateLists()}catch(e){message(e.message)}};
$('#leaveRelationship').onclick=async()=>{if(!confirm('Leave Relationship Mode and make your profile eligible for discovery again?'))return;try{await api('/relationship/leave','POST');await updateLists();message('Relationship Mode ended')}catch(e){message(e.message)}};
$('#plansList').onclick=async e=>{const b=e.target.closest('[data-plan]');if(!b)return;try{await api('/plans/respond','POST',{id:b.dataset.plan,status:b.dataset.response});await updateLists();message('Response saved')}catch(err){message(err.message)}};
$('#checkinsList').onclick=async e=>{const b=e.target.closest('[data-checkin]');if(!b)return;try{await api('/checkins/done','POST',{id:b.dataset.checkin});await updateLists()}catch(err){message(err.message)}};
$('#relationshipsList').onclick=async e=>{const b=e.target.closest('[data-relationship]');if(!b)return;try{await api('/relationship/respond','POST',{id:b.dataset.relationship,status:b.dataset.answer});await updateLists();message('Relationship invitation updated')}catch(err){message(err.message)}};
})();