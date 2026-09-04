import { clone, loadPublishedPricing, downloadJson } from './pricing-engine.js?v=1.7.3';

const OWNER_HASH_HEX = 'c5ee4e379c108b66df779ab11d19214374e9c0286c7ae5e9987ee689d67061e7';
const OWNER_STORAGE_KEY = 'printCostAnalyzerOwnerEncryptedV1';
const $ = s => document.querySelector(s);
const rows = $('#pricingRows');
const tierSelect = $('#activeTier');
const tierBadge = $('#editingTierBadge');
const meta = $('#configMeta');
const profileGrid = $('#profileGrid');
const customerRows = $('#customerPricingRows');
const customerTierBadge = $('#customerEditingTierBadge');
let config = null;
let published = null;
let editingTier = 'normal';
let sessionKey = '';
let ownerPrefs = { owner:'', repo:'', branch:'main', path:'data/pricing-config.json' };

function toast(icon, title) {
  if (window.Swal?.fire) return Swal.fire({toast:true,position:'top-end',icon,title,showConfirmButton:false,timer:2200,background:'#0f1a2c',color:'#eef4ff'});
  alert(title);
}
function bytesToBase64(bytes){ let s=''; for (const b of bytes) s+=String.fromCharCode(b); return btoa(s); }
function base64ToBytes(s){ const b=atob(s); return Uint8Array.from(b,c=>c.charCodeAt(0)); }
function hex(bytes){ return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function sha256Hex(text){ return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))); }
async function deriveKey(password, salt){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'}, base, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
}
async function encryptPayload(payload,password){
  const salt=crypto.getRandomValues(new Uint8Array(16)); const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(password,salt); const plain=new TextEncoder().encode(JSON.stringify(payload));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
  return JSON.stringify({v:1,salt:bytesToBase64(salt),iv:bytesToBase64(iv),data:bytesToBase64(cipher)});
}
async function decryptPayload(raw,password){
  const p=JSON.parse(raw); if(p.v!==1) throw new Error('Format penyimpanan lokal tidak dikenali');
  const salt=base64ToBytes(p.salt), iv=base64ToBytes(p.iv), data=base64ToBytes(p.data);
  const key=await deriveKey(password,salt); const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,data);
  return JSON.parse(new TextDecoder().decode(plain));
}
function today(){ return new Date().toLocaleDateString('sv-SE'); }
function sanitizePublicConfig(input){
  const keys=['schema_version','price_version','updated_at','currency','active_tier','tier_labels','materials','production_profiles','media_source_labels','customer_supplied_tariffs'];
  const out={}; for(const k of keys) if(input?.[k]!==undefined) out[k]=clone(input[k]);
  out.updated_at=today(); return out;
}
function validateConfig(c){
  if(!c || !Array.isArray(c.materials) || !c.schema_version) throw new Error('Format konfigurasi tidak dikenali');
  if(published && c.schema_version!==published.schema_version) throw new Error(`Schema ${c.schema_version} tidak kompatibel dengan ${published.schema_version}`);
}
function renderProfiles(){
  profileGrid.innerHTML='';
  for(const p of (config.production_profiles||[])){
    const card=document.createElement('article'); card.className='profile-card';
    card.innerHTML=`<strong>${p.name}</strong><span>${p.note||''}</span>`; profileGrid.appendChild(card);
  }
}
function renderRows(tier=editingTier){
  editingTier=tier; tierSelect.value=tier; tierBadge.textContent=config.tier_labels?.[tier]||tier; rows.innerHTML='';
  for(const material of config.materials||[]) for(const size of material.sizes||[]){
    const t=size.tariffs?.[tier]||{}; const tr=document.createElement('tr'); tr.dataset.material=material.id; tr.dataset.size=size.id;
    tr.innerHTML=`<td><strong>${material.name}</strong></td><td>${size.label||size.id}</td>
      <td><input class="price-input" data-key="H" type="number" min="0" step="50" value="${Number(t.H)||0}"></td>
      <td><input class="price-input" data-key="HW" type="number" min="0" step="50" value="${Number(t.HW)||0}"></td>
      <td><input class="price-input" data-key="W" type="number" min="0" step="50" value="${Number(t.W)||0}"></td>
      <td><input class="price-input" data-key="duplex_credit" type="number" min="0" step="50" value="${Number(t.duplex_credit)||0}"></td><td>${material.duplex?'Ya':'Tidak'}</td>`;
    rows.appendChild(tr);
  }
}
function renderCustomerRows(tier=editingTier){
  if(!customerRows)return; customerTierBadge.textContent=config.tier_labels?.[tier]||tier; customerRows.innerHTML='';
  for(const [profileId,profile] of Object.entries(config.customer_supplied_tariffs||{})) for(const [sizeGroup,sizeData] of Object.entries(profile.sizes||{})){
    const t=sizeData?.[tier]||{}; const tr=document.createElement('tr'); tr.dataset.profile=profileId; tr.dataset.sizeGroup=sizeGroup;
    tr.innerHTML=`<td><strong>${profile.label||profileId}</strong></td><td>${profile.size_labels?.[sizeGroup]||sizeGroup}</td>
      <td><input class="price-input" data-key="H" type="number" min="0" step="50" value="${Number(t.H)||0}"></td>
      <td><input class="price-input" data-key="HW" type="number" min="0" step="50" value="${Number(t.HW)||0}"></td>
      <td><input class="price-input" data-key="W" type="number" min="0" step="50" value="${Number(t.W)||0}"></td><td>${profile.note||''}</td>`;
    customerRows.appendChild(tr);
  }
}
function captureRows(tier=editingTier){
  for(const tr of rows.querySelectorAll('tr')){
    const material=config.materials.find(x=>x.id===tr.dataset.material); const size=material?.sizes.find(x=>x.id===tr.dataset.size); if(!size)continue;
    size.tariffs||={}; size.tariffs[tier]||={}; for(const input of tr.querySelectorAll('input[data-key]')) size.tariffs[tier][input.dataset.key]=Math.max(0,Math.round(Number(input.value)||0));
  }
}
function captureCustomerRows(tier=editingTier){
  for(const tr of customerRows.querySelectorAll('tr')){
    const size=config.customer_supplied_tariffs?.[tr.dataset.profile]?.sizes?.[tr.dataset.sizeGroup]; if(!size)continue;
    size[tier]||={}; for(const input of tr.querySelectorAll('input[data-key]')) size[tier][input.dataset.key]=Math.max(0,Math.round(Number(input.value)||0)); size[tier].duplex_credit=0;
  }
}
function captureAll(){ captureRows(editingTier); captureCustomerRows(editingTier); config.active_tier=editingTier; config.updated_at=today(); }
function updatePrefsFromForm(){ ownerPrefs={owner:$('#ghOwner').value.trim(),repo:$('#ghRepo').value.trim(),branch:$('#ghBranch').value.trim()||'main',path:$('#ghPath').value.trim()||'data/pricing-config.json'}; }
function renderPrefs(){ $('#ghOwner').value=ownerPrefs.owner||''; $('#ghRepo').value=ownerPrefs.repo||''; $('#ghBranch').value=ownerPrefs.branch||'main'; $('#ghPath').value=ownerPrefs.path||'data/pricing-config.json'; }
async function loadOwnerConfig(){
  published=await loadPublishedPricing(); config=clone(published);
  const raw=localStorage.getItem(OWNER_STORAGE_KEY);
  if(raw){ try{ const payload=await decryptPayload(raw,sessionKey); validateConfig(payload.config); config=payload.config; ownerPrefs={...ownerPrefs,...(payload.prefs||{})}; meta.textContent=`Versi harga ${config.price_version||'-'} · konfigurasi privat terenkripsi dimuat`; } catch(e){ meta.textContent='Konfigurasi lokal tidak dapat dibuka; memakai konfigurasi publik.'; toast('warning','Konfigurasi lokal tidak dapat didekripsi'); } }
  editingTier=config.active_tier||'normal'; renderRows(editingTier); renderCustomerRows(editingTier); renderProfiles(); renderPrefs();
  if(!raw) meta.textContent=`Versi harga ${config.price_version||'-'} · konfigurasi publik`;
}
async function saveEncryptedLocal(){
  captureAll(); updatePrefsFromForm(); validateConfig(config);
  const raw=await encryptPayload({config:sanitizePublicConfig(config),prefs:ownerPrefs},sessionKey); localStorage.setItem(OWNER_STORAGE_KEY,raw);
  meta.textContent=`Versi harga ${config.price_version||'-'} · konfigurasi privat terenkripsi tersimpan`; toast('success','Pengaturan lokal tersimpan terenkripsi');
}
async function unlock(){
  const key=$('#ownerKey').value.trim(); if(!key)return;
  $('#gateStatus').textContent='Memeriksa kunci…'; const digest=await sha256Hex(key);
  if(digest!==OWNER_HASH_HEX){ $('#gateStatus').textContent='Kunci tidak sesuai.'; $('#ownerKey').select(); return; }
  sessionKey=key; $('#ownerGate').hidden=true; $('#settingsShell').hidden=false; await loadOwnerConfig(); $('#ownerKey').value='';
}
async function publishToGitHub(){
  captureAll(); updatePrefsFromForm(); const token=$('#ghToken').value.trim(); if(!token) throw new Error('GitHub token belum diisi');
  if(!ownerPrefs.owner||!ownerPrefs.repo) throw new Error('Owner dan repository wajib diisi');
  const path=ownerPrefs.path.split('/').map(encodeURIComponent).join('/');
  const api=`https://api.github.com/repos/${encodeURIComponent(ownerPrefs.owner)}/${encodeURIComponent(ownerPrefs.repo)}/contents/${path}`;
  const headers={'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'};
  let sha;
  const get=await fetch(`${api}?ref=${encodeURIComponent(ownerPrefs.branch)}`,{headers});
  if(get.ok){ sha=(await get.json()).sha; } else if(get.status!==404){ throw new Error(`Gagal membaca file GitHub (${get.status})`); }
  const publicConfig=sanitizePublicConfig(config); config=clone(publicConfig);
  const content=bytesToBase64(new TextEncoder().encode(JSON.stringify(publicConfig,null,2)));
  const body={message:`Update Print Cost Analyzer pricing ${publicConfig.price_version||''}`.trim(),content,branch:ownerPrefs.branch}; if(sha)body.sha=sha;
  const put=await fetch(api,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!put.ok){ let msg=`GitHub API ${put.status}`; try{ const j=await put.json(); if(j.message)msg+=`: ${j.message}`;}catch{} throw new Error(msg); }
  $('#publishStatus').textContent=`Berhasil dipublikasikan ${new Date().toLocaleString('id-ID')} ke ${ownerPrefs.owner}/${ownerPrefs.repo}@${ownerPrefs.branch}/${ownerPrefs.path}`;
  $('#ghToken').value=''; await saveEncryptedLocal(); toast('success','pricing-config.json berhasil dipublikasikan');
}

