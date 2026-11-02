import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
const $=id=>document.getElementById(id);let app,auth,db,user=null,records=[],stopSnapshot=null,reminderTimer=null;
const configured=firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('PASTE_') && firebaseConfig.projectId && !firebaseConfig.projectId.includes('YOUR_');
function toast(s){const t=$('toast');t.textContent=s;t.style.display='block';setTimeout(()=>t.style.display='none',2800)}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function alertFor(x){if(x.status==='Purchased')return'Completed';if(x.status==='Cancelled')return'Closed';if(!x.followup)return'No date';const t=today();return x.followup<t?'OVERDUE':x.followup===t?'DUE TODAY':'Upcoming'}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function demandsRef(){return collection(db,'users',user.uid,'demands')}
function cleanPhone(p){let n=(p||'').replace(/\D/g,'');if(n.startsWith('0'))n='92'+n.slice(1);if(!n.startsWith('92'))n='92'+n;return n}
function render(){const data=[...records].sort((a,b)=>(b.created||0)-(a.created||0));const open=data.filter(x=>!['Purchased','Cancelled'].includes(x.status));const due=data.filter(x=>['OVERDUE','DUE TODAY'].includes(alertFor(x)));$('total').textContent=data.length;$('open').textContent=open.length;$('due').textContent=due.length;$('purchased').textContent=data.filter(x=>x.status==='Purchased').length;
const overdue=due.filter(x=>alertFor(x)==='OVERDUE'),todayDue=due.filter(x=>alertFor(x)==='DUE TODAY');$('dailyText').textContent=`${overdue.length} overdue · ${todayDue.length} due today · ${open.length} open demands. Review these customers and contact them when stock is available.`;
$('reminderSummary').classList.toggle('hidden',due.length===0);$('reminderSummary').innerHTML=due.length?`<strong>Follow-up needed:</strong> ${overdue.length} overdue and ${todayDue.length} due today.`:'';
const q=$('search').value.toLowerCase(),sf=$('statusFilter').value,af=$('alertFilter').value;const list=data.filter(x=>(!q||[x.customer,x.phone,x.product].join(' ').toLowerCase().includes(q))&&(!sf||x.status===sf)&&(!af||alertFor(x)===af));$('rows').innerHTML='';$('empty').style.display=list.length?'none':'block';
for(const x of list){const tr=document.createElement('tr'),tds=Array.from({length:5},()=>document.createElement('td'));tds[0].innerHTML=`<b>${esc(x.customer)}</b><br><small>${esc(x.phone)}</small>`;tds[1].innerHTML=`<b>${esc(x.product)}</b><br><small>${esc([x.size,x.colour].filter(Boolean).join(' · '))}</small>`;const a=alertFor(x),cls=a==='OVERDUE'?'red':a==='DUE TODAY'?'yellow':a==='Completed'?'green':'';tds[2].innerHTML=`${esc(x.followup||'—')}<br><span class="pill ${cls}">${a}</span>`;tds[3].innerHTML=`<span class="pill">${esc(x.status)}</span><br><small>${esc(x.priority)}</small>`;const actions=document.createElement('div');actions.className='actions';const wa=document.createElement('button');wa.textContent='WhatsApp';wa.onclick=()=>window.open('https://wa.me/'+cleanPhone(x.phone),'_blank','noopener');const edit=document.createElement('button');edit.className='secondary';edit.textContent='Edit';edit.onclick=()=>fill(x);const del=document.createElement('button');del.className='danger';del.textContent='Delete';del.onclick=async()=>{if(confirm('Delete this customer demand?')){try{await deleteDoc(doc(db,'users',user.uid,'demands',x.id));toast('Demand deleted')}catch(e){toast('Delete failed: '+e.message)}}};actions.append(wa,edit,del);tds[4].append(actions);tds.forEach(td=>tr.append(td));$('rows').append(tr)}
}
function clearForm(){$('demandForm').reset();$('recordId').value='';$('formTitle').textContent='Add Customer Demand';$('quantity').value=1}
function fill(x){$('recordId').value=x.id;['customer','phone','product','category','size','colour','quantity','budget','priority','followup','status','lastContact','notes'].forEach(k=>$(k).value=x[k]??'');$('formTitle').textContent='Edit Customer Demand';$('formPanel').scrollIntoView({behavior:'smooth'})}
$('demandForm').onsubmit=async e=>{e.preventDefault();if(!user)return;const id=$('recordId').value||crypto.randomUUID();const old=records.find(x=>x.id===id);const item={id,created:old?.created||Date.now(),updated:Date.now()};['customer','phone','product','category','size','colour','quantity','budget','priority','followup','status','lastContact','notes'].forEach(k=>item[k]=$(k).value.trim());item.quantity=Number(item.quantity||1);item.budget=Number(item.budget||0);try{await setDoc(doc(db,'users',user.uid,'demands',id),item);clearForm();toast('Saved — syncing automatically')}catch(err){toast('Could not save: '+err.message)}};
$('clearBtn').onclick=clearForm;$('newBtn').onclick=()=>{clearForm();$('customer').focus();$('formPanel').scrollIntoView({behavior:'smooth'})};['search','statusFilter','alertFilter'].forEach(id=>$(id).addEventListener('input',render));
$('googleBtn').onclick=async()=>{if(!configured){$('setupWarning').classList.remove('hidden');return}try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){toast('Sign-in failed: '+e.message)}};
$('signOutBtn').onclick=()=>signOut(auth);
$('exportBtn').onclick=()=>download('amjad-enterprises-backup-'+today()+'.json',JSON.stringify({app:'AMJAD ENTERPRISES CRM',version:2,exported:new Date().toISOString(),demands:records},null,2),'application/json');
$('importBtn').onclick=()=>$('restoreFile').click();$('restoreFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const o=JSON.parse(await f.text());if(!Array.isArray(o.demands))throw Error('Invalid backup file');if(!confirm(`Import ${o.demands.length} records into your cloud account? Existing records with the same IDs will be replaced.`))return;for(const x of o.demands){if(x.id)await setDoc(doc(db,'users',user.uid,'demands',x.id),x)}toast('Backup imported; syncing')}catch(err){alert('Import failed: '+err.message)}e.target.value=''};
$('csvBtn').onclick=()=>{const keys=['customer','phone','product','category','size','colour','quantity','budget','priority','followup','status','lastContact','notes'];const csv=[keys.join(','),...records.map(x=>keys.map(k=>'"'+String(x[k]??'').replace(/"/g,'""')+'"').join(','))].join('\n');download('amjad-enterprises-demands.csv',csv,'text/csv')};
function download(n,s,t){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([s],{type:t}));a.href=u;a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function readLegacy(){return new Promise(resolve=>{const req=indexedDB.open('amjad-enterprises-crm',1);req.onerror=()=>resolve([]);req.onsuccess=()=>{const d=req.result;if(!d.objectStoreNames.contains('demands'))return resolve([]);const r=d.transaction('demands').objectStore('demands').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>resolve([])}})}
async function offerLegacyImport(){try{if(!navigator.onLine)return;const local=await readLegacy();if(!local.length)return;const snap=await getDocs(demandsRef());if(!snap.empty)return;if(confirm(`Found ${local.length} records saved in this browser's earlier CRM version. Import them into your private cloud account?`)){for(const x of local)await setDoc(doc(db,'users',user.uid,'demands',x.id),x);toast('Previous records imported')}}catch(e){console.warn('Legacy import check',e)}}
function notify(title,body,tag){if(Notification.permission!=='granted')return;if(navigator.serviceWorker?.controller){navigator.serviceWorker.ready.then(r=>r.showNotification(title,{body,tag,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png'})).catch(()=>new Notification(title,{body,tag}))}else new Notification(title,{body,tag})}
function checkReminders(){if(!user||!('Notification'in window)||Notification.permission!=='granted')return;const due=records.filter(x=>['OVERDUE','DUE TODAY'].includes(alertFor(x)));const key=today();for(const x of due.slice(0,10)){const k='ae_due_'+x.id;if(localStorage.getItem(k)!==key){notify(`Follow-up: ${x.customer}`,`${x.product} · ${alertFor(x)} · ${x.phone}`,`ae-demand-${x.id}`);localStorage.setItem(k,key)}}const now=new Date();if(now.getHours()>=9&&localStorage.getItem('ae_daily_notice')!==key){notify('AMJAD ENTERPRISES — Daily summary',`${records.filter(x=>!['Purchased','Cancelled'].includes(x.status)).length} open customer demands. Review today's follow-ups.`,'ae-daily');localStorage.setItem('ae_daily_notice',key)}if(reminderTimer)clearTimeout(reminderTimer);const next=new Date();next.setHours(9,0,0,0);if(next<=now)next.setDate(next.getDate()+1);reminderTimer=setTimeout(checkReminders,next-now)}
$('enableNotifyBtn').onclick=async()=>{if(!('Notification'in window)){toast('Notifications are not supported in this browser');return}const p=await Notification.requestPermission();toast(p==='granted'?'Reminders enabled':'Notification permission not granted');checkReminders()};
function function startUser(u) {
  user = u;
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('signOutBtn').classList.remove('hidden');

  $('syncState').textContent = '● Checking cloud...';

  if (stopSnapshot) stopSnapshot();

  stopSnapshot = onSnapshot(
    demandsRef(),
    { includeMetadataChanges: true },
    snap => {
      records = snap.docs.map(d => ({
        ...d.data(),
        id: d.id
      }));

      render();
      checkReminders();

      if (snap.metadata.hasPendingWrites) {
        $('syncState').textContent = '● Uploading...';
      } else if (snap.metadata.fromCache) {
        $('syncState').textContent = '● Local only — waiting for cloud';
      } else {
        $('syncState').textContent = '● Cloud verified';
      }
    },
    err => {
      toast('Cloud sync error: ' + err.message);
      $('syncState').textContent = '● Sync issue';
    }
  );

  offerLegacyImport();
}
function endUser() {user=null;records=[];if(stopSnapshot)stopSnapshot();stopSnapshot=null;$('loginView').classList.remove('hidden');$('appView').classList.add('hidden');$('signOutBtn').classList.add('hidden');$('syncState').textContent='Not signed in'}
window.addEventListener('online',()=>{$('syncState').textContent='● Reconnecting'});window.addEventListener('offline',()=>{$('syncState').textContent='● Offline — changes queued'});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
if(!configured){$('setupWarning').classList.remove('hidden');$('googleBtn').disabled=true;$('googleBtn').textContent='Complete Firebase setup first'}else{try{app=initializeApp(firebaseConfig);auth=getAuth(app);try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch(e){console.warn('Persistent cache unavailable; using standard Firestore',e);db=getFirestore(app)}onAuthStateChanged(auth,u=>u?startUser(u):endUser())}catch(e){$('setupWarning').classList.remove('hidden');toast('Firebase setup error: '+e.message)}}
