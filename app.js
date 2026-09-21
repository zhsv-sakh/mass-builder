/* ============================================================
   app.js — вся логика приложения
   ============================================================
   Зависит от data.js (MEALS, VITAMINS, BASE_FOODS, GOALS).
   Подключается ПОСЛЕ data.js.
   v7.9: добавлен режим тренера + синхронизация GitHub
   ============================================================ */

const LS_KEY = 'massBuilderV6';
const LS_LAST_BACKUP = 'massBuilderV6_lastBackup';
const LS_AUTO = 'massBuilderV6_autobackup';
const LS_BEFORE_IMPORT = 'massBuilderV6_before_import';
const ONBOARD_KEY = 'massBuilderV7_onboarded';
const STATE_VERSION = '7.9';

const LS_SYNC = 'massBuilderV6_sync';
const LS_CLIENTS = 'massBuilderV6_clients';
const LS_TRAINER_TOKEN = 'massBuilderV6_trainerToken';
const LS_TRAINER_MODE = 'massBuilderV6_trainerMode';
const LS_ACTIVE_CLIENT = 'massBuilderV6_activeClient';

const MONTHS_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const MONTHS_FULL  = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                      'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const WEEKDAYS_SHORT = ['вс','пн','вт','ср','чт','пт','сб'];

/* ============================================================
   STATE
   ============================================================ */
let state = {
  _v: STATE_VERSION,
  meals:{}, extras:{}, water:{}, vitamins:{}, weights:{}, modes:{},
  profile:{ name:'Виталик', height:180, target:75, weight:67.5, goal:'gain', theme:'dark', shift:0 },
  customFoods:[]
};

let activeDate = null;
let stripAnchor = null;
let calYear, calMonth;
let chartScale = 7;
let editingExtra = null;
let portionFood = null;
let portionMealId = null;
let currentMealId = null;
let monthPickerOpen = false;
let obIdx = 0;

let saveTimer = null;
function scheduleSave(){
  if(saveTimer) return;
  saveTimer = setTimeout(()=>{ saveTimer=null; writeLS(); }, 300);
}
function saveStateImmediate(){
  if(isReadOnly()) return;
  if(saveTimer){ clearTimeout(saveTimer); saveTimer=null; }
  writeLS();
}
function writeLS(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){}
  scheduleSync();
}
function saveState(){ scheduleSave(); }

/* ============================================================
   TRAINER MODE
   ============================================================ */
let trainerMode = false;
let clients = [];
let activeClient = null;
let trainerData = null;

function loadTrainerSettings(){
  try{
    trainerMode = localStorage.getItem(LS_TRAINER_MODE) === '1';
    clients = JSON.parse(localStorage.getItem(LS_CLIENTS) || '[]');
    activeClient = JSON.parse(localStorage.getItem(LS_ACTIVE_CLIENT) || 'null');
  }catch(e){ trainerMode=false; clients=[]; activeClient=null; }
}
function saveTrainerSettings(){
  try{
    localStorage.setItem(LS_TRAINER_MODE, trainerMode?'1':'0');
    localStorage.setItem(LS_CLIENTS, JSON.stringify(clients));
    localStorage.setItem(LS_ACTIVE_CLIENT, JSON.stringify(activeClient));
  }catch(e){}
}
function getTrainerToken(){
  try{ return localStorage.getItem(LS_TRAINER_TOKEN) || ''; }catch(e){ return ''; }
}
function setTrainerToken(t){
  try{ localStorage.setItem(LS_TRAINER_TOKEN, t||''); }catch(e){}
}
function getActiveState(){
  return (trainerMode && activeClient && trainerData) ? trainerData : state;
}
function isReadOnly(){
  return !!(trainerMode && activeClient && trainerData);
}

async function loadClientData(client){
  const token = getTrainerToken();
  if(!token) throw new Error('Нет токена тренера');
  const url = `https://api.github.com/repos/${client.owner}/${client.repo}/contents/${client.file}?ref=main`;
  const r = await fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json'
    }
  });
  if(!r.ok) throw new Error('GET ' + r.status);
  const j = await r.json();
  const txt = b64decode(j.content);
  return JSON.parse(txt);
}

async function enterTrainerMode(client){
  if(!client) return;
  activeClient = client;
  try{
    trainerData = await loadClientData(client);
    saveTrainerSettings();
    applyTrainerView();
    toast('Данные: ' + client.name);
  }catch(e){
    console.warn('load client fail', e);
    toast('Не удалось загрузить: ' + e.message);
  }
}
function exitTrainerMode(){
  trainerData = null;
  activeClient = null;
  saveTrainerSettings();
  applyTrainerView();
  toast('Свои данные');
}
function applyTrainerView(){
  const banner = document.getElementById('trainerBanner');
  const picker = document.getElementById('clientPicker');
  const inTrainer = trainerMode && activeClient && trainerData;
  if(banner){
    banner.classList.toggle('hidden', !inTrainer);
    if(inTrainer) document.getElementById('trainerClient').textContent = activeClient.name;
  }
  if(picker){
    picker.classList.toggle('hidden', !(trainerMode && clients.length));
    picker.innerHTML = '<option value="">— свои —</option>' +
      clients.map(c=>`<option value="${c.owner}/${c.repo}/${c.file}" ${activeClient && activeClient.file===c.file ? 'selected':''}>${c.name}</option>`).join('');
  }
  renderAll();
}

function renderClientsList(){
  const box = document.getElementById('clientsList');
  if(!box) return;
  if(!clients.length){ box.innerHTML = '<div class="empty">Клиентов нет</div>'; return; }
  box.innerHTML = clients.map((c,i)=>`
    <div class="profrow" style="padding:8px 0">
      <span><b>${c.name}</b><br><small style="color:var(--muted);font-size:11px">${c.owner}/${c.repo}/${c.file}</small></span>
      <button class="iconbtn" style="width:34px;height:34px;font-size:14px" data-del-client="${i}">✕</button>
    </div>`).join('');
  box.querySelectorAll('[data-del-client]').forEach(btn=>{
    btn.onclick = ()=>{
      const i = +btn.dataset.delClient;
      if(activeClient && activeClient.file === clients[i].file){ activeClient=null; trainerData=null; }
      clients.splice(i,1);
      saveTrainerSettings();
      renderClientsList();
      applyTrainerView();
    };
  });
}

/* ============================================================
   GITHUB SYNC (свой дневник)
   ============================================================ */
let syncTimer = null;
let syncInProgress = false;