$('#unlockOwner').addEventListener('click',()=>unlock().catch(e=>{$('#gateStatus').textContent=`Gagal: ${e.message}`}));
$('#ownerKey').addEventListener('keydown',e=>{if(e.key==='Enter')$('#unlockOwner').click();});
tierSelect.addEventListener('change',()=>{ const next=tierSelect.value; captureRows(editingTier); captureCustomerRows(editingTier); config.active_tier=next; renderRows(next); renderCustomerRows(next); });
$('#saveSettings').addEventListener('click',()=>saveEncryptedLocal().catch(e=>toast('error',e.message)));
$('#exportSettings').addEventListener('click',()=>{ captureAll(); downloadJson('pricing-config.json',sanitizePublicConfig(config)); });
$('#importSettings').addEventListener('change',async e=>{ const file=e.target.files?.[0]; if(!file)return; try{ const imported=JSON.parse(await file.text()); validateConfig(imported); config=imported; editingTier=config.active_tier||'normal'; renderRows(editingTier); renderCustomerRows(editingTier); renderProfiles(); toast('success','Konfigurasi berhasil diimpor'); }catch(err){toast('error',`Impor gagal: ${err.message}`)}finally{e.target.value='';} });
$('#publishSettings').addEventListener('click',async()=>{ const ok=window.Swal?.fire?await Swal.fire({title:'Publikasikan tarif ke GitHub?',text:'data/pricing-config.json pada repository tujuan akan diperbarui.',icon:'question',showCancelButton:true,confirmButtonText:'Publikasikan',cancelButtonText:'Batal',background:'#0f1a2c',color:'#eef4ff'}).then(r=>r.isConfirmed):confirm('Publikasikan tarif ke GitHub?'); if(!ok)return; $('#publishStatus').textContent='Mempublikasikan…'; publishToGitHub().catch(e=>{ $('#publishStatus').textContent=`Gagal: ${e.message}`; toast('error',e.message); }); });
$('#resetSettings').addEventListener('click',async()=>{ const ok=window.Swal?.fire?await Swal.fire({title:'Hapus konfigurasi lokal?',text:'Editor kembali memakai pricing-config.json publik.',icon:'warning',showCancelButton:true,confirmButtonText:'Reset',cancelButtonText:'Batal',background:'#0f1a2c',color:'#eef4ff'}).then(r=>r.isConfirmed):confirm('Reset konfigurasi lokal?'); if(!ok)return; localStorage.removeItem(OWNER_STORAGE_KEY); config=clone(published); ownerPrefs={owner:'',repo:'',branch:'main',path:'data/pricing-config.json'}; editingTier=config.active_tier||'normal'; renderRows(editingTier); renderCustomerRows(editingTier); renderProfiles(); renderPrefs(); meta.textContent='Konfigurasi lokal dihapus; memakai konfigurasi publik'; toast('success','Konfigurasi lokal dihapus'); });
$('#lockOwner').addEventListener('click',()=>{ sessionKey=''; config=null; published=null; $('#settingsShell').hidden=true; $('#ownerGate').hidden=false; $('#gateStatus').textContent='Konfigurasi privat hanya diproses di browser ini.'; $('#ownerKey').focus(); });