function getSyncCfg(){
  try{ return JSON.parse(localStorage.getItem(LS_SYNC) || 'null') || {}; }catch(e){ return {}; }
}
function setSyncCfg(cfg){
  try{ localStorage.setItem(LS_SYNC, JSON.stringify(cfg)); }catch(e){}
}
function syncConfigured(){
  const c = getSyncCfg();
  return !!(c.owner && c.repo && c.file && c.token);
}
function syncApiUrl(cfg){
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.file}`;
}
function b64encode(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(b64){
  return decodeURIComponent(escape(atob(b64.replace(/\n/g,''))));
}

async function ghGetFile(cfg){
  const r = await fetch(syncApiUrl(cfg) + '?ref=main', {
    headers: {
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': 'application/vnd.github+json'
    }
  });
  if(r.status === 404) return { sha:null, content:null };
  if(!r.ok) throw new Error('GET ' + r.status);
  const j = await r.json();
  return { sha: j.sha, content: j.content ? b64decode(j.content) : null };
}

async function ghPutFile(cfg, contentStr, sha){
  const body = {
    message: 'sync ' + new Date().toISOString(),
    content: b64encode(contentStr),
    branch: 'main'
  };
  if(sha) body.sha = sha;
  const r = await fetch(syncApiUrl(cfg), {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if(!r.ok){
    const t = await r.text();
    throw new Error('PUT ' + r.status + ' ' + t.slice(0,200));
  }
  const j = await r.json();
  return j.content.sha;
}

async function syncNow(silent){
  if(isReadOnly()) return;
  if(syncInProgress) return;
  const cfg = getSyncCfg();
  if(!cfg.owner || !cfg.repo || !cfg.file || !cfg.token){
    if(!silent) toast('Синхронизация не настроена');
    return;
  }
  syncInProgress = true;
  updateSyncInfo('Синхронизация...');
  try{
    const cur = await ghGetFile(cfg);
    const newSha = await ghPutFile(cfg, JSON.stringify(state), cur.sha);
    cfg.lastSha = newSha;
    cfg.lastSync = new Date().toISOString();
    setSyncCfg(cfg);
    updateSyncInfo(null);
    if(!silent) toast('Синхронизировано ✓');
  }catch(e){
    console.warn('sync fail', e);
    updateSyncInfo('Ошибка: ' + e.message);
    if(!silent) toast('Ошибка синхронизации');
  }finally{
    syncInProgress = false;
  }
}

function scheduleSync(){
  if(!syncConfigured()) return;
  if(isReadOnly()) return;
  if(syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(()=>{ syncTimer=null; syncNow(true); }, 10000);
}

function updateSyncInfo(errMsg){
  const info = document.getElementById('syncInfo');
  if(!info) return;
  if(errMsg){ info.textContent = errMsg; info.className = 'backupinfo warn'; return; }
  const cfg = getSyncCfg();
  if(!cfg.owner || !cfg.repo || !cfg.file || !cfg.token){
    info.textContent = 'Синхронизация не настроена';
    info.className = 'backupinfo warn';
    return;
  }
  if(!cfg.lastSync){
    info.textContent = 'Настроено, но ещё не отправлялось';
    info.className = 'backupinfo';
    return;
  }
  const d = new Date(cfg.lastSync);
  const diff = Math.floor((Date.now() - d.getTime())/1000);
  let txt;
  if(diff < 60) txt = 'только что';
  else if(diff < 3600) txt = Math.floor(diff/60) + ' мин назад';
  else if(diff < 86400) txt = Math.floor(diff/3600) + ' ч назад';
  else txt = Math.floor(diff/86400) + ' дн назад';
  info.textContent = 'Последняя синхронизация: ' + txt;
  info.className = 'backupinfo';
}

/* ============================================================
   ДАТЫ
   ============================================================ */
function pad2(n){ return String(n).padStart(2,'0'); }
function dateKey(d){
  const dt = d || new Date();
  return dt.getFullYear()+'-'+pad2(dt.getMonth()+1)+'-'+pad2(dt.getDate());
}
function todayKey(){ return dateKey(new Date()); }
function currentKey(){ return activeDate || todayKey(); }
function parseKey(k){
  const [y,m,d] = k.split('-').map(Number);
  return new Date(y, m-1, d);
}
function addDays(k, n){
  const d = parseKey(k); d.setDate(d.getDate()+n);
  return dateKey(d);
}
function isSaturday(key){ return parseKey(key).getDay() === 6; }
function fmtDateRu(iso){
  const d = parseKey(iso);
  const mn = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return d.getDate() + ' ' + mn[d.getMonth()];
}

/* ============================================================
   ЗАГРУЗКА / МИГРАЦИЯ
   ============================================================ */
function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const p = JSON.parse(raw);
      state = Object.assign(state, p);
      state.profile = Object.assign({name:'Виталик',height:180,target:75,weight:67.5,goal:'gain',theme:'dark',shift:0}, p.profile||{});
      state.customFoods = p.customFoods || [];
      state._v = STATE_VERSION;
      const migrated = migrateWater();
      if(migrated) saveStateImmediate();
    }
  }catch(e){ console.warn('load fail', e); }
}
function migrateWater(){
  if(!state.water) { state.water = {}; return false; }
  let changed = false;
  Object.keys(state.water).forEach(date => {
    const dayW = state.water[date];
    if(!dayW || typeof dayW !== 'object') return;
    Object.keys(dayW).forEach(mealId => {
      const v = dayW[mealId];
      if(typeof v === 'number' && !isNaN(v)) return;
      const meal = MEALS.find(m => m.id === mealId);
      if(v === true){ dayW[mealId] = meal ? meal.water : 0; changed = true; }
      else if(typeof v === 'string' && !isNaN(+v)){ dayW[mealId] = Math.max(0, Math.round(+v)); changed = true; }
      else { dayW[mealId] = 0; changed = true; }
    });
  });
  return changed;
}

/* ============================================================
   ХЕЛПЕРЫ
   ============================================================ */
function getMealData(date, mealId){
  const S = getActiveState();
  if(!S.meals[date]) S.meals[date] = {};
  if(!S.meals[date][mealId]){
    S.meals[date][mealId] = { _activeVariant:'v1', v1:{}, v2:{}, v3:{} };
  }
  const m = S.meals[date][mealId];
  MEALS.find(x=>x.id===mealId).variants.forEach(v=>{ if(!m[v.id]) m[v.id]={}; });
  if(!m._activeVariant) m._activeVariant='v1';
  return m;
}
function getWater(date, mealId){
  const S = getActiveState();
  if(!S.water[date]) S.water[date]={};
  const v = S.water[date][mealId];
  return typeof v === 'number' && !isNaN(v) ? v : 0;
}
function setWater(date, mealId, val){
  if(isReadOnly()) return;
  if(!state.water[date]) state.water[date]={};
  state.water[date][mealId] = Math.max(0, Math.round(val || 0));
  saveState();
}
function getExtras(date, mealId){
  const S = getActiveState();
  if(!S.extras[date]) S.extras[date]={};
  if(!S.extras[date][mealId]) S.extras[date][mealId]=[];
  return S.extras[date][mealId];
}
function getVitamins(date){
  const S = getActiveState();
  if(!S.vitamins[date]){
    S.vitamins[date]={ d3:false, omega:false, multi:false, magnesium:false, zinc:false, creatine:false };
  }
  return S.vitamins[date];
}
function getMode(date){
  const S = getActiveState();
  return S.modes[date] || 'rest';
}
function setMode(date, mode){
  if(isReadOnly()) return;
  state.modes[date]=mode; saveState();
}

function sumMeal(meal, variant, checked, extras, waterMl){
  let k=0,p=0,f=0,c=0;
  const v = meal.variants.find(x=>x.id===variant);
  if(v) v.items.forEach(it=>{ if(checked[it.id]){ k+=it.k; p+=it.p; f+=it.f; c+=it.c; } });
  (extras||[]).forEach(e=>{ k+=e.kcal||0; p+=e.protein||0; f+=e.fat||0; c+=e.carbs||0; });
  return {k,p,f,c,w: waterMl||0};
}
function sumDay(date){
  let total = {k:0,p:0,f:0,c:0,w:0};
  MEALS.forEach(m=>{
    const md = getMealData(date, m.id);
    const v = md._activeVariant;
    const checked = md[v] || {};
    const ex = getExtras(date, m.id);
    const w = getWater(date, m.id);
    const s = sumMeal(m, v, checked, ex, w);
    total.k+=s.k; total.p+=s.p; total.f+=s.f; total.c+=s.c; total.w+=s.w;
  });
  return total;
}
function targets(date){
  const S = getActiveState();
  const goal = S.profile.goal || 'gain';
  const g = GOALS[goal] || GOALS.gain;
  const mode = getMode(date || currentKey());
  const train = mode==='train';
  return {
    k: train?g.kTrain:g.kRest,
    p: train?g.pTrain:g.pRest,
    f: train?g.fTrain:g.fRest,
    c: train?g.cTrain:g.cRest,
    w: g.w
  };
}
function pct(v, max){ return Math.max(0, Math.min(100, Math.round(v/max*100))); }
function barColor(p){
  if(p>=100) return 'linear-gradient(90deg,#35c759,#8fe36b)';
  if(p>=70) return 'linear-gradient(90deg,#ffcc00,#35c759)';
  if(p>=40) return 'linear-gradient(90deg,#ff8a3d,#ffcc00)';
  return 'linear-gradient(90deg,#ff453a,#ff8a3d)';
}
function fmt(n){ return Math.round(n); }
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('on');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'),1500);
}
function vibrate(ms){ if(navigator.vibrate) try{ navigator.vibrate(ms||8); }catch(_){} }
function mealTime(meal){
  const S = getActiveState();
  const shift = S.profile.shift || 0;
  const [h,m] = meal.time.split(':').map(Number);
  let total = h*60 + m + shift;
  const nextDay = total >= 1440;
  total = ((total % 1440) + 1440) % 1440;
  const hh = Math.floor(total/60), mm = total%60;
  return pad2(hh)+':'+pad2(mm) + (nextDay ? ' (+1)' : '');
}
function latestWeight(){
  const S = getActiveState();
  const keys = Object.keys(S.weights).sort();
  return keys.length ? S.weights[keys[keys.length-1]] : (S.profile.weight || 67.5);
}
function applyTheme(){ document.documentElement.setAttribute('data-theme', state.profile.theme || 'dark'); }
function allFoods(){ return BASE_FOODS.concat(state.customFoods); }

/* ============================================================
   DAY STRIP
   ============================================================ */
function renderDayStrip(){
  const strip = document.getElementById('dayStrip');
  strip.innerHTML = '';
  if(!stripAnchor) stripAnchor = todayKey();
  const cur = currentKey();
  if(cur < stripAnchor) stripAnchor = cur;
  if(cur > addDays(stripAnchor,6)) stripAnchor = addDays(cur,-6);

  for(let i=0;i<7;i++){
    const key = addDays(stripAnchor, i);
    const d = parseKey(key);
    const isToday = key===todayKey();
    const hasData = dayHasData(key);
    const el = document.createElement('div');
    el.className = 'day' + (key===cur?' on':'') + (isToday?' today':'') + (hasData?' has':'');
    el.innerHTML = `
      <div class="dw">${isToday?'сег':WEEKDAYS_SHORT[d.getDay()]}</div>
      <div class="dn">${d.getDate()}</div>
      <div class="dm">${MONTHS_SHORT[d.getMonth()]}</div>
    `;
    el.onclick = ()=>{ activeDate = key; renderAll(); };
    strip.appendChild(el);
  }
}
function dayHasData(key){
  const S = getActiveState();
  if(S.weights[key]) return true;
  if(S.meals[key] && Object.keys(S.meals[key]).length) return true;
  if(S.extras[key] && Object.keys(S.extras[key]).length) return true;
  if(S.water[key] && Object.values(S.water[key]).some(v => (typeof v==='number'?v:0) > 0)) return true;
  if(S.vitamins[key] && Object.values(S.vitamins[key]).some(Boolean)) return true;
  return false;
}

/* ============================================================
   BARS / TOTALS
   ============================================================ */
function renderBars(){
  const date = currentKey();
  const total = sumDay(date);
  const t = targets(date);
  const bars = [
    {n:'🔥 Калории', v:total.k, max:t.k, u:'ккал'},
    {n:'🥩 Белки', v:total.p, max:t.p, u:'г'},
    {n:'🥑 Жиры', v:total.f, max:t.f, u:'г'},
    {n:'🍚 Углеводы', v:total.c, max:t.c, u:'г'},
    {n:'💧 Вода', v:total.w, max:t.w, u:'мл'}
  ];
  document.getElementById('bars').innerHTML = bars.map(b=>{
    const p = pct(b.v,b.max);
    const cls = b.v === 0 ? 'fill zero' : 'fill';
    const style = b.v === 0 ? '' : `width:${p}%;background:${barColor(p)}`;
    return `<div class="bar">
      <div class="barhead"><b>${b.n}</b><span>${fmt(b.v)} / ${b.max} ${b.u} · ${p}%</span></div>
      <div class="track"><div class="${cls}" style="${style}"></div></div>
    </div>`;
  }).join('');
}
function renderTotals(){
  const date = currentKey();
  const total = sumDay(date);
  const t = targets(date);
  const cells = [
    {l:'ккал', v:fmt(total.k), max:t.k},
    {l:'Б', v:fmt(total.p), max:t.p},
    {l:'Ж', v:fmt(total.f), max:t.f},
    {l:'У', v:fmt(total.c), max:t.c},
    {l:'вода', v:fmt(total.w), max:t.w}
  ];
  document.getElementById('totalsGrid').innerHTML = cells.map(c=>{
    const p = pct(c.v,c.max);
    const col = p>=100?'var(--good)':p>=70?'var(--warn)':'var(--txt)';
    return `<div class="cell"><div class="v" style="color:${col}">${c.v}</div><div class="l">${c.l}</div></div>`;
  }).join('');
}
function renderBarsAndTotals(){ renderBars(); renderTotals(); }

function updateMealKcal(mealId){
  const meal = MEALS.find(m=>m.id===mealId);
  if(!meal) return;
  const card = document.querySelector(`.meal[data-meal-id="${mealId}"]`);
  if(!card) return;
  const md = getMealData(currentKey(), mealId);
  const active = md._activeVariant;
  const checked = md[active] || {};
  const extras = getExtras(currentKey(), mealId);
  const v = meal.variants.find(x=>x.id===active);
  let k=0,p=0,f=0,c=0;
  if(v) v.items.forEach(it=>{ if(checked[it.id]){ k+=it.k;p+=it.p;f+=it.f;c+=it.c; } });
  extras.forEach(e=>{ k+=e.kcal||0;p+=e.protein||0;f+=e.fat||0;c+=e.carbs||0; });
  const kcalEl = card.querySelector('.mealhead .kcal');
  if(kcalEl) kcalEl.innerHTML = `<b>${fmt(k)}</b><span>ккал</span>`;
  const line2 = card.querySelector('.mealhead .line2');
  if(line2) line2.textContent = mealTime(meal) + ' · Б' + fmt(p) + ' Ж' + fmt(f) + ' У' + fmt(c);
}

/* ============================================================
   MEALS
   ============================================================ */
function renderMeals(){
  const date = currentKey();
  const wrap = document.getElementById('mealsWrap');
  wrap.innerHTML = '';
  MEALS.forEach(meal=>{
    const md = getMealData(date, meal.id);
    const active = md._activeVariant;
    const checked = md[active] || {};
    const extras = getExtras(date, meal.id);
    const waterMl = getWater(date, meal.id);

    const v = meal.variants.find(x=>x.id===active);
    let k=0,p=0,f=0,c=0;
    v.items.forEach(it=>{ if(checked[it.id]){ k+=it.k;p+=it.p;f+=it.f;c+=it.c; } });
    extras.forEach(e=>{ k+=e.kcal||0;p+=e.protein||0;f+=e.fat||0;c+=e.carbs||0; });

    const full = waterMl >= meal.water;
    const over = waterMl > meal.water;

    const card = document.createElement('div');
    card.className='meal';
    card.dataset.mealId = meal.id;
    card.innerHTML = `
      <div class="mealhead">
        <div class="emoji">${meal.emoji}</div>
        <div class="meta">
          <div class="title">${meal.title}</div>
          <div class="line2">${mealTime(meal)} · Б${fmt(p)} Ж${fmt(f)} У${fmt(c)}</div>
        </div>
        <div class="kcal">
          <b>${fmt(k)}</b>
          <span>ккал</span>
        </div>
      </div>
      <div class="variants">
        ${meal.variants.map(vr=>`<div class="pill ${vr.id===active?'on':''}" data-meal="${meal.id}" data-variant="${vr.id}">${vr.name}</div>`).join('')}
      </div>
      <div class="items">
        ${v.items.map(it=>`
          <div class="item ${checked[it.id]?'done':''}" data-meal="${meal.id}" data-item="${it.id}">
            <div class="chk">✓</div>
            <div class="nm">${it.n}</div>
            <div class="kbju">${it.k} ккал · Б${it.p} Ж${it.f} У${it.c}</div>
          </div>`).join('')}
      </div>
      ${extras.length? `<div class="extras">
        ${extras.map((e,i)=>`<div class="extra">
          <div class="nm" data-edit-meal="${meal.id}" data-edit-idx="${i}">${e.name}${e.portion ? ' · '+e.portion+' г' : ''}</div>
          <div class="kbju">${fmt(e.kcal)} ккал · Б${fmt(e.protein)} Ж${fmt(e.fat)} У${fmt(e.carbs)}</div>
          <button class="del" data-meal="${meal.id}" data-idx="${i}">✕</button>
        </div>`).join('')}
      </div>`:''}
      <div class="mealwater">
        <div class="wico">💧</div>
        <div class="wlbl">Вода</div>
        <div class="wval ${full?'full':''}">
          <b>${waterMl}</b> / ${meal.water} мл
          ${over ? `<small>+${waterMl-meal.water} сверх</small>` : ''}
        </div>
        <div class="wbtns">
          <button class="wbtn" data-wa="${meal.id}" data-delta="-200" aria-label="−200 мл">−</button>
          <button class="wbtn plus" data-wa="${meal.id}" data-delta="+200" aria-label="+200 мл">+</button>
        </div>
      </div>
      <div class="mealactions">
        <button class="btn add" data-meal="${meal.id}" data-add="1">+ Внеплановая еда</button>
      </div>
    `;
    wrap.appendChild(card);
  });
}
function updateMealWaterRow(mealId){
  const meal = MEALS.find(m => m.id === mealId);
  if(!meal) return;
  const card = document.querySelector(`.meal[data-meal-id="${mealId}"]`);
  if(!card) return;
  const waterMl = getWater(currentKey(), mealId);
  const full = waterMl >= meal.water;
  const over = waterMl > meal.water;
  const val = card.querySelector('.mealwater .wval');
  if(val){
    val.classList.toggle('full', full);
    val.innerHTML = `<b>${waterMl}</b> / ${meal.water} мл` +
      (over ? `<small>+${waterMl-meal.water} сверх</small>` : '');
  }
}

/* ============================================================
   ВИТАМИНЫ
   ============================================================ */
function renderVitamins(){
  const date = currentKey();
  const v = getVitamins(date);
  const mode = getMode(date);
  const wrap = document.getElementById('vitsWrap');
  wrap.innerHTML = VITAMINS.map(vt=>{
    const hide = vt.creatine && mode!=='train';
    return `<div class="vit ${v[vt.id]?'done':''} ${vt.creatine?'creatine':''} ${hide?'hide':''}" data-vit="${vt.id}">
      <div class="chk">✓</div>
      <span>${vt.n}</span>
      <span class="tag">${vt.tag}</span>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.vit').forEach(el=>{
    el.onclick = ()=>{
      if(isReadOnly()) return;
      const id = el.dataset.vit;
      const vv = getVitamins(currentKey());
      vv[id] = !vv[id]; saveState(); renderAll();
    };
  });
}

/* ============================================================
   РЕЖИМ
   ============================================================ */
function renderMode(){
  const date = currentKey();
  const S = getActiveState();
  const mode = S.modes[date];          // ← именно так, без дефолта 'train'
  const seg = document.getElementById('modeSeg');
  seg.classList.toggle('unset', !mode);
  document.querySelectorAll('#modeSeg button').forEach(b=>{
    b.classList.toggle('on', b.dataset.mode===mode);
    b.classList.toggle('rest', b.dataset.mode==='rest' && b.classList.contains('on'));
  });
}

/* ============================================================
   МОДАЛКА ЕДЫ
   ============================================================ */
function openFoodModal(mealId){
  if(isReadOnly()){ toast('Режим просмотра'); return; }
  currentMealId = mealId;
  document.getElementById('foodOverlay').classList.add('on');
  document.getElementById('foodSearch').value='';
  document.getElementById('customBlock').style.display='none';
  renderFoodList('');
  setTimeout(()=>document.getElementById('foodSearch').focus(), 250);
}
function closeFoodModal(){ document.getElementById('foodOverlay').classList.remove('on'); }
function renderFoodList(q){
  const list = document.getElementById('foodList');
  const query = (q||'').toLowerCase().trim();
  const arr = allFoods().filter(f=> !query || f.name.toLowerCase().includes(query));
  if(!arr.length){ list.innerHTML='<div class="empty">Ничего не найдено</div>'; return; }
  list.innerHTML = arr.map((f,i)=>`
    <div class="foodrow" data-idx="${i}">
      <div class="nm">${f.name}</div>
      <div class="kbju">${f.kcal} ккал / 100 г<br>порция ≈ ${f.defaultPortion||100} г</div>
    </div>`).join('');
  list.querySelectorAll('.foodrow').forEach(el=>{
    el.onclick = ()=>{
      const f = arr[+el.dataset.idx];
      openPortion(f);
    };
  });
}
function openPortion(food){
  portionFood = food;
  portionMealId = currentMealId;
  document.getElementById('portionName').textContent = food.name;
  document.getElementById('portionInput').value = food.defaultPortion || 100;
  updatePortionPreview();
  document.getElementById('portionOverlay').classList.add('on');
}
function closePortion(){
  document.getElementById('portionOverlay').classList.remove('on');
  portionFood = null; portionMealId = null;
}
function updatePortionPreview(){
  if(!portionFood) return;
  let p = +document.getElementById('portionInput').value || 100;
  if(p > 5000) p = 5000;
  if(p < 1) p = 1;
  const coef = p/100;
  document.getElementById('pvKcal').textContent = fmt(portionFood.kcal * coef);
  document.getElementById('pvProtein').textContent = fmt(portionFood.protein * coef);
  document.getElementById('pvFat').textContent = fmt(portionFood.fat * coef);
  document.getElementById('pvCarbs').textContent = fmt(portionFood.carbs * coef);
}
function addExtra(mealId, name, kcal, protein, fat, carbs, portion){
  if(isReadOnly()) return;
  const date = currentKey();
  const arr = getExtras(date, mealId);
  arr.push({
    name,
    kcal: Math.round(kcal),
    protein: Math.round(protein * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    portion: portion ? Math.round(portion) : null
  });
  saveState(); renderAll();
}

/* ============================================================
   РЕДАКТИРОВАНИЕ ВНЕПЛАНОВОГО
   ============================================================ */
function openEditExtra(mealId, idx){
  if(isReadOnly()) return;
  const date = currentKey();
  const arr = getExtras(date, mealId);
  const e = arr[idx];
  if(!e) return;
  editingExtra = { mealId, idx };
  document.getElementById('edName').value = e.name;
  document.getElementById('edKcal').value = e.kcal;
  document.getElementById('edProtein').value = e.protein;
  document.getElementById('edFat').value = e.fat;
  document.getElementById('edCarbs').value = e.carbs;
  document.getElementById('editOverlay').classList.add('on');
}
function closeEditExtra(){ document.getElementById('editOverlay').classList.remove('on'); editingExtra = null; }

/* ============================================================
   ГРАФИКИ
   ============================================================ */
function niceStep(range, targetTicks){
  if(range <= 0) return 1;
  const rough = range / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  let nice;
  if(norm < 1.5) nice = 1;
  else if(norm < 3) nice = 2;
  else if(norm < 7) nice = 5;
  else nice = 10;
  return nice * pow;
}

function drawLine(canvas, series, color, labels, selectedIdx, second, refLine){
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio||1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w*dpr; canvas.height = h*dpr;
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,w,h);

  const narrow = w < 380;
  const pad = {l: narrow ? 34 : 42, r: second ? (narrow ? 34 : 42) : 12, t: 16, b: 40};
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const total = labels.length;
  const xAt = i => pad.l + (total===1 ? cw/2 : cw*i/(total-1));

  function computeAxis(ser){
    const pts = ser.length && typeof ser[0] === 'object';
    let mx = 0, mn = Infinity;
    if(pts){
      ser.forEach(p=>{ if(p.y>mx) mx=p.y; if(p.y<mn) mn=p.y; });
    } else {
      ser.forEach(v=>{ if(v>mx) mx=v; if(v<mn) mn=v; });
    }
    if(!ser.length || mx === 0){ mx = 1; mn = 0; }
    if(mn === Infinity) mn = 0;

    if(pts && mn > 0){
      const span0 = mx - mn;
      const padY = span0 > 0 ? span0 * 0.5 : 1;
      mn = mn - padY;
      mx = mx + padY;
    } else if(!pts) {
      mn = Math.max(0, mn);
    }

    const tTicks = narrow ? 4 : 5;
    let sp = mx - mn;
    if(sp <= 0){ sp = 1; mx = mn + sp; }

    let st = niceStep(sp, tTicks);
    let nMin = Math.floor(mn / st) * st;
    let nMax = Math.ceil(mx / st) * st;
    if(nMax === nMin) nMax = nMin + st;

    let tk = Math.round((nMax - nMin) / st);

    while(tk > tTicks + 1){
      st = st * 2;
      nMin = Math.floor(mn / st) * st;
      nMax = Math.ceil(mx / st) * st;
      tk = Math.round((nMax - nMin) / st);
    }
    while(tk < 3 && st > 0.001){
      st = st / 2;
      nMin = Math.floor(mn / st) * st;
      nMax = Math.ceil(mx / st) * st;
      tk = Math.round((nMax - nMin) / st);
    }
    if(tk < 1) tk = 1;

    return { yMin: nMin, yMax: nMax, step: st, ticks: tk };
  }

  // определяем границы данных
  let dataMax = 0, dataMin = Infinity;
  series.forEach(s => {
    const v = typeof s === 'object' ? s.y : s;
    if(v > dataMax) dataMax = v;
    if(v < dataMin) dataMin = v;
  });
  if(!series.length){ dataMax = 1; dataMin = 0; }
  if(dataMin === Infinity) dataMin = 0;

  // норма попадает в ось, только если она в разумных пределах от данных (±30%)
  const span = Math.max(dataMax - dataMin, 1);
  const range = span * 3;  // допуск: цель не дальше 3 «разбросов» от данных
  const refInRange = refLine
    && refLine.value > 0
    && refLine.axis !== 'second'
    && refLine.value >= dataMin - range
    && refLine.value <= dataMax + range;

  const addRefToAxis1 = refInRange;
  const seriesWithRef = addRefToAxis1 ? series.concat(refLine.value) : series;
  const axis1 = computeAxis(seriesWithRef);
  const yMin = axis1.yMin, yMax = axis1.yMax;
  const yAt = v => pad.t + ch * (1 - (v - yMin) / (yMax - yMin));

  let axis2 = null, yAt2 = null;
  if(second && second.series && second.series.length){
    const s2WithRef = (refLine && refLine.axis === 'second' && refLine.value > 0)
      ? second.series.concat(refLine.value)
      : second.series;
    axis2 = computeAxis(s2WithRef);
    yAt2 = v => pad.t + ch * (1 - (v - axis2.yMin) / (axis2.yMax - axis2.yMin));
  }

  const isPoints = series.length && typeof series[0] === 'object';
  const decimals = isPoints ? 1 : (Math.abs(axis1.step - Math.round(axis1.step)) < 0.0001 ? 0 : 1);

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
  ctx.lineWidth = 1;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  ctx.font = (narrow ? '9.5px' : '10px') + ' sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  let lastLabel = null;
  for(let i = 0; i <= axis1.ticks; i++){
    const v = yMin + axis1.step * i;
    const y = yAt(v);
    if(y < pad.t - 1 || y > pad.t + ch + 1) continue;

    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();

    const label = v.toFixed(decimals);
    if(label !== lastLabel){
      ctx.fillText(label, pad.l - 6, y);
      lastLabel = label;
    }
  }

  if(axis2){
    ctx.textAlign = 'left';
    ctx.fillStyle = second.color || color;
    for(let i = 0; i <= axis2.ticks; i++){
      const v = axis2.yMin + axis2.step * i;
      const y = yAt2(v);
      if(y < pad.t - 1 || y > pad.t + ch + 1) continue;
      ctx.fillText(v.toFixed(decimals), w - pad.r + 6, y);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  }
if(refLine && refLine.value > 0 && refInRange){
    const useAxis2 = (refLine.axis === 'second' && yAt2);
    const yRef = useAxis2 ? yAt2(refLine.value) : yAt(refLine.value);
    if(yRef >= pad.t && yRef <= pad.t + ch){
      ctx.save();
      ctx.strokeStyle = refLine.color || '#ff453a';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, yRef);
      ctx.lineTo(w - pad.r, yRef);
      ctx.stroke();
      ctx.setLineDash([]);
      if(refLine.label){
        ctx.fillStyle = refLine.color || '#ff453a';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(refLine.label, w - pad.r - 4, yRef - 3);
      }
      ctx.restore();
    }
  }
  if(selectedIdx !== undefined && selectedIdx >= 0 && selectedIdx < total){
    const x = xAt(selectedIdx);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + ch);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if(isPoints){
    if(series.length >= 2){
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.forEach((p, i)=>{
        const x = xAt(p.x), y = yAt(p.y);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.fillStyle = color;
    series.forEach(p=>{
      const x = xAt(p.x), y = yAt(p.y);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI*2);
      ctx.fill();
    });
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((v, i)=>{
      const x = xAt(i), y = yAt(v);
      if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = color;
    const r = total > 60 ? 1.5 : 2.5;
    series.forEach((v, i)=>{
      const x = xAt(i), y = yAt(v);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();
    });
  }

  if(second && second.series && second.series.length){
    const s2 = second.series;
    const isPts2 = typeof s2[0] === 'object';

    if(isPts2){
      if(s2.length >= 2){
        ctx.strokeStyle = second.color || color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        s2.forEach((p, i)=>{
          const x = xAt(p.x), y = yAt2(p.y);
          if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      ctx.fillStyle = second.color || color;
      s2.forEach(p=>{
        const x = xAt(p.x), y = yAt2(p.y);
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI*2);
        ctx.fill();
      });
    } else {
      ctx.strokeStyle = second.color || color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s2.forEach((v, i)=>{
        const x = xAt(i), y = yAt2(v);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.fillStyle = second.color || color;
      const r = total > 60 ? 1.5 : 2.5;
      s2.forEach((v, i)=>{
        const x = xAt(i), y = yAt2(v);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI*2);
        ctx.fill();
      });
    }
  }

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  ctx.font = '9.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const stepX = Math.max(1, Math.floor(total / (narrow ? 4 : 6)));
  labels.forEach((l, i)=>{
    if(i % stepX !== 0 && i !== total-1) return;
    ctx.fillText(l, xAt(i), h - 7);
  });
}



function rangeAround(dateKeyStr, back, forward){
  const out = [];
  for(let i=-back;i<=forward;i++) out.push(addDays(dateKeyStr, i));
  return out;
}

/* ============================================================
   PROGRESS
   ============================================================ */
function renderProgress(){
  const cur = currentKey();
  const S = getActiveState();
  const goal = S.profile.goal || 'gain';
  const g = GOALS[goal] || GOALS.gain;
  const sat = isSaturday(cur);
  const existing = S.weights[cur];
  const box = document.getElementById('weightBoxDate');
  const now = document.getElementById('weightBoxNow');
  const input = document.getElementById('weightInput');
  const btn = document.getElementById('btnSaveWeight');
  const note = document.getElementById('weightNote');

  const d = parseKey(cur);
  const wd = ['вс','пн','вт','ср','чт','пт','сб'][d.getDay()];
  box.textContent = `${cur} (${wd})`;
  now.textContent = existing ? existing+' кг' : 'нет записи';

  if(existing){
    input.value = existing;
    btn.textContent = 'Изменить';
    btn.classList.remove('hint');
    note.className = 'weightnote';
    note.textContent = 'Запись есть. Можно изменить значение.';
  } else {
    input.value = '';
    btn.textContent = 'Записать';
    if(sat){
      btn.classList.remove('hint');
      note.className = 'weightnote';
      note.textContent = 'Суббота — рекомендуемый день взвешивания.';
    } else {
      btn.classList.add('hint');
      note.className = 'weightnote lock';
      note.textContent = 'Суббота — обычный день взвешивания. Можно записать и сегодня.';
    }
  }
  if(isReadOnly()){
    input.disabled = true;
    btn.disabled = true;
    btn.classList.add('hint');
    note.textContent = 'Режим просмотра';
  } else {
    input.disabled = false;
    btn.disabled = false;
  }

  let end = cur > todayKey() ? todayKey() : cur;
  const days = [];
  for(let i=chartScale-1;i>=0;i--) days.push(addDays(end, -i));

  const labels = days.map(k=>{
    const d = parseKey(k);
    return d.getDate() + '.' + pad2(d.getMonth()+1);
  });
  const kcals = days.map(k=> sumDay(k).k);
  const proteins = days.map(k=> sumDay(k).p);

  const wPoints = [];
  let selIdx = -1;
  days.forEach((k,i)=>{
    if(k===cur) selIdx = i;
    if(S.weights[k]) wPoints.push({x:i, y:S.weights[k]});
  });

  drawLine(
    document.getElementById('chartWeight'),
    wPoints,
    '#4f8cff',
    labels,
    selIdx,
    null,
    { value: S.profile.target || 75, color: '#ff453a', label: 'цель ' + (S.profile.target || 75) + ' кг' }
  );

  const wtLabel = document.getElementById('weightTargetLabel');
  if(wtLabel) wtLabel.textContent = S.profile.target || 75;

  const hist = document.getElementById('weightHist');
  const entries = Object.keys(S.weights).sort().reverse().slice(0,10);
  hist.innerHTML = entries.length
    ? entries.map(k=>{
        const dd = parseKey(k);
        const wday = ['вс','пн','вт','ср','чт','пт','сб'][dd.getDay()];
        return `<div data-hist-key="${k}"><span>${k} (${wday})</span><b>${S.weights[k]} кг</b></div>`;
      }).join('')
    : '<div class="empty">Пока нет записей веса</div>';
  hist.querySelectorAll('[data-hist-key]').forEach(el=>{
    el.onclick = ()=>{
      activeDate = el.dataset.histKey;
      stripAnchor = activeDate;
      renderAll(); renderProgress();
    };
  });

  document.getElementById('proteinHint').textContent = chartScale + ' дней';

  drawLine(
    document.getElementById('chartProtein'),
    proteins,
    '#35c759',
    labels,
    selIdx,
    null,
    { value: g.pTrain, color: '#ff453a', label: 'норма ' + g.pTrain + ' г' }
  );

  drawLine(
    document.getElementById('chartKcal'),
    kcals,
    '#ff8a3d',
    labels,
    selIdx,
    null,
    { value: g.kTrain, color: '#ff453a', label: 'норма ' + g.kTrain + ' ккал' }
  );

  renderTrainings();
}

/* ============================================================
   ТРЕНИРОВКИ
   ============================================================ */
function renderTrainings(){
  const S = getActiveState();
  const curDate = parseKey(todayKey());
  const year = curDate.getFullYear();
  const month = curDate.getMonth();

  document.getElementById('trainMonth').textContent =
    MONTHS_FULL[month] + ' ' + year;

  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = todayKey();

  let train = 0, rest = 0, empty = 0;

  for(let d=1; d<=daysInMonth; d++){
    const key = year+'-'+pad2(month+1)+'-'+pad2(d);
    if(key > today) continue;

    const mode = S.modes[key];
    const hasData = dayHasData(key);

    if(mode === 'train') train++;
    else if(mode === 'rest') rest++;
    else if(hasData) rest++;
    else empty++;
  }

  const totalPast = train + rest + empty;
  const percent = totalPast > 0 ? Math.round(train / totalPast * 100) : 0;

  document.getElementById('trainStats').innerHTML = `
    <div class="ts train">
      <div class="v">${train}</div>
      <div class="l">тренировок</div>
    </div>
    <div class="ts rest">
      <div class="v">${rest}</div>
      <div class="l">отдых</div>
    </div>
    <div class="ts empty">
      <div class="v">${empty}</div>
      <div class="l">пусто</div>
    </div>
  `;

  const statsBox = document.getElementById('trainStats');
  let pctRow = statsBox.parentElement.querySelector('.trainpercent');
  if(!pctRow){
    pctRow = document.createElement('div');
    pctRow.className = 'trainpercent';
    statsBox.parentElement.appendChild(pctRow);
  }
  pctRow.innerHTML = `<b>${percent}%</b> тренировочных дней в месяце`;
}

let resizeTimer = null;
window.addEventListener('resize', ()=>{
  if(!document.getElementById('tabProgress').classList.contains('on')) return;
  if(resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(()=>{ renderProgress(); }, 200);
});

/* ============================================================
   КАЛЕНДАРЬ
   ============================================================ */
function openCalendar(){
  const cur = currentKey();
  calYear = parseInt(cur.slice(0,4),10);
  calMonth = parseInt(cur.slice(5,7),10)-1;
  monthPickerOpen = false;
  renderCalendar();
  document.getElementById('calOverlay').classList.add('on');
}
function closeCalendar(){ document.getElementById('calOverlay').classList.remove('on'); }

function renderCalendar(){
  document.getElementById('calTitle').textContent = MONTHS_FULL[calMonth] + ' ' + calYear;

  const picker = document.getElementById('monthPicker');
  picker.classList.toggle('on', monthPickerOpen);
  if(monthPickerOpen){
    picker.innerHTML = MONTHS_FULL.map((m,i)=>
      `<button data-m="${i}" class="${i===calMonth?'on':''}">${m}</button>`
    ).join('');
    picker.querySelectorAll('button').forEach(b=>{
      b.onclick = ()=>{ calMonth = +b.dataset.m; monthPickerOpen = false; renderCalendar(); };
    });
  }

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  ['пн','вт','ср','чт','пт','сб','вс'].forEach(d=>{
    const el = document.createElement('div');
    el.className='dow'; el.textContent=d; grid.appendChild(el);
  });
  const first = new Date(calYear, calMonth, 1);
  let startDow = (first.getDay()+6)%7;
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const cur = currentKey();
  for(let i=0;i<startDow;i++){
    const el = document.createElement('div');
    el.className='cd empty'; grid.appendChild(el);
  }
  for(let d=1;d<=daysInMonth;d++){
    const key = calYear+'-'+pad2(calMonth+1)+'-'+pad2(d);
    const el = document.createElement('div');
    el.className = 'cd' + (key===cur?' on':'') + (key===todayKey()?' today':'') + (dayHasData(key)?' has':'');
    el.textContent = d;
    el.onclick = ()=>{
      activeDate = key; stripAnchor = key; closeCalendar(); renderAll();
    };
    grid.appendChild(el);
  }
}

/* ============================================================
   RENDER ALL
   ============================================================ */
function renderAll(){
  renderDayStrip();
  renderMode();
  renderBars();
  renderMeals();
  renderVitamins();
  renderTotals();
  renderHeader();
  renderTodayBtn();
  if(document.getElementById('tabProgress').classList.contains('on')) renderProgress();
}
function renderHeader(){
  const S = getActiveState();
  const p = S.profile || state.profile;
  const w = latestWeight();
  document.getElementById('hName').textContent = '💪 ' + (p.name||'Виталик');
  document.getElementById('hWeight').textContent = w;
  const goal = GOALS[p.goal] || GOALS.gain;
  const isToday = currentKey()===todayKey();
  document.getElementById('hSub').textContent = (isToday ? 'сегодня' : fmtDateRu(currentKey())) + ' · ' + goal.label.toLowerCase();
}
function renderTodayBtn(){
  document.getElementById('btnToday').classList.toggle('hidden', currentKey()===todayKey());
}

/* ============================================================
   ОНБОРДИНГ
   ============================================================ */
const OB_STEPS = [
  {icon:'💪', title:'Набор массы', text:'Это твой личный трекер питания. Отмечай съеденное — приложение считает калории, белки, жиры, углеводы и воду за день.'},
  {icon:'✅', title:'Как отмечать', text:'Нажми на строку продукта — появится галочка. Внизу приёма есть «+ Внеплановая еда», там же указываешь вес порции.'},
  {icon:'💧', title:'Вода и прогресс', text:'В строке воды — кнопки − и + по 200 мл. Долгое нажатие ускоряет. Вода суммируется по всем приёмам.'}
];
function renderOnboard(){
  const step = OB_STEPS[obIdx];
  document.getElementById('obIcon').textContent = step.icon;
  document.getElementById('obTitle').textContent = step.title;
  document.getElementById('obText').textContent = step.text;
  document.querySelectorAll('#obDots .dot').forEach((d,i)=>{ d.classList.toggle('on', i===obIdx); });
  document.getElementById('obNext').textContent = obIdx === OB_STEPS.length-1 ? 'Начать' : 'Далее';
}
function nextOnboard(){
  if(obIdx < OB_STEPS.length-1){ obIdx++; renderOnboard(); }
  else closeOnboard();
}
function closeOnboard(){
  document.getElementById('onboard').classList.add('hide');
  try{ localStorage.setItem(ONBOARD_KEY, '1'); }catch(e){}
  setTimeout(()=>document.getElementById('onboard').style.display='none', 300);
}

/* ============================================================
   БЭКАП
   ============================================================ */
function exportBackup(){
  try{
    const payload = {
      _app: 'massBuilder',
      _v: STATE_VERSION,
      _exported: new Date().toISOString(),
      state: state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = 'massBuilder-backup-' + d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    try{ localStorage.setItem(LS_LAST_BACKUP, new Date().toISOString()); }catch(e){}
    toast('Бэкап сохранён');
    updateBackupInfo();
  }catch(e){
    console.warn('export fail', e);
    toast('Не удалось сохранить');
  }
}
function updateBackupInfo(){
  const info = document.getElementById('backupInfo');
  if(!info) return;
  let last = null;
  try{ last = localStorage.getItem(LS_LAST_BACKUP); }catch(e){}
  if(!last){
    info.textContent = 'Бэкап ещё не делал';
    info.className = 'backupinfo warn';
  } else {
    const d = new Date(last);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    let txt;
    if(days <= 0) txt = 'сегодня, ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    else if(days === 1) txt = 'вчера';
    else if(days < 7) txt = days + ' дн. назад';
    else txt = days + ' дн. назад · пора сделать';
    info.textContent = 'Последний бэкап: ' + txt;
    info.className = 'backupinfo' + (days >= 7 ? ' warn' : '');
  }
  const btn = document.getElementById('btnAutoRestore');
  if(!btn) return;
  let auto = null;
  try{ auto = JSON.parse(localStorage.getItem(LS_AUTO) || 'null'); }catch(e){}
  if(auto && auto._date === todayKey()){
    btn.disabled = true;
    btn.textContent = '⏪ Откатить на утро (недоступно сегодня)';
  } else if(auto && auto.state){
    btn.disabled = false;
    btn.textContent = '⏪ Откатить на ' + (auto._date || 'прошлый раз');
  } else {
    btn.disabled = true;
    btn.textContent = '⏪ Откатить (снимка нет)';
  }
}
function importBackup(file){
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      const data = JSON.parse(ev.target.result);
      if(!data || data._app !== 'massBuilder' || !data.state){
        toast('Это не бэкап massBuilder');
        return;
      }
      const exp = data._exported ? new Date(data._exported).toLocaleString('ru-RU') : 'неизвестно';
      const ok = confirm(
        'Восстановить данные из бэкапа?\n\n' +
        'Файл: ' + file.name + '\n' +
        'Экспортирован: ' + exp + '\n\n' +
        'Все текущие данные будут ЗАМЕНЕНЫ. Продолжить?'
      );
      if(!ok) return;
      try{ localStorage.setItem(LS_BEFORE_IMPORT, JSON.stringify(state)); }catch(e){}
      state = Object.assign({
        _v: STATE_VERSION,
        meals:{}, extras:{}, water:{}, vitamins:{}, weights:{}, modes:{},
        profile:{ name:'Виталик', height:180, target:75, weight:67.5, goal:'gain', theme:'dark', shift:0 },
        customFoods:[]
      }, data.state);
      state._v = STATE_VERSION;
      state.profile = Object.assign({name:'Виталик',height:180,target:75,weight:67.5,goal:'gain',theme:'dark',shift:0}, data.state.profile||{});
      saveStateImmediate();
      applyTheme();
      renderAll();
      toast('Восстановлено');
      closeMenu();
    }catch(e){
      console.warn('import fail', e);
      toast('Ошибка чтения файла');
    }
  };
  reader.readAsText(file);
}
function autoSnapshot(){
  try{
    const last = JSON.parse(localStorage.getItem(LS_AUTO) || 'null');
    if(last && last._date === todayKey()) return;
    const snap = {
      _app: 'massBuilder',
      _auto: true,
      _v: STATE_VERSION,
      _date: todayKey(),
      _savedAt: new Date().toISOString(),
      state: state
    };
    localStorage.setItem(LS_AUTO, JSON.stringify(snap));
  }catch(e){}
}
function autoRestore(){
  try{
    const auto = JSON.parse(localStorage.getItem(LS_AUTO) || 'null');
    if(!auto || !auto.state){ toast('Снимка нет'); return; }
    const ok = confirm(
      'Восстановить данные из автоснимка?\n\n' +
      'Снимок от: ' + (auto._date || '?') + '\n\n' +
      'Все текущие данные будут ЗАМЕНЕНЫ. Продолжить?'
    );
    if(!ok) return;
    try{ localStorage.setItem(LS_BEFORE_IMPORT, JSON.stringify(state)); }catch(e){}
    state = Object.assign({}, auto.state, {_v: STATE_VERSION});
    state.profile = Object.assign({name:'Виталик',height:180,target:75,weight:67.5,goal:'gain',theme:'dark',shift:0}, auto.state.profile||{});
    saveStateImmediate();
    applyTheme();
    renderAll();
    toast('Откатились на ' + auto._date);
    closeMenu();
  }catch(e){
    toast('Не удалось');
  }
}

/* ============================================================
   МЕНЮ
   ============================================================ */
function openMenu(){
  const p = state.profile;
  document.getElementById('pName').value = p.name || 'Виталик';
  document.getElementById('pHeight').value = p.height;
  document.getElementById('pGoal').value = p.goal || 'gain';
  document.getElementById('pTarget').value = p.target;
  document.getElementById('pWeight').value = p.weight || 67.5;
  document.getElementById('pTheme').value = p.theme || 'dark';
  document.getElementById('pShift').value = p.shift || 0;
  updateBackupInfo();

  // sync fields
  const cfg = getSyncCfg();
  if(cfg.owner) document.getElementById('syncOwner').value = cfg.owner;
  if(cfg.repo) document.getElementById('syncRepo').value = cfg.repo;
  if(cfg.file) document.getElementById('syncFile').value = cfg.file;
  if(cfg.token) document.getElementById('syncToken').value = cfg.token;
  updateSyncInfo(null);

  // trainer fields
  loadTrainerSettings();
  const tmCheck = document.getElementById('trainerMode');
  if(tmCheck) tmCheck.checked = trainerMode;
  const tmBlock = document.getElementById('trainerBlock');
  if(tmBlock) tmBlock.style.display = trainerMode ? 'block' : 'none';
  const tmToken = document.getElementById('trainerToken');
  if(tmToken) tmToken.value = getTrainerToken();
  renderClientsList();

  document.getElementById('menuOverlay').classList.add('on');
}
function closeMenu(){ document.getElementById('menuOverlay').classList.remove('on'); }

/* ============================================================
   СОБЫТИЯ
   ============================================================ */
function bindBaseEvents(){
  document.getElementById('dayPrev').onclick = ()=>{
    stripAnchor = addDays(stripAnchor||todayKey(), -7);
    renderDayStrip(); toast('Неделя назад');
  };
  document.getElementById('dayNext').onclick = ()=>{
    stripAnchor = addDays(stripAnchor||todayKey(), 7);
    renderDayStrip(); toast('Неделя вперёд');
  };
  document.getElementById('btnToday').onclick = ()=>{
    activeDate = todayKey();
    stripAnchor = todayKey();
    renderAll();
    toast('Сегодня');
  };

  document.getElementById('scaleSeg').addEventListener('click', (e)=>{
    const b = e.target.closest('button');
    if(!b) return;
    chartScale = +b.dataset.scale;
    document.querySelectorAll('#scaleSeg button').forEach(x=>x.classList.toggle('on', x===b));
    renderProgress();
  });

  document.getElementById('btnCalendar').onclick = openCalendar;
  document.getElementById('calClose').onclick = closeCalendar;
  document.getElementById('calOverlay').onclick = (e)=>{ if(e.target.id==='calOverlay') closeCalendar(); };
  document.getElementById('calTitle').onclick = ()=>{ monthPickerOpen = !monthPickerOpen; renderCalendar(); };
  document.getElementById('calPrev').onclick = ()=>{ calMonth--; if(calMonth<0){ calMonth=11; calYear--; } renderCalendar(); };
  document.getElementById('calNext').onclick = ()=>{ calMonth++; if(calMonth>11){ calMonth=0; calYear++; } renderCalendar(); };
  document.getElementById('calToday').onclick = ()=>{ activeDate = todayKey(); stripAnchor = todayKey(); closeCalendar(); renderAll(); };
  document.getElementById('calYesterday').onclick = ()=>{ activeDate = addDays(todayKey(),-1); stripAnchor = activeDate; closeCalendar(); renderAll(); };
  document.getElementById('calTomorrow').onclick = ()=>{ activeDate = addDays(todayKey(),1); stripAnchor = activeDate; closeCalendar(); renderAll(); };

  document.querySelectorAll('#modeSeg button').forEach(b=>{
    b.onclick = ()=>{
      if(isReadOnly()){ toast('Режим просмотра'); return; }
      const date = currentKey();
      setMode(date, b.dataset.mode);
      if(date !== todayKey()) toast('Режим для '+date);
      renderAll();
    };
  });

  document.querySelectorAll('.tabbar button').forEach(b=>{
    b.onclick = ()=>{
      const tab = b.dataset.tab;
      if(tab === 'settings'){ openMenu(); return; }
      document.querySelectorAll('.tabbar button').forEach(x=>x.classList.remove('on'));
      document.querySelectorAll('.tabpage').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      document.getElementById(tab==='today'?'tabToday':'tabProgress').classList.add('on');
      if(tab==='progress') renderProgress();
    };
  });

  document.getElementById('foodClose').onclick = closeFoodModal;
  document.getElementById('foodOverlay').onclick = (e)=>{ if(e.target.id==='foodOverlay') closeFoodModal(); };
  document.getElementById('foodSearch').oninput = (e)=> renderFoodList(e.target.value);
  document.getElementById('btnCustomToggle').onclick = ()=>{
    const b = document.getElementById('customBlock');
    b.style.display = b.style.display==='none'?'block':'none';
  };
  document.getElementById('cfAdd').onclick = ()=>{
    const name = document.getElementById('cfName').value.trim();
    const kcal = +document.getElementById('cfKcal').value||0;
    const protein = +document.getElementById('cfProtein').value||0;
    const fat = +document.getElementById('cfFat').value||0;
    const carbs = +document.getElementById('cfCarbs').value||0;
    const portion = +document.getElementById('cfPortion').value||100;
    if(!name){ toast('Введи название'); return; }
    const save = document.getElementById('cfSave').checked;
    if(save){ state.customFoods.push({name,kcal,protein,fat,carbs,defaultPortion:portion}); }
    closeFoodModal();
    openPortion({name,kcal,protein,fat,carbs,defaultPortion:portion});
    portionMealId = currentMealId;
  };

  document.getElementById('portionClose').onclick = closePortion;
  document.getElementById('portionOverlay').onclick = (e)=>{ if(e.target.id==='portionOverlay') closePortion(); };
  document.getElementById('portionInput').oninput = updatePortionPreview;
  document.getElementById('portionInput').addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); document.getElementById('portionAdd').click(); }
  });
  document.getElementById('portionPlus').onclick = ()=>{
    const inp = document.getElementById('portionInput');
    const step = (portionFood && portionFood.small) ? 10 : 50;
    inp.value = (+inp.value || 0) + step;
    updatePortionPreview();
  };
  document.getElementById('portionMinus').onclick = ()=>{
    const inp = document.getElementById('portionInput');
    const step = (portionFood && portionFood.small) ? 10 : 50;
    inp.value = Math.max(1, (+inp.value || 0) - step);
    updatePortionPreview();
  };
  document.getElementById('portionAdd').onclick = ()=>{
    if(!portionFood) return;
    let p = Math.max(1, +document.getElementById('portionInput').value || 100);
    if(p > 5000) p = 5000;
    const coef = p/100;
    addExtra(portionMealId, portionFood.name,
      portionFood.kcal * coef, portionFood.protein * coef,
      portionFood.fat * coef, portionFood.carbs * coef, p);
    closePortion();
    closeFoodModal();
    toast('Добавлено: '+portionFood.name+' · '+p+' г');
  };

  document.getElementById('editClose').onclick = closeEditExtra;
  document.getElementById('editOverlay').onclick = (e)=>{ if(e.target.id==='editOverlay') closeEditExtra(); };
  document.getElementById('edSave').onclick = ()=>{
    if(!editingExtra) return;
    const { mealId, idx } = editingExtra;
    const date = currentKey();
    const arr = getExtras(date, mealId);
    if(!arr[idx]) return;
    arr[idx] = {
      name: document.getElementById('edName').value.trim() || arr[idx].name,
      kcal: Math.round(+document.getElementById('edKcal').value || 0),
      protein: Math.round((+document.getElementById('edProtein').value || 0) * 10) / 10,
      fat: Math.round((+document.getElementById('edFat').value || 0) * 10) / 10,
      carbs: Math.round((+document.getElementById('edCarbs').value || 0) * 10) / 10,
      portion: arr[idx].portion || null
    };
    saveState(); closeEditExtra(); renderAll(); toast('Изменено');
  };

  document.getElementById('menuClose').onclick = closeMenu;
  document.getElementById('menuOverlay').onclick = (e)=>{ if(e.target.id==='menuOverlay') closeMenu(); };
  document.getElementById('profSave').onclick = ()=>{
    const p = state.profile;
    p.name = document.getElementById('pName').value.trim() || 'Виталик';
    p.height = +document.getElementById('pHeight').value || 180;
    p.goal = document.getElementById('pGoal').value || 'gain';
    p.target = +document.getElementById('pTarget').value || 75;
    p.weight = +document.getElementById('pWeight').value || 67.5;
    p.theme = document.getElementById('pTheme').value || 'dark';
    p.shift = +document.getElementById('pShift').value || 0;
    saveState(); applyTheme(); renderAll();
    closeMenu();
    toast('Сохранено');
  };

  /* --- Sync --- */
  document.getElementById('btnSyncNow').onclick = ()=>{
    const c = getSyncCfg();
    c.owner = document.getElementById('syncOwner').value.trim();
    c.repo = document.getElementById('syncRepo').value.trim();
    c.file = document.getElementById('syncFile').value.trim();
    c.token = document.getElementById('syncToken').value.trim();
    setSyncCfg(c);
    syncNow(false);
  };
  document.getElementById('btnSyncCheck').onclick = async ()=>{
    const c = getSyncCfg();
    c.owner = document.getElementById('syncOwner').value.trim();
    c.repo = document.getElementById('syncRepo').value.trim();
    c.file = document.getElementById('syncFile').value.trim();
    c.token = document.getElementById('syncToken').value.trim();
    setSyncCfg(c);
    try{
      const cur = await ghGetFile(c);
      toast(cur.sha ? 'Связь есть, файл найден ✓' : 'Связь есть, файл пуст');
    }catch(e){
      toast('Ошибка: ' + e.message);
    }
  };
  document.getElementById('btnSyncClear').onclick = ()=>{
    if(!confirm('Забыть токен и настройки синхронизации?')) return;
    setSyncCfg({});
    document.getElementById('syncToken').value = '';
    updateSyncInfo(null);
    toast('Токен забыт');
  };

  /* --- Trainer mode --- */
  loadTrainerSettings();
  const tmCheck = document.getElementById('trainerMode');
  const tmBlock = document.getElementById('trainerBlock');
  const tmToken = document.getElementById('trainerToken');
  if(tmCheck) tmCheck.checked = trainerMode;
  if(tmBlock) tmBlock.style.display = trainerMode ? 'block' : 'none';
  if(tmToken) tmToken.value = getTrainerToken();

  if(tmCheck) tmCheck.onchange = ()=>{
    trainerMode = tmCheck.checked;
    if(tmBlock) tmBlock.style.display = trainerMode ? 'block' : 'none';
    if(!trainerMode){ activeClient=null; trainerData=null; }
    saveTrainerSettings();
    renderClientsList();
    applyTrainerView();
  };
  if(tmToken) tmToken.onchange = ()=> setTrainerToken(tmToken.value.trim());

  const addClientBtn = document.getElementById('btnAddClient');
  if(addClientBtn) addClientBtn.onclick = ()=>{
    const name = document.getElementById('clientName').value.trim();
    const owner = document.getElementById('clientOwner').value.trim();
    const repo = document.getElementById('clientRepo').value.trim();
    const file = document.getElementById('clientFile').value.trim();
    if(!name || !owner || !repo || !file){ toast('Заполни все поля'); return; }
    clients.push({name, owner, repo, file});
    saveTrainerSettings();
    document.getElementById('clientName').value='';
    document.getElementById('clientOwner').value='';
    document.getElementById('clientRepo').value='';
    document.getElementById('clientFile').value='';
    renderClientsList();
    applyTrainerView();
    toast('Клиент добавлен');
  };

  const clientPicker = document.getElementById('clientPicker');
  if(clientPicker){
    clientPicker.onchange = ()=>{
      const val = clientPicker.value;
      if(!val){ exitTrainerMode(); return; }
      const c = clients.find(x=>`${x.owner}/${x.repo}/${x.file}` === val);
      if(c) enterTrainerMode(c);
    };
  }

  document.getElementById('btnExport').onclick = exportBackup;
  document.getElementById('btnImport').onclick = ()=> document.getElementById('fileInput').click();
  document.getElementById('fileInput').onchange = (e)=>{
    const f = e.target.files && e.target.files[0];
    if(f) importBackup(f);
    e.target.value = '';
  };
  document.getElementById('btnAutoRestore').onclick = autoRestore;

  document.getElementById('btnSaveWeight').onclick = ()=>{
    if(isReadOnly()){ toast('Режим просмотра'); return; }
    const cur = currentKey();
    const v = parseFloat(document.getElementById('weightInput').value);
    if(!v || v<=0){ toast('Введи вес'); return; }
    if(v < 30 || v > 250){ toast('Вес 30–250 кг'); return; }
    const existing = !!state.weights[cur];
    state.weights[cur] = v;
    state.profile.weight = v;
    saveStateImmediate();
    renderProgress(); renderHeader();
    toast(existing ? 'Вес изменён: '+v+' кг' : 'Вес записан: '+v+' кг');
  };

  document.getElementById('obNext').onclick = nextOnboard;
  document.getElementById('obSkip').onclick = closeOnboard;

  document.querySelectorAll('.sheet').forEach(sheet=>{
    let startY = 0, curY = 0, dragging = false;
    sheet.addEventListener('touchstart', (e)=>{
      if(sheet.scrollTop > 0) return;
      startY = e.touches[0].clientY; dragging = true;
      sheet.style.transition = 'none';
    }, {passive:true});
    sheet.addEventListener('touchmove', (e)=>{
      if(!dragging) return;
      curY = e.touches[0].clientY;
      const dy = curY - startY;
      if(dy > 0) sheet.style.transform = 'translateY('+dy+'px)';
    }, {passive:true});
    sheet.addEventListener('touchend', ()=>{
      if(!dragging) return;
      const dy = curY - startY;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if(dy > 100){
        const ov = sheet.closest('.overlay');
        if(ov) ov.classList.remove('on');
      }
      dragging = false;
    });
  });

  window.addEventListener('beforeunload', ()=>{ saveStateImmediate(); });
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'hidden') saveStateImmediate();
  });
  window.addEventListener('pagehide', ()=>{ saveStateImmediate(); });

  renderClientsList();
  applyTrainerView();
}

/* ============================================================
   СОБЫТИЯ — делегирование на список приёмов
   ============================================================ */
let mealEventsBound = false;
function bindMealEvents(){
  if(mealEventsBound) return;
  mealEventsBound = true;
  const wrap = document.getElementById('mealsWrap');

  wrap.addEventListener('click', (ev)=>{
    if(isReadOnly()) return;
    const t = ev.target;

    const pill = t.closest('.pill');
    if(pill){
      const mealId = pill.dataset.meal;
      const v = pill.dataset.variant;
      const date = currentKey();
      const md = getMealData(date, mealId);
      if(md._activeVariant === v) return;
      MEALS.find(x=>x.id===mealId).variants.forEach(vr=>{ md[vr.id] = {}; });
      md._activeVariant = v;
      saveState(); renderAll();
      const mealName = MEALS.find(x=>x.id===mealId).variants.find(x=>x.id===v).name;
      toast('Вариант: '+mealName+' · галочки сброшены');
      return;
    }

    const wbtn = t.closest('[data-wa]');
    if(wbtn && !wbtn._longpressed){
      const mealId = wbtn.dataset.wa;
      const delta = +wbtn.dataset.delta;
      const cur = getWater(currentKey(), mealId);
      const next = Math.max(0, cur + delta);
      setWater(currentKey(), mealId, next);
      updateMealWaterRow(mealId);
      renderBarsAndTotals();
      vibrate(8);
      return;
    }
    if(wbtn) wbtn._longpressed = false;

    const item = t.closest('.item');
    if(item){
      if(t.closest('.del')) return;
      const date = currentKey();
      const mealId = item.dataset.meal;
      const itemId = item.dataset.item;
      const md = getMealData(date, mealId);
      const v = md._activeVariant;
      if(!md[v]) md[v]={};
      md[v][itemId] = !md[v][itemId];
      item.classList.toggle('done', !!md[v][itemId]);
      saveState();
      updateMealKcal(mealId);
      renderBarsAndTotals();
      vibrate(5);
      return;
    }

    const del = t.closest('.extra .del');
    if(del){
      ev.stopPropagation();
      const date = currentKey();
      const mealId = del.dataset.meal;
      const idx = +del.dataset.idx;
      const arr = getExtras(date, mealId);
      arr.splice(idx,1); saveState(); renderAll();
      return;
    }

    const edit = t.closest('[data-edit-meal]');
    if(edit){
      openEditExtra(edit.dataset.editMeal, +edit.dataset.editIdx);
      return;
    }

    const addBtn = t.closest('[data-add]');
    if(addBtn){
      openFoodModal(addBtn.dataset.meal);
      return;
    }
  });

  let lpTimer = null, lpInterval = null, lpTarget = null, lpStarted = false;
  const startLP = (el)=>{
    lpStarted = false;
    lpTimer = setTimeout(()=>{
      lpStarted = true;
      el._longpressed = true;
      vibrate(15);
      const delta = +el.dataset.delta;
      lpInterval = setInterval(()=>{
        const mealId = el.dataset.wa;
        const cur = getWater(currentKey(), mealId);
        const next = Math.max(0, cur + delta);
        if(next === cur){ stopLP(); return; }
        setWater(currentKey(), mealId, next);
        updateMealWaterRow(mealId);
        renderBarsAndTotals();
      }, 250);
    }, 500);
  };
  const stopLP = ()=>{
    if(lpTimer){ clearTimeout(lpTimer); lpTimer = null; }
    if(lpInterval){ clearInterval(lpInterval); lpInterval = null; }
    if(lpTarget && lpStarted){ lpTarget._longpressed = true; setTimeout(()=>{ lpTarget._longpressed = false; }, 50); }
    lpTarget = null;
  };

  wrap.addEventListener('touchstart', (ev)=>{
    if(isReadOnly()) return;
    const wbtn = ev.target.closest('[data-wa]');
    if(!wbtn) return;
    lpTarget = wbtn;
    startLP(wbtn);
  }, {passive:true});
  wrap.addEventListener('touchend', stopLP, {passive:true});
  wrap.addEventListener('touchcancel', stopLP, {passive:true});
  wrap.addEventListener('touchmove', stopLP, {passive:true});

  wrap.addEventListener('mousedown', (ev)=>{
    if(isReadOnly()) return;
    const wbtn = ev.target.closest('[data-wa]');
    if(!wbtn) return;
    lpTarget = wbtn;
    startLP(wbtn);
  });
  wrap.addEventListener('mouseup', stopLP);
  wrap.addEventListener('mouseleave', stopLP);
}

/* ============================================================
   INIT
   ============================================================ */
loadState();
loadTrainerSettings();
applyTheme();
stripAnchor = todayKey();
autoSnapshot();
bindBaseEvents();
bindMealEvents();
renderAll();
updateBackupInfo();

try{
  if(!localStorage.getItem(ONBOARD_KEY)) renderOnboard();
  else document.getElementById('onboard').style.display = 'none';
}catch(e){ renderOnboard(); }
