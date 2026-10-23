/* Action Items — web app. Data lives in your Google Sheet (via its Apps Script web app). */
'use strict';

const STATUS = ['Not started', 'In progress', 'Waiting', 'Done', 'Cancelled'];
const PRIO = ['1 - High', '2 - Medium', '3 - Low'];
const REC = ['None', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];
const STATUS_C = { 'Not started': ['#F1F3F5', '#495057'], 'In progress': ['#DBE7FF', '#1D4ED8'], 'Waiting': ['#EDE4FF', '#6B21A8'],
  'Done': ['#DCFCE7', '#166534'], 'Cancelled': ['#F1F3F5', '#9CA3AF'] };
const PRIO_C = { '1': ['#FDE2E1', '#B91C1C'], '2': ['#FEF3C7', '#92400E'], '3': ['#E0F2FE', '#075985'] };
const AREA_C = { 'Work': ['#DBEAFE', '#1E40AF'], 'Home': ['#FCE7F3', '#9D174D'], 'Personal': ['#FEF9C3', '#854D0E'],
  'M.Sc': ['#EDE9FE', '#5B21B6'], 'Reserve Duty': ['#E9EDD5', '#4D5527'], 'Family': ['#FFE4E6', '#9F1239'],
  'Finance': ['#DCFCE7', '#166534'], 'Health': ['#CCFBF1', '#115E59'] };
const AREA_PALETTE = [['#E0F2FE', '#075985'], ['#FFEDD5', '#9A3412'], ['#ECFCCB', '#3F6212'], ['#FAE8FF', '#86198F'], ['#E0E7FF', '#3730A3'], ['#FEF3C7', '#92400E'], ['#CFFAFE', '#155E75'], ['#FFE4E6', '#9F1239']];
function areaColor(a) {
  if (!a) return null;
  if (AREA_C[a]) return AREA_C[a];
  let h = 0; for (const ch of String(a)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AREA_PALETTE[h % AREA_PALETTE.length];
}
const HORIZONS = ['Overdue', 'Today', 'This week', 'Next week', 'This month', 'Later', 'No date'];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* which build is running: 'personal' (the original) or 'public' (the copy anyone can set up for themselves) */
const EDITION = (typeof window !== 'undefined' && window.AI_EDITION) || 'personal';
const TEMPLATE_URL = (typeof window !== 'undefined' && window.AI_TEMPLATE) || '';   // a Google Sheet to copy ("…/copy"), when one exists
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};

let settings = store.get('ai.settings', { url: '', demo: false });
const sess = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
};
let password = store.get('ai.pw', null) || sess.get('ai.pw') || '';
let username = store.get('ai.user', null) || sess.get('ai.user') || '';
const remembered = () => !!store.get('ai.pw', null);
let ui = store.get('ai.ui', { tab: 'focus', area: 'All' });
const EMPTY = () => ({ items: [], areas: Object.keys(AREA_C), people: ['Me'], report: null });
let data = (store.get('ai.pw', null) && store.get('ai.cache', null)) || EMPTY();
let search = '';
let role = 'owner', me = { name: '', canSuggest: false }, pending = [], mySugg = [], pwReq = [];
let myDay = { date: '', rows: [] }, focusRemote = null;
const isGuest = () => role === 'guest';
let weekOff = 0;

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { if (!s) return null; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(d.getDate(), last)); return x; };
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const dayDiff = (a, b) => Math.round((a - b) / 86400000);
const fmt = (s, withDay) => { const d = parse(s); if (!d) return ''; return (withDay ? d.toLocaleDateString(locale(), { weekday: 'short' }) + ' ' : '') + `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const weekStart = (d) => addDays(d, -d.getDay()); // Sunday

const isClosed = (it) => it.status === 'Done' || it.status === 'Cancelled';
function horizon(it) {
  if (isClosed(it)) return 'Closed';
  const d = parse(it.due); if (!d) return 'No date';
  const t = today();
  if (d < t) return 'Overdue';
  if (+d === +t) return 'Today';
  const ws = weekStart(t);
  if (d <= addDays(ws, 6)) return 'This week';
  if (d <= addDays(ws, 13)) return 'Next week';
  if (d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()) return 'This month';
  return 'Later';
}
function nextDue(it) {
  const d = parse(it.due); if (!d) return null;
  switch (it.rec) {
    case 'Daily': return addDays(d, 1); case 'Weekly': return addDays(d, 7);
    case 'Monthly': return addMonths(d, 1); case 'Quarterly': return addMonths(d, 3); case 'Yearly': return addMonths(d, 12);
    default: return null;
  }
}
const prioRank = (p) => parseInt(String(p || '2').charAt(0), 10) || 2;
const sortOpen = (a, b) => (parse(a.due) || new Date(9e15)) - (parse(b.due) || new Date(9e15)) || prioRank(a.prio) - prioRank(b.prio);

/* ---------- API ---------- */
async function api(method, body) {
  if (settings.demo) return demoApi(method, body);
  if (!settings.url) throw new Error('No sheet URL yet');
  if (!password) { showLock(); throw new Error('Locked'); }
  let res;
  if (!username) { showLock(); throw new Error('Locked'); }
  const payload = Object.assign({ username, password }, method === 'GET' ? { action: 'list' } : body);
  try {
    res = await fetch(settings.url, { method: 'POST', body: JSON.stringify(payload) });
  } catch (e) {
    if (!isGuest() && body && (body.action === 'save' || body.action === 'delete') && !navigator.onLine) {
      queuePush(body); return { ok: true, queued: true, row: body.item ? body.item.row || 0 : 0 };
    }
    throw new Error('Can\'t reach the sheet. Check: (1) URL ends with /exec, (2) Deploy › Manage deployments › Who has access = Anyone, then New version › Deploy. Tip: ⚙ › Test in browser.');
  }
  let j;
  try { j = await res.json(); }
  catch (e) { throw new Error('The sheet answered with a web page instead of data — check the deployment: Who has access = Anyone, URL ends with /exec'); }
  if (!j.ok) { const err = new Error(j.error || 'Server error'); err.auth = !!j.auth; throw err; }
  return j;
}

function setSync(text, err) {
  $('#sync').textContent = text && !err ? '· ' + text : '';
  const e = $('#syncErr'); if (e) { e.hidden = !err; e.textContent = err ? '⚠ ' + text : ''; }
}
let ciOpenAfterLoad = /^#calreview/.test(location.hash);
async function load(quiet) {
  if (!settings.demo && (!settings.url || !password || !username)) { showLock(); return false; }
  setSync(L('syncing…', 'מסנכרן…'));
  try {
    await flushQueue();
    const j = await api('GET');
    applyList(j);
    setSync(L('synced ', 'סונכרן ') + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    if (e.auth) { lockApp(e.message); return false; }
    setSync(L('Not synced', 'לא מסונכרן') + (queue().length ? L(` · ${queue().length} waiting`, ` · ${queue().length} ממתינים`) : ''), true);
    if (!quiet) toast(e.message);
    render(); return false;
  }
  render(); return true;
}

/* ---------- undo / redo ---------- */
const hist = { undo: [], redo: [] };
const clone = (o) => o ? JSON.parse(JSON.stringify(o)) : null;
function record(b, a) { hist.undo.push({ b: clone(b), a: clone(a) }); if (hist.undo.length > 50) hist.undo.shift(); hist.redo = []; }
function remapRow(oldRow, newRow) {
  [hist.undo, hist.redo].forEach(st => st.forEach(h => ['b', 'a'].forEach(k => { if (h[k] && h[k].row === oldRow) h[k].row = newRow; })));
}
async function applyState(fromState, toState) {
  if (!toState) return remove(fromState.row, false);
  if (!fromState) { const copy = clone(toState); const old = copy.row; copy.row = 0; const ok = await save(copy, false); if (ok) remapRow(old, copy.row); return ok; }
  return save(clone(toState), false);
}
let histBusy = false;
async function undo() {
  if (histBusy || !hist.undo.length) return; histBusy = true;
  const h = hist.undo.pop();
  if (await applyState(h.a, h.b)) { hist.redo.push(h); toast(L('↶ Undone', '↶ בוטל') + (h.b ? ': ' + h.b.item : '')); } else hist.undo.push(h);
  histBusy = false; render();
}
async function redo() {
  if (histBusy || !hist.redo.length) return; histBusy = true;
  const h = hist.redo.pop();
  if (await applyState(h.b, h.a)) { hist.undo.push(h); toast(L('↷ Redone', '↷ שוחזר') + (h.a ? ': ' + h.a.item : '')); } else hist.redo.push(h);
  histBusy = false; render();
}
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});

async function save(it, track = true) {
  const prev = it.row ? clone(data.items.find(x => x.row === it.row)) : null;
  const before = JSON.stringify(data.items);
  const i = data.items.findIndex(x => x.row === it.row && it.row);
  if (i >= 0) data.items[i] = it; else data.items.push(Object.assign({ row: 0, _tmp: true }, it));
  render();
  try {
    const payload = Object.assign({}, it); delete payload._tmp;
    const j = await api('POST', { action: 'save', item: payload });
    it.row = j.row;
    const k = data.items.findIndex(x => x._tmp);
    if (k >= 0) { data.items[k] = Object.assign({}, it); }
    if (!settings.demo && remembered()) store.set('ai.cache', data);
    if (track) record(prev, it);
    render();
    return true;
  } catch (e) {
    data.items = JSON.parse(before); render(); toast('Not saved: ' + e.message); return false;
  }
}
async function remove(row, track = true) {
  const before = JSON.stringify(data.items);
  const prev = clone(data.items.find(x => x.row === row));
  data.items = data.items.filter(x => x.row !== row); render();
  try {
    await api('POST', { action: 'delete', row }); if (!settings.demo && remembered()) store.set('ai.cache', data);
    if (track) { record(prev, null); toast('Deleted — tap ↶ Undo to bring it back'); }
    render(); return true;
  } catch (e) { data.items = JSON.parse(before); render(); toast('Not deleted: ' + e.message); return false; }
}

/* ---------- complete / reopen ---------- */
async function toggleDone(it, opt) {
  const copy = Object.assign({}, it), at = Object.assign({}, lastTap);   // where the item was tapped (before any question box)
  if (isClosed(it)) { copy.status = 'In progress'; copy.done = ''; await save(copy); return; }
  const h = opt && opt.hours !== undefined ? opt.hours : await askHours(it);
  if (h === null) return;                                   // closed the box = cancel
  if (h !== '') copy.acthrs = String(h);
  const nd = nextDue(it);
  if (nd && it.rec && it.rec !== 'None') {
    copy.due = iso(nd); copy.status = 'Not started'; copy.wsince = '';
    if (Array.isArray(copy.checklist)) copy.checklist = copy.checklist.map(x => ({ t: x.t, d: false }));
    const plan = parseFloat(it.hrs);
    if (h !== '' && plan && Math.abs(h - plan) > 1) {
      const upd = await confirmBox(tr('Update the plan?'),
        L(`This took you ${h} h, but "${it.item}" is planned for ${plan} h.\n\nPlan ${h} h for the next time (${fmt(copy.due, true)})?`,
          `זה לקח לך ${h} שע׳, אבל "${it.item}" מתוכנן ל-${plan} שע׳.\n\nלתכנן ${h} שע׳ לפעם הבאה (${fmt(copy.due, true)})?`),
        L(`Plan ${h} h`, `תכנן ${h} שע׳`), L(`Keep ${plan} h`, `השאר ${plan} שע׳`));
      if (upd) copy.hrs = String(h);
    }
    celebrate(at.x, at.y);                                    // right away — don't wait for the sheet
    if (await save(copy)) { toast(L(`Done ✓  Next: ${fmt(copy.due, true)}`, `בוצע ✓  הבא: ${fmt(copy.due, true)}`), { label: L('↶ Undo', '↶ ביטול'), fn: undo }); }
  } else {
    copy.status = 'Done'; copy.done = iso(today());
    celebrate(at.x, at.y);
    if (await save(copy)) toast(L('Done ✓', 'בוצע ✓'), { label: L('↶ Undo', '↶ ביטול'), fn: undo });
  }
}

/* ---------- 🎉 celebration when an item is completed (in the background, never blocks) ---------- */
let lastTap = { x: innerWidth / 2, y: innerHeight / 2 };
document.addEventListener('pointerdown', (e) => { lastTap = { x: e.clientX, y: e.clientY }; }, true);
function celebrate(x, y) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  x = x ?? lastTap.x; y = y ?? lastTap.y;
  const layer = document.createElement('div'); layer.className = 'celebrate';
  const cols = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6', '#FB923C'];
  const N = innerWidth < 600 ? 70 : 110;
  for (let k = 0; k < N; k++) {
    const c = document.createElement('i');
    const ang = (-90 + (Math.random() - 0.5) * 150) * Math.PI / 180, sp = 180 + Math.random() * 380;
    c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.background = cols[k % cols.length];
    c.style.setProperty('--dx', Math.cos(ang) * sp + 'px'); c.style.setProperty('--dy', Math.sin(ang) * sp + 'px');
    c.style.setProperty('--fall', (innerHeight - y + 120 + Math.random() * 200) + 'px');
    c.style.setProperty('--rot', (Math.random() * 1080 - 540) + 'deg');
    c.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
    if (k % 4 === 0) { c.style.borderRadius = '50%'; c.style.width = c.style.height = '8px'; }
    else if (k % 4 === 1) { c.style.width = '4px'; c.style.height = '14px'; }
    layer.appendChild(c);
  }
  ['🎉', '✨', '🥳', '⭐', '👏'].sort(() => Math.random() - 0.5).slice(0, 3).forEach((em, k) => {
    const e = document.createElement('b'); e.textContent = em;
    e.style.left = (x + (k - 1) * 46) + 'px'; e.style.top = (y - 10) + 'px'; e.style.animationDelay = (k * 0.08) + 's';
    layer.appendChild(e);
  });
  const glow = document.createElement('u'); glow.style.left = x + 'px'; glow.style.top = y + 'px'; layer.appendChild(glow);
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3200);
}

/* ---------- small modal helpers ---------- */
function askHours(it) {
  return new Promise(resolve => {
    const d = $('#dlgHours'), f = $('#frmHours'), inp = f.elements.namedItem('h');
    $('#hoursTitle').textContent = `"${it.item}"` + (parseFloat(it.hrs) ? L(` — planned ${it.hrs} h`, ` — תוכנן ${it.hrs} שע׳`) : '');
    inp.value = it.hrs || '';
    $('#hoursQuick').innerHTML = [0.25, 0.5, 1, 1.5, 2, 3, 4, 8].map(v => `<button type="button" data-h="${v}">${v} ${L('h', 'שע׳')}</button>`).join('');
    let done = false; const finish = (v) => { if (done) return; done = true; if (d.open) d.close(); resolve(v); };
    $('#hoursQuick').onclick = (e) => { const b = e.target.closest('[data-h]'); if (b) inp.value = b.dataset.h; };
    f.onsubmit = (e) => { e.preventDefault(); const v = parseFloat(inp.value); finish(isNaN(v) ? '' : v); };
    $('#hoursSkip').onclick = () => finish('');
    $('#hoursX').onclick = () => finish(null);
    d.oncancel = () => finish(null);
    d.showModal(); setTimeout(() => inp.select(), 50);
  });
}
function confirmBox(title, msg, yes, no) {
  return new Promise(resolve => {
    const d = $('#dlgConfirm');
    $('#cfTitle').textContent = title; $('#cfMsg').innerText = msg; $('#cfYes').textContent = yes; $('#cfNo').textContent = no;
    let done = false; const finish = (v) => { if (done) return; done = true; if (d.open) d.close(); resolve(v); };
    $('#cfYes').onclick = () => finish(true); $('#cfNo').onclick = () => finish(false); d.oncancel = () => finish(false);
    d.showModal();
  });
}
const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
/* last actual hours for this recurring item, or for a previous item with the same title (or same topic for recurring) */
function lastActual(it, editing) {
  if (editing && it.rec && it.rec !== 'None' && parseFloat(editing.acthrs)) return { h: parseFloat(editing.acthrs), title: editing.item };
  const cands = data.items.filter(x => x.row !== (editing && editing.row) && parseFloat(x.acthrs) &&
    (norm(x.item) === norm(it.item) ||
     (it.rec && it.rec !== 'None' && x.rec === it.rec && it.topic && norm(x.topic) === norm(it.topic) && x.area === it.area)));
  cands.sort((a, b) => String(b.done || b.created || '').localeCompare(String(a.done || a.created || '')));
  return cands.length ? { h: parseFloat(cands[0].acthrs), title: cands[0].item } : null;
}

/* ---------- rendering ---------- */
function pill(text, colors) { const c = colors || ['#F3F4F6', '#374151']; return `<span class="pill" style="background:${c[0]};color:${c[1]}">${esc(text)}</span>`; }
function dueLabel(it) {
  if (isClosed(it)) return it.done ? `<span>${L('Done', 'בוצע')} ${fmt(it.done)}</span>` : '';
  const d = parse(it.due); if (!d) return '<span>No date</span>';
  const n = dayDiff(d, today());
  const cls = n < 0 ? 'late' : n <= 3 ? 'soon' : 'ok';
  const txt = n < 0 ? L(`${-n}d late`, `באיחור ${-n} ימ׳`) : n === 0 ? L('Today', 'היום') : n === 1 ? L('Tomorrow', 'מחר') : L(`in ${n}d`, `בעוד ${n} ימ׳`);
  return `<span class="due ${cls}">${txt}</span><span>${fmt(it.due, true)}</span>`;
}
function card(it, opt) {
  const h = horizon(it), closed = isClosed(it), mine = opt && opt.mine;
  const cls = closed ? 'closed' : h === 'Overdue' ? 'overdue' : h === 'Today' ? 'today' : '';
  const hi = /^1/.test(it.prio || '') && !closed ? `<span class="c-hi">${L('High', 'גבוהה')}</span>` : '';
  const area = it.area ? `<span class="c-area" style="--a:${areaColor(it.area)[1]}"><i></i>${esc(tr(it.area))}</span>` : '';
  // one when-line, no repeats: "2 days late · Mon 20/10", "Today · 09:30", "Thu 23/10"
  let when = '';
  if (closed) when = it.done ? `<span>${L('Done', 'בוצע')} ${fmt(it.done)}</span>` : '';
  else { const d = parse(it.due);
    if (d) { const n = dayDiff(d, today());
      const rel = n < 0 ? `<span class="c-late">${n === -1 ? L('1 day late', 'באיחור יום') : L(`${-n} days late`, `באיחור ${-n} ימים`)}</span>` : n === 0 ? `<span class="c-today">${L('Today', 'היום')}</span>` : n === 1 ? `<span>${L('Tomorrow', 'מחר')}</span>` : '';
      when = rel + (n < 0 || n > 1 ? `<span>${fmt(it.due, true)}</span>` : '') + (it.time ? `<span>${esc(it.time)}</span>` : ''); } }
  const st = it.status === 'In progress' && !closed ? `<span>${L('In progress', 'בתהליך')}</span>` : '';
  const who = it.focal && it.focal !== 'Me' ? `<span>👤 ${esc(it.focal)}</span>` : '';
  const wd = waitDays(it);
  const wait = wd !== null ? `<span class="${wd >= 3 ? 'wait-late' : ''}">⏳ ${L(`waiting ${wd}d`, `ממתין ${wd} ימ׳`)}</span>` : '';
  const rec = it.rec && it.rec !== 'None' ? `<span title="${esc(L('Recurring', 'חוזרת'))}">↻ ${esc(tr(it.rec))}</span>` : '';
  const cl = Array.isArray(it.checklist) && it.checklist.length ? `<span>☑ ${it.checklist.filter(x => x.d).length}/${it.checklist.length}</span>` : '';
  const priv = it.private ? '<span class="private-ic" title="Private — hidden from guests">🔒</span>' : '';
  const cal = it.cal && !isGuest() ? `<span class="cal-ic" title="${esc(L('In iPhone calendar: ', 'ביומן האייפון: ') + it.cal)}">📅</span>` : '';
  const sep = (arr) => arr.filter(Boolean).join('<span class="dot" aria-hidden="true">·</span>');
  const owner = !isGuest();
  return `<div class="card ${cls} ${mine ? 'mine' : ''}" data-row="${it.row}">
    ${owner ? `<button class="check ${closed ? 'on' : ''}" data-check="${it.row}" aria-label="${esc(closed ? L('Mark as not done', 'סמן כלא בוצע') : L('Mark done', 'סמן כבוצע'))}"><span class="ring">${closed ? '✓' : ''}</span></button>` : '<span class="check-sp"></span>'}
    <div class="body">
      <div class="title"><bdi>${esc(it.item)}</bdi></div>
      ${area || hi ? `<div class="meta m1">${area}${hi}</div>` : ''}
      ${when || st || who || wait || rec || cl || priv || cal ? `<div class="meta m2">${sep([when ? `<span class="c-when">${when}</span>` : '', st, who, wait, rec, cl, priv, cal])}</div>` : ''}
      ${it.com ? `<div class="note" dir="auto">${esc(it.com)}</div>` : ''}
    </div>${mine && owner ? `<button class="c-more c-unday" data-dayrm="${it.row}" aria-label="${esc(L('Remove from My day', 'הסר משלי להיום'))}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}${owner && !closed ? `<button class="c-more" data-cmenu="${it.row}" aria-label="${esc(L('More actions', 'פעולות נוספות'))}" aria-haspopup="menu"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>` : ''}</div>`;
}

/* area filter: one area, several (long-press a tab to add it), or all */
function areaSel() {
  const multi = (ui.areas || []).filter(a => data.areas.includes(a));
  if (multi.length > 1) return multi;
  return ui.area === 'All' || !data.areas.includes(ui.area) ? null : [ui.area];
}
const areaOk = (a) => { const sel = areaSel(); return !sel || sel.includes(a); };
const areaSelLabel = () => { const sel = areaSel(); return sel ? sel.map(a => tr(a)).join(' + ') : L('All areas', 'כל התחומים'); };
function pickArea(a, add) {
  if (!add || a === 'All') { ui.area = a; ui.areas = []; }
  else {
    let set = (areaSel() || []).slice();
    set = set.includes(a) ? set.filter(x => x !== a) : set.concat(a);
    if (!set.length) { ui.area = 'All'; ui.areas = []; } else if (set.length === 1) { ui.area = set[0]; ui.areas = []; } else { ui.areas = set; ui.area = set[0]; }
  }
  store.set('ai.ui', ui); render();
}
function filtered() {
  const q = search.trim().toLowerCase();
  return data.items.filter(it =>
    areaOk(it.area) &&
    (!q || [it.item, it.topic, it.com, it.focal].join(' ').toLowerCase().includes(q)));
}

function render() {
  document.body.classList.toggle('guest', isGuest());
  $('#guestBar').hidden = !isGuest();
  if (isGuest()) $('#guestBar').textContent = L(`👀 ${me.name} · view only`, `👀 ${me.name} · צפייה בלבד`);
  $('#btnPending').hidden = isGuest() || !(pending.length + pwReq.length);
  $('#pendingBadge').textContent = (pending.length + pwReq.length) || '';
  $('#today').textContent = today().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  // counts follow the same scope as the list (selected areas, guests' own view)
  const scope = data.items.filter(it => areaOk(it.area));
  const open = scope.filter(it => !isClosed(it));
  const cnt = (h) => open.filter(it => horizon(it) === h).length;
  const ws = weekStart(today());
  const doneWeek = scope.filter(it => it.status === 'Done' && parse(it.done) >= ws).length;
  const k3 = [['Overdue', cnt('Overdue'), L('late', 'באיחור'), 'red'], ['Today', cnt('Today'), L('today', 'להיום'), 'amber'], ['This week', cnt('This week'), L('this week', 'השבוע'), 'green']];
  $('#kpis').innerHTML = k3.map(([h, n, l, c]) => `<button class="kpi ${c} ${n ? '' : 'zero'}" data-jump="${h}"><b>${n}</b> ${l}</button>`).join('<span class="kdot" aria-hidden="true">·</span>');
  if ($('#menuKpis')) $('#menuKpis').innerHTML = [['waiting', open.filter(i => i.status === 'Waiting').length, L('Waiting', 'ממתינות')], ['done', doneWeek, L('Done this week', 'בוצעו השבוע')], ['all', open.length, L('Open', 'פתוחות')]]
    .map(([t, n, l]) => `<button class="mk" data-goto="${t}"><b>${n}</b><span>${l}</span></button>`).join('');
  const TITLES = { focus: L('Focus', 'פוקוס'), notebook: L('Notebook', 'פנקס'), week: L('Week', 'שבוע'), all: L('All open', 'כל הפתוחות'), waiting: L('Waiting', 'ממתין'), people: L('People', 'אנשים'), done: L('Done', 'בוצעו') };
  $('#screenTitle').textContent = TITLES[ui.tab] || 'Action Items';
  const inMore = ['all', 'waiting', 'people', 'done'].includes(ui.tab);
  document.querySelectorAll('#tabs [data-tab], #moreMenu [data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === ui.tab); b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'); });
  $('#tabMore').classList.toggle('on', inMore); $('#tabMoreLbl').textContent = inMore ? TITLES[ui.tab] : L('More', 'עוד');
  if ($('#langMenuLbl')) $('#langMenuLbl').textContent = isHe() ? 'English' : 'עברית';
  if ($('#welcomeOn')) $('#welcomeOn').checked = store.get('ai.welcomeOn', true);
  const inColl = ui.tab === 'notebook' && ui.nbBook === 'coll';
  const fab = $('#fab');
  fab.hidden = isGuest() && !me.canSuggest;
  $('#fabLbl').textContent = isGuest() ? L('Suggest a task', 'הצעת משימה') : inColl ? L('New in the Collection', 'רשומה חדשה באוסף') : L('Add a task', 'הוספת משימה');
  fab.setAttribute('aria-label', $('#fabLbl').textContent);
  if (search && $('#searchRow').hidden) { $('#searchRow').hidden = false; $('#btnSearch').setAttribute('aria-expanded', 'true'); }
  $('#areaChips').innerHTML = ['All'].concat(data.areas).map(a => { const sel = areaSel(), on = sel ? sel.includes(a) : a === 'All'; return `<button class="chip ${on ? 'on' : ''} ${on && sel && sel.length > 1 ? 'multi' : ''}" data-area="${esc(a)}" aria-pressed="${on}">${on ? '<span class="ck" aria-hidden="true">✓</span>' : ''}${esc(a)}</button>`; }).join('');

  const items = filtered();
  let html = '';
  if (search.trim()) { $('#list').classList.remove('weekmode'); document.body.classList.remove('nb-mode', 'coll-mode'); $('#list').innerHTML = searchHtml(search.trim()); return; }
  $('#list').classList.toggle('weekmode', ui.tab === 'week');
  if (ui.tab !== 'notebook') document.body.classList.remove('nb-mode', 'coll-mode');
  if (ui.tab === 'week') { $('#list').innerHTML = renderWeek(items); return; }
  document.body.classList.toggle('nb-mode', ui.tab === 'notebook');
  document.body.classList.toggle('coll-mode', ui.tab === 'notebook' && ui.nbBook === 'coll' && (!isGuest() || collCats.length > 0));
  if (ui.tab === 'notebook') { $('#list').innerHTML = renderNotebook(); return; }
  if (ui.tab === 'done') {
    const done = items.filter(isClosed).sort((a, b) => (parse(b.done) || 0) - (parse(a.done) || 0));
    html = group('Completed', done, '');
  } else if (ui.tab === 'people') {
    const open = items.filter(it => !isClosed(it) && it.focal && it.focal !== 'Me');
    const names = [...new Set(open.map(it => it.focal))].sort((a, b) => a.localeCompare(b));
    html = names.map(n => group('👤 ' + n, open.filter(it => it.focal === n).sort(sortOpen), '')).join('');
    if (!html) html = `<div class="empty"><b>👥</b>${L('No open items assigned to other people.', 'אין משימות פתוחות שמשויכות לאנשים אחרים.')}</div>`;
  } else if (ui.tab === 'waiting') {
    html = group('Waiting on others', items.filter(it => it.status === 'Waiting').sort(sortOpen), '');
  } else {
    const hs = ui.tab === 'focus' ? ['Overdue', 'Today', 'This week'] : HORIZONS.filter(h => h !== 'No date');
    const mineRows = ui.tab === 'focus' && !isGuest() ? dayRows() : [];
    const openF = items.filter(it => !isClosed(it) && !mineRows.includes(it.row)).sort(sortOpen);
    const od = openF.filter(it => horizon(it) === 'Overdue');
    html = hs.map(h => {
      if (ui.tab === 'focus' && h === 'Overdue' && od.length > 2 && !grpIsOpen('focus:OverdueList')) {   // many late ones: a summary instead of the whole list
        const oldest = od[0], late = dayDiff(today(), parse(oldest.due));
        return `<section class="od-box" data-h="Overdue"><div class="od-top"><b>⏰ ${L(`${od.length} overdue tasks`, `${od.length} משימות באיחור`)}</b><span>${L(`oldest: ${late} days`, `הוותיקה: ${late} ימים`)}</span></div>
          <div class="od-act">${isGuest() ? '' : `<button class="btn primary" data-triage>${L(`Go through ${od.length}`, `לעבור על ${od.length}`)}</button>`}<button class="btn ghost" data-grp="focus:OverdueList">${L('Show the list', 'הצג רשימה')}</button></div></section>`;
      }
      return group(h, openF.filter(it => horizon(it) === h), h.toLowerCase().replace(' ', ''), { collapsible: true, key: ui.tab + ':' + h });
    }).join('');
    if (ui.tab === 'focus') html = myDayHtml() + html;
    if (ui.tab === 'focus') {
      const urgent = openF.filter(it => ['Overdue', 'Today'].includes(horizon(it))).length, wk = openF.filter(it => horizon(it) === 'This week').length;
      if (!urgent) html = `<div class="empty calm"><b>🌤</b><strong>${L('Nothing late or due today', 'אין משהו באיחור או להיום')}</strong>${wk ? `<button class="btn ghost" data-jump="This week">${L(`Show this week (${wk})`, `הצג את השבוע (${wk})`)}</button>` : `<span>${L('Enjoy — or add something with ＋ below.', 'תהנה — או הוסף משהו עם ＋ למטה.')}</span>`}</div>` + html;
    }
    const nd = openF.filter(it => !it.due).length;
    if (ui.tab === 'all' && nd) html += `<button class="nb-link" data-goto="notebook">📒 ${L(`${nd} items without a date are in the Notebook`, `${nd} משימות ללא תאריך נמצאות בפנקס`)} <span>›</span></button>`;
  }
  if (isGuest() && ui.tab === 'focus' && mySugg.length) html = suggHtml() + html;
  if (ui.tab === 'focus') html = `<button class="story-row" data-story><span class="sr-ic" aria-hidden="true"><svg class="ic" viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/></svg></span><span class="sr-t">${L('Today’s recap', 'תקציר היום')} <small>· ${L('30 seconds', '30 שניות')}</small></span><span class="sr-scope">${esc(areaSelLabel())}</span></button>` + html;
  if (!html) html = ui.tab === 'focus'
    ? `<div class="empty"><b>🎉</b>Nothing overdue, due today or this week.<br>Check "All open" for later items.</div>`
    : `<div class="empty"><b>🗂</b>No items here.</div>`;
  $('#list').innerHTML = html;
}
/* ---------- 📒 Notebook: items without a date, as a checklist per area ---------- */
function nbItems(area) {
  const q = search.trim().toLowerCase();
  const wk = new Date(today().getTime() - 7 * 86400000);
  return data.items.filter(it => !it.due && it.area === area && it.status !== 'Cancelled' &&
    (!isClosed(it) || (parse(it.done) && parse(it.done) >= wk)) &&             // crossed-out lines stay for a week
    (!q || [it.item, it.topic, it.com, it.focal].join(' ').toLowerCase().includes(q)));
}
function renderNotebook() {
  const hasColl = !isGuest() || collCats.length;
  const books = !hasColl ? '' : `<div class="nb-books"><button class="${ui.nbBook !== 'coll' ? 'on' : ''}" data-book="tasks">📒 ${L('Tasks', 'משימות')}</button><button class="${ui.nbBook === 'coll' ? 'on' : ''}" data-book="coll">💡 ${L('Collection', 'אוסף')}</button></div>`;
  if (ui.nbBook === 'coll' && hasColl) return books + renderCollection();
  return books + renderTaskNotebook();
}
function renderTaskNotebook() {
  const areas = data.areas.length ? data.areas : ['Home'];
  const counts = Object.fromEntries(areas.map(a => [a, nbItems(a).filter(it => !isClosed(it)).length]));
  let page = ui.nbArea && areas.includes(ui.nbArea) ? ui.nbArea : (ui.area !== 'All' && areas.includes(ui.area) ? ui.area : (areas.find(a => counts[a]) || areas[0]));
  ui.nbArea = page;
  const tabs = areas.map(a => { const c = areaColor(a) || ['#E5E7EB', '#374151'];
    return `<button class="nb-tab ${a === page ? 'on' : ''}" data-nb="${esc(a)}" style="--tab-bg:${c[0]};--tab-ink:${c[1]}">${esc(tr(a))}${counts[a] ? `<i>${counts[a]}</i>` : ''}</button>`; }).join('');
  const list = nbItems(page).sort((a, b) => (isClosed(a) - isClosed(b)) || String(a.prio || '9').localeCompare(String(b.prio || '9')) || (a.row - b.row));
  const line = (it) => {
    const done = isClosed(it), hi = /^1/.test(it.prio || '');
    const sub = [it.focal && it.focal !== 'Me' ? '@' + esc(it.focal) : '', parseFloat(it.hrs) ? '~' + esc(it.hrs) + L('h', 'ש׳') : '',
      Array.isArray(it.checklist) && it.checklist.length ? '☑ ' + it.checklist.filter(x => x.d).length + '/' + it.checklist.length : ''].filter(Boolean).join(' · ');
    return `<li class="nb-line ${done ? 'done' : ''}" data-row="${it.row}">
      <button class="nb-check" data-nbcheck="${it.row}" aria-label="${done ? L('Mark as not done', 'סמן כלא בוצע') : L('Mark as done', 'סמן כבוצע')}">${done ? '✓' : ''}</button>
      <span class="nb-text" dir="auto">${hi ? '<b class="nb-hi">!</b> ' : ''}${esc(it.item)}${sub ? `<small>${sub}</small>` : ''}</span>
      ${it.private ? '<span class="private-ic">🔒</span>' : ''}${!isGuest() && !done ? `<button class="nb-day ${inDay(it.row) ? 'on' : ''}" data-dayadd="${it.row}" aria-label="${esc(inDay(it.row) ? L('Remove from My day', 'הסר משלי להיום') : L('Add to My day', 'הוסף לשלי להיום'))}" aria-pressed="${inDay(it.row)}">☀</button>` : ''}</li>`;
  };
  const openN = list.filter(it => !isClosed(it)).length;
  return `<div class="nb-wrap">
    <div class="nb-tabs">${ORDER_BTN('nb-tab nb-ord')}${tabs}</div>
    <div class="nb-paper" style="--area-ink:${(areaColor(page) || ['', '#374151'])[1]};--area-bg:${(areaColor(page) || ['#E5E7EB'])[0]}">
      <div class="nb-rings" aria-hidden="true">${'<i></i>'.repeat(9)}</div>
      <div class="nb-head"><h2>${esc(tr(page))}</h2><span>${openN ? L(`${openN} to do`, `${openN} לביצוע`) : L('All done ✓', 'הכל בוצע ✓')}</span></div>
      <ul class="nb-lines">${list.map(line).join('')}
        <li class="nb-line nb-new owner-only"><span class="nb-plus">＋</span><input id="nbNew" dir="auto" enterkeyhint="done" autocomplete="off" placeholder="${esc(L('Write a new line…', 'כתוב שורה חדשה…'))}"></li>
        ${'<li class="nb-line nb-empty" aria-hidden="true"></li>'.repeat(Math.max(2, 8 - list.length))}
      </ul>
      <p class="nb-foot">${L('Tap a line to edit it or give it a date — dated items move to the schedule.', 'לחץ על שורה כדי לערוך או לתת לה תאריך — משימה עם תאריך עוברת ללוח הזמנים.')}</p>
    </div></div>`;
}
/* ---------- 💡 Collection — an inspiration board (recommendations, wishes, notes — not tasks) ---------- */
const C_PAL = ['#FFE4E6', '#FEF3C7', '#DCFCE7', '#E0E7FF', '#FAE8FF', '#CFFAFE', '#FFEDD5', '#ECFCCB', '#F5F5F4', '#FCE7F3'];
const C_INK = ['#BE123C', '#B45309', '#15803D', '#4338CA', '#A21CAF', '#0E7490', '#C2410C', '#4D7C0F', '#57534E', '#BE185D'];
const catOf = (id) => collCats.find(c => c.id === id) || collCats[0] || { id: '', name: '', kind: 'try' };
const catIdx = (id) => Math.max(0, collCats.findIndex(c => c.id === id));
const catEmoji = (c) => { const m = String(c.name || '').match(/^(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)/u); return m ? m[1] : '✨'; };
const catLabel = (c) => String(c.name || '').replace(/^(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s*/u, '');
const stars = (n) => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
const collRO = () => isGuest();
function catStyleC(c) {
  const n = String((c && c.name) || '') + ' ' + String((c && c.id) || '');
  if (/drink|קוקטייל|משקא|אלכוהול|יין|wine|cocktail|בר\b/i.test(n)) return 'drink';
  if (/recipe|מתכו/i.test(n)) return 'recipe';
  if (/food|restaurant|cafe|café|מסעד|אוכל|קפה|אכול/i.test(n)) return 'food';
  return 'other';
}
/* 🍽 kinds of places to eat — one per entry, guessed from the name / notes when not chosen */
const C_FOOD = [['cafe', '☕', 'Café', 'בית קפה'], ['cart', '🛻', 'Coffee cart', 'עגלת קפה'], ['bakery', '🥐', 'Bakery / dessert', 'מאפייה / קינוחים'], ['italian', '🍝', 'Italian', 'איטלקי'], ['pizza', '🍕', 'Pizza', 'פיצה'],
  ['burger', '🍔', 'Burger', 'המבורגר'], ['diner', '🥞', 'Diner / brunch', 'דיינר / בראנץ׳'], ['meat', '🥩', 'Meat / grill', 'בשרים'], ['asian', '🍣', 'Asian', 'אסייתי'], ['mexican', '🌮', 'Mexican', 'מקסיקני'],
  ['middle', '🥙', 'Middle-Eastern', 'מזרחי / ים־תיכוני'], ['fish', '🐟', 'Fish / seafood', 'דגים ופירות ים'], ['veg', '🥗', 'Vegetarian / vegan', 'צמחוני / טבעוני'], ['street', '🌯', 'Street food', 'אוכל רחוב'],
  ['bar', '🍷', 'Bar / wine', 'בר / יין'], ['chef', '👨‍🍳', 'Chef / fine dining', 'שף / גורמה'], ['other', '🍽', 'Other', 'אחר']];
const FOOD_RE = [['cart', /עגלת קפה|עגלת|coffee cart|קפה על גלגלים|food truck|פודטראק/i], ['bakery', /מאפי|bakery|קונדיטור|patisserie|גלידה|gelato|ice cream|קינוח|dessert|שוקולד/i],
  ['cafe', /בית קפה|קפה|café|cafe|coffee|espresso|אספרסו/i], ['pizza', /פיצ|pizz/i], ['italian', /איטלק|ital|פסטה|pasta|טרטוריה|trattoria|osteria/i], ['burger', /המבורגר|burger|בורגר/i],
  ['diner', /דיינר|diner|בראנץ|brunch|ארוחת בוקר|breakfast|פנקייק/i], ['meat', /בשר|סטייק|steak|גריל|grill|מעשנ|smokehouse|bbq|ברביקיו|אסאדו|שיפוד/i],
  ['asian', /סוש|sushi|אסי|asian|ראמן|ramen|תאי|thai|סינ|chinese|יפנ|japan|וייטנאמ|vietnam|קוריאנ|korean|דים סאם|נודלס|noodle|הודי|indian/i], ['mexican', /מקסיק|mexic|טאקו|taco|בוריטו|burrito/i],
  ['fish', /דגים|fish|seafood|פירות ים|שרימפס/i], ['veg', /טבעונ|vegan|צמחונ|vegetarian|סלט/i], ['middle', /חומוס|hummus|שווארמה|shawarma|פלאפל|falafel|מזרח|ים.תיכונ|לבנונ|levant|מסעדה ערבית|קבב|kebab|דרוז/i],
  ['street', /אוכל רחוב|street food|סביח|כריך|סנדוויץ|sandwich|טוסט/i], ['bar', /בר יין|wine bar|\bbar\b|פאב|pub|ברים|יקב|winery|קוקטייל/i], ['chef', /שף|chef|גורמה|fine dining|מסעדת שף|טעימות|tasting/i]];
function guessFood(text) { const t = String(text || ''); const f = FOOD_RE.find(x => x[1].test(t)); return f ? f[0] : ''; }
const foodOf = (k) => C_FOOD.find(b => b[0] === k) || (k ? [k, '🍽', k, k] : null);
const foodType = (en) => en.base || guessFood([en.title, en.notes, en.by].join(' '));
const C_BASES = [['gin', '🍸', 'Gin', "ג'ין"], ['vodka', '🧊', 'Vodka', 'וודקה'], ['rum', '🍹', 'Rum', 'רום'], ['tequila', '🌵', 'Tequila', 'טקילה'], ['whisky', '🥃', 'Whisky', 'וויסקי'],
  ['brandy', '🍂', 'Brandy / Cognac', 'ברנדי / קוניאק'], ['pisco', '🏔', 'Pisco', 'פיסקו'], ['cachaca', '🌴', 'Cachaça', 'קשאסה'], ['arak', '🌿', 'Arak / Ouzo', 'ערק / אוזו'],
  ['campari', '🔴', 'Campari', 'קמפרי'], ['aperol', '🟠', 'Aperol', 'אפרול'], ['prosecco', '🫧', 'Prosecco', 'פרוסקו'], ['sparkling', '🥂', 'Champagne / sparkling', 'שמפניה / מבעבע'],
  ['wine', '🍷', 'Wine', 'יין'], ['beer', '🍺', 'Beer', 'בירה'], ['liqueur', '🍊', 'Liqueur', 'ליקר'], ['none', '🍋', 'Non-alcoholic', 'ללא אלכוהול'], ['other', '✨', 'Other', 'אחר']];
/* a base can also be free text the user added (e.g. "סאקה") — shown as its own group */
const baseOf = (k) => C_BASES.find(b => b[0] === k) || (k && k !== 'other' ? [k, '🥤', k, k] : C_BASES[C_BASES.length - 1]);
const NEW_BASE = '__new';
function fillBaseSelect(cur, style) {
  const food = (style || catStyleC(catOf($('#collCat').value))) === 'food', LIST = food ? C_FOOD : C_BASES;
  const same = coll.filter(x => food ? catStyleC(catOf(x.cat)) === 'food' : catStyleC(catOf(x.cat)) === 'drink');
  const custom = [...new Set(same.map(x => x.base).filter(b => b && !LIST.some(c => c[0] === b)))];
  if (cur && !LIST.some(c => c[0] === cur) && custom.indexOf(cur) < 0) custom.push(cur);
  if ($('#collBaseLbl')) $('#collBaseLbl').textContent = food ? L('Kind of place', 'סוג המקום') : L('Base', 'בסיס');
  $('#collBase').innerHTML = `<option value="">${L('— choose —', '— בחר —')}</option>` + LIST.map(b => `<option value="${b[0]}">${b[1]} ${esc(L(b[2], b[3]))}</option>`).join('') +
    custom.map(b => `<option value="${esc(b)}">${food ? '🍽' : '🥤'} ${esc(b)}</option>`).join('') + `<option value="${NEW_BASE}">${food ? L('＋ Add a kind…', '＋ הוספת סוג…') : L('＋ Add a base…', '＋ הוספת בסיס…')}</option>`;
  $('#collBaseNew').placeholder = food ? L('Georgian, Ethiopian…', 'גאורגי, אתיופי…') : 'סאקה, מזקל, ורמוט…';
  $('#collBase').value = cur || ''; $('#collBaseNew').hidden = true; $('#collBaseNew').value = '';
}
let ctOpen = {};
function statusWords(kind) {
  return kind === 'wish' ? { want: L('🎁 Wish', '🎁 משאלה'), tried: L('🎉 Came true', '🎉 הוגשמה'), fWant: L('Open', 'פתוחות'), fTried: L('Came true', 'הוגשמו') }
    : { want: L('☆ Want to try', '☆ רוצה לנסות'), tried: L('✓ Tried', '✓ ניסינו'), fWant: L('Want to try', 'רוצה לנסות'), fTried: L('Tried', 'ניסינו') };
}
function collMatches(en) {
  const q = search.trim().toLowerCase();
  return !q || [en.title, en.notes, en.place, en.by, en.for].join(' ').toLowerCase().includes(q);
}
/* ---------- 🧩 smart category templates — each category decides which details are saved and how they look ----------
   tpl = { view:'cards'|'table'|'list', group:'<field key>', want:'…', done:'…', fields:[{k,l,t,o?,ph?}], find:[{l,u}] }
   t = text | choice (o = options) | long (free text) | mono (chords / tabs / code — fixed-width, line breaks kept) | number | url */
const TPL_T = [['text', 'Short text', 'טקסט קצר'], ['choice', 'Choice', 'בחירה מרשימה'], ['long', 'Long text', 'טקסט ארוך'], ['mono', 'Chords / tabs (fixed width)', 'אקורדים / טאבים (רוחב קבוע)'], ['number', 'Number', 'מספר'], ['url', 'Link', 'קישור']];
const TPL_PRESETS = [
  { id: 'food', em: '🍽', n: ['Restaurants & cafés', 'מסעדות ובתי קפה'], re: /(?!)/,
    tpl: () => ({ view: 'cards', fields: [
      { k: 'kosher', l: L('Kosher', 'כשרות'), t: 'choice', o: isHe() ? ['כשר', 'כשר למהדרין', 'לא כשר'] : ['Kosher', 'Kosher (strict)', 'Not kosher'] },
      { k: 'shabbat', l: L('Shabbat', 'שבת'), t: 'choice', o: isHe() ? ['פתוח בשבת', 'סגור בשבת'] : ['Open on Shabbat', 'Closed on Shabbat'] }] }) },
  { id: 'music', em: '🎸', n: ['Music / guitar', 'מוזיקה / גיטרה'], re: /גיטר|guitar|אוקולל|ukulele|פסנתר|piano|נגינ|מוזיק|music|אקורד|chord|תופים|drums|כינור|violin|\bבס\b|bass|songs|שירים לנגן/i,
    tpl: () => ({ view: 'list', group: 'type', want: L('🎯 To learn', '🎯 ללמוד'), done: L('🎶 I can play it', '🎶 יודע לנגן'), fields: [
      { k: 'type', l: L('Type', 'סוג'), t: 'choice', o: isHe() ? ['שיר', 'אקורדים', 'טאבים', 'תווים', 'תיאוריה', 'תרגיל', 'טכניקה'] : ['Song', 'Chords', 'Tabs', 'Sheet music', 'Theory', 'Exercise', 'Technique'] },
      { k: 'artist', l: L('Artist / source', 'אמן / מקור'), t: 'text' }, { k: 'key', l: L('Key / tuning', 'סולם / כיוונון'), t: 'text', ph: 'Am · Standard' },
      { k: 'capo', l: L('Capo', 'קאפו'), t: 'number' }, { k: 'level', l: L('Level', 'רמה'), t: 'choice', o: isHe() ? ['מתחיל', 'בינוני', 'מתקדם'] : ['Beginner', 'Intermediate', 'Advanced'] },
      { k: 'body', l: L('Chords / tabs / notes', 'אקורדים / טאבים / תווים'), t: 'mono' }],
      find: [{ l: '🎸 Ultimate Guitar', u: 'https://www.ultimate-guitar.com/search.php?search_type=title&value={q}' }, { l: '▶ YouTube', u: 'https://www.youtube.com/results?search_query={q}+guitar' }] }) },
  { id: 'books', em: '📚', n: ['Books', 'ספרים'], re: /ספר|book|קריא|reading/i,
    tpl: () => ({ view: 'cards', want: L('📖 To read', '📖 לקרוא'), done: L('✓ Read', '✓ קראתי'), fields: [
      { k: 'author', l: L('Author', 'סופר/ת'), t: 'text' }, { k: 'genre', l: L('Genre', 'ז׳אנר'), t: 'choice', o: isHe() ? ['רומן', 'מתח', 'עיון', 'ביוגרפיה', 'פנטזיה', 'ילדים', 'עסקים', 'היסטוריה'] : ['Novel', 'Thriller', 'Non-fiction', 'Biography', 'Fantasy', 'Kids', 'Business', 'History'] },
      { k: 'pages', l: L('Pages', 'עמודים'), t: 'number' }, { k: 'quote', l: L('A line I liked', 'משפט שאהבתי'), t: 'long' }],
      find: [{ l: '🔎 Google', u: 'https://www.google.com/search?q={q}+book' }] }) },
  { id: 'screen', em: '🎬', n: ['Movies & series', 'סרטים וסדרות'], re: /סרט|סדר[הו]ת?|movie|film|series|tv\b|נטפליקס|netflix/i,
    tpl: () => ({ view: 'cards', group: 'type', want: L('🍿 To watch', '🍿 לראות'), done: L('✓ Watched', '✓ ראינו'), fields: [
      { k: 'type', l: L('Type', 'סוג'), t: 'choice', o: isHe() ? ['סרט', 'סדרה', 'דוקו', 'אנימציה'] : ['Movie', 'Series', 'Documentary', 'Animation'] },
      { k: 'where', l: L('Where to watch', 'איפה רואים'), t: 'choice', o: ['Netflix', 'Disney+', 'Apple TV', 'HBO Max', 'Prime Video', 'yes', 'HOT', isHe() ? 'קולנוע' : 'Cinema'] },
      { k: 'year', l: L('Year', 'שנה'), t: 'number' }, { k: 'genre', l: L('Genre', 'ז׳אנר'), t: 'text' }],
      find: [{ l: '▶ Trailer', u: 'https://www.youtube.com/results?search_query={q}+trailer' }] }) },
  { id: 'trip', em: '🧭', n: ['Trips & hikes', 'טיולים'], re: /טיול|מסלול|מעיי|hike|trail|trip/i,
    tpl: () => ({ view: 'cards', group: 'region', fields: [
      { k: 'region', l: L('Region', 'אזור'), t: 'choice', o: isHe() ? ['צפון', 'גליל וגולן', 'מרכז', 'ירושלים', 'דרום', 'מדבר', 'חו״ל'] : ['North', 'Galilee & Golan', 'Center', 'Jerusalem', 'South', 'Desert', 'Abroad'] },
      { k: 'length', l: L('Length', 'משך / אורך'), t: 'text', ph: L('2 hours · 5 km', '2 שעות · 5 ק״מ') },
      { k: 'level', l: L('Difficulty', 'רמת קושי'), t: 'choice', o: isHe() ? ['קל', 'בינוני', 'קשה'] : ['Easy', 'Medium', 'Hard'] },
      { k: 'season', l: L('Best season', 'עונה מומלצת'), t: 'choice', o: isHe() ? ['כל השנה', 'חורף', 'אביב', 'קיץ', 'סתיו'] : ['All year', 'Winter', 'Spring', 'Summer', 'Autumn'] },
      { k: 'water', l: L('Water / kids / dogs', 'מים / ילדים / כלבים'), t: 'text' }] }) },
  { id: 'recipe', em: '🍳', n: ['Recipes', 'מתכונים'], re: /מתכו|recipe|בישול|אפייה|baking|קינוח/i,
    tpl: () => ({ view: 'cards', fields: [
      { k: 'time', l: L('Time', 'זמן הכנה'), t: 'text', ph: L('40 min', '40 דק׳') }, { k: 'serves', l: L('Serves', 'מנות'), t: 'number' },
      { k: 'level', l: L('Difficulty', 'רמת קושי'), t: 'choice', o: isHe() ? ['קל', 'בינוני', 'מאתגר'] : ['Easy', 'Medium', 'Challenging'] },
      { k: 'ingr', l: L('Ingredients', 'מצרכים'), t: 'long' }],
      find: [{ l: '▶ YouTube', u: 'https://www.youtube.com/results?search_query={q}+מתכון' }] }) },
  { id: 'learn', em: '🎓', n: ['Learning', 'לימוד'], re: /קורס|לימוד|ללמוד|course|learn|study|שפה|language|תיאורי|theory|הרצא|lecture/i,
    tpl: () => ({ view: 'list', group: 'topic', want: L('📌 To learn', '📌 ללמוד'), done: L('✓ Learned', '✓ למדתי'), fields: [
      { k: 'topic', l: L('Topic', 'נושא'), t: 'text' }, { k: 'src', l: L('Source', 'מקור'), t: 'choice', o: isHe() ? ['סרטון', 'מאמר', 'קורס', 'ספר', 'פודקאסט'] : ['Video', 'Article', 'Course', 'Book', 'Podcast'] },
      { k: 'level', l: L('Level', 'רמה'), t: 'choice', o: isHe() ? ['בסיסי', 'בינוני', 'מתקדם'] : ['Basic', 'Intermediate', 'Advanced'] }, { k: 'sum', l: L('Summary / key points', 'סיכום / נקודות חשובות'), t: 'long' }] }) },
  { id: 'workout', em: '🏋️', n: ['Workouts', 'אימונים'], re: /אימונ|כושר|workout|gym|fitness|יוגה|yoga|ריצה|running|פילאטיס/i,
    tpl: () => ({ view: 'list', group: 'type', want: L('💪 To try', '💪 לנסות'), done: L('✓ Done it', '✓ עשיתי'), fields: [
      { k: 'type', l: L('Type', 'סוג'), t: 'choice', o: isHe() ? ['כוח', 'אירובי', 'גמישות', 'יוגה', 'HIIT', 'מתיחות'] : ['Strength', 'Cardio', 'Mobility', 'Yoga', 'HIIT', 'Stretching'] },
      { k: 'time', l: L('Duration', 'משך'), t: 'text' }, { k: 'gear', l: L('Equipment', 'ציוד'), t: 'text' }, { k: 'plan', l: L('Sets / steps', 'סטים / שלבים'), t: 'long' }],
      find: [{ l: '▶ YouTube', u: 'https://www.youtube.com/results?search_query={q}+workout' }] }) }];
const tplPresetFor = (c) => { const st = catStyleC(c); if (st === 'drink') return null; if (st === 'food') return TPL_PRESETS.find(p => p.id === 'food'); const n = String((c && c.name) || '') + ' ' + String((c && c.id) || ''); return TPL_PRESETS.find(p => p.re.test(n)) || null; };
/* the category's template: saved one › automatic one by name › none (drinks / restaurants have their own built-in look) */
function catTpl(c) {
  if (!c) return null;
  if (c.tpl && Array.isArray(c.tpl.fields)) return c.tpl;
  const p = tplPresetFor(c); if (!p) return null;
  c._auto = c._auto || p.tpl(); return c._auto;
}
const tplField = (tpl, k) => tpl && (tpl.fields || []).find(f => f.k === k);
const xv = (en, k) => { const v = en && en.x && en.x[k]; return v === undefined || v === null ? '' : String(v); };
function tplQuery(en, tpl) {
  const extra = (tpl.fields || []).filter(f => f.t === 'text').map(f => xv(en, f.k)).find(Boolean) || '';
  return encodeURIComponent((en.title + ' ' + extra).trim()).replace(/%20/g, '+');
}
/* short details shown on a card / row: choices as chips, short text with its label */
function tplChips(en, tpl, skip) {
  if (!tpl) return '';
  return (tpl.fields || []).filter(f => !(skip || []).includes(f.k) && ['choice', 'text', 'number'].includes(f.t) && xv(en, f.k)).slice(0, 4)
    .map(f => `<span class="tp-chip ${f.t === 'choice' ? 'ch' : ''}" dir="auto">${f.t === 'choice' ? '' : `<small>${esc(f.l)}</small> `}${esc(xv(en, f.k))}</span>`).join('');
}
/* the full details, for an opened row */
function tplDetail(en, tpl) {
  if (!tpl) return '';
  return (tpl.fields || []).filter(f => xv(en, f.k)).map(f => {
    const v = xv(en, f.k);
    if (f.t === 'mono') return `<div class="tp-block"><h5>${esc(f.l)}</h5><pre class="tp-mono" dir="ltr">${esc(v)}</pre></div>`;
    if (f.t === 'long') return `<div class="tp-block"><h5>${esc(f.l)}</h5><div class="tp-long" dir="auto">${esc(v)}</div></div>`;
    if (f.t === 'url') return /^https?:\/\//i.test(v) ? `<button class="btn ghost" data-clink="${esc(v)}">🔗 ${esc(f.l)}</button>` : '';
    return '';
  }).join('');
}
function tplFind(en, tpl) {
  return tpl && tpl.find ? tpl.find.filter(x => /^https:\/\//i.test(x.u)).map(x => `<button class="btn ghost" data-clink="${esc(x.u.replace('{q}', tplQuery(en, tpl)))}">${esc(x.l)}</button>`).join('') : '';
}

/* ---- the collection: a shelf of categories › inside one category, one tool row + a "Filter" sheet ---- */
function cfOf(id) {
  ui.cf = ui.cf || {};
  const o = ui.cf[id] || { st: 'all', kind: ((ui.collKind || {})[id] || []).slice(), f: {} };
  o.f = o.f || {}; o.kind = o.kind || []; return o;
}
function cfSet(id, o) { ui.cf = Object.assign({}, ui.cf, { [id]: o }); store.set('ai.ui', ui); }
function cfCount(id) { const o = cfOf(id); return (o.st !== 'all' ? 1 : 0) + (o.kind.length ? 1 : 0) + Object.keys(o.f).filter(k => (o.f[k] || []).length).length; }
const kindKey = (en, st) => st === 'food' ? (foodType(en) || '_') : st === 'drink' ? (en.base || 'other') : '';
/* the entries of one category after search + filters (status filter last, so its counts stay right) */
function collFiltered(cat, noStatus) {
  const o = cfOf(cat.id), st = catStyleC(cat), tpl = catTpl(cat);
  let list = coll.filter(x => x.cat === cat.id && collMatches(x));
  if (o.kind.length && (st === 'food' || st === 'drink')) list = list.filter(x => o.kind.includes(kindKey(x, st)));
  Object.keys(o.f).forEach(k => { const v = o.f[k] || []; if (v.length && tplField(tpl, k)) list = list.filter(x => v.includes(xv(x, k) || '_')); });
  if (!noStatus && cat.kind !== 'note' && o.st !== 'all') list = list.filter(x => o.st === 'tried' ? x.status === 'tried' : x.status !== 'tried');
  return list;
}
function statusWordsC(c) {
  const w = statusWords(c.kind), tpl = catTpl(c);
  if (tpl && tpl.want) { w.want = tpl.want; w.fWant = tpl.want.replace(/^\W+\s*/u, '') || tpl.want; }
  if (tpl && tpl.done) { w.tried = tpl.done; w.fTried = tpl.done.replace(/^\W+\s*/u, '') || tpl.done; }
  return w;
}
function collShelf() {
  const ro = collRO();
  const tiles = collCats.map((c, i) => {
    const mine = coll.filter(x => x.cat === c.id), done = mine.filter(x => x.status === 'tried').length;
    const peek = mine.slice().sort((a, b) => String(b.updated || b.added).localeCompare(String(a.updated || a.added))).slice(0, 2).map(x => esc(x.title)).join(' · ');
    const tpl = catTpl(c);
    return `<button class="cs-tile" data-ccat="${esc(c.id)}" style="--c-bg:${C_PAL[i % C_PAL.length]};--c-ink:${C_INK[i % C_INK.length]}">
      <span class="cs-em">${catEmoji(c)}</span><b dir="auto">${esc(catLabel(c))}</b>
      <span class="cs-n">${mine.length ? `${mine.length}${c.kind !== 'note' && done ? ` · ${done} ✓` : ''}` : L('empty', 'ריק')}</span>
      ${peek ? `<span class="cs-peek" dir="auto">${peek}</span>` : ''}</button>`;
  }).join('');
  const add = ro ? '' : `<button class="cs-tile cs-add" data-ccats="new"><span class="cs-em">＋</span><b>${L('New category', 'קטגוריה חדשה')}</b><span class="cs-n">${L('e.g. 🎸 Guitar, 📚 Books', 'למשל 🎸 גיטרה, 📚 ספרים')}</span></button>`;
  const anyMap = collCats.some(c => c.map);
  const tools = `<div class="cs-tools">${anyMap ? `<button class="chip" data-cview="map">🗺 ${L('Everything on the map', 'הכל במפה')}</button>` : ''}${ro ? '' : `<button class="chip" data-ccats>✏️ ${L('Edit categories', 'עריכת קטגוריות')}</button>`}</div>`;
  let found = '';
  if (search.trim()) {
    const hits = coll.filter(x => collCats.some(c => c.id === x.cat) && collMatches(x));
    found = `<h3 class="cs-h">🔎 ${L('Found', 'נמצאו')} <i>${hits.length}</i></h3>` + (hits.length ? `<div class="c-board">${hits.map(collCard).join('')}</div>` : `<p class="hint">${L('Nothing matches.', 'אין התאמות.')}</p>`);
  }
  return `<div class="c-wrap">${found}<div class="cs-grid">${tiles}${add}</div>${tools}</div>`;
}
function collAllMap() {
  const mapCats = collCats.filter(c => c.map).map(c => c.id);
  const list = coll.filter(x => mapCats.includes(x.cat) && collMatches(x));
  collPins = list.filter(x => x.lat !== null && x.lat !== undefined && x.lat !== '');
  setTimeout(initCollMap, 0);
  return `<div class="c-wrap"><div class="c-head"><button class="c-back" data-cview="board">‹ ${L('Collection', 'האוסף')}</button><h3>🗺 ${L('Everything on the map', 'הכל במפה')} <i>${collPins.length}</i></h3></div>
    <div class="c-map" id="collMap"><p class="hint" style="padding:16px">${L('Loading the map…', 'טוען מפה…')}</p></div></div>`;
}
function collViews(cat) {
  const tpl = catTpl(cat), st = catStyleC(cat), v = [['board', '▦', L('Cards', 'כרטיסים')], ['table', '☰', L('Table', 'טבלה')]];
  if (tpl && st !== 'drink') v.push(['list', '≣', L('List', 'רשימה')]);
  if (cat.map) v.push(['map', '🗺', L('Map', 'מפה')]);
  return v;
}
function collLayoutOf(cat) {
  const saved = (ui.collLayout || {})[cat.id], tpl = catTpl(cat), views = collViews(cat).map(x => x[0]);
  if (saved && views.includes(saved)) return saved;
  if (catStyleC(cat) === 'drink') return 'table';
  return tpl && tpl.view === 'table' ? 'table' : tpl && tpl.view === 'list' ? 'list' : 'board';
}
function renderCollection() {
  if (ui.collCat !== '*' && !collCats.find(c => c.id === ui.collCat)) ui.collCat = '*';
  if (!collCats.length) return `<div class="c-wrap"><div class="empty"><b>✨</b>${L('Nothing here yet.', 'עדיין אין כאן כלום.')}</div></div>`;
  if (ui.collCat === '*') return ui.collView === 'map' && collCats.some(c => c.map) ? collAllMap() : collShelf();
  const cat = catOf(ui.collCat), kind = cat.kind, tpl = catTpl(cat), ro = collRO();
  const layout = collLayoutOf(cat), n = coll.filter(x => x.cat === cat.id).length;
  const fc = cfCount(cat.id);
  const views = collViews(cat).map(([k, ic, l]) => `<button class="${layout === k ? 'on' : ''}" data-clayout="${k}" aria-label="${esc(l)}" title="${esc(l)}">${ic}<span class="c-vl">${esc(l)}</span></button>`).join('');
  const hasFilters = kind !== 'note' || ['food', 'drink'].includes(catStyleC(cat)) || (tpl && tpl.fields.some(f => f.t === 'choice'));
  let html = `<div class="c-head" style="--c-ink:${C_INK[catIdx(cat.id) % C_INK.length]}"><button class="c-back" data-ccat="*" aria-label="${esc(L('All categories', 'כל הקטגוריות'))}">‹</button>
    <h3 dir="auto"><span>${catEmoji(cat)}</span> <span class="c-ht">${esc(catLabel(cat))}</span> <i>${n}</i></h3>
    ${ro ? '' : `<button class="c-fbtn" data-ctpl="${esc(cat.id)}" title="${esc(L('What is saved and how it looks', 'מה נשמר ואיך זה נראה'))}">🧩 ${L('Template', 'תבנית')}</button>`}</div>
    <div class="c-tools2"><div class="c-view c-layout">${views}</div><span class="grow"></span>
    ${hasFilters ? `<button class="c-fbtn ${fc ? 'on' : ''}" data-cfsheet>⚲ ${L('Filter', 'סינון')}${fc ? ` <i>${fc}</i>` : ''}</button>` : ''}</div>`;
  html += collActiveFilters(cat);
  const list = collFiltered(cat);
  if (layout === 'map') {
    const pins = list.filter(x => x.lat !== null && x.lat !== undefined && x.lat !== '');
    const nopin = list.filter(x => !pins.includes(x));
    collPins = pins;
    html += `<div class="c-map" id="collMap"><p class="hint" style="padding:16px">${L('Loading the map…', 'טוען מפה…')}</p></div>
      ${nopin.length ? `<div class="c-nopin"><span>📍 ${L(`${nopin.length} without a location — tap to add a place:`, `${nopin.length} בלי מיקום — לחץ כדי להוסיף מקום:`)}</span>${nopin.map(x => `<button class="c-chip" data-cid="${esc(x.id)}">${esc(x.title)}</button>`).join('')}</div>` : ''}`;
    setTimeout(initCollMap, 0);
    return `<div class="c-wrap">${html}</div>`;
  }
  if (layout === 'table') return `<div class="c-wrap">${html}${collTable(cat, list)}</div>`;
  if (layout === 'list') return `<div class="c-wrap">${html}${tplList(cat, list)}</div>`;
  list.sort((a, b) => (a.status === 'tried') - (b.status === 'tried') || (b.rating - a.rating) || String(b.updated || b.added).localeCompare(String(a.updated || a.added)));
  const addCard = ro ? '' : `<div class="c-card c-new" style="--c-bg:${C_PAL[catIdx(cat.id) % C_PAL.length]};--c-ink:${C_INK[catIdx(cat.id) % C_INK.length]}">
      <div class="c-band"><span class="c-emoji">${catEmoji(cat)}</span><span>${L('New', 'חדש')}</span></div>
      <input id="collNew" dir="auto" enterkeyhint="done" autocomplete="off" placeholder="${esc(kind === 'wish' ? L('I wish…', 'הייתי רוצה…') : kind === 'note' ? L('Write it down…', 'כתוב כאן…') : L('Name, or paste a link…', 'שם, או הדבק קישור…'))}">
      <button class="c-more" data-cnew>${L('＋ with details', '＋ עם פרטים')}</button></div>`;
  html += `<div class="c-board">${addCard}${list.map(collCard).join('')}</div>`;
  if (!list.length && ro) html += `<div class="empty"><b>${catEmoji(cat)}</b>${L('Nothing here yet.', 'עדיין אין כאן כלום.')}</div>`;
  return `<div class="c-wrap">${html}</div>`;
}
/* the filters that are on, as small chips you can remove with ✕ */
function collActiveFilters(cat) {
  const o = cfOf(cat.id), w = statusWordsC(cat), st = catStyleC(cat), tpl = catTpl(cat), out = [];
  if (o.st !== 'all') out.push(['st', o.st, o.st === 'tried' ? w.fTried : w.fWant]);
  o.kind.forEach(k => { const b = st === 'food' ? (k === '_' ? [0, '❔', 'No kind', 'בלי סוג'] : foodOf(k)) : baseOf(k); out.push(['kind', k, b[1] + ' ' + L(b[2], b[3])]); });
  Object.keys(o.f).forEach(k => (o.f[k] || []).forEach(v => { const f = tplField(tpl, k); if (f) out.push(['f:' + k, v, v === '_' ? f.l + ': —' : v]); }));
  if (!out.length) return '';
  return `<div class="c-active">${out.map(([g, v, l]) => `<button class="c-af" data-cfx="${esc(g)}" data-cfv="${esc(v)}">${esc(l)} <b>✕</b></button>`).join('')}${out.length > 1 ? `<button class="linkish" data-cfx="*">${L('Clear all', 'נקה הכל')}</button>` : ''}</div>`;
}
function openCollFilter() {
  const cat = catOf(ui.collCat); if (!cat || ui.collCat === '*') return;
  $('#cfHead').textContent = catEmoji(cat) + ' ' + L('Filter', 'סינון') + ' · ' + catLabel(cat);
  cfRender(); $('#dlgCFilt').showModal();
}
function cfRender() {
  const cat = catOf(ui.collCat), o = cfOf(cat.id), st = catStyleC(cat), tpl = catTpl(cat), w = statusWordsC(cat);
  const base = coll.filter(x => x.cat === cat.id && collMatches(x));
  const chip = (g, v, label, n, on) => `<button type="button" class="c-kind ${on ? 'on' : ''}" data-cfg="${esc(g)}" data-cfv="${esc(v)}" aria-pressed="${on}">${label}${n !== null ? ` <i>${n}</i>` : ''}</button>`;
  let h = '';
  if (cat.kind !== 'note') {
    const pre = collFiltered(cat, true), nT = pre.filter(x => x.status === 'tried').length;
    h += `<section class="cf-sec"><h4>${L('Status', 'מצב')}</h4><div class="c-kinds">${[['all', L('All', 'הכל'), pre.length], ['want', w.fWant, pre.length - nT], ['tried', w.fTried, nT]].map(([k, l, n]) => chip('st', k, esc(l), n, o.st === k)).join('')}</div></section>`;
  }
  if (st === 'food' || st === 'drink') {
    const cnt = {}; base.forEach(x => { const k = kindKey(x, st); cnt[k] = (cnt[k] || 0) + 1; });
    const LIST = st === 'food' ? C_FOOD : C_BASES;
    const keys = LIST.map(b => b[0]).filter(k => cnt[k]).concat(Object.keys(cnt).filter(k => k !== '_' && !LIST.some(b => b[0] === k))).concat(cnt._ ? ['_'] : []);
    if (keys.length) h += `<section class="cf-sec"><h4>${st === 'food' ? L('Kind of place', 'סוג המקום') : L('Base', 'בסיס')}</h4><div class="c-kinds">${keys.map(k => { const b = k === '_' ? ['_', '❔', 'No kind', 'בלי סוג'] : st === 'food' ? foodOf(k) : baseOf(k); return chip('kind', k, b[1] + ' ' + esc(L(b[2], b[3])), cnt[k], o.kind.includes(k)); }).join('')}</div></section>`;
  }
  (tpl ? tpl.fields : []).filter(f => f.t === 'choice').forEach(f => {
    const cnt = {}; base.forEach(x => { const v = xv(x, f.k) || '_'; cnt[v] = (cnt[v] || 0) + 1; });
    const vals = (f.o || []).filter(v => cnt[v]).concat(Object.keys(cnt).filter(v => v !== '_' && !(f.o || []).includes(v))).concat(cnt._ ? ['_'] : []);
    if (vals.length) h += `<section class="cf-sec"><h4 dir="auto">${esc(f.l)}</h4><div class="c-kinds">${vals.map(v => chip('f:' + f.k, v, v === '_' ? '—' : esc(v), cnt[v], (o.f[f.k] || []).includes(v))).join('')}</div></section>`;
  });
  $('#cfBody').innerHTML = h || `<p class="hint">${L('Nothing to filter yet.', 'עוד אין לפי מה לסנן.')}</p>`;
  $('#cfShow').textContent = L(`Show ${collFiltered(cat).length}`, `הצג ${collFiltered(cat).length}`);
}
function cfToggle(g, v) {
  const id = ui.collCat, o = cfOf(id);
  if (g === '*') { cfSet(id, { st: 'all', kind: [], f: {} }); ui.collKind = Object.assign({}, ui.collKind, { [id]: [] }); return; }
  if (g === 'st') o.st = o.st === v ? 'all' : v;
  else if (g === 'kind') o.kind = o.kind.includes(v) ? o.kind.filter(x => x !== v) : o.kind.concat(v);
  else if (g.startsWith('f:')) { const k = g.slice(2), cur = o.f[k] || []; o.f[k] = cur.includes(v) ? cur.filter(x => x !== v) : cur.concat(v); }
  ui.collKind = Object.assign({}, ui.collKind, { [id]: o.kind });
  cfSet(id, o);
}
/* ≣ list view — grouped by the template's main choice (e.g. Song / Chords / Tabs), tap a row to open chords, tabs, notes */
function tplList(cat, list) {
  const tpl = catTpl(cat) || { fields: [] }, gf = tplField(tpl, tpl.group);
  const lang = isHe() ? 'he' : 'en', cmp = (a, b) => String(a).localeCompare(String(b), lang, { sensitivity: 'base', numeric: true });
  const groups = {};
  list.forEach(en => { const k = gf ? (xv(en, gf.k) || '_') : '*'; (groups[k] = groups[k] || []).push(en); });
  const order = gf ? (gf.o || []).filter(k => groups[k]).concat(Object.keys(groups).filter(k => k !== '_' && !(gf.o || []).includes(k)).sort(cmp)).concat(groups._ ? ['_'] : []) : ['*'];
  const sub = (tpl.fields || []).find(f => f.t === 'text' && f.k !== tpl.group);
  const w = statusWordsC(cat);
  const row = (en) => {
    const open = !!ctOpen[en.id], done = en.status === 'tried';
    return `<div class="ct-item tp-item ${open ? 'open' : ''} ${done ? 'done' : ''}">
      <button class="ct-row" data-ctr="${esc(en.id)}" aria-expanded="${open}">
        <span class="ct-name" dir="auto"><b>${esc(en.title)}</b>${sub && xv(en, sub.k) ? `<small> · ${esc(xv(en, sub.k))}</small>` : ''}</span>
        <span class="ct-meta">${tplChips(en, tpl, [tpl.group, sub && sub.k])}${done && cat.kind !== 'note' ? '<span class="ct-ok">✓</span>' : ''}${(tpl.fields || []).some(f => f.t === 'mono' && xv(en, f.k)) ? '<span title="chords">🎼</span>' : ''}${en.link ? (ctIsVideo(en.link) ? '<span>▶</span>' : '<span>🔗</span>') : ''}</span>
        <span class="ct-chev">⌄</span></button>
      ${open ? `<div class="ct-detail">
        ${en.img ? `<img class="ct-img" src="${esc(en.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        ${tplDetail(en, tpl)}
        ${en.notes ? `<div class="ct-notes" dir="auto">${esc(en.notes)}</div>` : ''}
        ${en.by ? `<p class="ct-by">👤 ${esc(en.by)}</p>` : ''}
        <div class="ct-actions">${en.link ? `<button class="btn ${ctIsVideo(en.link) ? 'primary' : 'ghost'}" data-clink="${esc(en.link)}">${ctIsVideo(en.link) ? L('▶ Watch', '▶ לסרטון') : L('🔗 Open link', '🔗 לקישור')}</button>` : ''}${tplFind(en, tpl)}
          ${collRO() ? '' : `${cat.kind !== 'note' ? `<button class="btn ghost" data-cdone="${esc(en.id)}">${done ? esc(w.want) : esc(w.tried)}</button>` : ''}<button class="btn ghost" data-copen="${esc(en.id)}">✏️ ${L('Edit', 'עריכה')}</button>`}</div>
      </div>` : ''}</div>`;
  };
  const add = collRO() ? '' : `<div class="ct-add"><input id="collNew" dir="auto" enterkeyhint="done" autocomplete="off" placeholder="${esc(L('Add — name or paste a link…', 'הוסף — שם או הדבק קישור…'))}"><button class="btn ghost" data-cnew>${L('＋ details', '＋ פרטים')}</button></div>`;
  const body = order.map(k => `<section class="ct-group">${gf ? `<h4 dir="auto">${k === '_' ? esc(L('Other', 'אחר')) : esc(k)} <i>${groups[k].length}</i></h4>` : ''}${groups[k].sort((a, b) => (a.status === 'tried') - (b.status === 'tried') || cmp(a.title, b.title)).map(row).join('')}</section>`).join('');
  return `<div class="c-table">${add}${list.length ? body : `<div class="empty"><b>${catEmoji(cat)}</b>${L('Nothing here yet.', 'עדיין אין כאן כלום.')}</div>`}</div>`;
}
/* ---- 🍸 table view (e.g. drinks): grouped by base, tap a row to open recipe / description / video ---- */
function collTable(cat, list) {
  if (catStyleC(cat) === 'drink') return drinkTable(cat, list);
  if (catTpl(cat)) return tplTable(cat, list);
  const drink = false;
  const groups = {};
  list.forEach(en => { const k = drink ? (en.base || 'other') : (en.status === 'tried' ? 'tried' : 'want'); (groups[k] = groups[k] || []).push(en); });
  const order = drink ? C_BASES.map(b => b[0]) : ['want', 'tried'];
  const head = (k) => drink ? `${baseOf(k)[1]} ${L(baseOf(k)[2], baseOf(k)[3])}` : (k === 'tried' ? statusWords(cat.kind).tried : statusWords(cat.kind).want);
  const isVideo = (u) => /youtu|tiktok|instagram\.com\/(reel|tv)|facebook\.com\/.*video|fb\.watch/i.test(u || '');
  const row = (en) => {
    const open = !!ctOpen[en.id];
    return `<div class="ct-item ${open ? 'open' : ''} ${en.status === 'tried' ? 'done' : ''}">
      <button class="ct-row" data-ctr="${esc(en.id)}" aria-expanded="${open}">
        <span class="ct-name" dir="auto">${esc(en.title)}</span>
        <span class="ct-meta">${en.rating ? `<span class="c-stars">${stars(en.rating)}</span>` : ''}${en.status === 'tried' && cat.kind !== 'note' ? '<span class="ct-ok">✓</span>' : ''}${en.link ? (isVideo(en.link) ? '<span title="video">▶</span>' : '<span>🔗</span>') : ''}</span>
        <span class="ct-chev">⌄</span></button>
      ${open ? `<div class="ct-detail">
        ${en.img ? `<img class="ct-img" src="${esc(en.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        ${en.notes ? `<div class="ct-notes" dir="auto">${esc(en.notes)}</div>` : `<p class="hint">${L('No instructions yet — tap Edit to add them.', 'עוד אין הוראות — לחץ עריכה כדי להוסיף.')}</p>`}
        ${en.by ? `<p class="ct-by">👤 ${esc(en.by)}</p>` : ''}
        <div class="ct-actions">${en.link ? `<button class="btn ${isVideo(en.link) ? 'primary' : 'ghost'}" data-clink="${esc(en.link)}">${isVideo(en.link) ? L('▶ Watch the video', '▶ לסרטון') : L('🔗 Open link', '🔗 לקישור')}</button>` : ''}
          ${collRO() ? '' : `<button class="btn ghost" data-copen="${esc(en.id)}">✏️ ${L('Edit', 'עריכה')}</button>`}</div>
      </div>` : ''}</div>`;
  };
  const add = collRO() ? '' : `<div class="ct-add"><input id="collNew" dir="auto" enterkeyhint="done" autocomplete="off" placeholder="${esc(drink ? L('Add a cocktail — name or paste a link…', 'הוסף קוקטייל — שם או הדבק קישור…') : L('Add — name or paste a link…', 'הוסף — שם או הדבק קישור…'))}"><button class="btn ghost" data-cnew>${L('＋ details', '＋ פרטים')}</button></div>`;
  const body = order.filter(k => groups[k]).map(k => `<section class="ct-group"><h4>${head(k)} <i>${groups[k].length}</i></h4>${groups[k].sort((a, b) => (b.rating - a.rating) || a.title.localeCompare(b.title)).map(row).join('')}</section>`).join('');
  return `<div class="c-table">${add}${body || `<div class="empty"><b>${catEmoji(cat)}</b>${L('Nothing here yet.', 'עדיין אין כאן כלום.')}</div>`}</div>`;
}
/* ☰ table for a category with a template: Name + its short details as columns, tap a row to open it */
function tplTable(cat, list) {
  const tpl = catTpl(cat), cols = tpl.fields.filter(f => ['choice', 'text', 'number'].includes(f.t)).slice(0, 3), w = statusWordsC(cat);
  const lang = isHe() ? 'he' : 'en', cmp = (a, b) => String(a).localeCompare(String(b), lang, { sensitivity: 'base', numeric: true });
  const rows = list.slice().sort((a, b) => (a.status === 'tried') - (b.status === 'tried') || cmp(a.title, b.title));
  const body = rows.map(en => {
    const open = !!ctOpen[en.id], done = en.status === 'tried';
    const r = `<tr class="dt-row ${open ? 'open' : ''} ${done ? 'done' : ''}" data-ctr="${esc(en.id)}" tabindex="0" aria-expanded="${open}">
      <td class="dt-name" dir="auto"><b>${esc(en.title)}</b>${done && cat.kind !== 'note' ? ' <span class="ct-ok">✓</span>' : ''}${en.rating ? `<div class="c-stars">${stars(en.rating)}</div>` : ''}</td>
      ${cols.map(f => `<td class="dt-ing" dir="auto">${xv(en, f.k) ? esc(xv(en, f.k)) : '<span class="dt-none">—</span>'}</td>`).join('')}
      <td class="dt-end">${en.link ? '<span class="dt-ic">🔗</span>' : ''}<span class="ct-chev">⌄</span></td></tr>`;
    if (!open) return r;
    return r + `<tr class="dt-detail"><td colspan="${cols.length + 2}"><div class="ct-detail">
      ${en.img ? `<img class="ct-img" src="${esc(en.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      ${tplDetail(en, tpl)}${en.notes ? `<div class="ct-notes" dir="auto">${esc(en.notes)}</div>` : ''}${en.by ? `<p class="ct-by">👤 ${esc(en.by)}</p>` : ''}
      <div class="ct-actions">${en.link ? `<button class="btn ghost" data-clink="${esc(en.link)}">${ctIsVideo(en.link) ? L('▶ Watch', '▶ לסרטון') : L('🔗 Open link', '🔗 לקישור')}</button>` : ''}${tplFind(en, tpl)}
        ${collRO() ? '' : `${cat.kind !== 'note' ? `<button class="btn ghost" data-cdone="${esc(en.id)}">${done ? esc(w.want) : esc(w.tried)}</button>` : ''}<button class="btn ghost" data-copen="${esc(en.id)}">✏️ ${L('Edit', 'עריכה')}</button>`}</div></div></td></tr>`;
  }).join('');
  const add = collRO() ? '' : `<div class="ct-add"><input id="collNew" dir="auto" enterkeyhint="done" autocomplete="off" placeholder="${esc(L('Add — name or paste a link…', 'הוסף — שם או הדבק קישור…'))}"><button class="btn ghost" data-cnew>${L('＋ details', '＋ פרטים')}</button></div>`;
  if (!rows.length) return `<div class="c-table">${add}<div class="empty"><b>${catEmoji(cat)}</b>${L('Nothing here yet.', 'עדיין אין כאן כלום.')}</div></div>`;
  return `<div class="c-table">${add}<table class="dt tp-table no-i18n"><thead><tr><th>${L('Name', 'שם')}</th>${cols.map(f => `<th dir="auto">${esc(f.l)}</th>`).join('')}<th></th></tr></thead><tbody>${body}</tbody></table></div>`;
}
/* 🍸 drinks: a real table — Base | Name | Other ingredients — sorted by base, then name (A→Z / א→ת); tap a row to open it */
const ctIsVideo = (u) => /youtu|tiktok|instagram\.com\/(reel|tv)|facebook\.com\/.*video|fb\.watch/i.test(u || '');
function drinkVideoUrl(en) {
  const last = String(en.notes || '').trim().split('\n').pop();
  const name = /^—\s*/.test(last) ? last.replace(/^—\s*/, '') : en.title;
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' ' + (/[\u0590-\u05FF]/.test(name) ? 'קוקטייל מתכון' : 'cocktail recipe'));
}
function drinkTable(cat, list) {
  const lang = isHe() ? 'he' : 'en';
  const cmp = (a, b) => String(a).localeCompare(String(b), lang, { sensitivity: 'base', numeric: true });
  const bLabel = (en) => L(baseOf(en.base || 'other')[2], baseOf(en.base || 'other')[3]);
  const rows = list.slice().sort((a, b) => cmp(bLabel(a), bLabel(b)) || cmp(a.title, b.title));
  let prev = null;
  const body = rows.map(en => {
    const open = !!ctOpen[en.id], b = baseOf(en.base || 'other'), first = b[0] !== prev; prev = b[0];
    const tried = en.status === 'tried';
    const row = `<tr class="dt-row ${first ? 'dt-first' : ''} ${open ? 'open' : ''} ${tried ? 'done' : ''}" data-ctr="${esc(en.id)}" tabindex="0" aria-expanded="${open}">
      <td class="dt-base ${first ? '' : 'rep'}"><span class="dt-bi">${b[1]}</span><span class="dt-bl">${esc(L(b[2], b[3]))}</span></td>
      <td class="dt-name" dir="auto">${en.img ? `<img class="dt-thumb" src="${esc(en.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<b>${esc(en.title)}</b>${tried ? ' <span class="ct-ok">✓</span>' : ''}${en.rating ? `<div class="c-stars">${stars(en.rating)}</div>` : ''}</td>
      <td class="dt-ing" dir="auto">${en.ing ? esc(en.ing) : '<span class="dt-none">—</span>'}</td>
      <td class="dt-end">${en.link ? (ctIsVideo(en.link) ? '<span class="dt-ic">▶</span>' : '<span class="dt-ic">🔗</span>') : ''}<span class="ct-chev">⌄</span></td></tr>`;
    if (!open) return row;
    return row + `<tr class="dt-detail"><td colspan="4"><div class="ct-detail">
        ${en.img ? `<img class="ct-img" src="${esc(en.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        ${en.notes ? `<div class="ct-notes" dir="auto">${esc(en.notes)}</div>` : `<p class="hint">${L('No instructions yet — tap Edit to add them.', 'עוד אין הוראות — לחץ עריכה כדי להוסיף.')}</p>`}
        ${en.by ? `<p class="ct-by">👤 ${esc(en.by)}</p>` : ''}
        <div class="ct-actions">${en.link ? `<button class="btn ${ctIsVideo(en.link) ? 'primary' : 'ghost'}" data-clink="${esc(en.link)}">${ctIsVideo(en.link) ? L('▶ Watch the video', '▶ לסרטון') : L('📖 Recipe', '📖 למתכון')}</button>` : ''}
          ${ctIsVideo(en.link) ? '' : `<button class="btn ghost" data-clink="${esc(drinkVideoUrl(en))}">${L('🎬 Videos', '🎬 סרטוני הכנה')}</button>`}
          ${collRO() ? '' : `<button class="btn ghost" data-copen="${esc(en.id)}">✏️ ${L('Edit', 'עריכה')}</button>`}</div>
      </div></td></tr>`;
  }).join('');
  const add = collRO() ? '' : `<div class="ct-add"><input id="collNew" dir="auto" enterkeyhint="done" autocomplete="off" placeholder="${esc(L('Add a cocktail — name or paste a link…', 'הוסף קוקטייל — שם או הדבק קישור…'))}"><button class="btn ghost" data-cnew>${L('＋ details', '＋ פרטים')}</button></div>`;
  if (!rows.length) return `<div class="c-table">${add}<div class="empty"><b>${catEmoji(cat)}</b>${L('Nothing here yet.', 'עדיין אין כאן כלום.')}</div></div>`;
  return `<div class="c-table">${add}<table class="dt no-i18n"><thead><tr><th>${L('Base', 'בסיס')}</th><th>${L('Name', 'שם')}</th><th>${L('Other ingredients', 'מצרכים נוספים')}</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function collCard(en) {
  const c = catOf(en.cat), i = catIdx(en.cat), w = statusWordsC(c), done = en.status === 'tried', tpl = catTpl(c);
  const mono = tpl && tpl.fields.find(f => f.t === 'mono' && xv(en, f.k)), chips = tplChips(en, tpl);
  const fk = catStyleC(c) === 'food' ? foodOf(foodType(en)) : null;
  const meta = [fk ? fk[1] + ' ' + esc(L(fk[2], fk[3])) : '', c.map && en.place ? '📍 ' + esc(en.place) : '', c.kind === 'wish' && en.for ? '🎁 ' + L('for ', 'בשביל ') + esc(en.for) : '', en.by ? '👤 ' + esc(en.by) : ''].filter(Boolean).join(' · ');
  const stamp = c.kind !== 'note' && done ? `<span class="c-stamp">${w.tried}</span>` : '';
  return `<article class="c-card ${done ? 'done' : ''} kind-${c.kind}" data-cid="${esc(en.id)}" style="--c-bg:${C_PAL[i % C_PAL.length]};--c-ink:${C_INK[i % C_INK.length]}">
    ${en.img ? `<img class="c-img" src="${esc(en.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="c-band"><span class="c-emoji">${catEmoji(c)}</span><span>${esc(catLabel(c))}</span>${stamp}</div>
    <h4 dir="auto">${esc(en.title)}</h4>
    ${en.rating ? `<div class="c-stars">${stars(en.rating)}</div>` : ''}
    ${meta ? `<div class="c-meta" dir="auto">${meta}</div>` : ''}
    ${chips ? `<div class="tp-chips">${chips}</div>` : ''}
    ${mono ? `<pre class="tp-mono tp-peek" dir="ltr">${esc(xv(en, mono.k).split('\n').slice(0, 5).join('\n'))}</pre>` : ''}
    ${en.notes ? `<p class="c-notes" dir="auto">${esc(en.notes)}</p>` : ''}
    ${en.link || (en.lat !== null && en.lat !== undefined && en.lat !== '') ? `<div class="c-actions">${en.link ? `<button data-clink="${esc(en.link)}">🔗 ${L('Link', 'קישור')}</button>` : ''}${en.lat !== null && en.lat !== undefined && en.lat !== '' ? `<button data-cpin="${esc(en.id)}">🗺 ${L('On the map', 'במפה')}</button>` : ''}</div>` : ''}
  </article>`;
}
/* ---- map (Leaflet + OpenStreetMap, loaded only when needed) ---- */
let collMap = null, collPins = [], collFocus = null, leafletP = null;
function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve();
  if (leafletP) return leafletP;
  leafletP = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = () => res(); s.onerror = () => { leafletP = null; rej(new Error('map')); }; document.head.appendChild(s);
  });
  return leafletP;
}
async function initCollMap() {
  const box = document.getElementById('collMap'); if (!box) return;
  try { await loadLeaflet(); } catch (e) { box.innerHTML = `<p class="hint" style="padding:16px">${L('The map could not load — check the internet connection.', 'המפה לא נטענה — בדוק את החיבור לאינטרנט.')}</p>`; return; }
  if (!document.getElementById('collMap')) return;
  if (collMap) { try { collMap.remove(); } catch (e) { /* old */ } collMap = null; }
  box.innerHTML = '';
  collMap = window.L.map(box, { zoomControl: true, attributionControl: true });
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(collMap);
  const markers = collPins.map(en => {
    const c = catOf(en.cat), i = catIdx(en.cat), w = statusWords(c.kind);
    const icon = window.L.divIcon({ className: '', html: `<div class="c-pin ${en.status === 'tried' ? 'done' : ''}" style="--c-ink:${C_INK[i % C_INK.length]}"><span>${(catStyleC(c) === 'food' && foodOf(foodType(en)) || [0, catEmoji(c)])[1]}</span></div>`, iconSize: [36, 44], iconAnchor: [18, 42], popupAnchor: [0, -38] });
    const m = window.L.marker([Number(en.lat), Number(en.lng)], { icon, title: en.title }).addTo(collMap);
    m.bindPopup(`<div class="c-pop" dir="auto"><b>${esc(en.title)}</b><div>${esc(c.name)}${catStyleC(c) === 'food' && foodOf(foodType(en)) ? ' · ' + esc(L(foodOf(foodType(en))[2], foodOf(foodType(en))[3])) : ''}</div>${en.rating ? `<div class="c-stars">${stars(en.rating)}</div>` : ''}${tplChips(en, catTpl(c)) ? `<div class="tp-chips" style="margin:4px 0">${tplChips(en, catTpl(c))}</div>` : ''}<div>${en.status === 'tried' ? w.tried : w.want}</div>${en.place ? `<div>📍 ${esc(en.place)}</div>` : ''}${en.by ? `<div>👤 ${esc(en.by)}</div>` : ''}${en.notes ? `<div class="c-pop-n">${esc(en.notes.slice(0, 140))}</div>` : ''}<button data-copen="${esc(en.id)}">${L('Details', 'פרטים')}</button>${en.link ? ` <button data-clink="${esc(en.link)}">🔗</button>` : ''}</div>`);
    m._cid = en.id; return m;
  });
  collMap.on('popupopen', (ev) => {
    const el = ev.popup.getElement(); if (!el) return;
    el.querySelectorAll('[data-copen]').forEach(b => { b.onclick = () => { const en = coll.find(x => x.id === b.dataset.copen); if (en) openColl(en); }; });
    el.querySelectorAll('[data-clink]').forEach(b => { b.onclick = () => window.open(b.dataset.clink, '_blank', 'noopener'); });
  });
  if (markers.length) collMap.fitBounds(window.L.featureGroup(markers).getBounds().pad(0.25), { maxZoom: 14 });
  else collMap.setView([31.8, 35.0], 7);
  if (collFocus) { const m = markers.find(x => x._cid === collFocus); if (m) { collMap.setView(m.getLatLng(), 15); m.openPopup(); } collFocus = null; }
  setTimeout(() => collMap && collMap.invalidateSize(), 100);
}
/* ---- saving ---- */
async function collApi(body) {
  if (settings.demo) {
    if (body.action === 'collSave') { const en = Object.assign({ id: body.entry.id || Math.random().toString(36).slice(2, 10), added: iso(today()), lat: body.entry.lat ?? null, lng: body.entry.lng ?? null }, body.entry); return { ok: true, entry: en }; }
    if (body.action === 'collCats') return { ok: true, collCats: body.cats };
    return { ok: true };
  }
  return api('POST', body);
}
async function collStore(en) {
  const before = JSON.stringify(coll);
  const tmp = Object.assign({}, en, { id: en.id || '_tmp' + Date.now() });
  const i = coll.findIndex(x => x.id === tmp.id); if (i >= 0) coll[i] = tmp; else coll.push(tmp);
  render();
  try {
    const j = await collApi({ action: 'collSave', entry: Object.assign({}, en) }); const k = coll.findIndex(x => x.id === tmp.id); if (k >= 0) coll[k] = j.entry; render();
    if (j.entry && j.entry.geo === 'none') toast(L('Saved — but the place wasn\'t found on the map. Try a fuller name (with the city) or 📍 Here.', 'נשמר — אבל המקום לא נמצא במפה. נסה שם מלא יותר (עם העיר) או 📍 כאן.'));
    return true;
  } catch (e) { coll = JSON.parse(before); render(); toast(L('Not saved: ', 'לא נשמר: ') + e.message); return false; }
}
async function collQuickAdd(text) {
  text = text.trim(); if (!text) return;
  const m = text.match(/https?:\/\/\S+/i); const link = m ? m[0] : '';
  let title = link ? text.replace(link, '').trim() : text;
  if (link && !settings.demo) {                                    // ✨ read the post / page and open a pre-filled entry to approve
    toast(L('✨ Reading the link…', '✨ קורא את הקישור…'));
    const cat = catOf(ui.collCat);
    const info = await linkInfo(link, cat);
    const en = Object.assign({ cat: cat.id, status: 'want' }, collFromInfo(info, { title, link }));
    openColl(en); collLinkNote(info);
    return;
  }
  if (!title && link) { try { title = new URL(link).hostname.replace(/^www\./, ''); } catch (e) { title = link; } }
  await collStore({ cat: ui.collCat, title, link, status: 'want', rating: 0 });
  const inp = $('#collNew'); if (inp) inp.focus();
}
async function linkInfo(url, cat, text) {
  const tpl = cat && catTpl(cat);
  try { return await api('POST', { action: 'linkInfo', url, cat: cat && cat.id, catName: cat && cat.name, text: text || '', fields: tpl ? tpl.fields : null }); } catch (e) { return null; }
}
function collFromInfo(info, base) {
  info = info || {};
  const o = { title: base.title || info.title || '', link: info.url || base.link, place: info.place || '', notes: info.notes || '', by: info.by || '', img: info.img || '', base: info.base || '', ing: info.ing || '', x: info.x && typeof info.x === 'object' ? info.x : {}, _auto: info.title || '' };
  if (info.summary && o.notes.indexOf(info.summary.slice(0, 20)) < 0) o.notes = info.summary + (o.notes ? '\n\n' + o.notes : '');
  if (!o.title) { try { o.title = new URL(base.link).hostname.replace(/^www\./, ''); } catch (e) { o.title = base.link; } }
  if (info.lat !== null && info.lat !== undefined && info.lat !== '') { o.lat = info.lat; o.lng = info.lng; o._pin = 'link'; o._geo = info.geoName || ''; }
  return o;
}
/* what happened when reading the link — shown as a banner in the entry window */
function collLinkNote(info, fromText) {
  const box = $('#collNote');
  if (!info || !info.found || info.blocked) {
    box.className = 'c-note warn'; box.hidden = false;
    box.innerHTML = L('📋 <b>The post couldn’t be read</b> (Instagram/Facebook often block it). Copy the post’s text in the app, paste it into <b>Notes</b> below and tap <b>✨ Fill from text</b>.',
      '📋 <b>לא הצלחתי לקרוא את הפוסט</b> (אינסטגרם/פייסבוק חוסמים לפעמים). העתק את הטקסט של הפוסט באפליקציה, הדבק ב<b>הערות</b> למטה ולחץ <b>✨ מלא מהטקסט</b>.');
  } else {
    box.className = 'c-note ok'; box.hidden = false;
    box.innerHTML = (info.ai ? '✨ ' + L('Read with AI', 'נקרא עם AI') : '✓ ' + (fromText ? L('Filled from the text', 'מולא מהטקסט') : L('Filled from the link', 'מולא מהקישור'))) + ' · ' + L('check and Save', 'בדוק ולחץ שמירה') +
      (info.aiError ? `<br><small>${esc(L('AI didn’t answer: ', 'ה-AI לא ענה: ') + info.aiError)}</small>` : '');
  }
  if ($('#dlgColl').open) collFormUi();
}
async function collFillFromLink() {
  const f = $('#frmColl'), link = f.elements.link.value.trim(), notes = f.elements.notes.value.trim();
  if (!/^https?:\/\//i.test(link) && notes.length < 15) return;
  const b = $('#collFill'); b.disabled = true; const old = b.textContent; b.textContent = L('✨ Reading…', '✨ קורא…');
  const cat = catOf($('#collCat').value);
  const blockedBefore = $('#collNote').classList.contains('warn');
  const useText = blockedBefore || !/^https?:\/\//i.test(link);
  const info = await linkInfo(link, cat, useText ? notes : '');
  b.disabled = false; b.textContent = old;
  collLinkNote(info, useText);
  if (!info || !info.found) return;
  const cur = f.elements.title.value.trim(), auto = f.dataset.autoTitle || '';
  if (info.title && (!cur || cur === auto || /^[\w.-]+\.(com|co\.il|il|net|org|io)$/i.test(cur))) { f.elements.title.value = info.title; f.dataset.autoTitle = info.title; }
  const set = (k, v) => { if (v && !f.elements[k].value.trim()) f.elements[k].value = v; };
  set('place', info.place); set('by', info.by);
  { const st1 = catStyleC(catOf($('#collCat').value)), gb = info.base || (st1 === 'food' ? guessFood([info.title, info.notes, info.summary].join(' ')) : '');
    if (gb && (!$('#collBase').value || $('#collBase').value === NEW_BASE)) fillBaseSelect(gb, st1); }
  if (info.ing && !$('#collIng').value.trim()) $('#collIng').value = info.ing;
  if (info.x && typeof info.x === 'object') { const cur = tplFormRead(); f._x = Object.assign({}, f._x || {}, info.x, Object.fromEntries(Object.entries(cur).filter(([, v]) => v))); $('#collTplRow').dataset.cat = ''; }
  const add = info.summary || info.notes;
  if (add && !f.elements.notes.value.includes(add.slice(0, 30))) f.elements.notes.value = blockedBefore ? (info.summary ? info.summary + '\n\n' : '') + f.elements.notes.value : (f.elements.notes.value.trim() ? f.elements.notes.value.trim() + '\n\n' : '') + add;
  if (info.img && !f.dataset.img) f.dataset.img = info.img;
  if (info.lat !== null && info.lat !== undefined && (f.dataset.lat === '' || f.dataset.manual === 'link')) { f.dataset.lat = info.lat; f.dataset.lng = info.lng; f.dataset.manual = 'link'; f.dataset.geo = info.geoName || ''; }
  collFormUi();
}
/* ---- place suggestions while typing (OpenStreetMap / Photon — free, no key) ---- */
const OSM_TYPE = { restaurant: ['Restaurant', 'מסעדה'], cafe: ['Café', 'בית קפה'], bar: ['Bar', 'בר'], pub: ['Pub', 'פאב'], fast_food: ['Fast food', 'מזון מהיר'], ice_cream: ['Ice cream', 'גלידה'],
  bakery: ['Bakery', 'מאפייה'], spring: ['Spring', 'מעיין'], peak: ['Peak', 'פסגה'], viewpoint: ['Viewpoint', 'תצפית'], waterfall: ['Waterfall', 'מפל'], nature_reserve: ['Nature reserve', 'שמורת טבע'],
  park: ['Park', 'פארק'], beach: ['Beach', 'חוף'], museum: ['Museum', 'מוזיאון'], attraction: ['Attraction', 'אטרקציה'], marketplace: ['Market', 'שוק'], hotel: ['Hotel', 'מלון'], winery: ['Winery', 'יקב'],
  city: ['City', 'עיר'], town: ['Town', 'יישוב'], village: ['Village', 'כפר'], suburb: ['Neighborhood', 'שכונה'], neighbourhood: ['Neighborhood', 'שכונה'], street: ['Street', 'רחוב'], residential: ['Street', 'רחוב'], cave_entrance: ['Cave', 'מערה'], stream: ['Stream', 'נחל'] };
let acTimer = null, acSeq = 0, acItems = [];
function placeLabel(p) {
  const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ');
  const town = p.city || p.town || p.village || p.county || '';
  return { name, town, line: [p.street && p.name ? [p.street, p.housenumber].filter(Boolean).join(' ') : '', town !== name ? town : '', p.state && p.state !== town ? p.state : ''].filter(Boolean).join(', '),
    type: OSM_TYPE[p.osm_value] ? L(OSM_TYPE[p.osm_value][0], OSM_TYPE[p.osm_value][1]) : '' };
}
async function placeSuggest(q) {
  const seq = ++acSeq, box = $('#placeAc'), f = $('#frmColl');
  const near = f.dataset.lat && f.dataset.manual !== 'pick' ? `&lat=${f.dataset.lat}&lon=${f.dataset.lng}` : '&lat=32.4&lon=35.0&location_bias_scale=0.2';
  let feats = [];
  try { const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6${near}`); const j = await r.json(); feats = (j.features || []); }
  catch (e) { box.hidden = true; return; }
  if (seq !== acSeq) return;
  acItems = feats.map(ft => Object.assign(placeLabel(ft.properties || {}), { lat: ft.geometry.coordinates[1], lng: ft.geometry.coordinates[0] })).filter(x => x.name);
  if (!acItems.length) { box.hidden = true; $('#collGeo').innerHTML = '⚠️ ' + esc(L('No place with this name on the map — check the spelling or add the city.', 'לא נמצא מקום כזה במפה — בדוק את האיות או הוסף את שם העיר.')); $('#collGeo').classList.add('warn'); return; }
  $('#collGeo').classList.remove('warn');
  box.innerHTML = acItems.map((x, k) => `<button type="button" data-ac="${k}"><b dir="auto">${esc(x.name)}</b><small dir="auto">${esc([x.type, x.line].filter(Boolean).join(' · '))}</small></button>`).join('');
  box.hidden = false;
}
$('#frmColl').addEventListener('input', (e) => {
  if (e.target.name !== 'place' || collRO()) return;
  const q = e.target.value.trim(); clearTimeout(acTimer);
  if (q.length < 2) { $('#placeAc').hidden = true; return; }
  acTimer = setTimeout(() => placeSuggest(q), 300);
});
$('#placeAc').addEventListener('pointerdown', (e) => e.preventDefault());           // keep the focus while choosing
$('#placeAc').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ac]'); if (!b) return; const x = acItems[Number(b.dataset.ac)], f = $('#frmColl');
  f.elements.place.value = x.town && x.town !== x.name ? x.name + ', ' + x.town : x.name;
  f.dataset.lat = x.lat; f.dataset.lng = x.lng; f.dataset.manual = 'pick'; f.dataset.geo = '';
  $('#placeAc').hidden = true; collFormUi();
});
$('#frmColl').addEventListener('focusout', (e) => { if (e.target.name === 'place') setTimeout(() => { $('#placeAc').hidden = true; }, 150); });
/* ---- ✨ AI settings ---- */
async function openAi() {
  $('#dlgAi').showModal(); $('#aiStatus').textContent = tr('Loading…'); $('#aiKey').value = '';
  try { const j = await api('POST', { action: 'getAi' }); $('#aiStatus').textContent = j.hasKey ? '✅ ' + L('AI is on', 'ה-AI פעיל') + ' (' + j.hint + ')' : L('Not set yet.', 'עוד לא הוגדר.'); }
  catch (e) { $('#aiStatus').textContent = /Unknown action/i.test(e.message) ? L('Paste the new script and deploy a new version first.', 'קודם הדבק את הסקריפט החדש ופרסם גרסה חדשה.') : e.message; }
}
$('#aiSave').addEventListener('click', async () => {
  const k = $('#aiKey').value.trim(); if (!k) return; $('#aiStatus').textContent = L('Checking the key…', 'בודק את המפתח…');
  try { const j = await api('POST', { action: 'saveAi', key: k }); $('#aiKey').value = ''; $('#aiStatus').textContent = j.ok !== false && /✓/.test(j.message || '') ? '✅ ' + L('Saved — AI works', 'נשמר — ה-AI עובד') : '⚠️ ' + (j.message || ''); }
  catch (e) { $('#aiStatus').textContent = e.message; }
});
$('#aiRemove').addEventListener('click', async () => { try { await api('POST', { action: 'saveAi', key: '' }); $('#aiStatus').textContent = L('Removed — links are read without AI.', 'הוסר — הקישורים ייקראו בלי AI.'); } catch (e) { toast(e.message); } });
$('#btnAi').addEventListener('click', openAi);
/* ---- entry dialog ---- */
let collEditing = null;
/* 🧩 the category's own fields inside the entry window */
function tplFormRender(c, vals, ro) {
  const box = $('#collTplRow'), tpl = catTpl(c); box.dataset.cat = c.id;
  if (!tpl || !tpl.fields.length) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false; vals = vals || {};
  box.innerHTML = tpl.fields.map(fd => {
    const v = vals[fd.k] === undefined || vals[fd.k] === null ? '' : String(vals[fd.k]), dis = ro ? 'disabled' : '';
    if (fd.t === 'choice') {
      const opts = (fd.o || []).concat(v && !(fd.o || []).includes(v) ? [v] : []);
      return `<div class="full tp-f"><span class="tp-l" dir="auto">${esc(fd.l)}</span><input type="hidden" data-xk="${esc(fd.k)}" value="${esc(v)}"><div class="chips tp-opts">${opts.map(o => `<button type="button" class="chip ${o === v ? 'on' : ''}" data-xopt="${esc(fd.k)}" data-v="${esc(o)}" ${dis}>${esc(o)}</button>`).join('')}</div></div>`;
    }
    if (fd.t === 'mono') return `<label class="full tp-f"><span class="tp-l" dir="auto">${esc(fd.l)}</span><textarea data-xk="${esc(fd.k)}" class="tp-mono-in" rows="8" dir="ltr" spellcheck="false" autocapitalize="off" placeholder="Am        F        C        G&#10;e|-----0-----1-----0----|" ${dis}>${esc(v)}</textarea></label>`;
    if (fd.t === 'long') return `<label class="full tp-f"><span class="tp-l" dir="auto">${esc(fd.l)}</span><textarea data-xk="${esc(fd.k)}" rows="3" dir="auto" ${dis}>${esc(v)}</textarea></label>`;
    const type = fd.t === 'number' ? 'text" inputmode="decimal' : fd.t === 'url' ? 'url" dir="ltr' : 'text" dir="auto';
    return `<label class="full tp-f"><span class="tp-l" dir="auto">${esc(fd.l)}</span><input type="${type}" data-xk="${esc(fd.k)}" value="${esc(v)}" placeholder="${esc(fd.ph || '')}" autocomplete="off" ${dis}></label>`;
  }).join('');
}
function tplFormRead() {
  const o = {}; document.querySelectorAll('#collTplRow [data-xk]').forEach(el => { const v = String(el.value || '').trim(); o[el.dataset.xk] = el.dataset.xk && el.tagName === 'TEXTAREA' ? String(el.value || '').replace(/\s+$/, '') : v; });
  return o;
}
function openColl(en) {
  collEditing = en.id ? en : null; const f = $('#frmColl'), ro = collRO();
  $('#collFill').textContent = L('✨ Fill from link', '✨ מלא מהקישור');
  $('#collHead').textContent = ro ? (en.title || '') : en.id ? L('Edit', 'עריכה') : L('New entry', 'רשומה חדשה');
  $('#collCat').innerHTML = collCats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  f.elements.title.value = en.title || ''; $('#collCat').value = en.cat && en.cat !== '*' ? en.cat : (collCats[0] || {}).id; f.elements.place.value = en.place || ''; f.elements.by.value = en.by || '';
  f.elements.link.value = en.link || ''; f.elements.notes.value = en.notes || ''; f.elements.for.value = en.for || '';
  { const st0 = catStyleC(catOf($('#collCat').value)); fillBaseSelect(en.base || (st0 === 'food' && (en.title || en.notes) ? guessFood([en.title, en.notes].join(' ')) : ''), st0); $('#collBase').dataset.style = st0; } $('#collIng').value = en.ing || '';
  f.dataset.status = en.status === 'tried' ? 'tried' : 'want'; f.dataset.rating = en.rating || 0; f._x = Object.assign({}, en.x || {}); $('#collTplRow').dataset.cat = '';
  f.dataset.lat = en.lat ?? ''; f.dataset.lng = en.lng ?? ''; f.dataset.manual = en._pin || ''; f.dataset.img = en.img || ''; f.dataset.autoTitle = en._auto || ''; f.dataset.geo = en._geo || '';
  $('#collNote').hidden = true; $('#placeAc').hidden = true; $('#collGeo').classList.remove('warn');
  [...f.elements].forEach(el => { if (el.name || el.id === 'collCat') el.disabled = ro; });
  $('#collSaveBtn').hidden = ro; $('#collDelete').hidden = ro || !en.id; $('#collHere').hidden = ro;
  collFormUi(); $('#dlgColl').showModal();
}
function collFormUi() {
  const f = $('#frmColl'), c = catOf($('#collCat').value), w = statusWordsC(c), ro = collRO();
  if ($('#collTplRow').dataset.cat !== c.id) { f._x = Object.assign(f._x || {}, tplFormRead()); tplFormRender(c, f._x, ro); }
  $('#collTry').hidden = c.kind === 'note';
  $('#collPlaceRow').hidden = !c.map;
  $('#collForRow').hidden = c.kind !== 'wish';
  const st = catStyleC(c);
  $('#collIngRow').hidden = st !== 'drink'; $('#collBaseRow').hidden = st !== 'drink' && st !== 'food';
  if (!$('#collBaseRow').hidden && $('#collBase').dataset.style !== st) { const keep = $('#collBase').value; fillBaseSelect(keep && keep !== NEW_BASE ? keep : '', st); $('#collBase').dataset.style = st; }
  f.elements.by.closest('label').hidden = c.kind === 'wish';
  $('#collStatus').innerHTML = `<button type="button" data-st="want" class="${f.dataset.status !== 'tried' ? 'on' : ''}">${w.want}</button><button type="button" data-st="tried" class="${f.dataset.status === 'tried' ? 'on' : ''}">${w.tried}</button>`;
  const r = Number(f.dataset.rating) || 0;
  $('#collStars').innerHTML = [1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="${n <= r ? 'on' : ''}" aria-label="${n}" ${ro ? 'disabled' : ''}>★</button>`).join('');
  $('#collStars').hidden = !(c.kind === 'try' && f.dataset.status === 'tried');
  if (ro) $('#collStatus').querySelectorAll('button').forEach(b => { b.disabled = true; });
  const l = f.elements.link.value.trim(); $('#collOpen').hidden = !/^https?:\/\//i.test(l);
  const hasText = f.elements.notes.value.trim().length >= 15;
  $('#collFill').hidden = ro || settings.demo || !(/^https?:\/\//i.test(l) || hasText);
  if (!$('#collFill').disabled) $('#collFill').textContent = $('#collNote').classList.contains('warn') || !/^https?:\/\//i.test(l) ? L('✨ Fill from text', '✨ מלא מהטקסט') : L('✨ Fill from link', '✨ מלא מהקישור');
  $('#collImg').hidden = !f.dataset.img; if (f.dataset.img && $('#collImg').getAttribute('src') !== f.dataset.img) $('#collImg').setAttribute('src', f.dataset.img);
  const has = f.dataset.lat !== '' && f.dataset.lat !== 'null';
  $('#collGeo').textContent = !c.map ? '' : has ? (f.dataset.manual === 'pick' ? L('✓ Chosen from the map — the pin goes exactly there', '✓ נבחר מהמפה — הנעץ יסומן בדיוק שם') : f.dataset.manual === 'link' ? L('📍 Found on the map', '📍 נמצא במפה') + (f.dataset.geo ? ': ' + f.dataset.geo : '') + L(' — not right? type the place and pick from the list', ' — לא נכון? הקלד את המקום ובחר מהרשימה') : f.dataset.manual ? L('📍 Your current location will be pinned', '📍 המיקום הנוכחי שלך יסומן במפה') : L('✓ On the map', '✓ מסומן במפה')) :
    L('The place (or a Google Maps link) puts a pin on the map.', 'המקום (או קישור של Google Maps) ישים נעץ במפה.');
  const fw = $('#collForChips'); fw.innerHTML = [L('Me', 'אני'), L('Neta', 'נטע'), L('The kids', 'הילדים'), L('All of us', 'כולנו')].map(x => `<button type="button" class="chip ${f.elements.for.value === x ? 'on' : ''}" data-for="${esc(x)}" ${ro ? 'disabled' : ''}>${esc(x)}</button>`).join('');
}
$('#frmColl').addEventListener('click', (e) => {
  const f = $('#frmColl'); if (collRO()) return;
  const st = e.target.closest('[data-st]'); if (st) { f.dataset.status = st.dataset.st; if (st.dataset.st === 'want') f.dataset.rating = 0; collFormUi(); return; }
  const sr = e.target.closest('[data-star]'); if (sr) { f.dataset.rating = Number(sr.dataset.star) === Number(f.dataset.rating) ? 0 : sr.dataset.star; collFormUi(); return; }
  const xo = e.target.closest('[data-xopt]'); if (xo) { const inp = $('#collTplRow').querySelector(`[data-xk="${CSS.escape(xo.dataset.xopt)}"]`); inp.value = inp.value === xo.dataset.v ? '' : xo.dataset.v; xo.parentNode.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.v === inp.value)); return; }
  const fo = e.target.closest('[data-for]'); if (fo) { f.elements.for.value = fo.dataset.for; collFormUi(); return; }
  if (e.target.id === 'collOpen') window.open(f.elements.link.value.trim(), '_blank', 'noopener');
  if (e.target.id === 'collFill') { collFillFromLink(); return; }
  if (e.target.id === 'collHere') {
    if (!navigator.geolocation) { toast(L('Location is not available on this device', 'מיקום לא זמין במכשיר הזה')); return; }
    $('#collGeo').textContent = L('Finding you…', 'מאתר מיקום…');
    navigator.geolocation.getCurrentPosition(p => { f.dataset.lat = p.coords.latitude.toFixed(6); f.dataset.lng = p.coords.longitude.toFixed(6); f.dataset.manual = '1'; collFormUi(); },
      () => { $('#collGeo').textContent = L('Location permission was not given.', 'לא ניתנה הרשאת מיקום.'); }, { enableHighAccuracy: true, timeout: 10000 });
  }
});
$('#frmColl').addEventListener('input', (e) => {
  const f = $('#frmColl');
  if ((e.target.name === 'place' || e.target.name === 'link') && !f.dataset.manual) { f.dataset.lat = ''; f.dataset.lng = ''; }
  collFormUi();
});
$('#collCat').addEventListener('change', collFormUi);
$('#frmColl').addEventListener('paste', (e) => {
  if (e.target.name !== 'link' || collRO()) return;
  setTimeout(() => { const f = $('#frmColl'); if (!f.elements.title.value.trim() || !f.elements.notes.value.trim()) collFillFromLink(); }, 50);
});
$('#collBase').addEventListener('change', () => { const n = $('#collBase').value === NEW_BASE; $('#collBaseNew').hidden = !n; if (n) $('#collBaseNew').focus(); });
$('#frmColl').addEventListener('submit', async (e) => {
  e.preventDefault(); if (collRO()) return; const f = $('#frmColl');
  const title = f.elements.title.value.trim(); if (!title) { f.elements.title.focus(); return; }
  let link = f.elements.link.value.trim(); if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
  const c = catOf($('#collCat').value);
  const en = Object.assign({}, collEditing || {}, { title, cat: c.id, place: c.map ? f.elements.place.value.trim() : '', by: c.kind === 'wish' ? '' : f.elements.by.value.trim(), link, notes: f.elements.notes.value,
    base: ['drink', 'food'].includes(catStyleC(c)) ? ($('#collBase').value === NEW_BASE ? $('#collBaseNew').value.trim() : $('#collBase').value) || (catStyleC(c) === 'food' ? guessFood([title, f.elements.notes.value].join(' ')) : '') : '', ing: catStyleC(c) === 'drink' ? $('#collIng').value.trim() : '', img: f.dataset.img || '', for: c.kind === 'wish' ? f.elements.for.value.trim() : '', status: c.kind === 'note' ? 'want' : f.dataset.status, rating: c.kind === 'try' && f.dataset.status === 'tried' ? Number(f.dataset.rating) || 0 : 0,
    lat: f.dataset.manual ? Number(f.dataset.lat) : (collEditing && f.dataset.lat !== '' ? collEditing.lat : null), lng: f.dataset.manual ? Number(f.dataset.lng) : (collEditing && f.dataset.lat !== '' ? collEditing.lng : null) });
  { const tpl = catTpl(c), x = Object.assign({}, (collEditing && collEditing.x) || {}), got = tplFormRead();
    if (tpl) tpl.fields.forEach(fd => { if (got[fd.k]) x[fd.k] = got[fd.k]; else delete x[fd.k]; });
    en.x = x; }
  if (!f.dataset.manual) { delete en.lat; delete en.lng; }
  $('#dlgColl').close(); if (ui.collCat !== '*') ui.collCat = en.cat; await collStore(en);
});
$('#collDelete').addEventListener('click', async () => {
  if (!collEditing || !collEditing.id) { $('#dlgColl').close(); return; }
  if (!await confirmBox(L('Delete?', 'למחוק?'), `"${collEditing.title}"`, L('Delete', 'מחיקה'), L('Cancel', 'ביטול'))) return;
  const before = JSON.stringify(coll), id = collEditing.id; coll = coll.filter(x => x.id !== id); $('#dlgColl').close(); render();
  try { await collApi({ action: 'collDelete', id }); toast(L('Deleted', 'נמחק')); } catch (err) { coll = JSON.parse(before); render(); toast(err.message); }
});
/* ---- categories (add / rename / reorder, with inspiration ideas) ---- */
const C_IDEAS = [['🎬', L('Movies & series', 'סרטים וסדרות'), 'try', false], ['📚', L('Books', 'ספרים'), 'try', false], ['🎵', L('Shows & concerts', 'הופעות'), 'try', true], ['☕', L('Cafés', 'בתי קפה'), 'try', true],
  ['🏨', L('Hotels & B&Bs', 'מלונות וצימרים'), 'try', true], ['🏖', L('Vacations', 'חופשות'), 'try', true], ['🍰', L('Desserts', 'קינוחים'), 'try', false], ['🎁', L('Gift ideas', 'רעיונות למתנות'), 'wish', false],
  ['🧒', L('Kids activities', 'פעילויות לילדים'), 'try', true], ['🍷', L('Wineries', 'יקבים'), 'try', true], ['🛠', L('DIY projects', 'פרויקטים לבית'), 'note', false], ['💡', L('Ideas', 'רעיונות'), 'note', false],
  ['🎸', L('Guitar', 'גיטרה'), 'try', false], ['🎓', L('Learning', 'לימוד'), 'try', false], ['🏋️', L('Workouts', 'אימונים'), 'try', false]];
function ccRow(c) {
  return `<li class="ord-row cc-row" data-id="${esc(c.id)}"><input class="cc-name" value="${esc(c.name)}" dir="auto" maxlength="40" placeholder="${esc(L('🍕 Name', '🍕 שם'))}">
    <select class="cc-kind"><option value="try" ${c.kind === 'try' || !c.kind ? 'selected' : ''}>${L('Recommendations', 'המלצות')}</option><option value="wish" ${c.kind === 'wish' ? 'selected' : ''}>${L('Wishes', 'משאלות')}</option><option value="note" ${c.kind === 'note' ? 'selected' : ''}>${L('Notes', 'רשימות')}</option></select>
    <label class="cc-map" title="${esc(L('Show on the map', 'הצג במפה'))}"><input type="checkbox" class="cc-mapcb" ${c.map ? 'checked' : ''}>🗺</label>
    <span class="cc-btns"><button type="button" class="icon-btn dark" data-ou>↑</button><button type="button" class="icon-btn dark" data-od>↓</button><button type="button" class="icon-btn dark" data-cdel>✕</button></span></li>`;
}
function openCollCats(addNew) {
  $('#ccList').innerHTML = collCats.map(ccRow).join(''); $('#ccStatus').textContent = '';
  const have = collCats.map(c => catLabel(c));
  $('#ccIdeas').innerHTML = C_IDEAS.filter(x => !have.includes(x[1])).map(x => `<button type="button" class="c-chip" data-idea="${esc(x.join('|'))}">${x[0]} ${esc(x[1])}</button>`).join('');
  $('#dlgCollCats').showModal();
  if (addNew) { $('#ccList').insertAdjacentHTML('beforeend', ccRow({ id: 'c' + Math.random().toString(36).slice(2, 7), name: '', kind: 'try', map: false })); $('#ccList').lastElementChild.querySelector('input').focus(); }
}
$('#ccAdd').addEventListener('click', () => { $('#ccList').insertAdjacentHTML('beforeend', ccRow({ id: 'c' + Math.random().toString(36).slice(2, 7), name: '', kind: 'try', map: false })); $('#ccList').lastElementChild.querySelector('input').focus(); });
$('#ccIdeas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-idea]'); if (!b) return; const [em, nm, kind, map] = b.dataset.idea.split('|');
  $('#ccList').insertAdjacentHTML('beforeend', ccRow({ id: 'c' + Math.random().toString(36).slice(2, 7), name: em + ' ' + nm, kind, map: map === 'true' })); b.remove();
  $('#ccStatus').textContent = L('Added — press Save.', 'נוסף — לחץ שמירה.');
});
$('#ccList').addEventListener('click', (e) => {
  const r = e.target.closest('.ord-row'); if (!r) return;
  if (e.target.closest('[data-ou]') && r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling);
  if (e.target.closest('[data-od]') && r.nextElementSibling) r.parentNode.insertBefore(r.nextElementSibling, r);
  if (e.target.closest('[data-cdel]')) {
    const n = coll.filter(x => x.cat === r.dataset.id).length;
    if (n) { $('#ccStatus').textContent = L(`This category has ${n} entries — move or delete them first.`, `בקטגוריה הזו יש ${n} רשומות — העבר או מחק אותן קודם.`); return; }
    r.remove();
  }
});
$('#ccSave').addEventListener('click', async () => {
  const prev = Object.fromEntries(collCats.map(c => [c.id, c]));
  const cats = [...$('#ccList').children].map(r => { const c = { id: r.dataset.id, name: r.querySelector('.cc-name').value.trim(), kind: r.querySelector('.cc-kind').value, map: r.querySelector('.cc-mapcb').checked }; if (prev[c.id] && prev[c.id].tpl) c.tpl = prev[c.id].tpl; return c; }).filter(c => c.name);
  if (!cats.length) return;
  try { const j = await collApi({ action: 'collCats', cats }); collCats = j.collCats; $('#dlgCollCats').close(); render(); toast(L('Saved', 'נשמר')); }
  catch (err) { $('#ccStatus').textContent = err.message; return; }
  // ✨ a new category the app has no ready template for → let the AI design what it saves and how it looks
  const fresh = collCats.filter(c => !prev[c.id] && !catTpl(c) && catStyleC(c) === 'other' && c.kind !== 'note');
  if (settings.demo || !fresh.length) return;
  let changed = false;
  for (const c of fresh) { const d = await collDesign(c); if (d && d.tpl) { c.tpl = d.tpl; changed = true; toast(L(`✨ The AI set up “${catLabel(c)}” — tap 🧩 inside to adjust`, `✨ ה-AI התאים את "${catLabel(c)}" — אפשר לשנות ב-🧩 בתוך הקטגוריה`)); } }
  if (changed) { try { const j = await collApi({ action: 'collCats', cats: collCats }); collCats = j.collCats; render(); } catch (err) { /* keep the local copy */ } }
});
/* ---- 🧩 template editor: which details a category saves, and how it looks ---- */
let tpEd = null;
async function collDesign(c) { try { const j = await api('POST', { action: 'collDesign', name: c.name, kind: c.kind }); return j && j.ok ? j : null; } catch (e) { return null; } }
function openTplEditor(id) {
  const c = catOf(id); if (!c || collRO()) return;
  const t = catTpl(c);
  tpEd = { id: c.id, tpl: JSON.parse(JSON.stringify(t || { view: 'cards', fields: [] })), auto: !c.tpl && !!t };
  $('#tpHead').textContent = '🧩 ' + catEmoji(c) + ' ' + catLabel(c);
  $('#tpStatus').textContent = tpEd.auto ? L('This is the automatic template for this kind of category — change anything and Save.', 'זו התבנית האוטומטית לסוג הזה של קטגוריה — שנה מה שתרצה ולחץ שמירה.') : '';
  tpRender(); $('#dlgTpl').showModal();
}
function tpRender() {
  const c = catOf(tpEd.id), t = tpEd.tpl, st = catStyleC(c);
  const views = [['cards', '▦ ' + L('Cards', 'כרטיסים')], ['table', '☰ ' + L('Table', 'טבלה')], ['list', '≣ ' + L('List', 'רשימה')]];
  const choices = t.fields.filter(f => f.t === 'choice');
  $('#tpBody').innerHTML = `
    <section class="tp-sec"><h4>${L('Start from', 'להתחיל מ…')}</h4><div class="chips">${TPL_PRESETS.map(p => `<button type="button" class="chip" data-tppre="${p.id}">${p.em} ${esc(L(p.n[0], p.n[1]))}</button>`).join('')}
      ${settings.demo ? '' : `<button type="button" class="chip tp-ai" data-tpai>✨ ${L('Design with AI', 'תכנון עם AI')}</button>`}</div>
      ${st !== 'other' ? `<p class="hint">${st === 'drink' ? L('Drinks keep their table (base, ingredients) — the fields here are added to it.', 'משקאות שומרים על הטבלה שלהם (בסיס, מצרכים) — השדות כאן נוספים עליה.') : L('Places keep their map and kinds — the fields here are added to them.', 'מקומות שומרים על המפה והסוגים — השדות כאן נוספים עליהם.')}</p>` : ''}</section>
    <section class="tp-sec"><h4>${L('How it looks', 'איך זה נראה')}</h4><div class="seg">${views.map(([k, l]) => `<button type="button" class="${(t.view || 'cards') === k ? 'on' : ''}" data-tpview="${k}">${l}</button>`).join('')}</div>
      ${choices.length ? `<label class="full">${L('Group the list by', 'לקבץ את הרשימה לפי')}<select id="tpGroup"><option value="">—</option>${choices.map(f => `<option value="${esc(f.k)}" ${t.group === f.k ? 'selected' : ''}>${esc(f.l)}</option>`).join('')}</select></label>` : ''}
      ${c.kind !== 'note' ? `<div class="tp-two"><label>${L('“Not yet” is called', 'שם ל״עוד לא״')}<input id="tpWant" dir="auto" maxlength="24" value="${esc(t.want || '')}" placeholder="${esc(statusWords(c.kind).want)}"></label><label>${L('“Done” is called', 'שם ל״בוצע״')}<input id="tpDone" dir="auto" maxlength="24" value="${esc(t.done || '')}" placeholder="${esc(statusWords(c.kind).tried)}"></label></div>` : ''}</section>
    <section class="tp-sec"><h4>${L('What each entry saves', 'מה נשמר בכל רשומה')}</h4>
      <p class="hint">${L('Name, link, notes and picture are always there. Add your own details:', 'שם, קישור, הערות ותמונה תמיד קיימים. הוסף פרטים משלך:')}</p>
      <ul class="tp-fields">${t.fields.map((f, i) => `<li class="tp-frow" data-i="${i}">
        <input class="tp-fl" dir="auto" maxlength="30" value="${esc(f.l)}" placeholder="${esc(L('Field name', 'שם השדה'))}">
        <select class="tp-ft">${TPL_T.map(([k, a, b]) => `<option value="${k}" ${f.t === k ? 'selected' : ''}>${esc(L(a, b))}</option>`).join('')}</select>
        <span class="cc-btns"><button type="button" class="icon-btn dark" data-tpup>↑</button><button type="button" class="icon-btn dark" data-tpdel>✕</button></span>
        ${f.t === 'choice' ? `<input class="tp-fo full" dir="auto" value="${esc((f.o || []).join(', '))}" placeholder="${esc(L('Options, separated by commas', 'אפשרויות, מופרדות בפסיק'))}">` : ''}</li>`).join('')}</ul>
      <button type="button" class="btn ghost" data-tpadd>＋ ${L('Add a field', 'הוספת שדה')}</button></section>`;
}
function tpSync() {
  const t = tpEd.tpl;
  document.querySelectorAll('#tpBody .tp-frow').forEach(r => { const f = t.fields[Number(r.dataset.i)]; if (!f) return; f.l = r.querySelector('.tp-fl').value.trim(); f.t = r.querySelector('.tp-ft').value; const o = r.querySelector('.tp-fo'); if (o) f.o = o.value.split(/[,،]/).map(x => x.trim()).filter(Boolean).slice(0, 20); if (f.t !== 'choice') delete f.o; });
  if ($('#tpGroup')) t.group = $('#tpGroup').value; if ($('#tpWant')) t.want = $('#tpWant').value.trim(); if ($('#tpDone')) t.done = $('#tpDone').value.trim();
}
$('#tpBody').addEventListener('change', (e) => { if (e.target.classList.contains('tp-ft')) { tpSync(); tpRender(); } });
$('#tpBody').addEventListener('click', async (e) => {
  const t = e.target;
  const pre = t.closest('[data-tppre]'); if (pre) { const p = TPL_PRESETS.find(x => x.id === pre.dataset.tppre); tpEd.tpl = p.tpl(); $('#tpStatus').textContent = L('Loaded — adjust and Save.', 'נטען — שנה מה שצריך ולחץ שמירה.'); tpRender(); return; }
  if (t.closest('[data-tpai]')) {
    tpSync(); $('#tpStatus').textContent = L('✨ Designing…', '✨ מתכנן…'); t.closest('[data-tpai]').disabled = true;
    const d = await collDesign(catOf(tpEd.id));
    if (d && d.tpl) { tpEd.tpl = d.tpl; $('#tpStatus').textContent = L('✨ Here is a suggestion — adjust and Save.', '✨ הנה הצעה — שנה מה שצריך ולחץ שמירה.'); tpRender(); }
    else { $('#tpStatus').textContent = (d && d.message) || L('The AI is not set up (☰ › AI) — pick a ready template or add fields yourself.', 'ה-AI לא מוגדר (☰ › AI) — בחר תבנית מוכנה או הוסף שדות בעצמך.'); t.closest('[data-tpai]').disabled = false; }
    return;
  }
  const v = t.closest('[data-tpview]'); if (v) { tpSync(); tpEd.tpl.view = v.dataset.tpview; tpRender(); return; }
  if (t.closest('[data-tpadd]')) { tpSync(); tpEd.tpl.fields.push({ k: 'f' + Math.random().toString(36).slice(2, 7), l: '', t: 'text' }); tpRender(); const ins = document.querySelectorAll('#tpBody .tp-fl'); ins[ins.length - 1].focus(); return; }
  const row = t.closest('.tp-frow'); if (!row) return; const i = Number(row.dataset.i);
  if (t.closest('[data-tpdel]')) { tpSync(); tpEd.tpl.fields.splice(i, 1); tpRender(); return; }
  if (t.closest('[data-tpup]') && i > 0) { tpSync(); const f = tpEd.tpl.fields; [f[i - 1], f[i]] = [f[i], f[i - 1]]; tpRender(); }
});
async function tpStore(tpl) {
  const cats = collCats.map(c => { const o = Object.assign({}, c); delete o._auto; if (o.id === tpEd.id) { if (tpl) o.tpl = tpl; else delete o.tpl; } return o; });
  try { const j = await collApi({ action: 'collCats', cats }); collCats = j.collCats; $('#dlgTpl').close(); render(); toast(L('Saved', 'נשמר')); }
  catch (err) { $('#tpStatus').textContent = err.message; }
}
$('#tpSave').addEventListener('click', () => { tpSync(); const t = tpEd.tpl; t.fields = t.fields.filter(f => f.l); if (t.group && !t.fields.some(f => f.k === t.group && f.t === 'choice')) t.group = ''; tpStore(t); });
$('#tpReset').addEventListener('click', () => tpStore(null));
/* 🔎 filter sheet */
$('#cfBody').addEventListener('click', (e) => { const b = e.target.closest('[data-cfg]'); if (!b) return; cfToggle(b.dataset.cfg, b.dataset.cfv); cfRender(); render(); });
$('#cfClear').addEventListener('click', () => { cfToggle('*'); cfRender(); render(); });
$('#cfShow').addEventListener('click', () => $('#dlgCFilt').close());
async function nbToggle(it) {
  const copy = Object.assign({}, it);
  const finishing = !isClosed(it);
  if (isClosed(it)) { copy.status = 'Not started'; copy.done = ''; } else { copy.status = 'Done'; copy.done = iso(today()); }
  if (finishing) celebrate();
  await save(copy);
}
async function nbAdd(text) {
  text = text.trim(); if (!text) return;
  const it = { item: text, area: ui.nbArea, status: 'Not started', prio: '', due: '', created: iso(today()), focal: 'Me' };
  await save(it);
  const inp = $('#nbNew'); if (inp) inp.focus();
}
$('#list').addEventListener('keydown', (e) => {
  if (e.target.id === 'nbNew' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const v = e.target.value; e.target.value = ''; nbAdd(v); }
  if (e.target.id === 'collNew' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const v = e.target.value; e.target.value = ''; collQuickAdd(v); }
});
let grpOpen = (() => { try { return JSON.parse(sessionStorage.getItem('ai.grp') || '{}'); } catch (e) { return {}; } })();
const GRP_CLOSED = { 'focus:This week': 1, 'all:Next week': 0, 'focus:OverdueList': 1 };   // collapsed unless opened in this session
function grpIsOpen(key) { return key in grpOpen ? grpOpen[key] : !GRP_CLOSED[key]; }
function setGrp(key, v) { grpOpen[key] = v; try { sessionStorage.setItem('ai.grp', JSON.stringify(grpOpen)); } catch (e) { /* none */ } }
function group(title, arr, cls, opt) {
  if (!arr.length) return '';
  const key = opt && opt.collapsible ? opt.key : '', open = !key || grpIsOpen(key);
  const head = key ? `<h3><button class="grp-h" data-grp="${esc(key)}" aria-expanded="${open}"><span>${esc(tr(title))}</span> <span class="n">${arr.length}</span><svg class="ic chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></h3>`
    : `<h3>${esc(title)} <span class="n">${arr.length}</span></h3>`;
  return `<section class="group ${cls} ${open ? '' : 'shut'}" data-h="${esc(title)}">${head}${open ? arr.map(card).join('') : ''}</section>`;
}

/* ---------- edit dialog ---------- */
const dlgEdit = $('#dlgEdit'), frm = $('#frmEdit');
const F = (k) => frm.elements.namedItem(k);
function fillSelect(sel, opts, blank) { sel.innerHTML = (blank ? '<option value=""></option>' : '') + opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join(''); }
let editing = null;
function openEdit(it) {
  editing = it || null;
  fillSelect(F('status'), STATUS); fillSelect(F('area'), data.areas, true); fillSelect(F('prio'), PRIO, true); fillSelect(F('rec'), REC);
  $('#peopleList').innerHTML = data.people.map(p => `<option value="${esc(p)}">`).join('');
  const v = it || { status: 'Not started', area: ui.area !== 'All' ? ui.area : 'Work', prio: '2 - Medium', rec: 'None', focal: 'Me', due: iso(today()) };
  ['item', 'status', 'area', 'prio', 'due', 'time', 'topic', 'focal', 'rec', 'hrs', 'done', 'acthrs', 'com'].forEach(k => {
    const el = F(k);
    if (el.tagName === 'SELECT' && v[k] && ![...el.options].some(o => o.value === v[k])) el.insertAdjacentHTML('beforeend', `<option value="${esc(v[k])}">${esc(v[k])}</option>`);
    el.value = v[k] ?? '';
  });
  F('private').checked = !!v.private;
  fillSelect(F('cal'), calCfg.names || []);
  if (v.cal && ![...F('cal').options].some(o => o.value === v.cal)) F('cal').insertAdjacentHTML('beforeend', `<option value="${esc(v.cal)}">${esc(v.cal)}</option>`);
  F('calOn').checked = !!v.cal; F('cal').value = v.cal || (calCfg.map || {})[v.area] || (calCfg.names || [])[0] || ''; updateCalBox();
  curCl = Array.isArray(v.checklist) ? v.checklist.map(x => ({ t: x.t, d: !!x.d })) : [];
  renderCl(); updateWaitBox(v);
  const ro = isGuest();
  [...frm.elements].forEach(el => { if (el.name) el.disabled = ro; });
  frm.querySelector('button[type=submit]').style.display = ro ? 'none' : '';
  $('#editTitle').textContent = tr(ro ? 'Action item' : it ? 'Edit action item' : 'New action item');
  $('#btnDelete').style.display = it && !ro ? '' : 'none';
  updateHint();
  dlgEdit.showModal();
  if (!it && !ro) setTimeout(() => F('item').focus(), 50);
}
function updateHint() {
  const nd = nextDue({ due: F('due').value, rec: F('rec').value });
  $('#nextHint').textContent = nd ? `↻ Recurring — ticking it done moves the due date to ${fmt(iso(nd), true)}.` : '';
}
function updateCalBox() {
  const on = F('calOn').checked; $('#calPick').hidden = !on;
  $('#calNeedDate').hidden = !(on && !F('due').value);
}
frm.addEventListener('change', (e) => {
  if (e.target === F('calOn')) { if (e.target.checked && !editing?.cal) F('cal').value = (calCfg.map || {})[F('area').value] || F('cal').value; updateCalBox(); }
  if (e.target === F('area') && F('calOn').checked && !editing?.cal && (calCfg.map || {})[F('area').value]) F('cal').value = calCfg.map[F('area').value];
});
frm.addEventListener('input', (e) => { if (e.target === F('due')) updateCalBox(); if (e.target === F('due') || e.target === F('rec')) updateHint(); if (e.target === F('status')) updateWaitBox(Object.assign({}, editing || {}, { status: F('status').value, focal: F('focal').value })); });
frm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const it = Object.assign({}, editing || {});
  ['item', 'status', 'area', 'prio', 'due', 'time', 'topic', 'focal', 'rec', 'hrs', 'done', 'acthrs', 'com'].forEach(k => { it[k] = String(F(k).value).trim(); });
  if (it.time) { const nt = normTime(it.time); if (nt === null) { toast(L('Start time: use 24-hour HH:MM, e.g. 17:30', 'שעת התחלה: פורמט 24 שעות HH:MM, למשל 17:30')); F('time').focus(); return; } it.time = nt; }
  if (!it.item || isGuest()) return;
  it.private = F('private').checked;
  it.cal = F('calOn').checked ? F('cal').value : '';
  it.checklist = curCl.filter(x => x.t);
  if (it.status === 'Waiting' && (!editing || editing.status !== 'Waiting' || !editing.wsince)) it.wsince = (editing && editing.status === 'Waiting' && editing.wsince) || iso(today());
  if (it.status !== 'Waiting') it.wsince = '';
  const justDone = it.status === 'Done' && (!editing || editing.status !== 'Done');
  if (it.status === 'Done' && !it.done) it.done = iso(today());
  if (!editing) it.created = iso(today());
  const plan = parseFloat(it.hrs);
  const changed = !editing || String(editing.hrs || '') !== it.hrs || (editing.rec || 'None') !== it.rec || norm(editing.item) !== norm(it.item);
  if (plan && changed && !isClosed(it)) {
    const ref = lastActual(it, editing);
    if (ref && Math.abs(plan - ref.h) > 1) {
      const ok = await confirmBox(tr('Check your estimate'),
        L(`Last time "${ref.title}" took you ${ref.h} h, but now you plan ${plan} h.\n\nApprove ${plan} h?`,
          `בפעם הקודמת "${ref.title}" לקח לך ${ref.h} שע׳, אבל עכשיו אתה מתכנן ${plan} שע׳.\n\nלאשר ${plan} שע׳?`),
        L(`Approve ${plan} h`, `אשר ${plan} שע׳`), L(`Use ${ref.h} h`, `השתמש ב-${ref.h} שע׳`));
      if (!ok) it.hrs = String(ref.h);
    }
  }
  dlgEdit.close();
  if (justDone) celebrate(innerWidth / 2, innerHeight * 0.45);
  if (await save(it)) { toast(editing ? 'Saved' : 'Added'); }
});
$('#btnDelete').addEventListener('click', () => {
  if (editing && confirm('Delete this action item?')) { dlgEdit.close(); remove(editing.row); }
});

/* ---------- settings ---------- */
const dlgSet = $('#dlgSettings'), frmSet = $('#frmSettings');
const S = (k) => frmSet.elements.namedItem(k);
function openSettings() { S('url').value = settings.url || ''; if (!dlgSet.open) dlgSet.showModal(); }
frmSet.addEventListener('submit', (e) => {
  e.preventDefault();
  const u = cleanUrl(S('url').value);
  if (!validUrl(u)) { toast('The Web-app URL must start with https://script.google.com/ and end with /exec'); return; }
  settings = { url: u, demo: false }; store.set('ai.settings', settings); dlgSet.close();
  if (password) load(); else showLock();
});
$('#btnTest').addEventListener('click', () => {
  const u = cleanUrl(S('url').value);
  if (!u) { toast('Paste the Web-app URL first'); return; }
  window.open(u, '_blank');
});
function startDemo() { settings = { url: settings.url || '', demo: true }; store.set('ai.settings', settings); if (dlgSet.open) dlgSet.close(); hideLock(); load(); toast('Demo mode — nothing is saved to your sheet'); }
$('#btnDemo').addEventListener('click', startDemo);

/* ---------- weekly report ---------- */
const dlgRep = $('#dlgReport');
let repSel = null;
function reportAreas() {
  if (!repSel) { const s0 = store.get('ai.report', null); repSel = (s0 && s0.areas && s0.areas.length) ? s0.areas : [(data.report && data.report.area) || 'Work']; }
  return repSel;
}
function reportData(offset) {
  const areas = reportAreas();
  const ws = addDays(weekStart(today()), 7 * offset), we = addDays(ws, 6), prevWs = addDays(ws, -7);
  const W = data.items.filter(it => areas.indexOf(it.area) >= 0);
  const by = (f, s) => W.filter(f).sort(s || sortOpen);
  const openNotWaiting = (it) => !isClosed(it) && it.status !== 'Waiting';
  return {
    ws, we,
    sections: [
      { title: '✔  COMPLETED LAST WEEK', color: '#059669', dateKey: 'done', dateLabel: 'Done',
        items: by(it => it.status === 'Done' && parse(it.done) >= prevWs && parse(it.done) < ws, (a, b) => parse(a.done) - parse(b.done)) },
      { title: '▶  PLANNED FOR THE WEEK', color: '#2563EB', dateKey: 'due', dateLabel: 'Due',
        items: by(it => openNotWaiting(it) && parse(it.due) && parse(it.due) >= ws && parse(it.due) <= we) },
      { title: '⚠  CARRIED OVER / OVERDUE', color: '#DC2626', dateKey: 'due', dateLabel: 'Due',
        items: by(it => openNotWaiting(it) && parse(it.due) && parse(it.due) < ws) },
      { title: '⏳  WAITING ON OTHERS', color: '#7C3AED', dateKey: 'due', dateLabel: 'Due',
        items: by(it => it.status === 'Waiting') }
    ]
  };
}
/* Email HTML written for Outlook (Word engine): table layout, bgcolor + background-color, no transparency/rounded tricks */
const TINT = { '#059669': '#E3F4EE', '#2563EB': '#E6EEFD', '#DC2626': '#FCE8E8', '#7C3AED': '#F0EAFE' };
function buildReport() {
  const offset = +$('#repWeek').value;
  const name = $('#repName').value.trim() || 'Ezra';
  const from = (data.report && data.report.from) || 'Amir Wolf';
  const r = reportData(offset);
  const range = `${pad(r.ws.getDate())}/${pad(r.ws.getMonth() + 1)} – ${pad(r.we.getDate())}/${pad(r.we.getMonth() + 1)}/${r.we.getFullYear()}`;
  const subject = `Weekly Action Items | ${range} | ${from}`;
  const F = 'font-family:Arial,Helvetica,sans-serif;';
  const P = (t, x) => `<p style="${F}font-size:14px;color:#1F2937;margin:0 0 12px 0;${x || ''}">${t}</p>`;
  const labels = ['Completed', 'Planned', 'Carried over', 'Waiting'];
  let html = `<div style="${F}font-size:14px;color:#1F2937;">`;
  html += P(`Hi ${esc(name)},`) + P(`Please find below my action items for the week of <b>${range}</b>.`);
  // summary "chips" as a one-row table
  html += `<table cellpadding="0" cellspacing="6" border="0" style="border-collapse:separate;margin:0 0 14px -6px;"><tr>` +
    r.sections.map((s, i) => `<td bgcolor="${TINT[s.color]}" style="background-color:${TINT[s.color]};color:${s.color};${F}font-size:13px;font-weight:bold;padding:6px 14px;white-space:nowrap;">${labels[i]}&nbsp;${s.items.length}</td>`).join('') +
    `</tr></table>`;
  let text = `Hi ${name},\n\nPlease find below my action items for the week of ${range}.\n\n`;
  const th = (t, w) => `<th align="left" bgcolor="#F3F4F6" style="background-color:#F3F4F6;color:#4B5563;${F}font-size:11px;font-weight:bold;text-transform:uppercase;padding:7px 10px;border-bottom:1px solid #E5E7EB;text-align:left;${w ? 'width:' + w + ';' : ''}">${t}</th>`;
  r.sections.forEach(s => {
    html += `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:860px;margin:0 0 20px 0;">`;
    html += `<tr><td colspan="6" bgcolor="${s.color}" style="background-color:${s.color};color:#FFFFFF;${F}font-size:14px;font-weight:bold;padding:9px 12px;">${esc(s.title.replace(/\s+/g, ' '))} (${s.items.length})</td></tr>`;
    text += `${s.title.replace(/\s+/g, ' ')}\n────────────────────────────\n`;
    if (!s.items.length) {
      html += `<tr><td colspan="6" style="${F}font-size:13px;color:#9CA3AF;font-style:italic;padding:9px 12px;border-bottom:1px solid #E5E7EB;">None</td></tr>`;
      text += 'None\n';
    } else {
      html += `<tr>${th('Action item', '30%')}${th('Topic', '14%')}${th(s.dateLabel, '11%')}${th('Priority', '11%')}${th('Status', '11%')}${th('Comments / next step')}</tr>`;
      s.items.forEach((it, i) => {
        const bg = i % 2 ? '#F9FAFB' : '#FFFFFF';
        const p = PRIO_C[String(it.prio).charAt(0)] || ['#F3F4F6', '#374151'];
        const td = (v, x) => `<td dir="auto" bgcolor="${bg}" valign="top" style="background-color:${bg};${F}font-size:13px;color:#1F2937;padding:8px 10px;border-bottom:1px solid #E5E7EB;vertical-align:top;${x || ''}">${v || '&nbsp;'}</td>`;
        html += '<tr>' + td(`<b>${esc(it.item)}</b>`) + td(esc(it.topic), 'color:#4B5563;') + td(fmt(it[s.dateKey], true), 'white-space:nowrap;') +
          td(it.prio ? `<span style="background-color:${p[0]};color:${p[1]};font-weight:bold;padding:1px 6px;white-space:nowrap;">${esc(it.prio)}</span>` : '') +
          td(esc(it.status), 'white-space:nowrap;') + td(esc(it.com), 'color:#4B5563;') + '</tr>';
        text += `${i + 1}.  ${it.item}${it[s.dateKey] ? `   |   ${s.dateLabel} ${fmt(it[s.dateKey])}` : ''}${it.prio ? '   |   ' + it.prio.replace(/^\d - /, '') : ''}\n${it.com ? '       ↳ ' + it.com + '\n' : ''}`;
      });
    }
    html += '</table>'; text += '\n';
  });
  html += P('Happy to adjust priorities if needed.') + P(`Best regards,<br><b>${esc(from)}</b>`) + '</div>';
  text += `Happy to adjust priorities if needed.\n\nBest regards,\n${from}`;
  return { html, text, subject };
}
function refreshReport() {
  const r = buildReport();
  const to = $('#repEmail').value.trim();
  const q = encodeURIComponent;
  $('#repSubject').innerHTML = `<b>Subject:</b> ${esc(r.subject)}`;
  $('#repPreview').innerHTML = r.html;
  $('#repOutlookWeb').href = `https://outlook.office.com/mail/deeplink/compose?to=${q(to)}&subject=${q(r.subject)}`;
  $('#repOutlookApp').href = `mailto:${q(to)}?subject=${q(r.subject)}`;
  $('#repGmail').href = `https://mail.google.com/mail/?view=cm&fs=1&to=${q(to)}&su=${q(r.subject)}`;
  store.set('ai.report', { name: $('#repName').value, email: to, week: $('#repWeek').value, areas: reportAreas() });
  $('#repAreas').innerHTML = data.areas.map(a => `<button type="button" class="chip ${reportAreas().indexOf(a) >= 0 ? 'on' : ''}" data-rarea="${esc(a)}">${esc(a)}</button>`).join('');
}
$('#repAreas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rarea]'); if (!b) return;
  const a = b.dataset.rarea, sel = reportAreas(), i = sel.indexOf(a);
  if (i >= 0) { if (sel.length > 1) sel.splice(i, 1); else { toast('Keep at least one area'); return; } } else sel.push(a);
  refreshReport();
});
function openReport() {
  const saved = store.get('ai.report', null);
  $('#repName').value = (saved && saved.name) || (data.report && data.report.manager) || 'Ezra';
  $('#repEmail').value = (saved && saved.email) || (data.report && data.report.email) || '';
  $('#repWeek').value = (saved && saved.week) || '1';
  $('#repStatus').textContent = ''; refreshReport(); dlgRep.showModal();
}
['repWeek', 'repName', 'repEmail'].forEach(id => $('#' + id).addEventListener('input', refreshReport));
$('#repCopy').addEventListener('click', async () => {
  const r = buildReport();
  const el = $('#repPreview');
  // 1) copy the rendered preview exactly like a manual select + Ctrl+C (most faithful when pasting into Outlook)
  let ok = false;
  try {
    const range = document.createRange(); range.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    ok = document.execCommand('copy'); sel.removeAllRanges();
  } catch (e) { ok = false; }
  // 2) fallback: clipboard API with a complete HTML document
  if (!ok) {
    try {
      const doc = `<html><head><meta charset="utf-8"></head><body>${r.html}</body></html>`;
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([doc], { type: 'text/html' }), 'text/plain': new Blob([r.text], { type: 'text/plain' }) })]);
      ok = true;
    } catch (e) { ok = false; }
  }
  const btn = $('#repCopy');
  if (ok) {
    btn.textContent = L('✓ Copied! Now paste in Outlook (Ctrl+V)', '✓ הועתק! עכשיו הדבק ב-Outlook (Ctrl+V)'); btn.classList.add('copied');
    $('#repStatus').textContent = L('✓ The formatted email is on your clipboard. Open Outlook › click in the message body › Ctrl+V.', '✓ המייל המעוצב הועתק. פתח את Outlook › לחץ בגוף ההודעה › Ctrl+V.');
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = tr('📋 Copy formatted email'); btn.classList.remove('copied'); }, 4000);
    toast('Copied ✓');
  } else {
    $('#repStatus').textContent = 'Your browser blocked automatic copying. The email below is selected — press Ctrl+C (phone: tap Copy), then paste in Outlook.';
    const range = document.createRange(); range.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    toast('The email is selected — press Ctrl+C (or long-press › Copy), then paste in Outlook');
  }
});

/* ---------- 🔎 one search for tasks, Notebook and Collection ---------- */
function searchHtml(q) {
  const ql = q.toLowerCase(), hit = (arr) => arr.join(' ').toLowerCase().includes(ql);
  const all = data.items.filter(it => hit([it.item, it.topic, it.com, it.focal, tr(it.area || '')]));     // guests only ever receive what's shared with them
  const tasks = all.filter(it => it.due || isClosed(it)).sort((a, b) => isClosed(a) - isClosed(b) || sortOpen(a, b));
  const notes = all.filter(it => !it.due && !isClosed(it));
  const cl = coll.filter(en => collCats.some(c => c.id === en.cat) && hit([en.title, en.notes, en.place, en.by, en.for, en.ing || '']));
  const sec = (ic, title, n, body) => n ? `<section class="group sr-sec"><h3>${ic} ${esc(title)} <span class="n">${n}</span></h3>${body}</section>` : '';
  const nbRow = (it) => `<button class="sr-item" data-sropen="${it.row}"><span class="sr-type">📒 ${L('Notebook', 'פנקס')}</span><bdi>${esc(it.item)}</bdi><small>${esc(tr(it.area))}</small></button>`;
  const clRow = (en) => { const c = catOf(en.cat); return `<button class="sr-item" data-cid="${esc(en.id)}"><span class="sr-type">💡 ${esc(c.name || L('Collection', 'אוסף'))}</span><bdi>${esc(en.title)}</bdi><small>${esc([en.place, en.status === 'tried' ? L('tried', 'ניסינו') : ''].filter(Boolean).join(' · '))}</small></button>`; };
  const html = sec('✅', L('Tasks', 'משימות'), tasks.length, tasks.slice(0, 40).map(it => card(it)).join(''))
    + sec('📒', L('Notebook', 'פנקס'), notes.length, notes.slice(0, 40).map(nbRow).join(''))
    + sec('💡', L('Collection', 'אוסף'), cl.length, cl.slice(0, 40).map(clRow).join(''));
  return `<div class="sr-head">${L(`Results for “${esc(q)}” — all areas`, `תוצאות עבור "${esc(q)}" — בכל התחומים`)}</div>` + (html || `<div class="empty"><b>🔎</b>${L('Nothing found.', 'לא נמצא כלום.')}</div>`);
}
document.addEventListener('click', (e) => { const o = e.target.closest('[data-sropen]'); if (!o) return; const it = data.items.find(x => String(x.row) === o.dataset.sropen); if (it) openEdit(it); });

/* ---------- 🗓 weekly review: decisions, not statistics ---------- */
let wr = null;
function openReview() {
  if (isGuest()) return;
  wr = { step: 0, log: [], pick: {} };
  $('#dlgReview').showModal(); wrRender();
}
function wrLog(txt) { wr.log.push(txt); }
function wrRender() {
  const box = $('#wrBody'), steps = [L('Overdue', 'באיחור'), L('Waiting on others', 'ממתין לאחרים'), L('From the Notebook', 'מהפנקס'), L('Decisions', 'החלטות')];
  const nav = `<ol class="wr-steps">${steps.map((t, k) => `<li class="${k === wr.step ? 'on' : k < wr.step ? 'done' : ''}">${t}</li>`).join('')}</ol>`;
  const open = data.items.filter(it => !isClosed(it));
  let body = '';
  if (wr.step === 0) {
    const od = open.filter(it => horizon(it) === 'Overdue').sort((a, b) => parse(a.due) - parse(b.due));
    body = od.length ? `<p class="wr-q">${L('What stays late? Decide on each one.', 'מה עדיין באיחור? להחליט על כל אחת.')}</p><ul class="wr-list">${od.slice(0, 8).map(it => `<li><bdi>${esc(it.item)}</bdi><small class="c-late">${L(`${dayDiff(today(), parse(it.due))}d late`, `באיחור ${dayDiff(today(), parse(it.due))} ימ׳`)}</small></li>`).join('')}</ul>${od.length > 8 ? `<p class="hint">${L(`+${od.length - 8} more`, `ועוד ${od.length - 8}`)}</p>` : ''}
      <button class="btn primary wr-big" data-wr="triage">${L(`Go through ${od.length}, one at a time`, `לעבור על ${od.length}, אחת אחת`)}</button>`
      : `<p class="wr-ok">✅ ${L('Nothing overdue.', 'אין משימות באיחור.')}</p>`;
  } else if (wr.step === 1) {
    const w = open.filter(it => it.status === 'Waiting' || (it.focal && it.focal !== 'Me')).sort((a, b) => (waitDays(b) || 0) - (waitDays(a) || 0));
    body = w.length ? `<p class="wr-q">${L('Who do you need to follow up with?', 'על מי אני מחכה וצריך לעשות מעקב?')}</p>${w.slice(0, 12).map(it => `<div class="wr-row" data-wrrow="${it.row}"><div><bdi>${esc(it.item)}</bdi><small>👤 ${esc(it.focal || '')}${waitDays(it) !== null ? ' · ' + L(`waiting ${waitDays(it)}d`, `ממתין ${waitDays(it)} ימ׳`) : ''}</small></div>
        <div class="wr-btns"><button data-wr="nudge" data-r="${it.row}">✉ ${L('Remind', 'תזכורת')}</button><button data-wr="got" data-r="${it.row}">✓ ${L('Got it', 'התקבל')}</button><button data-wr="tue" data-r="${it.row}">📅 ${L('Check Tue', 'לבדוק בשלישי')}</button></div></div>`).join('')}`
      : `<p class="wr-ok">✅ ${L('Not waiting on anyone.', 'לא מחכה לאף אחד.')}</p>`;
  } else if (wr.step === 2) {
    const nb = open.filter(it => !it.due).sort((a, b) => prioRank(a.prio) - prioRank(b.prio));
    const ns = addDays(weekStart(today()), 7);
    body = nb.length ? `<p class="wr-q">${L('Which Notebook items move forward next week?', 'אילו משימות מהפנקס לקדם בשבוע הבא?')}</p>
      <div class="wr-pick">${nb.slice(0, 20).map(it => `<label class="ap-row"><input type="checkbox" data-wrpick="${it.row}" ${wr.pick[it.row] ? 'checked' : ''}><span class="ap-dot" style="background:${areaColor(it.area)[1]}"></span><bdi>${esc(it.item)}</bdi><b>${esc(tr(it.area))}</b></label>`).join('')}</div>
      <label class="wr-day">${L('Plan them for', 'לתכנן ל־')} <input type="date" id="wrDay" value="${iso(ns)}"></label>
      <label class="remember"><input type="checkbox" id="wrToDay"> ${L('Also put the first one in My day', 'וגם להכניס את הראשונה ל"שלי להיום"')}</label>`
      : `<p class="wr-ok">📒 ${L('The Notebook is empty.', 'הפנקס ריק.')}</p>`;
  } else {
    const ns = addDays(weekStart(today()), 7), ne = addDays(ns, 6);
    const next = open.filter(it => { const d = parse(it.due); return d && d >= ns && d <= ne; }).sort(sortOpen);
    body = `<p class="wr-q">${L('What you decided:', 'מה החלטת:')}</p>${wr.log.length ? `<ul class="wr-list">${wr.log.map(t => `<li>${t}</li>`).join('')}</ul>` : `<p class="hint">${L('No changes this time.', 'לא שינית כלום הפעם.')}</p>`}
      <p class="wr-q">${L(`Next week (${fmt(iso(ns), true)}–${fmt(iso(ne), true)}):`, `השבוע הבא (${fmt(iso(ns), true)}–${fmt(iso(ne), true)}):`)}</p>
      ${next.length ? `<ul class="wr-list">${next.map(it => `<li><bdi>${esc(it.item)}</bdi><small>${fmt(it.due, true)} · ${esc(tr(it.area))}</small></li>`).join('')}</ul>` : `<p class="hint">${L('Nothing planned yet.', 'עוד לא תוכנן כלום.')}</p>`}`;
  }
  const last = wr.step === 3;
  box.innerHTML = nav + `<div class="wr-body">${body}</div><div class="sheet-actions">${wr.step ? `<button class="btn ghost" data-wr="prev">‹ ${L('Back', 'חזרה')}</button>` : ''}<span class="grow"></span>${last ? `<button class="btn primary" data-close>${L('Finish', 'סיום')}</button>` : `<button class="btn primary" data-wr="next">${wr.step === 2 && Object.values(wr.pick).some(Boolean) ? L('Plan & continue', 'לתכנן ולהמשיך') : L('Next', 'הבא')} ›</button>`}</div>`;
}
document.addEventListener('change', (e) => { const c = e.target.closest('[data-wrpick]'); if (c && wr) wr.pick[c.dataset.wrpick] = c.checked; });
document.addEventListener('click', async (e) => {
  const b = e.target.closest('#dlgReview [data-wr]'); if (!b || !wr) return;
  const k = b.dataset.wr, it = b.dataset.r ? data.items.find(x => String(x.row) === b.dataset.r) : null;
  if (k === 'prev') { wr.step--; wrRender(); return; }
  if (k === 'triage') { openTriage(); const t = $('#dlgTriage'); const back = () => { t.removeEventListener('close', back); if (wr) { const n = tri ? tri.stats : null; wrRender(); } }; t.addEventListener('close', back); return; }
  if (k === 'next') {
    if (wr.step === 2) {
      const rows = Object.keys(wr.pick).filter(r => wr.pick[r]).map(Number), day = ($('#wrDay') || {}).value;
      for (const r of rows) { const x = data.items.find(y => y.row === r); if (x && day && await save(Object.assign({}, x, { due: day }))) wrLog(L(`📅 “${esc(x.item)}” → ${fmt(day, true)}`, `📅 "${esc(x.item)}" ← ${fmt(day, true)}`)); }
      if (rows.length && $('#wrToDay') && $('#wrToDay').checked) { toggleDay(rows[0]); wrLog(L('☀ added to My day', '☀ נוסף לשלי להיום')); }
      wr.pick = {};
    }
    wr.step++; wrRender(); return;
  }
  if (!it) return;
  if (k === 'nudge') {
    const text = isHe() ? `היי${it.focal && it.focal !== 'Me' ? ' ' + it.focal : ''}, תזכורת קטנה לגבי "${it.item}". אשמח לעדכון כשתוכל/י. תודה!` : `Hi${it.focal && it.focal !== 'Me' ? ' ' + it.focal : ''}, a quick reminder about "${it.item}". Could you update me when you can? Thanks!`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast(L('Reminder copied', 'התזכורת הועתקה')); } } catch (x) { /* cancelled */ }
    wrLog(L(`✉ reminded about “${esc(it.item)}”`, `✉ נשלחה תזכורת על "${esc(it.item)}"`)); b.closest('.wr-row').classList.add('did'); return;
  }
  if (k === 'got') { if (await save(Object.assign({}, it, { status: 'In progress', focal: 'Me', wsince: '' }))) { wrLog(L(`✓ “${esc(it.item)}” came back`, `✓ "${esc(it.item)}" התקבל`)); wrRender(); } return; }
  if (k === 'tue') { let d = addDays(weekStart(today()), 2); if (d <= today()) d = addDays(d, 7); if (await save(Object.assign({}, it, { due: iso(d) }))) { wrLog(L(`📅 follow up “${esc(it.item)}” on ${fmt(iso(d), true)}`, `📅 מעקב על "${esc(it.item)}" ב-${fmt(iso(d), true)}`)); b.closest('.wr-row').classList.add('did'); } return; }
});
$('#btnReview').addEventListener('click', openReview);

/* ---------- ☀ My day: up to 3 tasks chosen for today (intentions — due dates are not touched) ---------- */
const todayIso = () => iso(today());
const dayRows = () => myDay.date === todayIso() ? myDay.rows.filter(r => data.items.some(it => it.row === r)) : [];
const inDay = (row) => dayRows().includes(Number(row));
async function saveDay(next) {
  const prev = myDay; myDay = { date: next.date, rows: next.rows.slice(0, 3) }; render();
  try { const j = await api('POST', { action: 'setDay', day: myDay }); if (j && j.myDay) myDay = j.myDay; }
  catch (e) { myDay = prev; render(); toast(L('Couldn’t save “My day”: ', 'לא נשמר "שלי להיום": ') + e.message); }
}
function toggleDay(row) {
  row = Number(row); const rows = dayRows();
  if (rows.includes(row)) { saveDay({ date: todayIso(), rows: rows.filter(r => r !== row) }); toast(L('Removed from My day', 'הוסר משלי להיום')); return true; }
  if (rows.length >= 3) { toast(L('My day already has 3 — remove one first', 'כבר בחרת 3 להיום — הסר אחת קודם')); return false; }
  saveDay({ date: todayIso(), rows: rows.concat(row) }); toast(L('☀ Added to My day', '☀ נוסף לשלי להיום')); return true;
}
function myDayHtml() {
  if (isGuest()) return '';
  // yesterday's picks that weren't finished: ask whether to keep going with them
  if (myDay.date && myDay.date !== todayIso()) {
    const left = myDay.rows.map(r => data.items.find(it => it.row === r)).filter(it => it && !isClosed(it));
    if (left.length) return `<section class="myday carry"><div class="md-head"><b>☀ ${L('Still on from ' + fmt(myDay.date, true) + ':', 'נשארו מ' + fmt(myDay.date, true) + ':')}</b></div>
      <ul class="md-left">${left.map(it => `<li><bdi>${esc(it.item)}</bdi></li>`).join('')}</ul>
      <div class="md-act"><button class="btn primary" data-daycarry="keep">${L('Keep them for today', 'להמשיך איתן היום')}</button><button class="btn ghost" data-daycarry="fresh">${L('Start fresh', 'להתחיל מחדש')}</button></div></section>`;
  }
  const items = dayRows().map(r => data.items.find(it => it.row === r)).filter(Boolean);
  if (!items.length) return `<div class="myday empty-day">☀ <b>${L('My day', 'שלי להיום')}</b> · ${L('pick up to 3 tasks from ⋯ to work on today', 'בחר עד 3 משימות דרך ⋯ לעבודה היום')}</div>`;
  const done = items.filter(isClosed).length;
  return `<section class="group myday"><h3><span>☀ ${L('My day', 'שלי להיום')}</span> <span class="n">${done}/${items.length}</span></h3>${items.map(it => card(it, { mine: true })).join('')}</section>`;
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-daycarry]'); if (!c) return;
  const keep = c.dataset.daycarry === 'keep';
  const left = myDay.rows.filter(r => { const it = data.items.find(x => x.row === r); return it && !isClosed(it); });
  saveDay({ date: todayIso(), rows: keep ? left : [] });
});

/* ---------- ⏰ go through overdue tasks, one at a time ---------- */
let tri = null;
function openTriage() {
  const list = data.items.filter(it => areaOk(it.area) && !isClosed(it) && horizon(it) === 'Overdue').sort((a, b) => parse(a.due) - parse(b.due));
  if (!list.length) { toast(L('Nothing overdue 🎉', 'אין משימות באיחור 🎉')); return; }
  tri = { rows: list.map(it => it.row), i: 0, mode: '', stats: { today: 0, date: 0, nb: 0, done: 0, cancel: 0, skip: 0 } };
  $('#dlgTriage').showModal(); triRender();
}
function triRender() {
  const box = $('#triBody'), n = tri.rows.length;
  if (tri.i >= n) {
    const st = tri.stats, parts = [[st.today, L('for today', 'להיום')], [st.date, L('rescheduled', 'קיבלו תאריך חדש')], [st.nb, L('to the Notebook', 'עברו לפנקס')], [st.done, L('done', 'הושלמו')], [st.cancel, L('cancelled', 'בוטלו')], [st.skip, L('skipped', 'דולגו')]].filter(x => x[0]);
    box.innerHTML = `<div class="tri-end"><b>✅ ${L('All reviewed', 'עברת על הכול')}</b><p>${parts.map(([k, l]) => `${k} ${l}`).join(' · ') || ''}</p><button class="btn primary" data-close>${L('Close', 'סגירה')}</button></div>`;
    return;
  }
  const it = data.items.find(x => x.row === tri.rows[tri.i]);
  if (!it || isClosed(it) || horizon(it) !== 'Overdue') { tri.i++; triRender(); return; }
  const late = dayDiff(today(), parse(it.due)), rec = it.rec && it.rec !== 'None';
  const full = dayRows().length >= 3 && !inDay(it.row);
  let extra = '';
  if (tri.mode === 'date') extra = `<div class="tri-sub"><label>${L('New date', 'תאריך חדש')}<input type="date" id="triDate" value="${iso(addDays(today(), 1))}"></label>
      <div class="tri-chips"><button data-tdate="1">${L('Tomorrow', 'מחר')}</button><button data-tdate="sun">${L('Next week', 'שבוע הבא')}</button><button data-tdate="7">+7</button></div>
      ${rec ? `<p class="hint">${L(`Repeats ${tr(it.rec)} — later occurrences will follow the new date.`, `חוזרת ${tr(it.rec)} — המופעים הבאים יחושבו מהתאריך החדש.`)}</p>` : ''}
      <div class="tri-row"><button class="btn primary" data-tri="dateok">${L('Save date', 'שמור תאריך')}</button><button class="btn ghost" data-tri="back">${L('Back', 'חזרה')}</button></div></div>`;
  else if (tri.mode === 'done' || tri.mode === 'cancel') extra = `<div class="tri-sub"><p><b>${L('This task repeats', 'המשימה חוזרת')} (${esc(tr(it.rec))}).</b> ${tri.mode === 'done' ? L('Mark…', 'לסמן כהושלמה…') : L('Cancel…', 'לבטל…')}</p>
      <div class="tri-row"><button class="btn primary" data-tri="${tri.mode}-one">${L('Just this occurrence', 'רק את המופע הזה')}</button><button class="btn ghost" data-tri="${tri.mode}-all">${L('The whole series', 'את כל הסדרה')}</button><button class="btn ghost" data-tri="back">${L('Back', 'חזרה')}</button></div></div>`;
  else if (tri.mode === 'nb') extra = `<div class="tri-sub"><p>${L(`This task repeats (${tr(it.rec)}). Moving it to the Notebook stops the repeats.`, `המשימה חוזרת (${tr(it.rec)}). העברה לפנקס תפסיק את החזרתיות.`)}</p>
      <div class="tri-row"><button class="btn primary" data-tri="nb-ok">${L('Move anyway', 'להעביר בכל זאת')}</button><button class="btn ghost" data-tri="back">${L('Back', 'חזרה')}</button></div></div>`;
  box.innerHTML = `<div class="tri-prog"><span dir="ltr">${tri.i + 1} / ${n}</span><i style="width:${Math.round(tri.i / n * 100)}%"></i></div>
    <div class="tri-card"><div class="tri-title"><bdi>${esc(it.item)}</bdi></div>
      <div class="tri-meta"><span class="c-area" style="--a:${areaColor(it.area)[1]}"><i></i>${esc(tr(it.area))}</span>${/^1/.test(it.prio || '') ? `<span class="c-hi">${L('High', 'גבוהה')}</span>` : ''}<span class="c-late">${late === 1 ? L('1 day late', 'באיחור יום') : L(`${late} days late`, `באיחור ${late} ימים`)}</span><span>${fmt(it.due, true)}</span>${rec ? `<span>↻ ${esc(tr(it.rec))}</span>` : ''}</div>
      ${it.com ? `<div class="tri-note" dir="auto">${esc(it.com)}</div>` : ''}</div>
    ${extra || `<div class="tri-actions">
      <button data-tri="today" ${full ? 'aria-disabled="true" class="dis"' : ''}><span>☀</span>${inDay(it.row) ? L('Already in My day', 'כבר בשלי להיום') : L('Work on it today', 'לעבוד עליה היום')}<small>${full ? L('My day is full (3)', 'שלי להיום מלא (3)') : L('due date stays', 'התאריך לא משתנה')}</small></button>
      <button data-tri="date"><span>📅</span>${L('New date', 'תאריך חדש')}</button>
      <button data-tri="nb"><span>📒</span>${L('To the Notebook', 'לפנקס, בלי תאריך')}</button>
      <button data-tri="done"><span>✓</span>${L('Done', 'הושלמה')}</button>
      <button data-tri="cancel"><span>✕</span>${L('Cancel it', 'ביטול המשימה')}</button>
      <button data-tri="skip"><span>⏭</span>${L('Skip for now', 'דלג כרגע')}</button></div>`}`;
}
async function triAct(k) {
  const it = data.items.find(x => x.row === tri.rows[tri.i]); if (!it) return;
  const rec = it.rec && it.rec !== 'None', next = () => { tri.mode = ''; tri.i++; triRender(); };
  const undoT = (msg) => toast(msg, { label: L('↶ Undo', '↶ ביטול'), fn: async () => { await undo(); if (tri) { tri.i = Math.max(0, tri.i - 1); triRender(); } } });
  if (k === 'back') { tri.mode = ''; triRender(); return; }
  if (k === 'skip') { tri.stats.skip++; next(); return; }
  if (k === 'today') { if (inDay(it.row)) { next(); return; } if (dayRows().length >= 3) { toast(L('My day already has 3 — remove one first', 'כבר בחרת 3 להיום — הסר אחת קודם')); return; } toggleDay(it.row); tri.stats.today++; next(); return; }
  if (k === 'date' || (k === 'done' && rec) || (k === 'cancel' && rec) || (k === 'nb' && rec)) { tri.mode = k; triRender(); return; }
  if (k === 'dateok') { const v = $('#triDate').value; if (!v) return; if (await save(Object.assign({}, it, { due: v }))) { tri.stats.date++; undoT(L(`Moved to ${fmt(v, true)}`, `הועבר ל-${fmt(v, true)}`)); next(); } return; }
  if (k === 'nb' || k === 'nb-ok') { if (await save(Object.assign({}, it, { due: '', time: '', rec: 'None' }))) { tri.stats.nb++; undoT(L('Moved to the Notebook', 'הועבר לפנקס')); next(); } return; }
  if (k === 'done' || k === 'done-one') { $('#dlgTriage').close(); await toggleDone(it); tri.stats.done++; tri.mode = ''; tri.i++; $('#dlgTriage').showModal(); triRender(); return; }
  if (k === 'done-all') { celebrate(); if (await save(Object.assign({}, it, { status: 'Done', done: todayIso(), rec: 'None' }))) { tri.stats.done++; undoT(L('Series completed', 'הסדרה הושלמה')); next(); } return; }
  if (k === 'cancel') { if (await save(Object.assign({}, it, { status: 'Cancelled' }))) { tri.stats.cancel++; undoT(L('Cancelled', 'בוטלה')); next(); } return; }
  if (k === 'cancel-one') { const nd = nextDue(it); if (nd && await save(Object.assign({}, it, { due: iso(nd) }))) { tri.stats.cancel++; undoT(L(`Skipped this one — next on ${fmt(iso(nd), true)}`, `המופע בוטל — הבא ב-${fmt(iso(nd), true)}`)); next(); } return; }
  if (k === 'cancel-all') { if (await save(Object.assign({}, it, { status: 'Cancelled' }))) { tri.stats.cancel++; undoT(L('Series cancelled', 'הסדרה בוטלה')); next(); } return; }
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-triage]')) { openTriage(); return; }
  const b = e.target.closest('#dlgTriage [data-tri]'); if (b) { if (b.getAttribute('aria-disabled') === 'true') { toast(L('My day already has 3 — remove one first', 'כבר בחרת 3 להיום — הסר אחת קודם')); return; } triAct(b.dataset.tri); return; }
  const td = e.target.closest('#dlgTriage [data-tdate]'); if (td) { const v = td.dataset.tdate; $('#triDate').value = iso(v === 'sun' ? addDays(weekStart(today()), 7) : addDays(today(), Number(v))); }
});
$('#dlgTriage').addEventListener('close', () => { tri = null; render(); });

/* ---------- card ⋯ menu, More tab, search, area picker, quick-entry sheet ---------- */
function openCardMenu(btn) {
  const m = $('#cardMenu'), row = btn.dataset.cmenu, r = btn.getBoundingClientRect();
  if (!m.hidden && m.dataset.row === row) { closeCardMenu(); return; }
  m.dataset.row = row;
  m.innerHTML = [['focus', '▶', L('Start focus', 'מתחילים פוקוס')], ['day', '☀', inDay(row) ? L('Remove from My day', 'הסר משלי להיום') : L('Add to My day', 'הוסף לשלי להיום')], ['done', '✓', L('Mark done', 'סמן כבוצע')], ['defer', '⏭', L('Defer to tomorrow', 'דחייה למחר')], ['edit', '✎', L('Edit', 'עריכה')]]
    .map(([k, ic, l]) => `<button role="menuitem" data-cact="${k}" data-row="${row}"><span aria-hidden="true">${ic}</span>${l}</button>`).join('');
  m.hidden = false; btn.setAttribute('aria-expanded', 'true');
  const w = m.offsetWidth, h = m.offsetHeight;
  let top = r.bottom + 4; if (top + h > innerHeight - 90) top = r.top - h - 4;
  let left = isHe() ? r.left : r.right - w; left = Math.max(8, Math.min(innerWidth - w - 8, left));
  m.style.top = top + 'px'; m.style.left = left + 'px';
  m.querySelector('button').focus({ preventScroll: true });
}
function closeCardMenu() { const m = $('#cardMenu'); if (m.hidden) return; m.hidden = true; document.querySelectorAll('[data-cmenu][aria-expanded=true]').forEach(b => b.setAttribute('aria-expanded', 'false')); }
function toggleMore(open) {
  const m = $('#moreMenu'), b = $('#tabMore'); open = open === undefined ? m.hidden : open;
  if (open === !m.hidden) return;
  m.hidden = !open; b.setAttribute('aria-expanded', open);
  if (open) { const r = b.getBoundingClientRect(); m.style.top = (r.bottom + 6 + scrollY) + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, isHe() ? r.left : r.right - m.offsetWidth)) + 'px'; }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCardMenu(); toggleMore(false); } });
window.addEventListener('scroll', () => { closeCardMenu(); toggleMore(false); }, { passive: true });
$('#btnSearch').addEventListener('click', () => {
  const r = $('#searchRow'), open = r.hidden; r.hidden = !open; $('#btnSearch').setAttribute('aria-expanded', open);
  if (open) $('#search').focus(); else if (search) { search = ''; $('#search').value = ''; render(); }
});
$('#btnAreaPick').addEventListener('click', openAreaPick);
function openAreaPick() {
  const sel = areaSel() || [];
  $('#apList').innerHTML = data.areas.map(a => `<label class="ap-row"><input type="checkbox" value="${esc(a)}" ${sel.includes(a) ? 'checked' : ''}><span class="ap-dot" style="background:${areaColor(a)[1]}"></span><span>${esc(tr(a))}</span><b>${data.items.filter(it => it.area === a && !isClosed(it)).length}</b></label>`).join('');
  $('#dlgAreaPick').showModal();
}
$('#apDone').addEventListener('click', () => {
  const set = [...document.querySelectorAll('#apList input:checked')].map(x => x.value);
  if (!set.length || set.length === data.areas.length) { ui.area = 'All'; ui.areas = []; } else if (set.length === 1) { ui.area = set[0]; ui.areas = []; } else { ui.areas = set; ui.area = set[0]; }
  store.set('ai.ui', ui); $('#dlgAreaPick').close(); render();
});
$('#apAll').addEventListener('click', () => { document.querySelectorAll('#apList input').forEach(x => { x.checked = false; }); $('#apDone').click(); });
$('#apOrder').addEventListener('click', () => { $('#dlgAreaPick').close(); openOrder(); });
function openQuick() {
  const d = $('#dlgQuick');
  $('#qaHelpList').innerHTML = [[L('Date', 'תאריך'), L('today, tomorrow, Sunday, 25/10', 'היום, מחר, ביום ראשון, 25/10')], [L('Time', 'שעה'), '9:30'], [L('Priority', 'עדיפות'), L('!1 high · !3 low', '!1 גבוהה · !3 נמוכה')], [L('Hours', 'שעות'), '~2h · ~0.5'], [L('Person', 'אדם'), '@' + L('Ezra', 'עזרא')], [L('Area', 'תחום'), L('detected from the words, or asked', 'מזוהה מהמילים, או שאשאל')]]
    .map(([k, v]) => `<li><b>${k}</b> <span dir="auto">${v}</span></li>`).join('');
  d.showModal(); setTimeout(() => $('#qa').focus(), 60);
}
$('#qaHelpBtn').addEventListener('click', () => { const h = $('#qaHelp'); h.hidden = !h.hidden; $('#qaHelpBtn').setAttribute('aria-expanded', !h.hidden); });
$('#qaFull').addEventListener('click', () => { const v = $('#qa').value.trim(); $('#dlgQuick').close(); openEdit(null); if (v) { const p = parseQuick(v); F('item').value = p.item || v; if (p.due) F('due').value = p.due; if (p.time) F('time').value = p.time; if (p.prio) F('prio').value = p.prio; if (p.area) F('area').value = p.area; if (p.hrs) F('hrs').value = p.hrs; if (p.focal) F('focal').value = p.focal; } });
// keep the sheet above the iPhone keyboard
if (window.visualViewport) { const kb = () => document.documentElement.style.setProperty('--kb', Math.max(0, innerHeight - visualViewport.height - visualViewport.offsetTop) + 'px'); visualViewport.addEventListener('resize', kb); visualViewport.addEventListener('scroll', kb); }

/* =====================================================================
   🌅 Daily welcome — first open of each local day: "What do we focus on today?"
   Never shown when the app opens on a task (notification link) or a focus session is running.
   ===================================================================== */
const CTX = {
  work: { re: /work|עבוד|משרד/i, ic: '💼', name: () => L('At work', 'בעבודה') },
  home: { re: /home|בית|house/i, ic: '🏠', name: () => L('At home', 'בבית') }
};
function ctxArea(k) { const a = data.areas.find(x => CTX[k].re.test(x) || CTX[k].re.test(tr(x))); return a || data.areas[k === 'work' ? 0 : 1] || data.areas[0]; }
function storySecs(area) {   // same timing rules as the video: ~5 s a slide + a bit per listed task
  try { const sl = storySlides(area); const ms = sl.reduce((t, x) => t + 5200 + ((x.html.match(/<li>/g) || []).length) * 900, 0); return Math.max(15, Math.round(ms / 5000) * 5); } catch (e) { return 30; }
}
function startOfDay() {
  if (isGuest()) return;
  const m = location.hash.match(/^#task=(\d+)/);
  if (m) {   // opened from a notification about one task: straight to it
    history.replaceState(null, '', location.pathname + location.search);
    const it = data.items.find(x => x.row === Number(m[1]));
    if (it) { store.set('ai.welcomeDay', todayIso()); setTimeout(() => openEdit(it), 80); }
    return;
  }
  if (fs && !fs.endAt) return;                                             // a focus session is running — the timer comes first
  if (store.get('ai.tourPending', false)) { store.set('ai.welcomeDay', todayIso()); setTimeout(startTour, 400); return; }   // brand-new copy: the tour first
  if (!store.get('ai.welcomeOn', true) || store.get('ai.welcomeDay', '') === todayIso()) return;
  if (story || document.querySelector('dialog[open]')) return;
  openWelcome(true);
}
function openWelcome(daily) {
  if (daily) store.set('ai.welcomeDay', todayIso());                       // counted as shown right away (skip / reopen won't bring it back today)
  let w = $('#welcome');
  if (!w) { w = document.createElement('div'); w.id = 'welcome'; w.className = 'welcome'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-labelledby', 'wcTitle'); document.body.appendChild(w); }
  const h = new Date().getHours(), hello = h < 5 ? L('Good night', 'לילה טוב') : h < 12 ? L('Good morning', 'בוקר טוב') : h < 17 ? L('Good afternoon', 'צהריים טובים') : L('Good evening', 'ערב טוב');
  const card = (k) => {
    const a = ctxArea(k), open = data.items.filter(it => it.area === a && !isClosed(it));
    const od = open.filter(it => horizon(it) === 'Overdue').length, td = open.filter(it => horizon(it) === 'Today').length, wk = open.filter(it => horizon(it) === 'This week').length;
    const desc = od || td ? [td && L(`${td} today`, `${td} להיום`), od && L(`${od} overdue`, `${od} באיחור`)].filter(Boolean).join(' · ') : wk ? L(`${wk} later this week`, `${wk} בהמשך השבוע`) : L('Nothing urgent', 'אין משהו דחוף');
    return `<button class="wc-card" data-wc="${k}" aria-label="${esc(CTX[k].name() + ' — ' + L('play the daily video', 'הפעלת הסרטון היומי'))}">
      <span class="wc-ic" aria-hidden="true">${CTX[k].ic}</span>
      <span class="wc-txt"><b>${CTX[k].name()}</b><small>${esc(desc)}</small></span>
      <span class="wc-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg></span>
      <span class="wc-dur">${L(`${storySecs(a)} sec`, `${storySecs(a)} שנ׳`)}</span></button>`;
  };
  w.innerHTML = `<div class="wc-in">
    <p class="wc-date">${esc(today().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
    <p class="wc-hello">${hello} ☀</p>
    <h1 id="wcTitle">${L('What do we focus on today?', 'במה מתמקדים היום?')}</h1>
    <div class="wc-cards">${card('work')}${card('home')}</div>
    <button class="wc-skip" data-wc="skip">${L('Straight to my tasks ›', 'ישר למשימות ‹')}</button>
    <p class="wc-note">${L('Turn this screen off in ☰ › Daily start screen', 'אפשר לכבות את המסך הזה ב-☰ › מסך פתיחה יומי')}</p></div>`;
  w.hidden = false; document.body.classList.add('welcome-open');
  setTimeout(() => { const b = w.querySelector('.wc-card'); if (b) b.focus({ preventScroll: true }); }, 50);
}
function closeWelcome() { const w = $('#welcome'); if (w) w.hidden = true; document.body.classList.remove('welcome-open'); }
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-wc]'); if (!b) return;
  const k = b.dataset.wc; closeWelcome();
  if (k === 'skip') { render(); return; }
  playCtx(k);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#welcome') && !$('#welcome').hidden) { closeWelcome(); render(); } });
function playCtx(k) {
  const a = ctxArea(k);
  storyAfter = () => openAfter(k);                                         // when it ends — or if stopped — offer a task to focus on
  try { openStory(a); } catch (e) { storyAfter = null; openAfter(k); }     // if the video can't play, go on without blocking
}
/* after the video: pick a task from that context and start focus, switch context, or go to the main screen */
function openAfter(k) {
  const d = $('#dlgAfter'); d.dataset.ctx = k; afterRender(); if (!d.open) d.showModal();
}
function afterRender() {
  const d = $('#dlgAfter'), k = d.dataset.ctx, a = ctxArea(k);
  const open = data.items.filter(it => it.area === a && !isClosed(it));
  const mine = dayRows().map(r => open.find(it => it.row === r)).filter(Boolean);
  const urgent = open.filter(it => ['Overdue', 'Today', 'This week'].includes(horizon(it)) && !mine.includes(it)).sort((x, y) => sortOpen(x, y));
  const nb = open.filter(it => !it.due && !mine.includes(it)).sort((x, y) => prioRank(x.prio) - prioRank(y.prio));
  const list = mine.concat(urgent, nb).slice(0, 6);
  const row = (it) => { const h = horizon(it), late = h === 'Overdue' ? dayDiff(today(), parse(it.due)) : 0;
    return `<div class="af-row"><div class="af-t"><bdi>${esc(it.item)}</bdi><small>${inDay(it.row) ? '☀ ' + L('My day', 'שלי להיום') + ' · ' : ''}${!it.due ? '📒 ' + L('Notebook', 'פנקס') : late ? `<span class="c-late">${L(`${late}d late`, `באיחור ${late} ימ׳`)}</span>` : h === 'Today' ? L('Today', 'היום') : fmt(it.due, true)}</small></div>
      <button class="btn primary af-go" data-afgo="${it.row}">▶ ${L('Focus', 'פוקוס')}</button></div>`; };
  $('#afBody').innerHTML = `<div class="seg af-seg">${['work', 'home'].map(x => `<button type="button" class="${x === k ? 'on' : ''}" data-afctx="${x}" aria-pressed="${x === k}">${CTX[x].ic} ${CTX[x].name()}</button>`).join('')}</div>
    <p class="af-q">${L('Pick a task and start focus time:', 'בחר משימה והתחל זמן פוקוס:')}</p>
    ${list.length ? list.map(row).join('') : `<p class="hint">${L('No open tasks here — enjoy, or switch context.', 'אין כאן משימות פתוחות — תהנה, או החלף הקשר.')}</p>`}
    <div class="sheet-actions"><button type="button" class="btn ghost" data-afreplay>↻ ${L('Watch again', 'לצפות שוב')}</button><span class="grow"></span><button type="button" class="btn primary" data-afmain>${L('To my tasks', 'למסך הראשי')}</button></div>`;
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-afctx]'); if (c) { $('#dlgAfter').dataset.ctx = c.dataset.afctx; afterRender(); return; }
  const g = e.target.closest('[data-afgo]'); if (g) { const it = data.items.find(x => String(x.row) === g.dataset.afgo); $('#dlgAfter').close(); if (it) openFocusSetup(it); return; }
  if (e.target.closest('[data-afmain]')) { const k = $('#dlgAfter').dataset.ctx; $('#dlgAfter').close(); const a = ctxArea(k); ui.tab = 'focus'; ui.area = a; ui.areas = []; store.set('ai.ui', ui); render(); scrollTo(0, 0); return; }
  if (e.target.closest('[data-afreplay]')) { const k = $('#dlgAfter').dataset.ctx; $('#dlgAfter').close(); playCtx(k); }
});
$('#welcomeOn').addEventListener('change', (e) => { store.set('ai.welcomeOn', e.target.checked); toast(e.target.checked ? L('Daily start screen on', 'מסך הפתיחה היומי פועל') : L('Daily start screen off', 'מסך הפתיחה היומי כבוי')); });

/* =====================================================================
   ⏱ Focus time — a quiet screen to work on one task.
   Time is computed from timestamps (start, paused total, pause start) saved on the device,
   so it survives locking the phone, switching apps or reloading. One active session across devices.
   ===================================================================== */
const DEV = (() => { let d = store.get('ai.dev', ''); if (!d) { d = Math.random().toString(36).slice(2, 10); store.set('ai.dev', d); } return d; })();
let fs = store.get('ai.focus', null), fsTick = null, fsSetup = null;
const fsNow = () => Date.now();
const fsElapsed = (f) => !f ? 0 : Math.max(0, (f.endAt || fsNow()) - f.start - (f.paused || 0) - (f.pauseAt ? (f.endAt || fsNow()) - f.pauseAt : 0));
const fsSave = () => store.set('ai.focus', fs);
const mmss = (ms, sec = true) => { const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s2 = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + (sec ? ':' + String(s2).padStart(2, '0') : (h ? '' : L(' min', ' דק׳'))); };
const fmtMin = (m) => m >= 60 ? L(`${Math.floor(m / 60)} h ${m % 60} min`, `${Math.floor(m / 60)} ש׳ ${m % 60} דק׳`) : L(`${m} min`, `${m} דקות`);
function openFocusSetup(it) {
  if (isGuest() || !it) return;
  if (fs && !fs.endAt) { if (fs.row === it.row) { showFocus(); return; } toast(L('Another focus session is running — finish it first', 'יש מקטע פוקוס פעיל — סיים אותו קודם')); showFocus(); return; }
  fsSetup = { it, plan: store.get('ai.focusPlan', 25), intro: store.get('ai.focusIntro', true), sound: store.get('ai.focusSound', true) };
  fsSetupRender(); $('#dlgFocusSetup').showModal();
}
function fsSetupRender() {
  const f = fsSetup, other = focusRemote && focusRemote.device !== DEV && Date.now() - Number(focusRemote.beat || focusRemote.start || 0) < 12 * 3600e3 ? focusRemote : null;
  const opt = (v, l) => `<button type="button" class="fs-opt ${f.plan === v ? 'on' : ''}" data-fsplan="${v}" aria-pressed="${f.plan === v}">${l}</button>`;
  $('#fsBody').innerHTML = `<div class="fs-task"><bdi>${esc(f.it.item)}</bdi></div>
    <div class="fs-label">${L('How long?', 'לכמה זמן?')}</div>
    <div class="fs-opts">${opt(25, L('25 min', '25 דק׳'))}${opt(45, L('45 min', '45 דק׳'))}${opt(-1, L('Custom', 'אחר'))}${opt(0, L('Open-ended', 'בלי הגבלה'))}</div>
    ${f.plan === -1 || ![25, 45, 0].includes(f.plan) ? `<label class="fs-custom">${L('Minutes', 'דקות')}<input type="number" id="fsMin" min="5" max="240" step="5" inputmode="numeric" value="${f.plan > 0 ? f.plan : 60}"></label>` : ''}
    <label class="remember"><input type="checkbox" id="fsIntro" ${f.intro ? 'checked' : ''}> ${L('Short intro with the character', 'פתיח קצר עם הדמות')}</label>
    <label class="remember"><input type="checkbox" id="fsSound" ${f.sound ? 'checked' : ''}> ${L('Intro sound', 'צליל בפתיח')}</label>
    <label class="remember"><input type="checkbox" id="fsNote" ${store.get('ai.focusNotify', true) ? 'checked' : ''}> ${L('Notify me if I leave the app', 'הודעה אם יוצאים מהאפליקציה')}</label>
    <p class="hint">${L('Leaving the app pauses focus; if the screen just turns off while the app is open, timing goes on.', 'יציאה מהאפליקציה משהה את הריכוז; אם המסך פשוט נכבה כשהאפליקציה פתוחה — המדידה ממשיכה.')}</p>
    ${other ? `<p class="fs-warn">⚠ ${L(`A session is running on another device: “${esc(other.item)}”. Starting here will end it there.`, `יש מקטע פעיל במכשיר אחר: "${esc(other.item)}". התחלה כאן תסיים אותו שם.`)}</p>` : ''}
    <div class="sheet-actions"><span class="grow"></span><button type="button" class="btn primary fs-go" id="fsGo">▶ ${L('Start focus', 'מתחילים פוקוס')}</button></div>`;
}
document.addEventListener('click', (e) => {
  const p = e.target.closest('[data-fsplan]'); if (p && fsSetup) { fsSetup.plan = Number(p.dataset.fsplan); fsSetupRender(); return; }
  if (e.target.closest('#fsGo')) fsStart();
});
async function fsStart() {
  const f = fsSetup; if (!f) return;
  let plan = f.plan; if (plan === -1 || ![25, 45, 0].includes(plan)) plan = Math.max(5, Math.min(240, Number(($('#fsMin') || {}).value) || 60));
  f.intro = $('#fsIntro').checked; f.sound = $('#fsSound').checked;
  const wantNote = $('#fsNote').checked; store.set('ai.focusNotify', wantNote);
  if (wantNote && 'Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission().catch(() => {}); } catch (e) { /* older Safari */ } }
  store.set('ai.focusPlan', [25, 45, 0].includes(plan) ? plan : -1); store.set('ai.focusIntro', f.intro); store.set('ai.focusSound', f.sound);
  fs = { id: DEV + '-' + Date.now(), row: f.it.row, item: f.it.item, device: DEV, start: fsNow(), plan, paused: 0, pauseAt: 0, endAt: 0, planAck: false, clock: store.get('ai.focusClock', 'full'), min: false };
  fsSave(); $('#dlgFocusSetup').close();
  fsSync(true);
  showFocus(f.intro, f.sound);
}
async function fsSync(force) {
  if (!fs || settings.demo) return;
  try { const j = await api('POST', { action: 'focusStart', session: { id: fs.id, row: fs.row, item: fs.item, device: DEV, start: fs.start, plan: fs.plan, paused: fs.paused, pauseAt: fs.pauseAt }, force: !!force });
    if (j && j.busy && !force) toast(L('A session is active on another device', 'יש מקטע פעיל במכשיר אחר')); else if (j && j.focus) focusRemote = j.focus; } catch (e) { /* offline — the device copy is the truth */ }
}
function showFocus(intro, sound) {
  if (!fs) return;
  if (EDITION === 'public' && !$('#fmBuddy').dataset.svg) { const b = $('#fmBuddy'); const d = document.createElement('div'); d.id = 'fmBuddy'; d.className = 'fm-buddy st-mascot'; d.dataset.svg = '1'; d.setAttribute('aria-hidden', 'true'); d.innerHTML = `<div class="mc-wrap">${mascotSvg(ST_CAST[0])}</div>`; b.replaceWith(d); }
  fs.min = false; fsSave();
  const m = $('#focusMode'); m.hidden = false; document.body.classList.add('focus-open');
  $('#fmTitle').innerHTML = `<bdi>${esc(fs.item)}</bdi>`;
  fsRender();
  clearInterval(fsTick); fsTick = setInterval(fsRender, 1000);
  if (intro && !matchMedia('(prefers-reduced-motion: reduce)').matches) fsIntro(sound);
}
function fsIntro(sound) {
  const box = $('#fmIntro'), img = $('#fmIntroImg'), bub = $('#fmBubble');
  box.hidden = false; box.className = 'fm-intro'; bub.classList.remove('show'); $('#focusMode').classList.add('intro');
  const art = $('#fmArt'); if (art) art.remove();
  if (EDITION === 'public') {          // the public copy uses one of the app's own drawn characters
    img.hidden = true; const ch = ST_CAST[Math.floor(Math.random() * ST_CAST.length)];
    const d = document.createElement('div'); d.id = 'fmArt'; d.className = 'st-mascot mood-hi fm-art'; d.innerHTML = `<div class="mc-wrap">${mascotSvg(ch, ST_OUTFITS.find(o => o.id === 'work'))}</div>`; box.insertBefore(d, img);
  } else { img.hidden = false; img.src = 'assets/focus/focus_intro.webp?t=' + Date.now(); }          // restart the animation (plays once)
  let au = null;
  if (sound && EDITION !== 'public') { try { au = new Audio('assets/focus/focus_intro.m4a'); au.volume = 0.8; au.play().catch(() => {}); } catch (e) { au = null; } }
  $('#fmMute').textContent = sound ? '🔊' : '🔇';
  $('#fmMute').onclick = () => { if (au) { au.muted = !au.muted; $('#fmMute').textContent = au.muted ? '🔇' : '🔊'; store.set('ai.focusSound', !au.muted); } };
  const end = () => { clearTimeout(t1); clearTimeout(t2); if (au) au.pause(); box.classList.add('out'); $('#focusMode').classList.remove('intro'); setTimeout(() => { box.hidden = true; img.removeAttribute('src'); }, 450); };
  $('#fmSkip').onclick = end;
  const t1 = setTimeout(() => bub.classList.add('show'), 1650);
  const t2 = setTimeout(end, 3600);
}
function fsRender() {
  if (!fs) return;
  const el = fsElapsed(fs), paused = !!fs.pauseAt, it = data.items.find(x => x.row === fs.row);
  const hideSec = fs.clock === 'nosec', hidden = fs.clock === 'hidden';
  $('#fmBadge').innerHTML = paused ? `⏸ ${L('On a break', 'בהפסקה')}` : `<i class="fm-dot"></i> ${L('Focus time', 'זמן פוקוס')}`;
  $('#fmClock').textContent = hidden ? '' : mmss(el, !hideSec);
  $('#fmClock').classList.toggle('hid', hidden);
  $('#fmClockBtn').innerHTML = `<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/>${hidden ? '<path d="M4 4l16 16"/>' : '<path d="M12 8v4l3 2"/>'}</svg>`;
  $('#fmMin').innerHTML = '<svg class="ic" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  const planMs = fs.plan > 0 ? fs.plan * 60000 : 0;
  $('#fmPlan').textContent = planMs ? (el < planMs ? L(`${fmtMin(Math.ceil((planMs - el) / 60000))} left of ${fs.plan}`, `נשארו ${fmtMin(Math.ceil((planMs - el) / 60000))} מתוך ${fs.plan}`) : L(`${fs.plan} min reached`, `הושלמו ${fs.plan} דקות`)) : (hidden ? L('Timing… (clock hidden)', 'מודד זמן… (השעון מוסתר)') : L('Open-ended', 'בלי הגבלה'));
  const next = it && Array.isArray(it.checklist) ? it.checklist.find(x => !x.d) : null;
  $('#fmStep').hidden = !next; if (next) $('#fmStep').innerHTML = `<span>${L('Next step', 'הצעד הבא')}</span><bdi>${esc(next.t)}</bdi>`;
  $('#focusMode').classList.toggle('paused', paused);
  const acts = paused
    ? `<button class="fm-btn main" data-fm="resume">▶ ${L('Back to focus', 'חזרה לפוקוס')}</button><button class="fm-btn" data-fm="end">${L('End session', 'סיום מקטע')}</button>`
    : `<button class="fm-btn" data-fm="pause">⏸ ${L('Break', 'הפסקה')}</button><button class="fm-btn" data-fm="end">${L('End session', 'סיום מקטע')}</button><button class="fm-btn main" data-fm="done">✓ ${L('Task done', 'המשימה הושלמה')}</button>`;
  if ($('#fmActions').dataset.k !== String(paused)) { $('#fmActions').innerHTML = acts; $('#fmActions').dataset.k = String(paused); }
  // planned time reached — never completes the task by itself
  if (planMs && el >= planMs && !fs.planAck && !paused && $('#fmLayer').hidden) {
    fsLayer(`<div class="fm-card"><b>⏰ ${L(`${fs.plan} minutes done`, `עברו ${fs.plan} דקות`)}</b><p>${L('Keep going, take a break, or wrap up?', 'להמשיך, לקחת הפסקה או לסיים?')}</p>
      <div class="fm-row"><button class="fm-btn main" data-fm="ack">${L('Keep going', 'להמשיך')}</button><button class="fm-btn" data-fm="pause">${L('Break', 'הפסקה')}</button><button class="fm-btn" data-fm="end">${L('Finish', 'סיום')}</button></div></div>`);
    try { navigator.vibrate && navigator.vibrate([120, 80, 120]); } catch (e) { /* none */ }
  }
  fsBanner();
}
function fsLayer(html) { const l = $('#fmLayer'); l.innerHTML = html; l.hidden = !html; }
function fsBanner() {
  let b = $('#fsBanner');
  const show = fs && !fs.endAt && fs.min;
  if (!show) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('button'); b.id = 'fsBanner'; b.className = 'fs-banner'; b.onclick = () => showFocus(); document.body.appendChild(b); }
  b.innerHTML = `<i class="fm-dot ${fs.pauseAt ? 'off' : ''}"></i><bdi>${esc(fs.item)}</bdi><b>${fs.clock === 'hidden' ? '⏱' : mmss(fsElapsed(fs), false)}</b><span>${L('Back', 'חזרה')} ›</span>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-fm]'); if (!b || !fs) return;
  const k = b.dataset.fm;
  if (k === 'pause') { if (!fs.pauseAt) fs.pauseAt = fsNow(); fsLayer(''); fsSave(); fsRender(); fsSync(); return; }
  if (k === 'resume') { if (fs.pauseAt) { fs.paused += fsNow() - fs.pauseAt; fs.pauseAt = 0; } fs.autoPaused = 0; fsLayer(''); fsSave(); fsRender(); fsSync(); return; }
  if (k === 'countaway') { fs.pauseAt = 0; fs.autoPaused = 0; fsLayer(''); fsSave(); fsRender(); fsSync(); return; }
  if (k === 'ack') { fs.planAck = true; fsSave(); fsLayer(''); return; }
  if (k === 'end' || k === 'done') { fsFinish(k === 'done'); return; }
  if (k === 'save') { fsCommit(); return; }
  if (k === 'discard') { fsDiscard(); return; }
  if (k === 'back') { fs.endAt = 0; fs.finishing = ''; fsSave(); fsLayer(''); fsRender(); return; }
});
$('#fmClockBtn').addEventListener('click', () => { if (!fs) return; fs.clock = { full: 'nosec', nosec: 'hidden', hidden: 'full' }[fs.clock || 'full']; store.set('ai.focusClock', fs.clock); fsSave(); fsRender(); });
$('#fmMin').addEventListener('click', () => { if (!fs) return; fs.min = true; fsSave(); $('#focusMode').hidden = true; document.body.classList.remove('focus-open'); fsBanner(); });
function fsFinish(taskDone) {
  if (fs.pauseAt) { fs.paused += fsNow() - fs.pauseAt; fs.pauseAt = 0; }
  fs.endAt = fsNow(); fs.finishing = taskDone ? 'done' : 'end'; fsSave();
  const mins = Math.max(1, Math.round(fsElapsed(fs) / 60000));
  const it = data.items.find(x => x.row === fs.row), had = parseFloat(it && it.acthrs) || 0;
  const long = mins > 180;
  fsLayer(`<div class="fm-card"><b>${taskDone ? '🎉 ' : ''}${L(`You worked on it for ${fmtMin(mins)}`, `עבדת על המשימה ${fmtMin(mins)}`)}</b>
    ${long ? `<p class="fm-warn">${L('That’s long — forgot to stop? You can fix it:', 'זה ארוך — אולי שכחת לעצור? אפשר לתקן:')}</p>` : ''}
    <label class="fm-fix">${L('Minutes worked', 'דקות עבודה')} <input type="number" id="fmMins" min="0" max="1440" step="1" inputmode="numeric" value="${mins}"></label>
    <label class="fm-chk"><input type="checkbox" id="fmAdd" checked> ${had ? L(`Add to actual hours (now ${had} h)`, `להוסיף לשעות בפועל (כרגע ${had} ש׳)`) : L('Save as actual hours', 'לשמור בשעות בפועל')}</label>
    <div class="fm-row"><button class="fm-btn main" data-fm="save">${taskDone ? L('Save & complete', 'שמור וסמן כהושלמה') : L('Save', 'שמור')}</button><button class="fm-btn" data-fm="back">${L('Back to the session', 'חזרה למקטע')}</button></div>
    <button class="fm-discard" data-fm="discard">🗑 ${taskDone ? L('Delete this focus time (still mark the task done)', 'מחיקת זמן הריכוז הזה (המשימה עדיין תסומן כהושלמה)') : L('Delete this focus time', 'מחיקת זמן הריכוז הזה')}</button></div>`);
  fsRender();
}
/* throw the session away: no hours, no Focus Log line — as if it never happened */
async function fsDiscard() {
  const ok = await confirmBox(L('Delete this focus time?', 'למחוק את זמן הריכוז?'), L('It won’t be counted anywhere — not in the task’s hours and not in the focus log.', 'הוא לא ייחשב בשום מקום — לא בשעות של המשימה ולא ביומן הריכוז.'), L('Delete', 'מחיקה'), L('Keep', 'השאר'));
  if (!ok || !fs) return;
  const sess = fs, it = data.items.find(x => x.row === sess.row), taskDone = sess.finishing === 'done';
  fs = null; store.set('ai.focus', null); clearInterval(fsTick); fsLayer(''); $('#focusMode').hidden = true; document.body.classList.remove('focus-open'); fsBanner();
  if (!settings.demo) api('POST', { action: 'focusEnd', id: sess.id }).catch(() => {});      // ends it on other devices too, without a log line
  focusRemote = null;
  if (taskDone && it) { lastTap = { x: innerWidth / 2, y: innerHeight / 2 }; await toggleDone(it); return; }   // the normal completion (asks for hours as usual)
  toast(L('Focus time deleted', 'זמן הריכוז נמחק'));
}
async function fsCommit() {
  const mins = Math.max(0, Math.round(Number($('#fmMins').value) || 0)), add = $('#fmAdd').checked, taskDone = fs.finishing === 'done';
  const sess = fs, it = data.items.find(x => x.row === sess.row);
  const hrs = Math.round(mins / 60 * 100) / 100, total = Math.round(((parseFloat(it && it.acthrs) || 0) + (add ? hrs : 0)) * 100) / 100;
  // close the screen first, then save once — the completion flow gets the total, so hours are never asked or added twice
  fs = null; store.set('ai.focus', null); clearInterval(fsTick); fsLayer(''); $('#focusMode').hidden = true; document.body.classList.remove('focus-open'); fsBanner();
  if (!settings.demo) api('POST', { action: 'focusEnd', id: sess.id, log: { row: sess.row, item: sess.item, minutes: mins, start: sess.start, end: sess.endAt, saved: add } }).catch(() => {});
  focusRemote = null;
  if (!it) return;
  if (taskDone) { lastTap = { x: innerWidth / 2, y: innerHeight / 2 }; await toggleDone(it, { hours: add ? total : (it.acthrs ? parseFloat(it.acthrs) : '') }); return; }
  if (add && hrs > 0) { if (await save(Object.assign({}, it, { acthrs: String(total) }))) toast(L(`Saved ${fmtMin(mins)} · ${total} h in total`, `נשמרו ${fmtMin(mins)} · סה״כ ${total} ש׳`), { label: L('↶ Undo', '↶ ביטול'), fn: undo }); }
  else toast(L('Session ended', 'המקטע הסתיים'));
}
// after loading: restore a session from this device, or offer the one running on another device
function fsRestore() {
  if (isGuest()) return;
  fs = store.get('ai.focus', null);
  if (fs && !fs.endAt) { if (fs.autoPaused) { showFocus(); fsAwayPrompt(); return; } if (fs.min) fsBanner(); else showFocus(); return; }
  if (fs && fs.endAt) { showFocus(); fsFinish(fs.finishing === 'done'); return; }
  const r = focusRemote;
  if (r && r.device !== DEV && Date.now() - Number(r.beat || r.start || 0) < 12 * 3600e3 && !$('#fsRemote')) {
    const b = document.createElement('div'); b.id = 'fsRemote'; b.className = 'fs-banner remote';
    b.innerHTML = `<i class="fm-dot"></i><bdi>${esc(r.item)}</bdi><span>${L('running on another device', 'פעיל במכשיר אחר')}</span><button type="button" id="fsTake">${L('Continue here', 'להמשיך כאן')}</button>`;
    document.body.appendChild(b);
    $('#fsTake').onclick = () => { fs = { id: r.id, row: r.row, item: r.item, device: DEV, start: r.start, plan: r.plan, paused: r.paused || 0, pauseAt: r.pauseAt || 0, endAt: 0, planAck: false, clock: store.get('ai.focusClock', 'full') }; fsSave(); b.remove(); fsSync(true); showFocus(); };
  }
}
/* leaving the app during focus:
   · the screen went dark by itself while the app was open (no touch for a while) → timing goes on
   · you switched to another app / went home right after using it → focus pauses at that moment,
     an optional phone notification says so, and coming back asks whether to continue */
let fsLastInput = Date.now();
['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { fsLastInput = Date.now(); }, { passive: true, capture: true }));
const FS_IDLE_MS = 20000;   // shorter than the shortest iPhone auto-lock (30 s)
function fsAway() {
  if (!fs || fs.endAt || fs.pauseAt) return;
  const now = fsNow();
  if (now - fsLastInput >= FS_IDLE_MS) { fs.darkAt = now; fsSave(); return; }      // the screen just turned off — keep counting
  fs.pauseAt = now; fs.autoPaused = now; fsSave(); fsSync();
  if (store.get('ai.focusNotify', true)) fsNotify();
}
function fsNotify() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then(r => r.showNotification(L('⏸ Focus paused', '⏸ מצב ריכוז הושהה'), {
      body: L(`You left the app — “${fs.item}” is paused. Tap to come back and continue.`, `יצאת מהאפליקציה — "${fs.item}" הושהה. הקש כדי לחזור ולהמשיך.`),
      tag: 'focus-away', renotify: true, icon: 'icons/icon-192.png', data: { url: location.href.split('#')[0] }
    })).catch(() => {});
  } catch (e) { /* not supported here */ }
}
function fsClearNote() { try { navigator.serviceWorker && navigator.serviceWorker.ready.then(r => r.getNotifications({ tag: 'focus-away' }).then(ns => ns.forEach(n => n.close()))).catch(() => {}); } catch (e) { /* none */ } }
function fsAwayPrompt() {
  if (!fs || !fs.autoPaused || fs.endAt) return;
  const mins = Math.max(1, Math.round((fsNow() - fs.autoPaused) / 60000));
  if ($('#focusMode').hidden) showFocus();
  fsLayer(`<div class="fm-card"><b>⏸ ${L('Focus was paused', 'מצב ריכוז הופסק')}</b>
    <p>${L(`You left the app ${fmtMin(mins)} ago, so the timer stopped then.`, `יצאת מהאפליקציה לפני ${fmtMin(mins)}, אז הטיימר נעצר באותו רגע.`)}<br><bdi>${esc(fs.item)}</bdi></p>
    <div class="fm-row"><button class="fm-btn main" data-fm="resume">▶ ${L('Continue focus', 'להמשיך מצב ריכוז')}</button></div>
    <div class="fm-row"><button class="fm-btn" data-fm="countaway">${L(`I was working on it — count those ${fmtMin(mins)}`, `עבדתי על המשימה — לספור גם את ${fmtMin(mins)}`)}</button><button class="fm-btn" data-fm="end">${L('End session', 'סיום מקטע')}</button></div></div>`);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { fsAway(); return; }
  fsLastInput = Date.now(); fsClearNote();
  if (!fs) return;
  if (fs.darkAt) { delete fs.darkAt; fsSave(); }
  if (fs.autoPaused) fsAwayPrompt(); else fsRender();
});
window.addEventListener('pagehide', fsAway);

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-close]')) { t.closest('dialog').close(); return; }
  const jp = t.closest('[data-jump]');
  if (jp) { const h = jp.dataset.jump; if (ui.tab !== 'focus') { ui.tab = 'focus'; store.set('ai.ui', ui); } setGrp('focus:' + h, true); render();
    const sec = document.querySelector(`#list .group[data-h="${h}"]`); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); else toast(L('Nothing there right now', 'אין שם כלום כרגע')); return; }
  const gh = t.closest('[data-grp]');
  if (gh) { setGrp(gh.dataset.grp, !grpIsOpen(gh.dataset.grp)); render(); return; }
  const drm = t.closest('[data-dayrm]'); if (drm) { e.stopPropagation(); toggleDay(drm.dataset.dayrm); return; }
  const dad = t.closest('[data-dayadd]'); if (dad) { e.stopPropagation(); toggleDay(dad.dataset.dayadd); return; }
  const cm = t.closest('[data-cmenu]');
  if (cm) { e.stopPropagation(); openCardMenu(cm); return; }
  const ca = t.closest('[data-cact]');
  if (ca) { closeCardMenu(); const it = data.items.find(x => String(x.row) === ca.dataset.row); if (!it) return;
    if (ca.dataset.cact === 'day') toggleDay(it.row); else if (ca.dataset.cact === 'focus') openFocusSetup(it); else if (ca.dataset.cact === 'defer') snooze(it.row); else if (ca.dataset.cact === 'edit') openEdit(it); else if (ca.dataset.cact === 'done') toggleDone(it); return; }
  if (!t.closest('#cardMenu')) closeCardMenu();
  if (t.closest('#tabMore')) { toggleMore(); return; }
  if (!t.closest('#moreMenu')) toggleMore(false);
  if (t.closest('#moreMenu [data-tab]')) toggleMore(false);
  if (t.closest('#menuKpis [data-goto]') && $('#dlgMenu').open) $('#dlgMenu').close();
  if (t.closest('[data-lang-toggle]')) { setLang(isHe() ? 'en' : 'he'); return; }
  const sz = t.closest('[data-snooze]');
  if (sz) { e.stopPropagation(); snooze(sz.dataset.snooze); return; }
  const qd = t.closest('[data-qd]');
  if (qd) { const v = qd.dataset.qd; F('due').value = iso(v === 'sun' ? addDays(weekStart(today()), 7) : addDays(today(), Number(v))); updateHint(); return; }
  const mv = t.closest('[data-mv]');
  if (mv) { e.stopPropagation(); moveDay(mv.dataset.r, +mv.dataset.mv); return; }
  const wk = t.closest('[data-wk]');
  if (wk) { weekOff = wk.dataset.wk === '0' ? 0 : weekOff + Number(wk.dataset.wk); render(); return; }
  if (t.closest('[data-ics]')) { openIcs(); return; }
  if (t.closest('[data-story]')) { openStory(); return; }
  if (t.closest('[data-ciopen]')) { openImport(); return; }
  if (t.closest('[data-undo]')) { undo(); return; }
  if (t.closest('[data-redo]')) { redo(); return; }
  const wi = t.closest('.wi');
  if (wi) { const it = data.items.find(x => String(x.row) === wi.dataset.row); if (it) openEdit(it); return; }
  if (t.closest('[data-order]')) { openOrder(); return; }
  const bk = t.closest('[data-book]');
  if (bk) { ui.nbBook = bk.dataset.book; store.set('ai.ui', ui); render(); return; }
  const cc = t.closest('[data-ccat]');
  if (cc) { ui.collCat = cc.dataset.ccat; ui.collView = 'board'; store.set('ai.ui', ui); render(); window.scrollTo({ top: 0 }); return; }
  if (t.closest('[data-cfsheet]')) { openCollFilter(); return; }
  const cfx = t.closest('[data-cfx]'); if (cfx) { cfToggle(cfx.dataset.cfx, cfx.dataset.cfv || ''); render(); return; }
  const ctp = t.closest('[data-ctpl]'); if (ctp) { openTplEditor(ctp.dataset.ctpl); return; }
  const cdn = t.closest('[data-cdone]'); if (cdn) { const en = coll.find(x => x.id === cdn.dataset.cdone); if (en && !collRO()) { const nx = Object.assign({}, en, { status: en.status === 'tried' ? 'want' : 'tried' }); if (nx.status === 'tried') celebrate(); collStore(nx); } return; }
  const ck = t.closest('[data-ckind]');
  if (ck) { const k = ck.dataset.ckind, cur = ((ui.collKind || {})[ui.collCat] || []).slice(); const next = k === '*' ? [] : cur.includes(k) ? cur.filter(x => x !== k) : cur.concat(k);
    ui.collKind = Object.assign({}, ui.collKind, { [ui.collCat]: next }); store.set('ai.ui', ui); render(); return; }
  const cf = t.closest('[data-cfilter]');
  if (cf) { ui.collFilter = cf.dataset.cfilter; store.set('ai.ui', ui); render(); return; }
  const ccs = t.closest('[data-ccats]'); if (ccs) { openCollCats(ccs.dataset.ccats === 'new'); return; }
  const cl2 = t.closest('[data-clayout]'); if (cl2) { ui.collLayout = Object.assign({}, ui.collLayout, { [ui.collCat]: cl2.dataset.clayout }); store.set('ai.ui', ui); render(); return; }
  const ctr = t.closest('[data-ctr]'); if (ctr) { ctOpen[ctr.dataset.ctr] = !ctOpen[ctr.dataset.ctr]; render(); return; }
  const cv = t.closest('[data-cview]'); if (cv) { ui.collView = cv.dataset.cview; store.set('ai.ui', ui); render(); return; }
  if (t.closest('[data-cnew]')) { openColl({ cat: ui.collCat, status: 'want', title: ($('#collNew') || {}).value || '' }); return; }
  const lk = t.closest('[data-clink]');
  if (lk) { e.stopPropagation(); window.open(lk.dataset.clink, '_blank', 'noopener'); return; }
  const cp = t.closest('[data-cpin]');
  if (cp) { e.stopPropagation(); const en = coll.find(x => x.id === cp.dataset.cpin); collFocus = cp.dataset.cpin; if (en && catOf(en.cat).map) { ui.collCat = en.cat; ui.collLayout = Object.assign({}, ui.collLayout, { [en.cat]: 'map' }); } else ui.collView = 'map'; render(); return; }
  const co = t.closest('[data-copen]'); if (co) { const en = coll.find(x => x.id === co.dataset.copen); if (en) openColl(en); return; }
  if (t.closest('#collNew') || t.closest('.c-new')) return;
  const cl = t.closest('[data-cid]');
  if (cl) { const en = coll.find(x => x.id === cl.dataset.cid); if (en) openColl(en); return; }
  const nbt = t.closest('[data-nb]');
  if (nbt) { ui.nbArea = nbt.dataset.nb; store.set('ai.ui', ui); render(); return; }
  const nbc = t.closest('[data-nbcheck]');
  if (nbc) { e.stopPropagation(); if (isGuest()) return; const it = data.items.find(x => String(x.row) === nbc.dataset.nbcheck); if (it) nbToggle(it); return; }
  const nbl = t.closest('.nb-line[data-row]');
  if (nbl) { const it = data.items.find(x => String(x.row) === nbl.dataset.row); if (it) openEdit(it); return; }
  const chk = t.closest('[data-check]');
  if (chk) { e.stopPropagation(); const it = data.items.find(x => String(x.row) === chk.dataset.check); if (it) toggleDone(it); return; }
  const c = t.closest('.card');
  if (c) { const it = data.items.find(x => String(x.row) === c.dataset.row); if (it) openEdit(it); return; }
  const tab = t.closest('[data-tab]') || t.closest('[data-goto]');
  if (tab) { ui.tab = tab.dataset.tab || tab.dataset.goto; store.set('ai.ui', ui); render(); return; }
  const ch = t.closest('[data-area]');
  if (ch) {
    if (areaLong && Date.now() - areaLong < 700) { areaLong = 0; return; }   // the click right after a long-press
    const a = ch.dataset.area; pickArea(a, e.ctrlKey || e.metaKey || e.shiftKey);
    if (a !== 'All' && !store.get('ai.multiHint', false)) { store.set('ai.multiHint', true); toast(L('Tip: long-press another area to see several together', 'טיפ: לחיצה ארוכה על תחום נוסף מציגה כמה תחומים יחד')); }
  }
});
let areaLong = 0, areaHold = null;
$('#areaChips').addEventListener('pointerdown', (e) => { const ch = e.target.closest('[data-area]'); if (!ch) return; clearTimeout(areaHold);
  areaHold = setTimeout(() => { areaLong = Date.now(); pickArea(ch.dataset.area, true); try { navigator.vibrate && navigator.vibrate(15); } catch (x) { /* none */ } }, 450); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => $('#areaChips').addEventListener(ev, () => clearTimeout(areaHold)));
$('#areaChips').addEventListener('scroll', () => clearTimeout(areaHold), { passive: true });
$('#areaChips').addEventListener('contextmenu', (e) => { if (e.target.closest('[data-area]')) e.preventDefault(); });
$('#search').addEventListener('input', (e) => { search = e.target.value; render(); });
$('#fab').addEventListener('click', () => isGuest() ? openSuggest() : (ui.tab === 'notebook' && ui.nbBook === 'coll') ? openColl({ cat: ui.collCat === '*' ? (collCats[0] || {}).id : ui.collCat, status: 'want' }) : openQuick());
$('#btnSettings').addEventListener('click', openSettings);
$('#btnRefresh').addEventListener('click', () => load());
$('#btnReport').addEventListener('click', openReport);
$('#btnNotify').addEventListener('click', openNotify);
$('#btnMenu').addEventListener('click', () => $('#dlgMenu').showModal());
$('#dlgMenu').addEventListener('click', (e) => { if (e.target.closest('.menu-item')) $('#dlgMenu').close(); });
$('#btnShare').addEventListener('click', openShare);
$('#btnStats').addEventListener('click', openStats);
$('#btnAreas').addEventListener('click', openAreas);
$('#btnFeed').addEventListener('click', openFeed);
$('#btnMaint').addEventListener('click', openMaint);
$('#btnPending').addEventListener('click', openPending);
$('#btnPending2').addEventListener('click', openPending);
document.addEventListener('visibilitychange', () => { if (!document.hidden && lockEl.hidden) load(true); });

let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  // dialogs sit in the browser's top layer — move the toast inside the open dialog so it is visible
  const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  if (t.parentNode !== host) host.appendChild(t);
  t.textContent = msg; t.classList.toggle('has-act', !!action);
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label; b.onclick = (e) => { e.stopPropagation(); t.classList.remove('show'); action.fn(); }; t.appendChild(b); }
  t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 3200);
}

/* ---------- demo backend (no sheet needed) ---------- */
let demoAreas = null, demoItems = null, demoNotify = null, demoGuests = [], demoPending = [], demoFeed = {};
function demoApi(method, body) {
  if (!demoItems) {
    const t = today(), d = (n) => iso(addDays(t, n));
    demoItems = [
      { row: 6, item: 'COGS explanation vs previous quarter', status: 'In progress', area: 'Work', prio: '2 - Medium', due: d(2), topic: 'WIP', focal: 'Me', rec: 'Quarterly', com: 'Closing activity' },
      { row: 7, item: 'Fixed costs vs AOP', status: 'Not started', area: 'Work', prio: '1 - High', due: d(-1), topic: 'Comparison', focal: 'Me', rec: 'None', com: '' },
      { row: 8, item: 'Capex depreciation', status: 'Waiting', area: 'Work', prio: '1 - High', due: d(3), topic: 'Capex', focal: 'Colleague', rec: 'None', com: 'Waiting for their changes' },
      { row: 9, item: 'Pay municipal tax', status: 'Not started', area: 'Home', prio: '1 - High', due: d(0), topic: 'Bills', focal: 'Me', rec: 'Monthly', com: '' },
      { row: 10, item: 'Draft thesis results chapter', status: 'Not started', area: 'M.Sc', prio: '1 - High', due: d(12), topic: 'Thesis', focal: 'Me', rec: 'None', com: '' },
      { row: 11, item: 'Send WIP report', status: 'Done', area: 'Work', prio: '2 - Medium', due: d(-3), done: d(-3), topic: 'WIP', focal: 'Me', rec: 'None', com: '' }
    ];
  }
  if (method === 'GET') return Promise.resolve({ ok: true, role: 'owner', myDay: store.get('ai.demoDay', null) || { date: '', rows: [] }, pending: demoPending, items: JSON.parse(JSON.stringify(demoItems)), areas: demoAreas || Object.keys(AREA_C), people: ['Me', 'Colleague'], report: { manager: 'Manager', email: '', from: 'Me', area: 'Work' } });
  if (body.action === 'setDay') { store.set('ai.demoDay', body.day); return Promise.resolve({ ok: true, myDay: body.day }); }
  if (body.action === 'focusStart') return Promise.resolve({ ok: true, focus: body.session });
  if (body.action === 'focusEnd') return Promise.resolve({ ok: true, ended: true });
  if (body.action === 'getGuests' || body.action === 'saveGuest' || body.action === 'deleteGuest') {
    if (body.action === 'saveGuest') { const g = Object.assign({}, body.guest); if (g.password) g.pw = g.password; delete g.password; if (!g.id) { g.id = Math.random().toString(36).slice(2, 8); demoGuests.push(g); } else demoGuests = demoGuests.map(x => x.id === g.id ? g : x); }
    if (body.action === 'deleteGuest') demoGuests = demoGuests.filter(x => x.id !== body.id);
    return Promise.resolve({ ok: true, guests: demoGuests });
  }
  if (body.action === 'stats') return Promise.resolve({ ok: true, archived: [] });
  if (body.action === 'saveAreas') { demoItems.forEach(it => { if (body.renames[it.area] !== undefined) it.area = body.renames[it.area]; else if (body.moveTo[it.area] !== undefined) it.area = body.moveTo[it.area]; }); demoAreas = body.areas; return demoApi('GET'); }
  if (body.action === 'getFeed' || body.action === 'setFeed') { if (body.action === 'setFeed') demoFeed = body.areas === null ? {} : { url: 'https://script.google.com/macros/s/DEMO/exec?feed=demo123', areas: body.areas || [] }; return Promise.resolve(Object.assign({ ok: true }, demoFeed)); }
  if (body.action === 'getMaint' || body.action === 'saveMaint') return Promise.resolve({ ok: true, on: body.action === 'saveMaint', cfg: { archiveDays: 60, keepBackups: 14 }, lastBackup: '', lastArchive: '' });
  if (body.action === 'archiveNow') return Promise.resolve({ ok: true, moved: 0 });
  if (body.action === 'backupNow') return Promise.resolve({ ok: true, backup: { name: 'demo backup' } });
  if (body.action === 'approve' || body.action === 'reject') { demoPending = demoPending.filter(x => x.id !== body.id); return Promise.resolve({ ok: true, row: 99 }); }
  if (body.action === 'save') {
    const it = Object.assign({}, body.item);
    if (!it.row) it.row = Math.max(5, ...demoItems.map(x => x.row)) + 1;
    const i = demoItems.findIndex(x => x.row === it.row); if (i >= 0) demoItems[i] = it; else demoItems.push(it);
    return Promise.resolve({ ok: true, row: it.row });
  }
  if (body.action === 'delete') { demoItems = demoItems.filter(x => x.row !== body.row); return Promise.resolve({ ok: true }); }
  if (body.action === 'getNotify') return Promise.resolve({ ok: true, config: demoNotify || { topic: 'ai-demo-topic', rules: [], detail: 'titles' }, triggerOn: !!demoNotify, email: 'you@example.com' });
  if (body.action === 'saveNotify') { demoNotify = body.config; return Promise.resolve({ ok: true, config: demoNotify, triggerOn: true }); }
  if (body.action === 'getCal' || body.action === 'saveCal' || body.action === 'calResend') return Promise.resolve({ ok: false, error: 'demo' });
  if (body.action === 'getSiri' || body.action === 'resetSiri') return Promise.resolve({ ok: true, key: 'sk_demo' });
  if (body.action === 'notifyStatus') return Promise.resolve({ ok: true, triggerOn: !!demoNotify, lastTick: demoNotify ? new Date().toISOString() : '', log: [] });
  if (body.action === 'testNotify') return Promise.resolve({ ok: true, sent: true, title: '[Test] ' + body.rule.area + ' · today', message: '(demo — nothing was sent)' });
  return Promise.resolve({ ok: false, error: 'Unknown' });
}


/* ---------- week view ---------- */
const byTime = (a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')) || prioRank(a.prio) - prioRank(b.prio);
const weekRange = (ws) => { const we = addDays(ws, 6); return `${pad(ws.getDate())}/${pad(ws.getMonth() + 1)} – ${pad(we.getDate())}/${pad(we.getMonth() + 1)}/${we.getFullYear()}`; };
function wiHtml(it, overdue) {
  const c = areaColor(it.area) || ['#F3F4F6', '#94A3B8'];
  const h = parseFloat(it.hrs);
  return `<div class="wi" data-row="${it.row}" ${isGuest() ? '' : 'draggable="true"'} style="border-inline-start-color:${c[1]}">
    <span class="tm">${esc(it.time || '')}</span>
    <span class="t" dir="auto" title="${esc(it.item)}">${esc(it.item)}</span>
    <span class="tm">${h ? h + L('h', ' שע׳') : ''}${overdue ? ' · ' + fmt(it.due) : ''}</span>
    <button class="mv" data-mv="-1" data-r="${it.row}" aria-label="${L('Previous day', 'יום קודם')}" ${overdue ? 'hidden' : ''}>${L('‹', '›')}</button>
    <button class="mv" data-mv="1" data-r="${it.row}" aria-label="${overdue ? L('Move to today', 'העבר להיום') : L('Next day', 'יום הבא')}">${L('›', '‹')}</button></div>`;
}
function renderWeek(items) {
  const ws = addDays(weekStart(today()), 7 * weekOff);
  const open = items.filter(it => !isClosed(it));
  let html = `<div class="week-head"><button class="nav" data-wk="-1" aria-label="${L('Previous week', 'שבוע קודם')}">${L('◀', '▶')}</button>
    <div class="range">${tr(weekOff === 0 ? 'This week' : weekOff === 1 ? 'Next week' : 'Week')} · ${weekRange(ws)}</div>
    <button class="nav" data-wk="1" aria-label="${L('Next week', 'שבוע הבא')}">${L('▶', '◀')}</button></div>
    <div class="week-tools">
      <button class="chip hist" data-undo ${hist.undo.length ? '' : 'disabled'} title="Undo (Ctrl+Z)">${L('↶ Undo', '↶ ביטול')}${hist.undo.length ? ' (' + hist.undo.length + ')' : ''}</button>
      <button class="chip hist" data-redo ${hist.redo.length ? '' : 'disabled'} title="Redo (Ctrl+Y)">${L('↷ Redo', '↷ חזרה')}${hist.redo.length ? ' (' + hist.redo.length + ')' : ''}</button>
      <span class="grow"></span>
      ${weekOff !== 0 ? '<button class="chip" data-wk="0">This week</button>' : ''}${isGuest() ? '' : `<button class="btn ghost" data-ciopen>📆 ${L('From calendar', 'מהיומן')}</button>`}<button class="btn link" data-ics>📅 Export to Outlook</button></div>
    <p class="saved-note">Changes save to your sheet automatically · Undo reverses them</p><div class="week-grid">`;
  const t = today();
  const over = weekOff === 0 ? open.filter(it => parse(it.due) && parse(it.due) < t).sort(sortOpen) : [];
  if (over.length) html += `<div class="day over"><h4><b>Overdue</b><span>${over.length}</span></h4>${over.map(it => wiHtml(it, true)).join('')}</div>`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i), key = iso(d);
    const its = open.filter(it => it.due === key).sort(byTime);
    const hrs = its.reduce((s0, it) => s0 + (parseFloat(it.hrs) || 0), 0);
    html += `<div class="day ${+d === +t ? 'today' : ''}" data-date="${key}"><h4><b>${d.toLocaleDateString(locale(), { weekday: 'short' })} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${+d === +t ? ' · ' + tr('Today') : ''}</b><span>${hrs ? hrs + L('h', ' שע׳') : ''}</span></h4>
      ${its.length ? its.map(it => wiHtml(it, false)).join('') : '<div class="empty-day">—</div>'}</div>`;
  }
  return html + '</div>';
}
async function moveDay(row, delta) {
  const it = data.items.find(x => String(x.row) === String(row)); if (!it) return;
  const d = parse(it.due), t = today();
  const nd = (!d || d < t) ? t : addDays(d, delta);
  const copy = Object.assign({}, it, { due: iso(nd) });
  if (await save(copy)) toast(L(`Moved to ${fmt(copy.due, true)}`, `הועבר ל-${fmt(copy.due, true)}`));
}

/* ---------- Outlook calendar (.ics) ---------- */
let icsSel = null;
function icsWeekItems() {
  const ws = addDays(weekStart(today()), 7 * weekOff), we = addDays(ws, 6);
  return data.items.filter(it => !isClosed(it) && icsSel.indexOf(it.area) >= 0 && parse(it.due) && parse(it.due) >= ws && parse(it.due) <= we);
}
function openIcs() {
  if (!icsSel) icsSel = store.get('ai.icsAreas', null) || (ui.area !== 'All' ? [ui.area] : data.areas.slice());
  const ws = addDays(weekStart(today()), 7 * weekOff);
  $('#icsRange').textContent = L(`Week ${weekRange(ws)} — open items with a due date in this week.`, `שבוע ${weekRange(ws)} — משימות פתוחות עם תאריך יעד בשבוע הזה.`);
  refreshIcs(); $('#dlgIcs').showModal();
}
function refreshIcs() {
  $('#icsAreas').innerHTML = data.areas.map(a => `<button type="button" class="chip ${icsSel.indexOf(a) >= 0 ? 'on' : ''}" data-iarea="${esc(a)}">${esc(a)}</button>`).join('');
  const n = icsWeekItems().length;
  $('#icsCount').textContent = n ? L(`${n} item${n > 1 ? 's' : ''} will be added to your calendar.`, `${n} משימות יתווספו ללוח השנה.`) : L('No items match — pick other areas or another week.', 'אין משימות מתאימות — בחר תחומים או שבוע אחר.');
}
$('#icsAreas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-iarea]'); if (!b) return;
  const i = icsSel.indexOf(b.dataset.iarea); if (i >= 0) icsSel.splice(i, 1); else icsSel.push(b.dataset.iarea);
  store.set('ai.icsAreas', icsSel); refreshIcs();
});
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUtc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
function icsFold(line) {           // RFC 5545: max 75 octets per line
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur); return out.join('\r\n');
}
function buildIcs(items, slot, alarm) {
  const ws = addDays(weekStart(today()), 7 * weekOff);
  const stamp = icsUtc(new Date()), seq = Math.floor(Date.now() / 60000) % 2000000000;
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Action Items//amirwolf87.github.io//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Action Items'];
  const cursor = {};
  items.slice().sort((a, b) => String(a.due).localeCompare(String(b.due)) || byTime(a, b)).forEach(it => {
    const d = parse(it.due);
    const dur = Math.max(0.25, parseFloat(it.hrs) || 1);
    let start = null;
    if (it.time && /^\d{1,2}:\d{2}$/.test(it.time)) { const [hh, mm] = it.time.split(':').map(Number); start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm); }
    else if (slot) { const k = it.due; if (!cursor[k]) cursor[k] = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0); start = new Date(cursor[k]); cursor[k] = new Date(+start + dur * 3600000); }
    const desc = [it.prio && 'Priority: ' + it.prio, it.status && 'Status: ' + it.status, it.topic && 'Topic: ' + it.topic, it.com && 'Next step: ' + it.com, 'From the Action Items app'].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', `UID:ai-r${it.row}-w${iso(ws)}@action-items`, `DTSTAMP:${stamp}`, `SEQUENCE:${seq}`);
    if (start) { L.push(`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(new Date(+start + dur * 3600000))}`); }
    else { L.push(`DTSTART;VALUE=DATE:${icsDate(d)}`, `DTEND;VALUE=DATE:${icsDate(addDays(d, 1))}`); }
    L.push(`SUMMARY:${icsEsc((it.area ? '[' + it.area + '] ' : '') + it.item)}`, `DESCRIPTION:${icsEsc(desc)}`);
    if (it.area) L.push(`CATEGORIES:${icsEsc(it.area)}`);
    L.push('TRANSP:' + (start ? 'OPAQUE' : 'TRANSPARENT'));
    if (alarm && start) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(it.item)}`, 'TRIGGER:-PT15M', 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
$('#icsGo').addEventListener('click', () => {
  const items = icsWeekItems();
  if (!items.length) { toast('Nothing to export for these areas'); return; }
  const ics = buildIcs(items, $('#icsSlot').checked, $('#icsAlarm').checked);
  const ws = addDays(weekStart(today()), 7 * weekOff);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = `action-items-week-${iso(ws)}.ics`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  $('#dlgIcs').close(); toast(L(`Downloaded ${items.length} item${items.length > 1 ? 's' : ''} — open the file to add them to Outlook`, `הורדו ${items.length} משימות — פתח את הקובץ כדי להוסיף ל-Outlook`));
});

/* ---------- notifications ---------- */
const DAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], DAYS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
let ntCfg = null;
const newRule = (area, time, days, kind) => ({ id: Math.random().toString(36).slice(2, 10), on: true, area, time, days, channel: 'push', kind: kind || 'today' });
function ruleHtml(r) {
  const areas = ['All'].concat(data.areas);
  return `<div class="rule" data-id="${esc(r.id)}">
    <input type="checkbox" class="r-on" ${r.on !== false ? 'checked' : ''} title="On / off">
    <select class="r-area">${areas.map(a => `<option value="${esc(a)}" ${a === r.area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <input type="text" class="r-time time24" inputmode="numeric" placeholder="HH:MM" maxlength="5" value="${esc(r.time)}">
    <select class="r-kind"><option value="today" ${r.kind !== 'weekly' ? 'selected' : ''}>📋 Today's items</option><option value="weekly" ${r.kind === 'weekly' ? 'selected' : ''}>📊 Weekly summary</option></select>
    <select class="r-ch"><option value="push" ${r.channel === 'push' ? 'selected' : ''}>📱 Push</option><option value="email" ${r.channel === 'email' ? 'selected' : ''}>✉ Email</option><option value="both" ${r.channel === 'both' ? 'selected' : ''}>Both</option></select>
    <button type="button" class="btn ghost r-test">Test</button>
    <button type="button" class="icon-btn dark r-del" aria-label="Delete">✕</button>
    <div class="days">${(isHe() ? DAYS_HE : DAYS_EN).map((d, i) => `<button type="button" data-d="${i}" class="${r.days.indexOf(i) >= 0 ? 'on' : ''}" title="${new Date(2026, 9, 18 + i).toLocaleDateString(locale(), { weekday: 'long' })}">${d}</button>`).join('')}</div>
  </div>`;
}
function readRules() {
  return [...document.querySelectorAll('#ntRules .rule')].map(el => ({
    id: el.dataset.id, on: el.querySelector('.r-on').checked, area: el.querySelector('.r-area').value,
    time: normTime(el.querySelector('.r-time').value) || '08:00', channel: el.querySelector('.r-ch').value, kind: el.querySelector('.r-kind').value,
    days: [...el.querySelectorAll('.days .on')].map(b => Number(b.dataset.d))
  }));
}
async function openNotify() {
  $('#dlgNotify').showModal(); $('#ntStatus').textContent = 'Loading…'; $('#ntRules').innerHTML = '';
  try {
    const j = await api('POST', { action: 'getNotify' });
    ntCfg = j.config;
    let rules = ntCfg.rules || [];
    const fresh = !rules.length;
    if (fresh) rules = [newRule('Work', '08:30', [0, 1, 2, 3, 4]), newRule('Home', '07:00', [0, 1, 2, 3, 4]), newRule('Home', '08:00', [5, 6]), newRule('Work', '15:00', [4], 'weekly')];
    $('#ntTopic').textContent = ntCfg.topic; $('#ntWeb').href = 'https://ntfy.sh/' + encodeURIComponent(ntCfg.topic); $('#ntDiagOut').hidden = true; $('#ntToken').value = ''; ntTokenSet = undefined; $('#ntTokenState').textContent = j.hasToken ? '✅ ' + (j.tokenHint || '') : L('— recommended', '— מומלץ'); $('#ntFallback').checked = ntCfg.fallbackEmail !== false; $('#ntDetail').value = ntCfg.detail || 'titles';
    $('#ntSugOn').checked = !ntCfg.onSuggest || ntCfg.onSuggest.on !== false; $('#ntSugCh').value = (ntCfg.onSuggest && ntCfg.onSuggest.channel) || 'push';
    $('#ntRules').innerHTML = rules.map(ruleHtml).join('');
    $('#ntStatus').textContent = fresh ? L('Suggested schedules — adjust and press Save.', 'תזמונים מוצעים — התאם ולחץ שמירה.')
      : (j.triggerOn ? L('✓ Notifications are active.', '✓ ההתראות פעילות.') : L('Saved schedules found, but notifications are not switched on yet — press Save.', 'נמצאו תזמונים שמורים, אבל ההתראות עוד לא הופעלו — לחץ שמירה.'));
  } catch (e) { $('#ntStatus').textContent = e.message; }
}
$('#ntRules').addEventListener('click', async (e) => {
  const day = e.target.closest('.days button'); if (day) { day.classList.toggle('on'); return; }
  const del = e.target.closest('.r-del'); if (del) { del.closest('.rule').remove(); return; }
  const test = e.target.closest('.r-test');
  if (test) {
    const id = test.closest('.rule').dataset.id, r = readRules().find(x => x.id === id);
    test.disabled = true; test.textContent = 'Sending…';
    try {
      if (ntCfg && $('#ntTopic').textContent) await api('POST', { action: 'saveNotify', config: currentNotify() });
      const j = await api('POST', { action: 'testNotify', rule: r });
      $('#ntStatus').innerText = `Sent: ${j.title}\n${j.message}`; toast('Test sent — check your phone');
    } catch (err) { $('#ntStatus').textContent = L('Test failed: ', 'הבדיקה נכשלה: ') + ntExplain(err.message); }
    finally { test.disabled = false; test.textContent = 'Test'; }
  }
});
function ntExplain(m) {
  m = String(m || '');
  if (/NOT_AUTHORIZED|permission|authoriz/i.test(m)) return L(
    'Google has not yet allowed the script to send push messages. Open the sheet › ✉ Manager Report › "App: send a test push (and authorize)", approve the permissions, then Deploy › Manage deployments › ✏ › New version.',
    'גוגל עוד לא אישרה לסקריפט לשלוח התראות. פתח את הגיליון › ✉ Manager Report › "App: send a test push (and authorize)", אשר את ההרשאות, ואז Deploy › Manage deployments › ✏ › New version.');
  const mailed = /EMAIL_SENT/.test(m) ? L(' (It was sent to your email instead.)', ' (ההודעה נשלחה במקום זה למייל שלך.)') : '';
  if (/\b429\b|limit reached|quota/i.test(m)) return L(
    'ntfy.sh daily limit reached. Without an account, ntfy counts messages per sending address, and Google\'s servers are shared with many other users, so the free quota is already used up. Fix: open "🔑 ntfy account token" above, create a free token and press Save.',
    'הגעת למגבלה היומית של ntfy.sh. בלי חשבון, ntfy סופר הודעות לפי כתובת השולח, והשרתים של גוגל משותפים להרבה משתמשים אחרים, כך שהמכסה החינמית כבר נוצלה. הפתרון: פתח למעלה את "🔑 טוקן חשבון ntfy", צור טוקן חינמי ולחץ שמירה.') + mailed;
  if (/\b401\b|\b403\b|unauthorized|forbidden/i.test(m)) return L('ntfy.sh rejected the token — create a new one at ntfy.sh/account and paste it again.', 'ntfy.sh דחה את הטוקן — צור טוקן חדש ב-ntfy.sh/account והדבק אותו שוב.') + mailed;
  if (/Unknown action/i.test(m)) return L('The script in the sheet is an older version — paste the new ActionItems_Script.gs and deploy a new version.', 'הסקריפט בגיליון בגרסה ישנה — הדבק את ActionItems_Script.gs החדש ופרסם גרסה חדשה (New version).');
  return m;
}
$('#ntDirect').addEventListener('click', async () => {
  const topic = $('#ntTopic').textContent; if (!topic) return;
  const b = $('#ntDirect'); b.disabled = true;
  try {
    const r = await fetch('https://ntfy.sh/' + encodeURIComponent(topic) + '?title=' + encodeURIComponent(L('✅ Test from the app', '✅ בדיקה מהאפליקציה')) + '&tags=white_check_mark',
      { method: 'POST', body: L('If you see this, the ntfy app on your phone is set up correctly.', 'אם ההודעה הזו הגיעה — אפליקציית ntfy בטלפון מוגדרת נכון.') });
    if (!r.ok) throw new Error('ntfy.sh ' + r.status);
    $('#ntStatus').innerText = L('✓ Sent straight to ntfy. Did it arrive on the phone?\n• Yes → the phone is fine; if scheduled alerts still don\'t come, press 🩺 Check status.\n• No → in the ntfy app check the subscription is exactly this topic on server ntfy.sh, and that notifications for ntfy are allowed in the phone settings.',
      '✓ נשלח ישירות ל-ntfy. האם זה הגיע לטלפון?\n• כן ← הטלפון מוגדר נכון; אם ההתראות המתוזמנות עדיין לא מגיעות, לחץ 🩺 בדיקת מצב.\n• לא ← באפליקציית ntfy בדוק שהמנוי הוא בדיוק לנושא הזה בשרת ntfy.sh, ושההתראות של ntfy מאושרות בהגדרות הטלפון.');
  } catch (e) { $('#ntStatus').textContent = L('Could not reach ntfy.sh: ', 'אין גישה ל-ntfy.sh: ') + e.message; }
  finally { b.disabled = false; }
});
$('#ntDiag').addEventListener('click', async () => {
  const out = $('#ntDiagOut'); out.hidden = false; out.textContent = L('Checking…', 'בודק…');
  try {
    const j = await api('POST', { action: 'notifyStatus' });
    const ago = (iso) => { if (!iso) return L('never', 'אף פעם'); const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? L('just now', 'עכשיו') : m < 120 ? L(`${m} min ago`, `לפני ${m} דק׳`) : new Date(iso).toLocaleString(isHe() ? 'he-IL' : 'en-GB', { hour12: false }); };
    const tickOk = j.lastTick && (Date.now() - new Date(j.lastTick)) < 20 * 60000;
    let h = `<div>${j.triggerOn ? '✅' : '❌'} ${L('Schedule switched on', 'התזמון מופעל')}</div>`;
    h += `<div>${tickOk ? '✅' : '⚠️'} ${L('Last scheduled check', 'בדיקה מתוזמנת אחרונה')}: ${esc(ago(j.lastTick))}</div>`;
    if (!j.triggerOn) h += `<p class="hint">${L('Press Save below to switch it on.', 'לחץ שמירה למטה כדי להפעיל.')}</p>`;
    else if (!tickOk) h += `<p class="hint">${L('The schedule exists but hasn\'t run recently (it runs every 5 min). If you just pasted the new script, wait 5 minutes and check again.', 'התזמון קיים אבל לא רץ לאחרונה (הוא רץ כל 5 דקות). אם הרגע הדבקת את הסקריפט החדש — חכה 5 דקות ובדוק שוב.')}</p>`;
    h += `<div class="nt-h">${L('Last push messages sent by the sheet', 'הודעות אחרונות שהגיליון שלח')}</div>`;
    h += (j.log || []).length ? j.log.map(x => `<div>${x.ok ? '✅' : x.via === 'email' ? '✉️' : '❌'} <small>${esc(ago(x.at))}</small> — ${esc(x.title)}${x.ok ? '' : `<br><small class="err">${esc(ntExplain(x.err))}</small>`}</div>`).join('')
      : `<div class="hint">${L('None yet — press "Test" on a schedule below.', 'עדיין אין — לחץ "בדיקה" באחד התזמונים למטה.')}</div>`;
    out.innerHTML = h;
  } catch (e) { out.textContent = ntExplain(e.message); }
});
$('#ntAdd').addEventListener('click', () => { $('#ntRules').insertAdjacentHTML('beforeend', ruleHtml(newRule('Work', '08:00', [0, 1, 2, 3, 4]))); });
$('#ntCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#ntTopic').textContent); toast('Topic copied'); } catch (e) { toast('Select the topic and copy it'); } });
let ntTokenSet;
$('#ntTokenClear').addEventListener('click', () => { $('#ntToken').value = ''; ntTokenSet = ''; $('#ntTokenState').textContent = L('— will be removed on Save', '— יוסר בשמירה'); });
const currentNotify = () => ({ token: $('#ntToken').value.trim() ? $('#ntToken').value.trim() : ntTokenSet, fallbackEmail: $('#ntFallback').checked, topic: $('#ntTopic').textContent, detail: $('#ntDetail').value, onSuggest: { on: $('#ntSugOn').checked, channel: $('#ntSugCh').value }, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem', rules: readRules() });
$('#ntSave').addEventListener('click', async () => {
  const cfg = currentNotify();
  const bad = cfg.rules.find(r => r.on && !r.days.length);
  if (bad) { $('#ntStatus').textContent = 'Pick at least one day for each schedule.'; return; }
  $('#ntStatus').textContent = 'Saving…';
  try {
    const j = await api('POST', { action: 'saveNotify', config: cfg });
    ntCfg = j.config; if (cfg.token) { $('#ntToken').value = ''; $('#ntTokenState').textContent = '✅'; } else if (cfg.token === '') $('#ntTokenState').textContent = L('— recommended', '— מומלץ'); ntTokenSet = undefined;
    $('#ntStatus').textContent = j.triggerOn ? L('✓ Saved — notifications are active.', '✓ נשמר — ההתראות פעילות.') : (j.note || tr('Saved'));
    toast('Notification schedules saved');
  } catch (e) { $('#ntStatus').textContent = 'Not saved: ' + e.message; }
});



/* ---------- offline queue ---------- */
const queue = () => store.get('ai.queue', []) || [];
function queuePush(body) { const q = queue(); q.push(body); store.set('ai.queue', q); toast(L('Offline — saved on this device, will sync later', 'אין חיבור — נשמר במכשיר ויסונכרן אחר כך')); }
let flushing = false;
async function flushQueue() {
  if (flushing || settings.demo || !queue().length || !navigator.onLine) return;
  flushing = true;
  try {
    let q = queue();
    while (q.length) {
      const b = q[0];
      const res = await fetch(settings.url, { method: 'POST', body: JSON.stringify(Object.assign({ username, password }, b)) });
      const j = await res.json(); if (!j.ok && j.auth) break;
      q.shift(); store.set('ai.queue', q);
    }
    if (!q.length) toast(L('Offline changes synced ✓', 'השינויים מהמצב הלא-מקוון סונכרנו ✓'));
  } catch (e) { /* still offline */ }
  flushing = false;
}
window.addEventListener('online', () => { if (lockEl.hidden) load(true); });

/* ---------- waiting & reminders ---------- */
function waitDays(it) {
  if (it.status !== 'Waiting') return null;
  const d = parse(it.wsince) || parse(it.created); if (!d) return null;
  return Math.max(0, dayDiff(today(), d));
}
function updateWaitBox(v) {
  const box = $('#waitBox'); if (!box) return;
  if (v.status !== 'Waiting' || isGuest()) { box.hidden = true; return; }
  const d = waitDays(Object.assign({ wsince: v.wsince || iso(today()) }, v)) || 0;
  $('#waitInfo').textContent = L(`⏳ Waiting${v.focal && v.focal !== 'Me' ? ' on ' + v.focal : ''} for ${d} day${d === 1 ? '' : 's'}`, `⏳ ממתין${v.focal && v.focal !== 'Me' ? ' ל' + v.focal : ''} ${d} ימים`);
  box.hidden = false;
}
$('#btnNudge').addEventListener('click', async () => {
  const name = F('focal').value && F('focal').value !== 'Me' ? F('focal').value : '';
  const since = editing && editing.wsince ? fmt(editing.wsince) : '';
  const text = isHe()
    ? `היי${name ? ' ' + name : ''}, תזכורת קטנה לגבי "${F('item').value}"${since ? ` (ממתין מ-${since})` : ''}. אשמח לעדכון כשתוכל/י. תודה!`
    : `Hi${name ? ' ' + name : ''}, a quick reminder about "${F('item').value}"${since ? ` (waiting since ${since})` : ''}. Could you update me when you can? Thanks!`;
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { /* cancelled */ }
  try { await navigator.clipboard.writeText(text); toast(L('Reminder text copied — paste it in WhatsApp / Teams / email', 'נוסח התזכורת הועתק — הדבק בוואטסאפ / Teams / מייל')); }
  catch (e) { prompt(L('Copy this reminder:', 'העתק את התזכורת:'), text); }
});

/* ---------- checklist ---------- */
let curCl = [];
function renderCl() {
  const ro = isGuest();
  $('#clList').innerHTML = curCl.map((x, i) => `<div class="cl-row ${x.d ? 'done' : ''}"><input type="checkbox" data-cli="${i}" ${x.d ? 'checked' : ''} ${ro ? 'disabled' : ''}><span dir="auto">${esc(x.t)}</span>${ro ? '' : `<button type="button" data-cldel="${i}" aria-label="Remove">✕</button>`}</div>`).join('');
  $('#clCount').textContent = curCl.length ? `${curCl.filter(x => x.d).length}/${curCl.length}` : '';
}
function addCl() { const v = $('#clNew').value.trim(); if (!v) return; curCl.push({ t: v, d: false }); $('#clNew').value = ''; renderCl(); $('#clNew').focus(); }
$('#clAddBtn').addEventListener('click', addCl);
$('#clNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCl(); } });
$('#clList').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cli]'); if (c) { curCl[+c.dataset.cli].d = c.checked; renderCl(); return; }
  const d = e.target.closest('[data-cldel]'); if (d) { curCl.splice(+d.dataset.cldel, 1); renderCl(); }
});

/* ---------- snooze & drag-and-drop ---------- */
async function snooze(row) {
  const it = data.items.find(x => String(x.row) === String(row)); if (!it) return;
  const d = parse(it.due), t = today();
  const nd = (!d || d <= t) ? addDays(t, 1) : addDays(d, 1);
  const copy = Object.assign({}, it, { due: iso(nd) });
  if (await save(copy)) toast(L(`Deferred to ${fmt(copy.due, true)}`, `נדחה ל-${fmt(copy.due, true)}`), { label: L('↶ Undo', '↶ ביטול'), fn: undo });
}
let dragRow = null;
document.addEventListener('dragstart', (e) => { const w = e.target.closest && e.target.closest('.wi[draggable=true]'); if (!w) return; dragRow = w.dataset.row; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragRow); } catch (err) { /* ignore */ } });
document.addEventListener('dragover', (e) => { const d = e.target.closest && e.target.closest('.day[data-date]'); if (!d || !dragRow) return; e.preventDefault(); document.querySelectorAll('.day.drop').forEach(x => x !== d && x.classList.remove('drop')); d.classList.add('drop'); });
document.addEventListener('dragleave', (e) => { const d = e.target.closest && e.target.closest('.day[data-date]'); if (d && !d.contains(e.relatedTarget)) d.classList.remove('drop'); });
document.addEventListener('drop', async (e) => {
  const d = e.target.closest && e.target.closest('.day[data-date]'); if (!d || !dragRow) return;
  e.preventDefault(); d.classList.remove('drop');
  const it = data.items.find(x => String(x.row) === String(dragRow)); dragRow = null;
  if (!it || it.due === d.dataset.date) return;
  if (await save(Object.assign({}, it, { due: d.dataset.date }))) toast(L(`Moved to ${fmt(d.dataset.date, true)}`, `הועבר ל-${fmt(d.dataset.date, true)}`));
});
document.addEventListener('dragend', () => { dragRow = null; document.querySelectorAll('.day.drop').forEach(x => x.classList.remove('drop')); });

/* ---------- 24-hour time ---------- */
/* "930" → 09:30 · "17" → 17:00 · "9:5" ✗ · "5pm" → 17:00 · "17.30" → 17:30 ; returns '' for empty, null if invalid */
function normTime(v) {
  v = String(v || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!v) return '';
  let m = v.match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/) || v.match(/^(\d{1,2})(\d{2})(am|pm)?$/);
  if (!m) return null;
  let h = +m[1]; const mi = m[2] ? +m[2] : 0;
  if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return pad(h) + ':' + pad(mi);
}
document.addEventListener('focusout', (e) => {
  if (!e.target.classList || !e.target.classList.contains('time24')) return;
  const n = normTime(e.target.value);
  if (n === null) { e.target.classList.add('bad'); toast(L('Use 24-hour time HH:MM, e.g. 08:30 or 17:00', 'הזן שעה בפורמט 24 שעות HH:MM, למשל 08:30 או 17:00')); }
  else { e.target.classList.remove('bad'); e.target.value = n; }
});

/* ---------- quick add ---------- */
function areaFromWord(w) {
  const x = w.toLowerCase();
  return data.areas.find(a => a.toLowerCase() === x || a.toLowerCase().startsWith(x) || (HE[a] && (HE[a] === w || HE[a].startsWith(w))));
}
/* built-in hints per area (English + Hebrew); your own past items teach it more */
const AREA_HINTS = {
  'Work': 'work report forecast budget capex opex p&l pnl cogs wip aop sap fp&a closing month-end quarter audit invoice po pr meeting presentation deck excel kpi bu fab tower ezra manager client vendor depreciation asset cost costs revenue variance plan madan grant עבודה דוח דו"ח תחזית תקציב ישיבה פגישה מצגת סגירה רבעון ספק לקוח הזמנה חשבונית פחת נכס עלויות הכנסות מנהל טאואר',
  'Home': 'home house buy groceries shopping clean cleaning laundry fix repair boiler plumber electrician arnona bill bills water electricity gas garden furniture paint kitchen bathroom apartment rent neta בית קניות סופר לקנות לנקות ניקיון כביסה לתקן תיקון בוילר דוד אינסטלטור חשמלאי ארנונה חשבון חשבונות מים חשמל גז גינה רהיטים צבע מטבח מקלחת דירה שכירות נטע',
  'Personal': 'car insurance license haircut passport renew hobby book read run personal רכב ביטוח רישיון תספורת דרכון לחדש תחביב ספר אישי טסט מוסך',
  'M.Sc': 'thesis paper course exam lecture homework assignment seminar professor advisor university tau research model dataset msc תזה מאמר קורס מבחן הרצאה עבודה-אקדמית תרגיל סמינר מנחה אוניברסיטה מחקר מודל תואר',
  'Reserve Duty': 'reserve miluim unit army base duty מילואים צו יחידה בסיס צבא שמ"פ',
  'Family': 'kids children parents mom dad birthday family visit school kindergarten grandma grandpa ילדים הורים אמא אבא יום-הולדת יומולדת משפחה ביקור בית-ספר גן סבתא סבא',
  'Finance': 'bank invest investment savings pension tax taxes mortgage loan stock stocks fund salary pay-slip בנק להשקיע השקעה חיסכון פנסיה מס מיסים משכנתא הלוואה מניות קרן משכורת תלוש כסף',
  'Health': 'doctor dentist clinic appointment gym workout medicine pharmacy test checkup רופא רופאה שיניים קופת מרפאה תור חדר-כושר אימון תרופה בית-מרקחת בדיקה'
};
const words = (x) => String(x || '').toLowerCase().replace(/["'׳״.,!?()\[\]:;]/g, ' ').split(/\s+/).filter(w => w.length > 1);
/* score each area: built-in hints + words from your own items in that area (+ the person) */
function guessArea(text, focal) {
  const ws = words(text); if (!ws.length) return null;
  const score = {};
  data.areas.forEach(a => {
    let sc = 0;
    const hints = ((AREA_HINTS[a] || '') + ' ' + ((data.areaHints || {})[a] || '') + ' ' + a + ' ' + (HE[a] || '')).toLowerCase().replace(/,/g, ' ').split(/\s+/);
    ws.forEach(w => { if (hints.some(h => h && (h === w || (h.length > 3 && (w.startsWith(h) || h.startsWith(w)) && Math.min(h.length, w.length) >= 4)))) sc += 2; });
    score[a] = sc;
  });
  // learn from existing items
  const freq = {};
  data.items.forEach(it => { if (!it.area) return; words(it.item + ' ' + (it.topic || '')).forEach(w => { (freq[w] = freq[w] || {})[it.area] = (freq[w][it.area] || 0) + 1; }); });
  ws.forEach(w => { const f = freq[w]; if (!f) return; const tot = Object.values(f).reduce((x, y) => x + y, 0); Object.keys(f).forEach(a => { if (score[a] !== undefined) score[a] += 2 * f[a] / tot; }); });
  if (focal && focal !== 'Me') {
    const byP = data.items.filter(it => it.focal && it.focal.toLowerCase() === focal.toLowerCase());
    byP.forEach(it => { if (score[it.area] !== undefined) score[it.area] += 1.5 / byP.length * 2; });
  }
  const ranked = Object.entries(score).sort((x, y) => y[1] - x[1]);
  const [best, second] = ranked;
  if (!best || best[1] < 1.5 || (second && best[1] - second[1] < 1)) return { area: null, ranked };
  return { area: best[0], ranked };
}
const WD = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const WD_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
function parseQuick(text) {
  let s = ' ' + text + ' ';
  const out = { item: '', due: '', time: '', prio: '', area: '', focal: '', hrs: '', auto: false };
  const take = (re, fn) => { s = s.replace(re, (...m) => { const r = fn(...m); return r === false ? m[0] : ' '; }); };
  take(/\s!([123])(?=\s)/, (m, p) => { out.prio = PRIO[+p - 1]; });
  take(/\s#(\S+)(?=\s)/, (m, w) => { const a = areaFromWord(w); if (!a) return false; out.area = a; });
  take(/\s@(\S+)(?=\s)/, (m, w) => { out.focal = w; });
  take(/\s~(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|ש|שע|שעות|ש׳|שע׳)?(?=\s)/i, (m, h) => { out.hrs = h; });
  // times (24h): 9:30 · 17:00 · ב-9:30 · בשעה 17 · at 9 · 5pm · 17.30 after at/בשעה
  take(/\s(?:at\s+|ב-?|בשעה\s+|@)?(\d{1,2}):(\d{2})(?:\s?(am|pm))?(?=\s)/i, (m, h, mi, ap) => { const n = normTime(h + ':' + mi + (ap || '')); if (!n) return false; out.time = n; });
  if (!out.time) take(/\s(?:at\s+|בשעה\s+|ב-)(\d{1,2})(?:[.](\d{2}))?(?:\s?(am|pm))?(?=\s)/i, (m, h, mi, ap) => { const n = normTime(h + (mi ? ':' + mi : '') + (ap || '')); if (!n) return false; out.time = n; });
  if (!out.time) take(/\s(\d{1,2})\s?(am|pm)(?=\s)/i, (m, h, ap) => { const n = normTime(h + ap); if (!n) return false; out.time = n; });
  const t = today();
  take(/\s(?:on\s+|ב-?|עד\s+)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/i, (m, d, mo, y) => {
    const yr = y ? (+y < 100 ? 2000 + +y : +y) : t.getFullYear(); let dt = new Date(yr, +mo - 1, +d);
    if (dt.getMonth() !== +mo - 1) return false; if (!y && dt < t) dt = new Date(yr + 1, +mo - 1, +d); out.due = iso(dt);
  });
  if (!out.due) take(/\s(today|היום)(?=\s)/i, () => { out.due = iso(t); });
  if (!out.due) take(/\s(tomorrow|tmrw|מחר)(?=\s)/i, () => { out.due = iso(addDays(t, 1)); });
  if (!out.due) take(/\s(next week|(?:ב)?שבוע הבא)(?=\s)/i, () => { out.due = iso(addDays(weekStart(t), 7)); });
  if (!out.due) take(/\s(?:on\s+)?(sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)(?=\s)/i,
    (m, w) => { out.due = iso(addDays(t, (WD[w.toLowerCase()] - t.getDay() + 7) % 7)); });
  // Hebrew weekday only with "יום"/"ביום"/"ב" in front (so "תואר שני" is not Monday)
  if (!out.due) take(/\s(?:ביום\s+|יום\s+|ב)(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?=\s)/, (m, w) => { out.due = iso(addDays(t, (WD_HE.indexOf(w) - t.getDay() + 7) % 7)); });
  out.item = s.replace(/\s+/g, ' ').trim();
  if (!out.area) { const g = guessArea(out.item, out.focal); if (g && g.area) { out.area = g.area; out.auto = true; } }
  return out;
}
function qaPreview() {
  const v = $('#qa').value.trim(); if (!v) { $('#qaPreview').innerHTML = ''; return; }
  const p = parseQuick(v);
  $('#qaPreview').innerHTML = [p.due && `<span>📅 ${fmt(p.due, true)}</span>`, p.time && `<span>🕘 ${p.time}</span>`,
    p.area ? pill(p.area, areaColor(p.area)) + (p.auto ? `<span title="${L('detected automatically', 'זוהה אוטומטית')}">✨</span>` : '') : `<span>❓ ${L('area: will ask', 'תחום: אשאל אותך')}</span>`,
    p.prio && pill(p.prio.replace(/^\d - /, ''), PRIO_C[p.prio.charAt(0)]), p.focal && `<span>👤 ${esc(p.focal)}</span>`, p.hrs && `<span>⏱ ${p.hrs}h</span>`]
    .filter(Boolean).join('');
}
/* ask which area when it can't be detected */
function askArea(item, ranked) {
  return new Promise(resolve => {
    const d = $('#dlgArea'), sel = $('#areaPick');
    const order = (ranked || []).map(r => r[0]).filter(a => data.areas.includes(a));
    const opts = order.concat(data.areas.filter(a => !order.includes(a)));
    sel.innerHTML = opts.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    sel.value = ui.area !== 'All' && data.areas.includes(ui.area) ? ui.area : opts[0];
    $('#areaItem').textContent = item;
    let done = false; const fin = (v) => { if (done) return; done = true; if (d.open) d.close(); resolve(v); };
    $('#areaOk').onclick = () => fin(sel.value); $('#areaCancel').onclick = () => fin(null); d.oncancel = () => fin(null);
    d.showModal(); setTimeout(() => sel.focus(), 50);
  });
}
$('#qa').addEventListener('input', qaPreview);
$('#quickAdd').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $('#qa').value.trim(); if (!v) return;
  const p = parseQuick(v); if (!p.item) { toast(L('Write what needs doing', 'כתוב מה צריך לעשות')); return; }
  let area = p.area;
  if (!area) { const g = guessArea(p.item, p.focal); area = await askArea(p.item, g && g.ranked); if (!area) return; }
  const it = { item: p.item, status: 'Not started', area, prio: p.prio || '2 - Medium',
    due: p.due, time: p.time, focal: p.focal || 'Me', hrs: p.hrs, rec: 'None', created: iso(today()) };
  $('#qa').value = ''; qaPreview(); if ($('#dlgQuick').open) $('#dlgQuick').close();
  if (await save(it)) toast(L(`Added to ${it.area}: ${it.item}`, `נוסף ל${tr(it.area)}: ${it.item}`));
});


/* ---------- manage areas ---------- */
function areaRow(name, orig, hints) {
  const c = areaColor(name || orig || 'x') || ['#F3F4F6', '#6B7280'];
  return `<div class="ar-row" data-orig="${esc(orig || '')}">
    <span class="ar-dot" style="background:${c[1]}"></span>
    <input class="ar-name" value="${esc(name)}" placeholder="${L('Area name', 'שם התחום')}" maxlength="30" dir="auto">
    <input class="ar-hints" value="${esc(hints || '')}" placeholder="${L('Keywords for quick add (optional)', 'מילות מפתח להוספה מהירה (לא חובה)')}" dir="auto">
    <span class="ar-count">${orig ? data.items.filter(it => it.area === orig && !isClosed(it)).length : 0}</span>
    <button type="button" class="icon-btn dark" data-arup aria-label="Up">↑</button>
    <button type="button" class="icon-btn dark" data-ardown aria-label="Down">↓</button>
    <button type="button" class="icon-btn dark" data-ardel aria-label="Remove">✕</button></div>`;
}
let areasRemoved = [];
function openAreas() {
  areasRemoved = [];
  $('#areaRows').innerHTML = data.areas.map(a => areaRow(a, a, (data.areaHints || {})[a])).join('');
  $('#areasStatus').textContent = '';
  $('#dlgAreas').showModal();
}
$('#areaRows').addEventListener('click', (e) => {
  const row = e.target.closest('.ar-row'); if (!row) return;
  if (e.target.closest('[data-ardel]')) { if (row.dataset.orig) areasRemoved.push(row.dataset.orig); row.remove(); }
  if (e.target.closest('[data-arup]') && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
  if (e.target.closest('[data-ardown]') && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
});
$('#areaAdd').addEventListener('click', () => { $('#areaRows').insertAdjacentHTML('beforeend', areaRow('', '', '')); $('#areaRows .ar-row:last-child .ar-name').focus(); });
function askMove(from, count, options) {
  return new Promise(resolve => {
    const d = $('#dlgMoveArea');
    $('#moveMsg').textContent = L(`"${from}" still has ${count} open item(s). Move them to:`, `ב"${tr(from)}" יש עדיין ${count} משימות פתוחות. להעביר אותן ל:`);
    $('#movePick').innerHTML = options.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('') + `<option value="">${L('— no area —', '— ללא תחום —')}</option>`;
    let done = false; const fin = (v) => { if (done) return; done = true; if (d.open) d.close(); resolve(v); };
    $('#moveOk').onclick = () => fin($('#movePick').value); $('#moveCancel').onclick = () => fin(null); d.oncancel = () => fin(null);
    d.showModal();
  });
}
$('#areasSave').addEventListener('click', async () => {
  const rows = [...document.querySelectorAll('#areaRows .ar-row')];
  const areas = rows.map(r => r.querySelector('.ar-name').value.trim()).filter(Boolean);
  if (!areas.length) { $('#areasStatus').textContent = L('Keep at least one area.', 'השאר לפחות תחום אחד.'); return; }
  if (new Set(areas.map(a => a.toLowerCase())).size !== areas.length) { $('#areasStatus').textContent = L('Two areas have the same name.', 'יש שני תחומים עם אותו שם.'); return; }
  const renames = {}, hints = {};
  rows.forEach(r => { const o = r.dataset.orig, n = r.querySelector('.ar-name').value.trim(); if (o && n && o !== n) renames[o] = n; if (o && !n) areasRemoved.push(o); if (n) hints[n] = r.querySelector('.ar-hints').value.trim(); });
  const moveTo = {};
  for (const a of [...new Set(areasRemoved)]) {
    const cnt = data.items.filter(it => it.area === a && !isClosed(it)).length;
    const any = data.items.filter(it => it.area === a).length;
    if (!any) continue;
    if (cnt) { const target = await askMove(a, cnt, areas); if (target === null) return; moveTo[a] = target; }
    else moveTo[a] = '';
  }
  $('#areasStatus').textContent = tr('Saving…');
  try {
    const j = await api('POST', { action: 'saveAreas', areas, renames, moveTo, hints });
    applyList(j); render(); $('#dlgAreas').close();
    toast(L(`Areas saved${j.moved ? ` · ${j.moved} item(s) updated` : ''}`, `התחומים נשמרו${j.moved ? ` · ${j.moved} משימות עודכנו` : ''}`));
  } catch (err) { $('#areasStatus').textContent = err.message; }
});

/* ---------- order of areas (tabs on the main screen and in the Notebook) ---------- */
const ORDER_BTN = (cls = 'chip') => isGuest() ? '' : `<button class="${cls} ord-btn" data-order title="${esc(L('Change the order of the areas', 'שינוי סדר התחומים'))}">⇅ ${L('Order', 'סדר')}</button>`;
$('#btnOrder').addEventListener('click', openOrder);
function openOrder() {
  $('#ordStatus').textContent = '';
  $('#ordList').innerHTML = data.areas.map(a => { const c = areaColor(a) || ['#E5E7EB', '#374151'];
    return `<li class="ord-row" data-a="${esc(a)}"><span class="ord-handle" aria-hidden="true">☰</span><span class="ord-name" style="background:${c[0]};color:${c[1]}">${esc(tr(a))}</span>
      <button type="button" class="icon-btn dark" data-ou aria-label="${esc(L('Move up', 'הזז למעלה'))}">↑</button><button type="button" class="icon-btn dark" data-od aria-label="${esc(L('Move down', 'הזז למטה'))}">↓</button></li>`; }).join('');
  $('#dlgOrder').showModal();
}
$('#ordList').addEventListener('click', (e) => {
  const row = e.target.closest('.ord-row'); if (!row) return;
  if (e.target.closest('[data-ou]') && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
  if (e.target.closest('[data-od]') && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
});
// drag with finger or mouse on the ☰ handle
let ordDrag = null;
$('#ordList').addEventListener('pointerdown', (e) => {
  const h = e.target.closest('.ord-handle'); if (!h) return;
  e.preventDefault(); ordDrag = h.closest('.ord-row'); ordDrag.classList.add('dragging'); h.setPointerCapture(e.pointerId);
});
$('#ordList').addEventListener('pointermove', (e) => {
  if (!ordDrag) return;
  const rows = [...$('#ordList').children].filter(r => r !== ordDrag);
  const after = rows.find(r => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
  if (after) $('#ordList').insertBefore(ordDrag, after); else $('#ordList').appendChild(ordDrag);
});
const ordEnd = () => { if (ordDrag) { ordDrag.classList.remove('dragging'); ordDrag = null; } };
$('#ordList').addEventListener('pointerup', ordEnd); $('#ordList').addEventListener('pointercancel', ordEnd);
$('#ordSave').addEventListener('click', async () => {
  const areas = [...$('#ordList').children].map(r => r.dataset.a);
  if (areas.join('\u0001') === data.areas.join('\u0001')) { $('#dlgOrder').close(); return; }
  const prev = data.areas; data.areas = areas; render();               // show the new order right away
  $('#ordStatus').textContent = tr('Saving…'); $('#ordSave').disabled = true;
  try {
    const j = await api('POST', { action: 'saveAreas', areas, renames: {}, moveTo: {}, hints: data.areaHints || {} });
    applyList(j); render(); $('#dlgOrder').close(); toast(L('Order saved', 'הסדר נשמר'));
  } catch (err) { data.areas = prev; render(); $('#ordStatus').textContent = err.message; }
  finally { $('#ordSave').disabled = false; }
});

/* ---------- 🎙 Siri / iPhone Shortcuts ---------- */
let siriKey = '';
let calCfg = { names: [], map: {} };
const COLL_DEFAULT = [{ id: 'food', name: '🍽 מסעדות', kind: 'try', map: true }, { id: 'trip', name: '🧭 טיולים', kind: 'try', map: true }, { id: 'activity', name: '🎯 פעילויות', kind: 'try', map: true }, { id: 'recipe', name: '🍳 מתכונים', kind: 'try', map: false }, { id: 'drink', name: '🍸 קוקטיילים ומשקאות', kind: 'try', map: false }, { id: 'wish', name: '🎁 משאלות', kind: 'wish', map: false }, { id: 'story', name: '💬 אנקדוטות', kind: 'note', map: false }];
let coll = [], collCats = COLL_DEFAULT.slice();
async function openSiri() {
  const box = $('#siriBody'); $('#dlgSiri').showModal();
  if (settings.demo) { box.innerHTML = `<p class="hint">${L('Connect your sheet first — Siri adds items straight into it.', 'חבר קודם את הגיליון — סירי מוסיפה משימות ישירות אליו.')}</p>`; return; }
  box.innerHTML = `<p class="hint">${tr('Loading…')}</p>`;
  try { siriKey = (await api('POST', { action: 'getSiri' })).key; }
  catch (e) { box.innerHTML = `<p class="hint">${esc(/Unknown action/i.test(e.message) ? L('Paste the new ActionItems_Script.gs into Apps Script and deploy a new version first.', 'קודם הדבק את ActionItems_Script.gs החדש ב-Apps Script ופרסם גרסה חדשה (New version).') : e.message)}</p>`; return; }
  const areaNames = [L('auto', 'אוטומטי')].concat(data.areas.map(a => tr(a)));
  const H = isHe();
  const step = (n, t) => `<li><b>${n}</b> ${t}</li>`;
  box.innerHTML = `
    <p class="hint">${L('Say “Hey Siri, new task”, dictate it, and it lands in your list. Items with no date go to the 📒 Notebook; “today” / “tomorrow” set the date. The area is the one you pick in the shortcut, or guessed from the words.',
      'אומרים "היי סירי, משימה חדשה", מכתיבים, והמשימה נכנסת לרשימה. משימה בלי תאריך נכנסת ל📒 פנקס; "היום" / "מחר" / "מחרתיים" קובעים תאריך. התחום — מה שבוחרים בקיצור, או ניחוש לפי המילים.')}</p>
    <div class="siri-keys">
      <label>${L('1 · Web-app URL', '1 · כתובת ה-Web app')}<div class="pw-row"><input readonly dir="ltr" value="${esc(settings.url)}"><button type="button" class="btn ghost" data-copy="${esc(settings.url)}">${L('Copy', 'העתקה')}</button></div></label>
      <label>${L('2 · Siri key (instead of your password)', '2 · מפתח סירי (במקום הסיסמה שלך)')}<div class="pw-row"><input readonly dir="ltr" id="siriKey" value="${esc(siriKey)}"><button type="button" class="btn ghost" data-copy-key>${L('Copy', 'העתקה')}</button><button type="button" class="btn ghost" id="siriReset">${L('New key', 'מפתח חדש')}</button></div></label>
      <label>${L('3 · Area list for the menu (optional)', '3 · רשימת תחומים לתפריט (רשות)')}<div class="pw-row"><input readonly value="${esc(areaNames.join(', '))}"><button type="button" class="btn ghost" data-copy="${esc(areaNames.join('\n'))}">${L('Copy', 'העתקה')}</button></div></label>
    </div>
    <h3 class="nt-h">${L('Create the shortcut on the iPhone (once, ~3 min)', 'יצירת הקיצור באייפון (פעם אחת, כ-3 דקות)')}</h3>
    <ol class="siri-steps">
      ${step('', L('Open the <b>Shortcuts</b> app › <b>＋</b> (new shortcut).', 'פתח את אפליקציית <b>קיצורים</b> (Shortcuts) › <b>＋</b>.'))}
      ${step('', L('Add action <b>Ask for Input</b> — type Text, question: “What\'s the task?”.', 'הוסף פעולה <b>בקש קלט</b> (Ask for Input) — סוג: טקסט, שאלה: "מה המשימה?".'))}
      ${step('', L('<i>Optional – choose the area by voice:</i> add <b>List</b>, paste the area list (item 3 above, one per line), then add <b>Choose from List</b>.', '<i>רשות – בחירת תחום:</i> הוסף <b>רשימה</b> (List) והדבק את רשימת התחומים (סעיף 3, שורה לכל תחום), ואחריה <b>בחר מתוך רשימה</b> (Choose from List).'))}
      <li>${L('Add <b>Get Contents of URL</b> and paste the URL (item 1). Tap <b>▸ / Show More</b>: Method <b>POST</b>, Request Body <b>JSON</b>, and add 4 Text fields:', 'הוסף <b>קבל תוכן של URL</b> (Get Contents of URL) והדבק את הכתובת (סעיף 1). לחץ <b>▸ / הצג עוד</b>: שיטה <b>POST</b>, גוף הבקשה <b>JSON</b>, והוסף 4 שדות מסוג טקסט:')}
      <div class="siri-fields"><code>action</code> = <code>siriAdd</code><br><code>key</code> = ${L('your Siri key (item 2)', 'מפתח סירי (סעיף 2)')}<br><code>text</code> = ${L('the variable <b>Provided Input</b>', 'המשתנה <b>קלט שסופק</b> (Provided Input)')}<br><code>area</code> = ${L('the variable <b>Chosen Item</b> — or just type <code>auto</code>', 'המשתנה <b>פריט שנבחר</b> (Chosen Item) — או פשוט הקלד <code>auto</code>')}</div></li>
      ${step('', L('Add <b>Get Dictionary Value</b> › key <code>message</code>, then <b>Speak Text</b> (or <b>Show Result</b>).', 'הוסף <b>קבל ערך ממילון</b> (Get Dictionary Value) › מפתח <code>message</code>, ואחריו <b>הקרא טקסט</b> (Speak Text) או <b>הצג תוצאה</b>.'))}
      ${step('', L('Name the shortcut <b>New task</b>. Now say: “Hey Siri, New task”.', 'קרא לקיצור <b>משימה חדשה</b>. עכשיו אומרים: "היי סירי, משימה חדשה".'))}
    </ol>
    <h3 class="nt-h">${L('Try a sentence (nothing is saved)', 'נסה משפט (לא נשמר כלום)')}</h3>
    <div class="pw-row"><input id="siriTry" dir="auto" placeholder="${esc(L('e.g. buy light bulbs tomorrow', 'למשל: לקנות נורות מחר'))}"><button type="button" class="btn primary" id="siriTest">${L('Check', 'בדיקה')}</button></div>
    <p class="hint" id="siriOut"></p>
    <p class="hint">${L('Anyone with the key can add items (not read them). If it leaks, press “New key” and update the shortcut.', 'מי שיש לו את המפתח יכול רק להוסיף משימות (לא לקרוא). אם הוא דלף — לחץ "מפתח חדש" ועדכן את הקיצור.')}</p>`;
}
$('#siriBody').addEventListener('click', async (e) => {
  const c = e.target.closest('[data-copy],[data-copy-key]');
  if (c) { const v = c.hasAttribute('data-copy-key') ? siriKey : c.dataset.copy; try { await navigator.clipboard.writeText(v); toast(L('Copied', 'הועתק')); } catch (err) { toast(v); } return; }
  if (e.target.id === 'siriReset') {
    if (!await confirmBox(L('New Siri key?', 'מפתח סירי חדש?'), L('The old key stops working — you\'ll need to paste the new one into the shortcut.', 'המפתח הישן יפסיק לעבוד — תצטרך להדביק את החדש בקיצור.'), L('New key', 'מפתח חדש'), L('Cancel', 'ביטול'))) return;
    try { siriKey = (await api('POST', { action: 'resetSiri' })).key; $('#siriKey').value = siriKey; toast(L('New key created', 'נוצר מפתח חדש')); } catch (err) { toast(err.message); }
    return;
  }
  if (e.target.id === 'siriTest') {
    const text = $('#siriTry').value.trim(); if (!text) return;
    $('#siriOut').textContent = tr('Loading…');
    try {
      const r = await fetch(settings.url, { method: 'POST', body: JSON.stringify({ action: 'siriAdd', key: siriKey, text, area: 'auto', dry: true }) });
      const j = await r.json(); $('#siriOut').textContent = (j.ok ? '✓ ' : '✕ ') + (j.message || j.error || '');
    } catch (err) { $('#siriOut').textContent = err.message; }
  }
});
$('#btnSiri').addEventListener('click', openSiri);

/* ---------- 📅 iPhone (iCloud) calendar sync via a Shortcut ---------- */
async function openCal() {
  const box = $('#calBody'); $('#dlgCal').showModal();
  if (settings.demo) { box.innerHTML = `<p class="hint">${L('Connect your sheet first.', 'חבר קודם את הגיליון.')}</p>`; return; }
  box.innerHTML = `<p class="hint">${tr('Loading…')}</p>`;
  let j; try { j = await api('POST', { action: 'getCal' }); }
  catch (e) { box.innerHTML = `<p class="hint">${esc(/Unknown action/i.test(e.message) ? L('Paste the new ActionItems_Script.gs into Apps Script and deploy a new version first.', 'קודם הדבק את ActionItems_Script.gs החדש ב-Apps Script ופרסם גרסה חדשה (New version).') : e.message)}</p>`; return; }
  calCfg = j.calCfg; siriKey = j.key; renderCal(j);
}
function calWhen(iso) { if (!iso) return L('never', 'אף פעם'); const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? L('just now', 'עכשיו') : m < 120 ? L(`${m} min ago`, `לפני ${m} דק׳`) : new Date(iso).toLocaleString(locale(), { hour12: false, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function renderCal(j) {
  const names = calCfg.names || [];
  const opt = (sel) => `<option value="">${L('— none —', '— ללא —')}</option>` + names.map(n => `<option value="${esc(n)}" ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const field = (k, v) => `<code>${k}</code> = ${v}`;
  $('#calBody').innerHTML = `
    <p class="hint">${L('Tick “📅 Add to iPhone calendar” in an item (it needs a due date) and choose the calendar. A Shortcut on your iPhone then puts it into that iCloud calendar — and updates or removes it when the item changes.',
      'מסמנים "📅 להוסיף ליומן האייפון" במשימה (צריך תאריך יעד) ובוחרים יומן. קיצור באייפון מכניס אותה ללוח השנה ב-iCloud — ומעדכן או מוחק כשהמשימה משתנה.')}</p>
    <div class="cal-status"><span>📅 ${L(`${j.linked} items linked`, `${j.linked} משימות מקושרות`)}</span><span>${j.pending ? '⏳ ' + L(`${j.pending} waiting for the iPhone`, `${j.pending} ממתינות לאייפון`) : '✅ ' + L('All synced', 'הכל מסונכרן')}</span><span>${L('Last sync', 'סנכרון אחרון')}: ${esc(calWhen(j.lastAck))}</span></div>
    <h3 class="nt-h">${L('Your iPhone calendars', 'לוחות השנה שלך באייפון')}</h3>
    <p class="hint">${L('Names exactly as in the iPhone Calendar app, one per line.', 'השמות בדיוק כמו באפליקציית לוח שנה, שם בכל שורה.')}</p>
    <textarea id="calNames" rows="5" dir="auto">${esc(names.join('\n'))}</textarea>
    <h3 class="nt-h">${L('Default calendar per area', 'יומן ברירת מחדל לכל תחום')}</h3>
    <div class="cal-map">${data.areas.map(a => `<label>${esc(tr(a))}<select data-calmap="${esc(a)}">${opt((calCfg.map || {})[a])}</select></label>`).join('')}</div>
    <label class="full">${L('Items without a start time', 'משימות בלי שעת התחלה')}<select id="calTime"><option value="">${L('All-day event', 'אירוע של יום שלם')}</option>${['07:00', '08:00', '09:00', '10:00', '12:00', '17:00', '20:00'].map(t => `<option ${calCfg.time === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <div class="sheet-actions"><button type="button" class="btn ghost" id="calResend">${L('↻ Send all again', '↻ לשלוח הכל מחדש')}</button><span class="grow"></span><button type="button" class="btn primary" id="calSave">${tr('Save')}</button></div>
    <p class="hint" id="calStatusMsg"></p>
    <details class="cal-guide"><summary>${L('One-time iPhone setup — the “Sync calendar” shortcut (~5 min)', 'הגדרה חד-פעמית באייפון — קיצור "סנכרון יומן" (כ-5 דקות)')}</summary>
      <div class="siri-keys">
        <label>${L('Web-app URL', 'כתובת ה-Web app')}<div class="pw-row"><input readonly dir="ltr" value="${esc(settings.url)}"><button type="button" class="btn ghost" data-ccopy="${esc(settings.url)}">${L('Copy', 'העתקה')}</button></div></label>
        <label>${L('Key (same as the Siri key)', 'מפתח (אותו מפתח של סירי)')}<div class="pw-row"><input readonly dir="ltr" value="${esc(siriKey)}"><button type="button" class="btn ghost" data-ccopy="${esc(siriKey)}">${L('Copy', 'העתקה')}</button></div></label>
      </div>
      <p class="hint">${L('In the Shortcuts app › ＋ › name it “Sync calendar”, and add these actions in order:', 'באפליקציית קיצורים › ＋ › קרא לו "סנכרון יומן", והוסף את הפעולות האלה לפי הסדר:')}</p>
      <ol class="siri-steps">
        <li>${L('<b>Get Contents of URL</b> — paste the URL · ▸ Method <b>POST</b> · Request Body <b>JSON</b> · fields:', '<b>קבל תוכן של URL</b> — הדבק את הכתובת · ▸ שיטה <b>POST</b> · גוף <b>JSON</b> · שדות:')}<div class="siri-fields">${field('action', '<code>calFeed</code>')}<br>${field('key', L('the key', 'המפתח'))}</div></li>
        <li>${L('<b>Get Dictionary Value</b> › key <code>events</code> (rename the result variable to <b>Events</b>). Also add <b>Get Dictionary Value</b> › <code>batch</code> from the URL contents (rename to <b>Batch</b>).', '<b>קבל ערך ממילון</b> › מפתח <code>events</code> (שנה את שם התוצאה ל-<b>Events</b>). ועוד <b>קבל ערך ממילון</b> › <code>batch</code> מתוכן ה-URL (שנה שם ל-<b>Batch</b>).')}</li>
        <li>${L('<b>Repeat with Each</b> item in <b>Events</b>. Inside it:', '<b>חזור עם כל פריט</b> ב-<b>Events</b>. בתוכו:')}
          <div class="siri-fields">
          a. ${L('<b>Get Dictionary Value</b> from <i>Repeat Item</i> for each key: <code>tag</code>, <code>op</code>, <code>cal</code>, <code>title</code>, <code>start</code>, <code>end</code>, <code>allday</code>, <code>notes</code> (8 actions — rename each result to the key name).', '<b>קבל ערך ממילון</b> מ-<i>פריט חוזר</i> לכל מפתח: <code>tag</code>, <code>op</code>, <code>cal</code>, <code>title</code>, <code>start</code>, <code>end</code>, <code>allday</code>, <code>notes</code> (8 פעולות — שנה את שם כל תוצאה לשם המפתח).')}<br>
          b. ${L('<b>Find Calendar Events</b> where <b>Notes</b> contains <code>tag</code> (start date: is in the last 2 years — or no date filter) → <b>Remove Events</b> (turn off “Confirm”).', '<b>מצא אירועי לוח שנה</b> שבהם <b>הערות</b> מכיל <code>tag</code> → <b>הסר אירועים</b> (כבה "אישור לפני הסרה").')}<br>
          c. ${L('<b>If</b> <code>op</code> is <code>add</code>: <b>Add New Event</b> — Title = <code>title</code>, Calendar = variable <code>cal</code>, Start = <code>start</code>, End = <code>end</code>, Notes = <code>notes</code>, All-day = on when <code>allday</code> is <code>yes</code> (use an inner If with two Add New Event actions).', '<b>אם</b> <code>op</code> הוא <code>add</code>: <b>הוסף אירוע חדש</b> — כותרת = <code>title</code>, לוח שנה = המשתנה <code>cal</code>, התחלה = <code>start</code>, סיום = <code>end</code>, הערות = <code>notes</code>, כל היום = מופעל כש-<code>allday</code> הוא <code>yes</code> (If פנימי עם שתי פעולות "הוסף אירוע").')}
          </div></li>
        <li>${L('After the repeat: <b>Get Contents of URL</b> (same URL, POST, JSON) with fields', 'אחרי החזרה: <b>קבל תוכן של URL</b> (אותה כתובת, POST, JSON) עם השדות')}<div class="siri-fields">${field('action', '<code>calAck</code>')}<br>${field('key', L('the key', 'המפתח'))}<br>${field('batch', L('the <b>Batch</b> variable', 'המשתנה <b>Batch</b>'))}</div></li>
        <li>${L('Run it once to approve calendar access. Then in <b>Automation</b> › ＋ › <b>App</b> › Calendar › “Is Opened” › Run Immediately › this shortcut — plus a <b>Time of Day</b> automation (e.g. 07:00) so it also syncs on its own.', 'הרץ אותו פעם אחת כדי לאשר גישה ללוח השנה. אחר כך ב<b>אוטומציה</b> › ＋ › <b>יישום</b> › לוח שנה › "נפתח" › הפעל מיד › הקיצור הזה — ועוד אוטומציה של <b>שעה ביום</b> (למשל 07:00) כדי שיסתנכרן גם לבד.')}</li>
      </ol>
      <p class="hint">${L('If the Calendar field doesn\'t accept the <code>cal</code> variable on your iPhone, use one <b>If cal is …</b> block per calendar instead.', 'אם שדה "לוח שנה" לא מקבל את המשתנה <code>cal</code> באייפון שלך — השתמש בבלוק <b>אם cal הוא …</b> לכל יומן.')}</p>
    </details>`;
}
$('#calBody').addEventListener('click', async (e) => {
  const c = e.target.closest('[data-ccopy]');
  if (c) { try { await navigator.clipboard.writeText(c.dataset.ccopy); toast(L('Copied', 'הועתק')); } catch (err) { toast(c.dataset.ccopy); } return; }
  if (e.target.id === 'calSave') {
    const names = $('#calNames').value.split('\n').map(x => x.trim()).filter(Boolean);
    const map = {}; document.querySelectorAll('[data-calmap]').forEach(sel => { if (sel.value) map[sel.dataset.calmap] = sel.value; });
    $('#calStatusMsg').textContent = tr('Saving…');
    try { const j = await api('POST', { action: 'saveCal', config: { names, map, time: $('#calTime').value } }); calCfg = j.calCfg; renderCal(j); toast(L('Saved', 'נשמר')); render(); }
    catch (err) { $('#calStatusMsg').textContent = err.message; }
  }
  if (e.target.id === 'calResend') {
    if (!await confirmBox(L('Send everything again?', 'לשלוח הכל מחדש?'), L('Next time the shortcut runs it will re-create all linked events (old copies are removed first, so nothing is duplicated).', 'בהרצה הבאה של הקיצור כל האירועים המקושרים ייווצרו מחדש (העותקים הישנים נמחקים קודם, כך שאין כפילויות).'), L('Send again', 'שלח מחדש'), L('Cancel', 'ביטול'))) return;
    try { renderCal(await api('POST', { action: 'calResend' })); } catch (err) { toast(err.message); }
  }
});
$('#calBody').addEventListener('input', (e) => { if (e.target.id === 'calNames') $('#calStatusMsg').textContent = L('Press Save to keep the changes.', 'לחץ שמירה כדי לשמור את השינויים.'); });
$('#btnCal').addEventListener('click', openCal);

/* ---------- 📆 Import from the iPhone calendars (review new events, choose what becomes a task) ---------- */
let ciEvents = [], ciAll = false, ciLast = '', ciIgnore = [], ciBusy = false;
const ciName = () => store.get('ai.ciName', L('Import calendar', 'ייבוא יומן'));
function ciAreaFor(ev) {
  const m = calCfg.map || {}; const byCal = Object.keys(m).find(a => m[a] === ev.cal && data.areas.includes(a));
  if (byCal) return byCal;
  const g = guessArea(ev.title); return g && g.area ? g.area : '';
}
async function openImport() {
  $('#dlgImport').showModal();
  if (settings.demo) { $('#ciList').innerHTML = `<p class="hint">${L('Connect your sheet first.', 'חבר קודם את הגיליון.')}</p>`; return; }
  await ciLoad();
}
async function ciLoad() {
  $('#ciList').innerHTML = `<p class="hint">${tr('Loading…')}</p>`;
  try { const j = await api('POST', { action: 'calInbox', all: ciAll }); ciEvents = j.events || []; ciLast = j.lastImport || ''; ciIgnore = j.ignore || []; if (ciLast) store.set('ai.ciReady', true); ciRender(); }
  catch (e) { $('#ciList').innerHTML = `<p class="hint">${esc(/Unknown action/i.test(e.message) ? L('Paste the new ActionItems_Script.gs into Apps Script and deploy a new version first.', 'קודם הדבק את ActionItems_Script.gs החדש ב-Apps Script ופרסם גרסה חדשה (New version).') : e.message)}</p>`; }
}
function ciRender() {
  $('#ciLast').textContent = L('Last sync from the iPhone: ', 'סנכרון אחרון מהאייפון: ') + calWhen(ciLast);
  $('#ciAllToggle').classList.toggle('on', ciAll);
  $('#ciAllToggle').textContent = ciAll ? L('🔍 Full check — showing skipped too', '🔍 בדיקה מלאה — מוצגים גם מה שדילגת') : L('🔍 Full check', '🔍 בדיקה מלאה');
  if (!ciEvents.length) {
    $('#ciList').innerHTML = `<div class="empty"><b>✅</b>${ciAll ? L('Nothing upcoming that you skipped.', 'אין אירועים קרובים שדילגת עליהם.') : L('No new events. Tap “Sync now” to check the calendars again.', 'אין אירועים חדשים. לחץ "סנכרן עכשיו" כדי לבדוק שוב את לוחות השנה.')}</div>`;
  } else {
    const byDay = {}; ciEvents.forEach(ev => { (byDay[ev.start.slice(0, 10)] = byDay[ev.start.slice(0, 10)] || []).push(ev); });
    const areaOpts = (sel) => `<option value="">${L('— area —', '— תחום —')}</option>` + data.areas.map(a => `<option value="${esc(a)}" ${a === sel ? 'selected' : ''}>${esc(tr(a))}</option>`).join('');
    $('#ciList').innerHTML = Object.keys(byDay).sort().map(d => `<div class="ci-day"><h4>${esc(fmt(d, true))}</h4>${byDay[d].map(ev => `
      <div class="ci-ev ${ev.decision ? 'was-' + ev.decision : ''}" data-ci="${esc(ev.id)}">
        <div class="ci-when">${ev.allday ? L('All day', 'כל היום') : esc(ev.start.slice(11, 16))}</div>
        <div class="ci-main"><b dir="auto">${esc(ev.title)}</b>
          <div class="ci-sub"><span class="ci-cal">📆 ${esc(ev.cal || '—')}</span>${ev.location ? `<span dir="auto">📍 ${esc(ev.location)}</span>` : ''}${ev.decision ? `<span class="ci-was">${ev.decision === 'ignored' ? L('🚫 never offered', '🚫 לא מוצע') : L('✕ skipped', '✕ דילגת')}</span>` : ''}</div>
          <div class="ci-act"><select class="ci-area" aria-label="${esc(tr('Area'))}">${areaOpts(ciAreaFor(ev))}</select>
            <button type="button" class="btn primary" data-ciadd>${L('＋ Add', '＋ הוסף')}</button>
            ${ev.decision ? '' : `<button type="button" class="btn ghost" data-ciskip>${L('✕ No', '✕ לא')}</button><button type="button" class="btn ghost ci-never" data-cinever title="${esc(L('Never offer events with this name', 'לא להציע שוב אירועים בשם הזה'))}">🚫</button>`}</div></div></div>`).join('')}</div>`).join('') +
      (ciAll ? '' : `<div class="sheet-actions"><span class="grow"></span><button type="button" class="btn ghost" data-ciskipall>${L(`✕ Skip all ${ciEvents.length} shown`, `✕ דלג על כל ה-${ciEvents.length} המוצגים`)}</button></div>`);
  }
  $('#ciIgnore').innerHTML = ciIgnore.length ? `<h3 class="nt-h">${L('Never offered', 'לא מוצעים לעולם')}</h3>` + ciIgnore.map((r, i) => `<span class="c-chip">🚫 ${esc(r.label || r.t)} <button type="button" class="linkish" data-ciun="${i}">${L('undo', 'בטל')}</button></span>`).join(' ') : '';
}
async function ciDecide(body, el) {
  if (ciBusy) return; ciBusy = true; if (el) el.classList.add('busy');
  try {
    const j = await api('POST', Object.assign({ action: 'calDecide', all: ciAll }, body));
    ciEvents = j.events || []; ciIgnore = j.ignore || ciIgnore;
    if (j.items) { data.items = j.items; render(); }
    ciRender();
    if (j.added) toast(L(`Added ${j.added} to your items ✓`, `נוספו ${j.added} למשימות ✓`)); else if (j.skipped > 1) toast(L(`${j.skipped} skipped`, `דילגת על ${j.skipped}`));
  } catch (e) { toast(e.message); if (el) el.classList.remove('busy'); }
  finally { ciBusy = false; }
}
$('#ciList').addEventListener('click', (e) => {
  const row = e.target.closest('[data-ci]');
  if (e.target.closest('[data-ciskipall]')) { ciDecide({ decision: 'skip', ids: ciEvents.map(x => x.id) }); return; }
  if (!row) return; const id = row.dataset.ci;
  if (e.target.closest('[data-ciadd]')) {
    const area = row.querySelector('.ci-area').value;
    if (!area) { row.querySelector('.ci-area').focus(); toast(L('Choose an area first', 'בחר קודם תחום')); return; }
    ciDecide({ decision: 'add', id, item: { area } }, row);
  }
  if (e.target.closest('[data-ciskip]')) ciDecide({ decision: 'skip', id }, row);
  if (e.target.closest('[data-cinever]')) ciDecide({ decision: 'skip', id, never: 'title' }, row);
});
$('#ciIgnore').addEventListener('click', (e) => { const b = e.target.closest('[data-ciun]'); if (b) ciDecide({ ids: [], unignore: Number(b.dataset.ciun) }); });
$('#ciAllToggle').addEventListener('click', () => { ciAll = !ciAll; ciLoad(); });
$('#ciRun').addEventListener('click', () => { location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(ciName()); });
$('#ciRefresh').addEventListener('click', ciLoad);
$('#ciGuideBox').addEventListener('toggle', () => {
  if (!$('#ciGuideBox').open) return;
  const field = (k, v) => `<code>${k}</code> = ${v}`;
  $('#ciGuide').innerHTML = `
    <div class="siri-keys">
      <label>${L('Web-app URL', 'כתובת ה-Web app')}<div class="pw-row"><input readonly dir="ltr" value="${esc(settings.url)}"><button type="button" class="btn ghost" data-cicopy="url">${L('Copy', 'העתקה')}</button></div></label>
      <label>${L('Key (same as the Siri key)', 'מפתח (אותו מפתח של סירי)')}<div class="pw-row"><input readonly dir="ltr" id="ciKey" value="…"><button type="button" class="btn ghost" data-cicopy="key">${L('Copy', 'העתקה')}</button></div></label>
      <label>${L('Shortcut name (the “Sync now” button runs it)', 'שם הקיצור (כפתור "סנכרן עכשיו" מפעיל אותו)')}<input id="ciNameIn" dir="auto" value="${esc(ciName())}"></label>
    </div>
    <p class="hint">${L('In the Shortcuts app › ＋ › name it exactly as above, and add:', 'באפליקציית קיצורים › ＋ › תן לו בדיוק את השם שלמעלה, והוסף:')}</p>
    <ol class="siri-steps">
      <li>${L('<b>Find Calendar Events</b> › Add Filter: <b>Start Date</b> <i>is in the next</i> <b>30 days</b> (all calendars — yours and the shared ones; to limit, add a filter on Calendar). Sort by Start Date, no limit.', '<b>מצא אירועי לוח שנה</b> › הוסף מסנן: <b>תאריך התחלה</b> <i>בטווח של</i> <b>30 הימים הבאים</b> (כל לוחות השנה — שלך והמשותפים; כדי להגביל, הוסף מסנן לפי לוח שנה). מיון לפי תאריך התחלה, בלי הגבלה.')}</li>
      <li>${L('<b>Repeat with Each</b> (the events). Inside it, one <b>Dictionary</b> action with Text items:', '<b>חזור עם כל פריט</b> (האירועים). בתוכו פעולת <b>מילון</b> אחת עם פריטי טקסט:')}
        <div class="siri-fields">${field('title', L('Repeat Item › <b>Title</b>', 'פריט חוזר › <b>כותרת</b>'))}<br>${field('start', L('Repeat Item › <b>Start Date</b> — tap it › Date Format <b>ISO 8601</b>, include time', 'פריט חוזר › <b>תאריך התחלה</b> — לחץ עליו › פורמט <b>ISO 8601</b>, כולל שעה'))}<br>${field('end', L('Repeat Item › <b>End Date</b> (ISO 8601 too)', 'פריט חוזר › <b>תאריך סיום</b> (גם ISO 8601)'))}<br>${field('calendar', L('Repeat Item › <b>Calendar</b>', 'פריט חוזר › <b>לוח שנה</b>'))}<br>${field('allday', L('Repeat Item › <b>Is All Day</b>', 'פריט חוזר › <b>כל היום</b>'))}<br>${field('location', L('Repeat Item › <b>Location</b>', 'פריט חוזר › <b>מיקום</b>'))}<br>${field('notes', L('Repeat Item › <b>Notes</b>', 'פריט חוזר › <b>הערות</b>'))}</div></li>
      <li>${L('After the repeat: <b>Get Contents of URL</b> — the URL · Method <b>POST</b> · Request Body <b>JSON</b> · fields:', 'אחרי החזרה: <b>קבל תוכן של URL</b> — הכתובת · שיטה <b>POST</b> · גוף <b>JSON</b> · שדות:')}
        <div class="siri-fields">${field('action', '<code>calImport</code>')}<br>${field('key', L('the key', 'המפתח'))}<br>${field('events', L('a <b>Text</b> field → the variable <b>Repeat Results</b>', 'שדה <b>טקסט</b> ← המשתנה <b>תוצאות חזרה</b> (Repeat Results)'))}</div></li>
      <li>${L('<b>Get Dictionary Value</b> › <code>message</code> › <b>Show Notification</b> (or Show Result). Optional: <b>Open URLs</b> › this app\'s address to come back.', '<b>קבל ערך ממילון</b> › <code>message</code> › <b>הצג הודעה</b> (או הצג תוצאה). רשות: <b>פתח כתובות URL</b> › כתובת האפליקציה כדי לחזור אליה.')}</li>
    </ol>
    <p class="hint">${L('Events you created from the app (📅 iPhone calendar) and items you already have on that date are never offered.', 'אירועים שנוצרו מהאפליקציה (📅 יומן אייפון) ומשימות שכבר קיימות באותו תאריך לא יוצעו לעולם.')}</p>`;
  api('POST', { action: 'getSiri' }).then(j => { siriKey = j.key; const k = $('#ciKey'); if (k) k.value = j.key; }).catch(() => {});
});
$('#ciGuide').addEventListener('click', async (e) => {
  const c = e.target.closest('[data-cicopy]'); if (!c) return;
  const v = c.dataset.cicopy === 'url' ? settings.url : siriKey; try { await navigator.clipboard.writeText(v); toast(L('Copied', 'הועתק')); } catch (err) { toast(v); }
});
$('#ciGuide').addEventListener('change', (e) => { if (e.target.id === 'ciNameIn' && e.target.value.trim()) { store.set('ai.ciName', e.target.value.trim()); toast(L('Saved', 'נשמר')); } });
$('#btnImport').addEventListener('click', openImport);
$('#btnStory').addEventListener('click', () => { $('#dlgMenu').close(); openStory(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#dlgImport').open && !settings.demo) ciLoad(); });

/* ---------- 🎬 Summary "video": animated story slides with spoken narration ---------- */
let story = null;
function storySlides(area) {
  const all = (area ? data.items.filter(it => it.area === area) : filtered()).filter(it => !isClosed(it));
  const t = today(), late = (it) => Math.max(1, dayDiff(t, parse(it.due)));
  const over = all.filter(it => horizon(it) === 'Overdue').sort((a, b) => parse(a.due) - parse(b.due));
  const tod = all.filter(it => horizon(it) === 'Today').sort((a, b) => String(a.time || '99').localeCompare(String(b.time || '99')) || prioRank(a.prio) - prioRank(b.prio));
  const wk = all.filter(it => horizon(it) === 'This week').sort(sortOpen);
  const hot = wk.filter(it => /^1/.test(it.prio || '')).concat(wk.filter(it => !/^1/.test(it.prio || ''))).slice(0, 5);
  const waiting = all.filter(it => it.status === 'Waiting').sort((a, b) => (waitDays(b) || 0) - (waitDays(a) || 0));
  const doneWk = data.items.filter(it => it.status === 'Done' && parse(it.done) >= weekStart(t) && (!area ? areaOk(it.area) : it.area === area)).length;
  const h = new Date().getHours();
  const hello = h < 12 ? L('Good morning', 'בוקר טוב') : h < 17 ? L('Good afternoon', 'צהריים טובים') : L('Good evening', 'ערב טוב');
  const areaTxt = area ? ' · ' + tr(area) : areaSel() ? ' · ' + areaSelLabel() : '';
  const li = (it, extra) => `<li><b dir="auto">${esc(it.item)}</b>${extra ? `<span>${extra}</span>` : ''}</li>`;
  const names = (arr) => arr.slice(0, 3).map(it => it.item).join(isHe() ? ', ' : ', ');
  const S = [];
  S.push({ cls: 'st-intro', html: `<div class="st-emoji">🎬</div><h1>${hello}</h1><p class="st-date">${esc(t.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }))}${esc(areaTxt)}</p>
      <div class="st-kpis"><div class="r"><b data-count="${over.length}">0</b><span>${tr('Overdue')}</span></div><div class="a"><b data-count="${tod.length}">0</b><span>${tr('Today')}</span></div><div class="g"><b data-count="${wk.length}">0</b><span>${tr('This week')}</span></div></div>`,
    say: L(`${hello}. You have ${over.length} overdue, ${tod.length} for today, and ${wk.length} more this week.`, `${hello}. יש לך ${over.length} משימות באיחור, ${tod.length} להיום, ועוד ${wk.length} השבוע.`) });
  if (over.length) S.push({ cls: 'st-red', html: `<div class="st-emoji">⏰</div><h2>${L(`${over.length} overdue`, `${over.length} באיחור`)}</h2><ul>${over.slice(0, 5).map(it => li(it, L(`${late(it)}d late`, `באיחור ${late(it)} ימ׳`))).join('')}</ul>${over.length > 5 ? `<p class="st-more">${L(`+${over.length - 5} more`, `ועוד ${over.length - 5}`)}</p>` : ''}`,
    say: L(`Overdue: ${names(over)}.`, `באיחור: ${names(over)}.`) });
  if (tod.length) S.push({ cls: 'st-amber', html: `<div class="st-emoji">📌</div><h2>${L(`Today · ${tod.length}`, `היום · ${tod.length}`)}</h2><ul>${tod.slice(0, 6).map(it => li(it, it.time ? '🕒 ' + esc(it.time) : '')).join('')}</ul>`,
    say: L(`For today: ${tod.slice(0, 3).map(it => (it.time ? 'at ' + it.time + ', ' : '') + it.item).join('; ')}.`, `להיום: ${tod.slice(0, 3).map(it => (it.time ? 'ב-' + it.time + ', ' : '') + it.item).join('; ')}.`) });
  if (hot.length) S.push({ cls: 'st-blue', html: `<div class="st-emoji">🔥</div><h2>${L('Coming up this week', 'השבוע')}</h2><ul>${hot.map(it => li(it, esc(fmt(it.due, true)) + (/^1/.test(it.prio || '') ? ' · ❗' : ''))).join('')}</ul>`,
    say: L(`Later this week: ${names(hot)}.`, `בהמשך השבוע: ${names(hot)}.`) });
  if (waiting.length) S.push({ cls: 'st-purple', html: `<div class="st-emoji">⏳</div><h2>${L('Waiting on others', 'ממתין לאחרים')}</h2><ul>${waiting.slice(0, 5).map(it => li(it, (it.focal && it.focal !== 'Me' ? '👤 ' + esc(it.focal) + ' · ' : '') + L(`${waitDays(it) || 0}d`, `${waitDays(it) || 0} ימ׳`))).join('')}</ul>`,
    say: L(`Waiting on others: ${waiting.length}. Maybe time for a reminder.`, `${waiting.length} משימות ממתינות לאחרים. אולי הזמן לתזכורת.`) });
  S.push({ cls: 'st-green', mood: doneWk ? null : ['hi', 'zero'], html: `<div class="st-emoji">🏆</div><h2>${L('Done this week', 'הושלמו השבוע')}</h2><div class="st-big" data-count="${doneWk}">0</div><p>${doneWk ? L('Great job — keep going!', 'כל הכבוד — ממשיכים!') : L('Let’s get the first one done today.', 'בוא נסגור היום את הראשונה.')}</p>`,
    say: doneWk ? L(`You finished ${doneWk} this week. Great job!`, `סגרת השבוע ${doneWk} משימות. כל הכבוד!`) : L('Let’s get the first one done today.', 'בוא נסגור היום את הראשונה.') });
  const first = over[0] || tod[0] || hot[0];
  S.push({ cls: 'st-outro', html: `<div class="st-emoji">🚀</div><h2>${L('Start with', 'מתחילים עם')}</h2>${first ? `<div class="st-first" dir="auto">${esc(first.item)}</div>` : `<p>${L('Nothing urgent — enjoy the day!', 'אין שום דבר דחוף — יום נעים!')}</p>`}
      <button class="btn primary st-go" data-st-go>${L('Open Focus', 'לפוקוס')}</button>`,
    say: first ? L(`Start with: ${first.item}. Good luck!`, `מתחילים עם: ${first.item}. בהצלחה!`) : L('Nothing urgent. Enjoy the day!', 'אין שום דבר דחוף. יום נעים!') });
  return S;
}
/* each slide: [the character's face/pose, which joke pool to draw from] */
const ST_MOOD = { 'st-intro': ['hi', 'intro'], 'st-red': ['panic', 'panic'], 'st-amber': ['coffee', 'coffee'], 'st-blue': ['think', 'think'], 'st-purple': ['peek', 'peek'], 'st-green': ['party', 'party'], 'st-outro': ['rocket', 'rocket'] };
/* funny lines — a fresh pick every time (lines used last time are skipped) */
const ST_LINES = {
  panic: [['Uh-oh… this is starting to smell 😬', 'אוי אוי אוי… זה מתחיל להריח 😬'], ['Nobody saw anything. Let’s fix it quietly 🤫', 'אף אחד לא ראה כלום. בוא נטפל בזה בשקט 🤫'],
    ['These tasks have started asking about you 😅', 'המשימות האלה כבר שואלות עליך 😅'], ['Some of these have waited longer than a doctor’s queue', 'יש פה דברים שמחכים יותר מתור בקופת חולים 🏥'],
    ['Relax, the pyramids weren’t built on time either 🏜', 'לא נורא, גם הפירמידות לא נבנו בזמן 🏜'], ['Deep breath… now RUN! 🏃', 'נשימה עמוקה… ועכשיו לרוץ! 🏃'],
    ['I’m not saying panic. I’m saying hurry 😰', 'אני לא אומר להיבהל. אני אומר למהר 😰'], ['Late is just early for next week 🙃', 'באיחור זה בסך הכול מוקדם לשבוע הבא 🙃']],
  coffee: [['Coffee in hand? Let’s go! ☕', 'קפה ביד? יאללה! ☕'], ['Today is the day. Almost certainly. ☕', 'היום זה היום. כמעט בטוח. ☕'], ['One more coffee and it’s done', 'עוד קפה אחד וזה נסגר ☕'],
    ['Short list, big ambitions 💪', 'רשימה קצרה, כוונות גדולות 💪'], ['Close it today — it won’t nag you tomorrow', 'מה שנסגר היום — לא יציק מחר'], ['I believe in you. Mostly. 😇', 'אני מאמין בך. רוב הזמן. 😇'],
    ['Plan: do it. Plan B: do it anyway', 'תוכנית א׳: לעשות. תוכנית ב׳: לעשות בכל זאת 😎']],
  think: [['Planning is half the work. The other half… is also work.', 'תכנון זה חצי מהעבודה. החצי השני… גם עבודה.'], ['I see the future… it’s full of tasks 🔮', 'אני רואה עתיד… והוא מלא משימות 🔮'],
    ['This week has no idea what’s coming 😏', 'השבוע הזה לא יודע מה מחכה לו 😏'], ['Smart to look ahead. Smarter to start', 'חכם להסתכל קדימה. עוד יותר חכם — להתחיל 🧠'],
    ['Tomorrow is a day too. Today is more of a day.', 'מחר זה גם יום. אבל היום זה יותר יום.'], ['Future you says thanks in advance 🙏', 'אתה של סוף השבוע כבר אומר תודה 🙏']],
  peek: [['Someone owes you an answer 👀', 'מישהו חייב לך תשובה 👀'], ['Just saying… a tiny reminder wouldn’t hurt 📨', 'אני רק אומר… תזכורת קטנה לא תזיק 📨'],
    ['Ball’s in their court. We’re watching 🕵️', 'הכדור אצלם. אבל אנחנו עוקבים 🕵️'], ['Maybe they forgot? Let’s remind them nicely (or not) 😇', 'אולי הם שכחו? בוא נזכיר בנימוס (או שלא) 😇'],
    ['Waiting… waiting… still waiting 🐌', 'ממתינים… ממתינים… עדיין ממתינים 🐌'], ['Their reply is on the way. By snail mail 🐌✉️', 'התשובה שלהם בדרך. בדואר רשום 🐌✉️']],
  party: [['Who’s the king? You’re the king! 👑', 'מי מלך? אתה מלך! 👑'], ['Wow! Can I get an autograph? ✍️', 'וואו! אפשר לקבל חתימה? ✍️'], ['Take a break. You earned it 🎉', 'קח הפסקה. הרווחת 🎉'],
    ['A machine! Simply a machine 🔥', 'מכונה! פשוט מכונה 🔥'], ['If there were a Task Olympics — gold 🥇', 'אם הייתה אולימפיאדת משימות — זהב 🥇'], ['Somebody call the newspapers 📰', 'שמישהו יתקשר לעיתון 📰']],
  zero: [['Zero is just the starting point 💪', 'אפס זו רק נקודת ההתחלה 💪'], ['Every long journey starts with one task 🐢', 'גם המסע הכי ארוך מתחיל במשימה אחת 🐢'],
    ['The week is still young. Like you 😉', 'השבוע עוד צעיר. כמוך 😉'], ['An empty board is the easiest to fill with ✔️', 'לוח ריק — הכי קל למלא אותו בווי ✔️']],
  rocket: [['3… 2… 1… liftoff!', '3… 2… 1… המראה!'], ['Go, before the coffee gets cold 🚀', 'קדימה, לפני שהקפה מתקרר 🚀'], ['You’re a cannon. Now fire 💥', 'אתה תותח. עכשיו לירות 💥'],
    ['See you on the other side of the list 👋', 'נתראה בצד השני של הרשימה 👋'], ['Off to work! (I’ll stay here and cheer) 📣', 'יאללה, לעבודה! (אני נשאר פה לעודד) 📣'], ['Go get ’em, tiger 🐯', 'קדימה, טיגריס 🐯']]
};
/* the cast — a different funny character every time the video plays */
const ST_CAST = [
  { id: 'blob', voice: [1.15, 1.02], c: '#FBBF24', name: ['Sunny', 'שמשון'], hi: [['Hi, I’m Sunny! Let’s see what’s waiting 😎', 'היי, אני שמשון! בוא נראה מה מחכה לנו 😎']],
    back: '', front: '<ellipse cx="46" cy="50" rx="14" ry="8" fill="rgba(255,255,255,.35)"/>', body: '<ellipse cx="60" cy="66" rx="44" ry="42" fill="var(--mc)"/>' },
  { id: 'cat', voice: [1.7, 1.05], shoe: '#FDBA74', c: '#FDBA74', name: ['Mitzi', 'מיצי'], hi: [['Meow. I checked your tasks… and your fridge 🐟', 'מיאו. אני מיצי. בדקתי את המשימות שלך… וגם את המקרר 🐟']],
    back: '<path d="M22 46 L28 6 L54 30 Z" fill="var(--mc)"/><path d="M98 46 L92 6 L66 30 Z" fill="var(--mc)"/><path d="M29 36 L32 16 L46 30 Z" fill="#F9A8D4"/><path d="M91 36 L88 16 L74 30 Z" fill="#F9A8D4"/>',
    body: '<ellipse cx="60" cy="66" rx="44" ry="42" fill="var(--mc)"/>', front: '<g stroke="#7C2D12" stroke-width="2" stroke-linecap="round" opacity=".55"><path d="M24 78 L6 74 M24 84 L6 88 M96 78 L114 74 M96 84 L114 88"/></g><path d="M56 76 L64 76 L60 81 Z" fill="#F472B6"/>' },
  { id: 'robot', voice: [0.55, 0.92], shoe: '#475569', torso: '<rect x="32" y="112" width="56" height="46" rx="10" fill="var(--mc)" stroke="#94A3B8" stroke-width="3"/><rect x="44" y="122" width="32" height="18" rx="4" fill="#0F172A"/><circle class="mc-blink" cx="52" cy="131" r="3" fill="#34D399"/><circle cx="60" cy="131" r="3" fill="#60A5FA"/><circle cx="68" cy="131" r="3" fill="#F87171"/>', c: '#CBD5E1', name: ['Robotoast', 'רובוטוסט'], hi: [['Beep boop. I am Robotoast. Scanning tasks… 🤖', 'ביפ בופ. אני רובוטוסט. סורק משימות… 🤖']],
    back: '<path d="M60 26 V10" stroke="#64748B" stroke-width="4"/><circle class="mc-blink" cx="60" cy="8" r="6" fill="#F87171"/><rect x="6" y="56" width="10" height="22" rx="3" fill="#94A3B8"/><rect x="104" y="56" width="10" height="22" rx="3" fill="#94A3B8"/>',
    body: '<rect x="14" y="26" width="92" height="82" rx="16" fill="var(--mc)" stroke="#94A3B8" stroke-width="3"/>', front: '<circle cx="24" cy="36" r="3" fill="#94A3B8"/><circle cx="96" cy="36" r="3" fill="#94A3B8"/><circle cx="24" cy="98" r="3" fill="#94A3B8"/><circle cx="96" cy="98" r="3" fill="#94A3B8"/>' },
  { id: 'ghost', voice: [1.35, 0.85], noLegs: true, torso: '<path d="M34 112 L34 176 q6.5 10 13 0 q6.5 10 13 0 q6.5 10 13 0 q6.5 10 13 0 L86 112 Z" fill="var(--mc)" stroke="#CBD5E1" stroke-width="2"/>', c: '#F1F5F9', name: ['Boo', 'בובו'], hi: [['Boo! I’m the ghost of tasks not yet done 👻', 'בּוּ! אני בובו, רוח המשימות שעוד לא נסגרו 👻']],
    back: '', body: '<path d="M16 66 Q16 22 60 22 Q104 22 104 66 L104 108 q-11 10 -22 0 q-11 10 -22 0 q-11 10 -22 0 q-11 10 -22 0 Z" fill="var(--mc)" stroke="#CBD5E1" stroke-width="2"/>', front: '' },
  { id: 'alien', voice: [1.9, 1.15], c: '#86EFAC', name: ['Zorg', 'זורג'], hi: [['Greetings, human. I came from space to inspect your list 👽', 'שלום בן אנוש. באתי מהחלל לבדוק את הרשימה שלך 👽']],
    back: '<path d="M44 28 L34 6 M76 28 L86 6" stroke="#16A34A" stroke-width="4" stroke-linecap="round"/><circle cx="34" cy="6" r="6" fill="#FDE047"/><circle cx="86" cy="6" r="6" fill="#FDE047"/>',
    body: '<ellipse cx="60" cy="68" rx="46" ry="40" fill="var(--mc)"/>', front: '<ellipse cx="44" cy="44" rx="12" ry="6" fill="rgba(255,255,255,.4)"/>' },
  { id: 'monster', voice: [0.45, 0.9], c: '#C4B5FD', name: ['Grrr', 'גרררר'], hi: [['Grrr! I eat tasks for breakfast 😋', 'גררר! אני אוכל משימות לארוחת בוקר 😋']],
    back: '<path d="M30 34 Q18 14 26 4 Q32 18 44 26 Z" fill="#FDE68A"/><path d="M90 34 Q102 14 94 4 Q88 18 76 26 Z" fill="#FDE68A"/>',
    body: '<ellipse cx="60" cy="66" rx="45" ry="42" fill="var(--mc)"/>', front: '<circle cx="28" cy="50" r="5" fill="rgba(0,0,0,.12)"/><circle cx="94" cy="96" r="6" fill="rgba(0,0,0,.12)"/><circle cx="86" cy="40" r="3.5" fill="rgba(0,0,0,.12)"/>' },
  { id: 'bear', voice: [0.7, 0.92], shoe: '#8B5E3C', c: '#D6A77A', name: ['Teddy', 'דובי'], hi: [['I’m Teddy. Just woke up from hibernation — what did I miss? 🐻', 'אני דובי. בדיוק התעוררתי משנת חורף — מה פספסתי? 🐻']],
    back: '<circle cx="24" cy="30" r="14" fill="var(--mc)"/><circle cx="96" cy="30" r="14" fill="var(--mc)"/><circle cx="24" cy="30" r="7" fill="#F5D0A9"/><circle cx="96" cy="30" r="7" fill="#F5D0A9"/>',
    body: '<ellipse cx="60" cy="66" rx="44" ry="42" fill="var(--mc)"/>', front: '<ellipse cx="60" cy="86" rx="22" ry="16" fill="#F5D0A9"/><ellipse cx="60" cy="77" rx="6" ry="4" fill="#3F2A1D"/>' },
  { id: 'penguin', voice: [1.5, 1.15], shoe: '#FB923C', torso: '<ellipse cx="60" cy="138" rx="30" ry="27" fill="var(--mc)"/><ellipse cx="60" cy="142" rx="21" ry="21" fill="#F8FAFC"/>', c: '#334155', name: ['Pingo', 'פינגו'], hi: [['Pingo here! Sliding you straight to business 🐧', 'פינגו כאן! מחליק לך ישר לעניינים 🐧']],
    back: '<ellipse cx="14" cy="80" rx="8" ry="18" fill="#1E293B" transform="rotate(20 14 80)"/><ellipse cx="106" cy="80" rx="8" ry="18" fill="#1E293B" transform="rotate(-20 106 80)"/>',
    body: '<ellipse cx="60" cy="66" rx="44" ry="44" fill="var(--mc)"/><ellipse cx="60" cy="74" rx="32" ry="32" fill="#F8FAFC"/>', front: '<path d="M53 74 L67 74 L60 80 Z" fill="#FB923C"/>' },
  { id: 'dino', voice: [0.6, 0.95], shoe: '#16A34A', c: '#4ADE80', name: ['Dino-Danny', 'דינו־דני'], hi: [['Roarrr! I’m Dino-Danny. I remember tasks from the Jurassic 🦖', 'רוארר! אני דינו־דני, ואני זוכר משימות עוד מתקופת היורה 🦖']],
    back: '<path d="M30 34 L36 14 L44 30 L52 10 L60 28 L68 10 L76 30 L84 14 L90 34 Z" fill="#16A34A"/>',
    body: '<ellipse cx="60" cy="68" rx="46" ry="40" fill="var(--mc)"/>', front: '<circle cx="30" cy="90" r="4" fill="#22C55E"/><circle cx="92" cy="50" r="5" fill="#22C55E"/><circle cx="88" cy="98" r="3" fill="#22C55E"/>' }
];
/* richer extras for the original cast */
Object.assign(ST_CAST.find(c => c.id === 'cat'), { quirk: 'q-tail', sfx: 'meow', tail: '<path class="mc-tail" d="M84 150 Q116 150 110 112 Q108 100 100 104" stroke="var(--mc)" stroke-width="10" fill="none" stroke-linecap="round"/>',
  lines: { panic: [['Hiss! Who left all these tasks on my keyboard? 🙀', 'חחחש! מי השאיר את כל המשימות על המקלדת שלי? 🙀']], party: [['Purrrfect week 😻', 'שבוע פררררפקט 😻']], rocket: [['I’ll be on your keyboard if you need me', 'אם תצטרך אותי — אני על המקלדת 🐾']] } });
Object.assign(ST_CAST.find(c => c.id === 'dino'), { quirk: 'q-tail', sfx: 'roar', tail: '<path class="mc-tail" d="M82 156 Q112 168 118 140 L104 150 Z" fill="var(--mc)" stroke="rgba(0,0,0,.14)"/>',
  lines: { panic: [['Even the asteroid was more on time 😬', 'אפילו המטאוריט הגיע יותר בזמן 😬']], rocket: [['ROAR! Go stomp that list 🦖', 'רוארר! לך תרמוס את הרשימה 🦖']] } });
Object.assign(ST_CAST.find(c => c.id === 'robot'), { sfx: 'beep', lines: { panic: [['ERROR 404: deadline not found 🤖', 'שגיאה 404: הדדליין לא נמצא 🤖']], think: [['Calculating… 87% chance you’ll crush it', 'מחשב… 87% סיכוי שתפציץ 📊']] } });
Object.assign(ST_CAST.find(c => c.id === 'ghost'), { quirk: 'q-float', sfx: 'boo', lines: { peek: [['I can walk through walls and still can’t get them to answer 👻', 'אני עובר דרך קירות ועדיין לא מצליח להשיג אותם 👻']] } });
Object.assign(ST_CAST.find(c => c.id === 'alien'), { sfx: 'radio', lines: { think: [['On my planet a week is 3 days. Lucky you 🛸', 'בכוכב שלי שבוע זה 3 ימים. יש לך מזל 🛸']] } });
Object.assign(ST_CAST.find(c => c.id === 'penguin'), { sfx: 'squeak', lines: { coffee: [['Iced coffee, obviously 🧊', 'קפה קר, ברור 🧊']] } });
Object.assign(ST_CAST.find(c => c.id === 'bear'), { sfx: 'growl', lines: { coffee: [['Honey in the coffee. Trust me 🍯', 'דבש בקפה. תסמוך עליי 🍯']] } });
Object.assign(ST_CAST.find(c => c.id === 'monster'), { sfx: 'growl', lines: { party: [['Burp. Those tasks were delicious 😋', 'גראפס. המשימות האלה היו טעימות 😋']] } });
ST_CAST.push(
  { id: 'owl', voice: [1.2, 0.92], c: '#A16207', name: ['Professor Hoot', 'פרופסור הוּט'], quirk: 'q-owl', sfx: 'hoot', shoe: '#F59E0B',
    hi: [['Hoo-hoo! Professor Hoot here. Let’s review the material 🦉', 'הוּ־הוּ! פרופסור הוּט כאן. בוא נעבור על החומר 🦉']],
    lines: { think: [['Wise owls plan ahead. Wiser ones start today 🦉', 'ינשוף חכם מתכנן. ינשוף חכם יותר מתחיל היום 🦉']], panic: [['Hoo let this happen?! 😱', 'הוּ אחראי על זה?! 😱']] },
    back: '<path d="M24 34 L20 4 L44 26 Z M96 34 L100 4 L76 26 Z" fill="#78350F"/>', body: '<ellipse cx="60" cy="66" rx="44" ry="42" fill="var(--mc)"/>',
    front: '<circle cx="44" cy="62" r="17" fill="#FDE68A"/><circle cx="76" cy="62" r="17" fill="#FDE68A"/><path d="M28 40 Q44 30 56 44 M92 40 Q76 30 64 44" stroke="#78350F" stroke-width="4" fill="none" stroke-linecap="round"/>',
    over: '<path d="M54 74 L66 74 L60 84 Z" fill="#F59E0B" stroke="#B45309" stroke-width="1.5"/>',
    torso: '<ellipse cx="60" cy="138" rx="28" ry="25" fill="var(--mc)"/><ellipse cx="60" cy="142" rx="18" ry="17" fill="#FDE68A"/><path d="M52 134 l4 4 l4-4 l4 4 l4-4 M50 144 l4 4 l4-4 l4 4 l4-4 l4 4" stroke="#B45309" stroke-width="2" fill="none"/>',
    wings: true, hat: '<g class="mc-hat"><rect x="38" y="16" width="44" height="6" fill="#111827"/><path d="M42 16 L60 6 L78 16 Z" fill="#111827"/><path d="M78 16 L86 30" stroke="#FDE047" stroke-width="2"/><circle cx="86" cy="31" r="3" fill="#FDE047"/></g>' },
  { id: 'fox', voice: [1.3, 1.1], c: '#F97316', name: ['Foxy', 'שועלי'], quirk: 'q-tail', sfx: 'yip', shoe: '#1F2937',
    hi: [['Psst… Foxy here. I know a shortcut through your tasks 🦊', 'פססט… שועלי כאן. אני מכיר קיצור דרך בין המשימות 🦊']],
    lines: { peek: [['Leave it to me, I’ll sniff out an answer 🦊', 'תשאיר לי, אני ארחרח להם תשובה 🦊']], rocket: [['Quick like a fox! Go go go 🦊', 'מהר כמו שועל! זוז זוז זוז 🦊']] },
    back: '<path d="M22 44 L26 2 L54 30 Z M98 44 L94 2 L66 30 Z" fill="var(--mc)"/><path d="M26 14 L27 2 L36 12 Z M94 14 L93 2 L84 12 Z" fill="#1F2937"/>',
    body: '<ellipse cx="60" cy="66" rx="44" ry="42" fill="var(--mc)"/>', front: '<path d="M18 74 Q60 120 102 74 Q90 104 60 106 Q30 104 18 74 Z" fill="#FFF7ED"/>',
    over: '<ellipse cx="60" cy="76" rx="6" ry="4.5" fill="#1F2937"/>',
    torso: '<ellipse cx="60" cy="138" rx="27" ry="25" fill="var(--mc)"/><ellipse cx="60" cy="144" rx="15" ry="16" fill="#FFF7ED"/>',
    tail: '<g class="mc-tail"><path d="M82 152 Q122 150 114 100 Q100 118 84 136 Z" fill="var(--mc)"/><path d="M114 100 Q118 112 110 120 Q104 112 114 100 Z" fill="#FFF7ED"/></g>' },
  { id: 'unicorn', voice: [1.6, 1.0], c: '#FCE7F3', name: ['Sparkle', 'נצנצה'], quirk: 'q-sparkle', sfx: 'chime', shoe: '#C084FC',
    hi: [['✨ Hi! I’m Sparkle. I sprinkle glitter on boring tasks ✨', '✨ היי! אני נצנצה. אני מפזרת נצנצים על משימות משעממות ✨']],
    lines: { party: [['Rainbows for everyone! 🌈', 'קשת לכולם! 🌈']], panic: [['Not even glitter can hide these 😬', 'אפילו נצנצים לא יסתירו את אלה 😬']] },
    back: '<circle cx="24" cy="44" r="12" fill="#F472B6"/><circle cx="20" cy="62" r="11" fill="#A78BFA"/><circle cx="22" cy="80" r="10" fill="#60A5FA"/><circle cx="32" cy="30" r="11" fill="#FBBF24"/><path d="M30 30 L36 10 L48 28 Z" fill="var(--mc)"/>',
    body: '<ellipse cx="60" cy="66" rx="44" ry="42" fill="var(--mc)" stroke="#F9A8D4" stroke-width="2"/>', front: '<ellipse cx="60" cy="88" rx="24" ry="14" fill="#FBCFE8"/><circle cx="52" cy="84" r="2" fill="#DB2777"/><circle cx="68" cy="84" r="2" fill="#DB2777"/>',
    hat: '<g class="mc-hat"><path d="M52 28 L60 -8 L68 28 Z" fill="#FDE047" stroke="#CA8A04" stroke-width="1.5"/><path d="M54 20 L66 16 M56 10 L64 6" stroke="#CA8A04" stroke-width="1.5"/></g>',
    tail: '<g class="mc-tail"><path d="M84 150 Q112 144 112 120" stroke="#F472B6" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M86 156 Q116 154 118 128" stroke="#A78BFA" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M84 144 Q106 136 106 116" stroke="#60A5FA" stroke-width="6" fill="none" stroke-linecap="round"/></g>',
    sparkle: true },
  { id: 'astro', voice: [1.05, 1.0], c: '#FCD9B8', limb: '#E5E7EB', name: ['Astro', 'אסטרו'], quirk: 'q-float', sfx: 'radio', shoe: '#6B7280',
    hi: [['Houston, this is Astro. Ready for the task mission 🚀', 'יוסטון, כאן אסטרו. מוכן למשימת המשימות 🚀']],
    lines: { think: [['One small task for you, one giant leap for the list', 'משימה קטנה לך, צעד גדול לרשימה 🌕']], rocket: [['Ignition! See you in orbit 🛰', 'הצתה! נתראה במסלול 🛰']] },
    back: '', body: '<ellipse cx="60" cy="66" rx="40" ry="40" fill="var(--mc)"/><path d="M24 52 Q60 14 96 52 Q88 30 60 26 Q32 30 24 52 Z" fill="#92400E"/>', front: '',
    over: '<circle cx="60" cy="64" r="52" fill="rgba(191,219,254,.18)" stroke="#E5E7EB" stroke-width="5"/><path d="M26 44 Q36 22 60 18" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/><path d="M96 26 L106 6" stroke="#9CA3AF" stroke-width="3"/><circle class="mc-blink" cx="106" cy="5" r="4" fill="#F87171"/>',
    torso: '<rect x="32" y="112" width="56" height="48" rx="16" fill="#E5E7EB" stroke="#9CA3AF" stroke-width="2"/><rect x="46" y="122" width="28" height="18" rx="4" fill="#1E3A8A"/><circle cx="53" cy="131" r="3" fill="#34D399"/><circle class="mc-blink" cx="67" cy="131" r="3" fill="#F87171"/><path d="M36 150 L84 150" stroke="#60A5FA" stroke-width="3"/>' },
  { id: 'pirate', voice: [0.75, 0.95], c: '#F2C9A0', limb: '#991B1B', name: ['Captain Arr', 'קפטן אררר'], quirk: 'q-sway', sfx: 'arr', shoe: '#111827',
    hi: [['Arrr! Captain Arr on deck. Show me the treasure… I mean the tasks 🏴‍☠️', 'אררר! קפטן אררר על הסיפון. תראה לי את האוצר… כלומר את המשימות 🏴‍☠️']],
    lines: { panic: [['Arrr! These tasks will sink the ship ⚓', 'אררר! המשימות האלה עוד יטביעו את הספינה ⚓']], peek: [['Send a parrot to remind them 🦜', 'שלח להם תוכי עם תזכורת 🦜']], party: [['Yo-ho-ho! That’s real treasure 💰', 'יו־הו־הו! זה האוצר האמיתי 💰']] },
    back: '', body: '<ellipse cx="60" cy="66" rx="42" ry="42" fill="var(--mc)"/>', front: '<path d="M30 92 Q60 128 90 92 Q86 110 60 114 Q34 110 30 92 Z" fill="#78350F"/>',
    over: '<path d="M26 50 L94 46" stroke="#111827" stroke-width="3"/><ellipse cx="44" cy="62" rx="13" ry="12" fill="#111827"/>',
    hat: '<g class="mc-hat"><path d="M10 34 Q60 -4 110 34 Q60 22 10 34 Z" fill="#111827"/><path d="M26 30 Q60 0 94 30" fill="#111827"/><circle cx="60" cy="18" r="6" fill="#F8FAFC"/><path d="M56 24 L64 24" stroke="#111827" stroke-width="2"/></g>',
    torso: '<path d="M32 118 Q60 108 88 118 L86 160 L34 160 Z" fill="#991B1B"/><path d="M50 116 L60 160 L70 116 Z" fill="#F8FAFC"/><path d="M52 126 H68 M54 136 H66 M56 146 H64" stroke="#1E3A8A" stroke-width="3"/><circle cx="40" cy="130" r="2.5" fill="#FDE047"/><circle cx="80" cy="130" r="2.5" fill="#FDE047"/>' },
  { id: 'wizard', voice: [0.85, 0.88], c: '#F5D0B5', limb: '#6D28D9', name: ['Merlinus', 'מרלינוס'], quirk: 'q-sparkle', sfx: 'magic', shoe: '#4C1D95',
    hi: [['Abracadabra! Merlinus at your service. Shall I make tasks disappear? 🪄', 'אברקדברה! מרלינוס לשירותך. שאעלים לך משימות? 🪄']],
    lines: { think: [['My crystal ball says… a busy week 🔮', 'כדור הבדולח שלי אומר… שבוע עמוס 🔮']], rocket: [['Wand ready. Now YOU do the magic ✨', 'השרביט מוכן. עכשיו אתה עושה את הקסם ✨']], panic: [['Even magic can’t undo “late” 😅', 'אפילו קסם לא מבטל "באיחור" 😅']] },
    back: '', body: '<ellipse cx="60" cy="66" rx="40" ry="40" fill="var(--mc)"/>', front: '<path d="M28 82 Q32 132 60 152 Q88 132 92 82 Q80 104 60 104 Q40 104 28 82 Z" fill="#F8FAFC" stroke="#E5E7EB"/>',
    over: '<path d="M40 82 Q50 76 58 82 M62 82 Q70 76 80 82" stroke="#F8FAFC" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M34 46 Q44 40 54 46 M66 46 Q76 40 86 46" stroke="#E5E7EB" stroke-width="4" fill="none" stroke-linecap="round"/>',
    hat: '<g class="mc-hat"><ellipse cx="60" cy="34" rx="50" ry="9" fill="#5B21B6"/><path d="M28 34 L66 -24 L92 34 Z" fill="#6D28D9"/><path d="M66 -24 Q80 -20 84 -8" stroke="#6D28D9" stroke-width="6" fill="none"/><path d="M50 10 l2 5 l5 0 l-4 3 l2 5 l-5-3 l-5 3 l2-5 l-4-3 l5 0 Z M72 20 l1.5 3.5 l3.5 0 l-3 2 l1.5 3.5 l-3.5-2 l-3.5 2 l1.5-3.5 l-3-2 l3.5 0 Z" fill="#FDE047"/></g>',
    itemL: '<g class="mc-wand"><path d="M18 156 L4 128" stroke="#78350F" stroke-width="4" stroke-linecap="round"/><path d="M4 120 l2.5 5 l5.5 .5 l-4 3.5 l1.5 5.5 l-5.5-3 l-5 3 l1.5-5.5 l-4-3.5 l5.5-.5 Z" fill="#FDE047"/></g>',
    torso: '<path d="M30 160 Q34 116 60 112 Q86 116 90 160 Z" fill="#6D28D9"/><path d="M40 140 l2 4 l4 0 l-3 3 l1 4 l-4-2 l-4 2 l1-4 l-3-3 l4 0 Z" fill="#FDE047"/>', sparkle: true },
  { id: 'chef', voice: [1.0, 1.08], c: '#F8D5B8', limb: '#F8FAFC', name: ['Chef Pepe', 'שף פפה'], quirk: 'q-sway', sfx: 'sizzle', shoe: '#111827',
    hi: [['Bonjour! Chef Pepe here. Today’s menu: your tasks, served hot 👨‍🍳', 'בונז׳ור! שף פפה כאן. התפריט היום: המשימות שלך, מוגשות חמות 👨‍🍳']],
    lines: { coffee: [['Espresso. Double. Now. ☕', 'אספרסו. כפול. עכשיו. ☕']], party: [['Chef’s kiss! 🤌', 'נשיקת שף! 🤌']], panic: [['Something is burning in the kitchen! 🔥', 'משהו נשרף במטבח! 🔥']] },
    back: '', body: '<ellipse cx="60" cy="68" rx="40" ry="40" fill="var(--mc)"/>', front: '<ellipse cx="60" cy="76" rx="5" ry="4" fill="#E9A07A"/>',
    over: '<path d="M38 82 Q48 72 60 80 Q72 72 82 82 Q72 80 60 84 Q48 80 38 82 Z" fill="#3F2A1D"/>',
    hat: '<g class="mc-hat"><rect x="34" y="22" width="52" height="14" rx="3" fill="#F8FAFC" stroke="#E5E7EB"/><circle cx="40" cy="12" r="12" fill="#F8FAFC"/><circle cx="60" cy="4" r="14" fill="#F8FAFC"/><circle cx="80" cy="12" r="12" fill="#F8FAFC"/></g>',
    itemL: '<g class="mc-spat"><path d="M18 156 L8 132" stroke="#78350F" stroke-width="4" stroke-linecap="round"/><rect x="0" y="116" width="14" height="18" rx="3" fill="#9CA3AF" transform="rotate(-22 7 125)"/></g>',
    torso: '<ellipse cx="60" cy="138" rx="28" ry="25" fill="#F8FAFC" stroke="#E5E7EB"/><path d="M44 126 H76 V158 H44 Z" fill="#FCA5A5" opacity=".85"/><circle cx="54" cy="122" r="2" fill="#9CA3AF"/><circle cx="66" cy="122" r="2" fill="#9CA3AF"/><path d="M48 116 L60 124 L72 116" fill="#DC2626"/>' },
  { id: 'octo', voice: [1.45, 1.05], c: '#F472B6', name: ['Octavia', 'תמנונה'], quirk: 'q-tent', sfx: 'blub', noLegs: true,
    hi: [['Blub blub! Octavia here — eight arms, zero excuses 🐙', 'בלוב בלוב! תמנונה כאן — שמונה זרועות, אפס תירוצים 🐙']],
    lines: { coffee: [['Eight cups of coffee. One per arm ☕', 'שמונה כוסות קפה. אחת לכל זרוע ☕']], party: [['Eight high-fives! 🙌', 'שמונה כיפים! 🙌']] },
    back: '', body: '<path d="M16 72 Q16 20 60 20 Q104 20 104 72 Q104 108 60 110 Q16 108 16 72 Z" fill="var(--mc)"/>', front: '<circle cx="34" cy="38" r="5" fill="rgba(255,255,255,.35)"/><circle cx="86" cy="42" r="4" fill="rgba(0,0,0,.1)"/><circle cx="76" cy="30" r="3" fill="rgba(0,0,0,.1)"/>',
    torso: '<g class="mc-tent"><path d="M30 104 Q18 140 30 160 Q36 170 28 180" stroke="var(--mc)" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M46 108 Q40 146 48 166 Q52 178 44 188" stroke="var(--mc)" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M74 108 Q80 146 72 166 Q68 178 76 188" stroke="var(--mc)" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M90 104 Q102 140 90 160 Q84 170 92 180" stroke="var(--mc)" stroke-width="10" fill="none" stroke-linecap="round"/></g>' }
);
ST_CAST.push(
  { id: 'soldier', voice: [0.8, 1.0], c: '#E8B98F', limb: '#4D5D33', name: ['Sgt. Shlomi', 'רס״ר שלומי'], quirk: 'q-sway', sfx: 'whistle', shoe: '#1F2937',
    hi: [['Attention! Sgt. Shlomi here — tasks, fall in! 🪖', 'הקשב! רס״ר שלומי כאן — משימות, להסתדר בשלשות! 🪖']],
    lines: { panic: [['What’s this mess?! Sort it out by 18:00 😤', 'מה הבלגן הזה?! לסדר עד שש בערב 😤']], coffee: [['Field coffee, finjan style ☕', 'קפה שחור בפינג׳אן, כמו בשטח ☕']], party: [['Outstanding! Weekend leave approved 🎖', 'מצוין! יציאה הביתה אושרה 🎖']], rocket: [['Move, move, move! 🏃', 'זוז, זוז, זוז! 🏃']] },
    back: '', body: '<ellipse cx="60" cy="68" rx="40" ry="40" fill="var(--mc)"/>', front: '<path d="M36 92 Q60 108 84 92" stroke="#A16207" stroke-width="2" fill="none" opacity=".35"/>',
    hat: '<g class="mc-hat"><path d="M16 46 Q16 8 60 8 Q104 8 104 46 Q60 36 16 46 Z" fill="#556B2F"/><path d="M24 34 Q60 22 96 34 M30 22 Q60 12 90 22 M40 14 L36 44 M60 10 L60 40 M80 14 L84 44" stroke="#3F4F24" stroke-width="2" fill="none"/><path d="M12 46 Q60 34 108 46" stroke="#3F4F24" stroke-width="4" fill="none"/></g>',
    torso: '<path d="M32 116 Q60 108 88 116 L88 160 L32 160 Z" fill="#556B2F"/><rect x="38" y="124" width="16" height="12" rx="2" fill="#4D5D33" stroke="#2A1A12" stroke-width="1.5"/><rect x="66" y="124" width="16" height="12" rx="2" fill="#4D5D33" stroke="#2A1A12" stroke-width="1.5"/><path d="M60 112 V160" stroke="#3F4F24" stroke-width="2"/><path d="M40 112 L44 118 L48 112 M72 112 L76 118 L80 112" fill="#FDE047"/>' },
  { id: 'doctor', voice: [1.1, 1.0], c: '#F5D0B5', limb: '#F8FAFC', name: ['Dr. Rafael', 'ד״ר רפאל'], quirk: '', sfx: 'heart', shoe: '#64748B',
    hi: [['Dr. Rafael here. Say “aaah”… and show me your list 🩺', 'ד״ר רפאל כאן. תגיד "אההה"… ותראה לי את הרשימה 🩺']],
    lines: { panic: [['Diagnosis: acute task-itis. Treatment: start now 💊', 'אבחנה: משימתיות חריפה. טיפול: להתחיל עכשיו 💊']], coffee: [['Doctor’s orders: water first, then coffee 💧', 'הוראות רופא: קודם מים, אחר כך קפה 💧']], party: [['Your health score is excellent! 💪', 'מדדים מצוינים! 💪']], rocket: [['An appointment a day keeps the doctor away 🍎', 'תור אחד ביום מרחיק את הרופא 🍎']] },
    back: '', body: '<ellipse cx="60" cy="68" rx="40" ry="40" fill="var(--mc)"/><path d="M22 54 Q24 24 60 24 Q96 24 98 54 Q86 36 60 38 Q34 36 22 54 Z" fill="#6B4226"/>', front: '',
    hat: '<g class="mc-hat"><path d="M26 34 Q60 22 94 34" stroke="#94A3B8" stroke-width="4" fill="none"/><circle cx="60" cy="26" r="10" fill="#E2E8F0" stroke="#2A1A12" stroke-width="2"/><circle cx="60" cy="26" r="4" fill="#fff"/></g>',
    torso: '<path d="M30 160 Q32 116 60 112 Q88 116 90 160 Z" fill="#F8FAFC"/><path d="M60 112 L52 160 M60 112 L68 160" stroke="#CBD5E1" stroke-width="2"/><path d="M44 116 Q40 138 52 144 Q60 148 58 138" stroke="#334155" stroke-width="2.5" fill="none"/><circle cx="58" cy="137" r="4" fill="#94A3B8" stroke="#2A1A12" stroke-width="1.5"/><rect x="70" y="124" width="12" height="10" rx="1" fill="#E2E8F0" stroke="#2A1A12" stroke-width="1.2"/><path d="M76 126 v6 M73 129 h6" stroke="#DC2626" stroke-width="2"/>' }
);
/* which characters fit which area (matched by name, Hebrew or English) */
/* every character can appear in every area — but it dresses for the area(s) of the video */
const ST_OUTFITS = [
  { re: /work|עבוד|משרד|job/i, id: 'work', label: ['in a suit', 'בחליפה'],
    torso: '<path d="M33 116 Q60 108 87 116 L88 160 L32 160 Z" fill="#1E3A8A"/><path d="M48 112 L60 130 L72 112 Z" fill="#fff" stroke="#2A1A12" stroke-width="1.6"/><path d="M57 118 h6 l-1 5 h-4 z" fill="#DC2626" stroke="#2A1A12" stroke-width="1.4"/><path d="M58 123 h4 l3 24 l-5 6 l-5-6 z" fill="#DC2626" stroke="#2A1A12" stroke-width="1.4"/><path d="M48 112 L54 140 M72 112 L66 140" stroke="#172554" stroke-width="2.5"/><circle cx="60" cy="152" r="1.6" fill="#FDE047"/>',
    item: '<g class="mc-prop"><rect x="2" y="158" width="30" height="20" rx="3" fill="#92400E" stroke="#2A1A12" stroke-width="2.2"/><path d="M11 158 v-4 h12 v4" fill="none" stroke="#2A1A12" stroke-width="2.2"/><path d="M2 166 h30" stroke="#2A1A12" stroke-width="1.6"/><rect x="15" y="164" width="4" height="4" fill="#FDE047" stroke="#2A1A12" stroke-width="1"/></g>',
    lines: { coffee: [['Suit, tie, coffee — meeting mode 👔', 'חליפה, עניבה, קפה — מצב ישיבות 👔']], rocket: [['Briefcase packed. To the office! 💼', 'התיק ארוז. למשרד! 💼']] } },
  { re: /home|בית|house|משק/i, id: 'home', label: ['in an apron', 'עם סינר'],
    hat: '<g class="mc-hat"><path d="M18 40 Q20 20 60 18 Q100 20 102 40 Q96 30 60 30 Q24 30 18 40 Z" fill="#F472B6"/><circle cx="60" cy="16" r="5" fill="#F9A8D4"/><path d="M56 30 l-4 4 M64 30 l4 4" stroke="#2A1A12" stroke-width="1.5"/></g>',
    torso: '<path d="M40 116 h40 l4 44 h-48 z" fill="#93C5FD"/><path d="M40 116 Q36 110 32 116 M80 116 Q84 110 88 116" stroke="#2A1A12" stroke-width="1.8" fill="none"/><rect x="50" y="134" width="20" height="12" rx="2" fill="#BFDBFE" stroke="#2A1A12" stroke-width="1.5"/><path d="M44 124 h32" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/>',
    item: '<g class="mc-prop"><path d="M18 156 L10 128" stroke="#92400E" stroke-width="3.5" stroke-linecap="round"/><path d="M10 128 q-10-6-8-16 q6 2 8 8 q0-10 6-14 q2 10-2 16 q8-4 12 0 q-6 6-16 6z" fill="#FDE68A" stroke="#2A1A12" stroke-width="1.6"/></g>',
    lines: { coffee: [['Coffee, then laundry. Maybe 🧺', 'קפה, ואז כביסה. אולי 🧺']], rocket: [['House won’t clean itself 🧹', 'הבית לא ינקה את עצמו 🧹']] } },
  { re: /m\.?sc|תואר|לימוד|study|studies|univers|אוניבר/i, id: 'study', label: ['in a graduation cap', 'עם כובע סיום'],
    hat: '<g class="mc-hat"><path d="M24 22 L60 8 L96 22 L60 36 Z" fill="#111827"/><path d="M40 28 v10 q20 8 40 0 v-10" fill="#1F2937"/><g class="mc-tassel"><path d="M60 22 L88 26 L90 44" stroke="#FDE047" stroke-width="2.5" fill="none"/><path d="M86 44 h8 l-1 8 h-6 z" fill="#FDE047"/></g></g>',
    torso: '<path d="M38 114 Q60 128 82 114 L80 122 Q60 136 40 122 Z" fill="#B91C1C"/>',
    item: '<g class="mc-prop"><path d="M2 150 l16-6 l16 6 v20 l-16-6 l-16 6 z" fill="#2563EB" stroke="#2A1A12" stroke-width="2"/><path d="M18 144 v20" stroke="#2A1A12" stroke-width="2"/><path d="M5 154 l10-3 M5 159 l10-3 M21 151 l10 3" stroke="#fff" stroke-width="1.2"/></g>',
    lines: { think: [['Thesis deadline is closer than it looks 📚', 'ההגשה של התזה קרובה ממה שנראה 📚']], coffee: [['Coffee + library = science ☕📚', 'קפה + ספרייה = מדע ☕📚']] } },
  { re: /reserve|מילואים|צבא|army|idf/i, id: 'army', label: ['in uniform', 'במדים'],
    hat: '<g class="mc-hat"><path d="M16 46 Q16 8 60 8 Q104 8 104 46 Q60 36 16 46 Z" fill="#556B2F"/><path d="M24 34 Q60 22 96 34 M30 22 Q60 12 90 22 M40 14 L36 44 M60 10 L60 40 M80 14 L84 44" stroke="#3F4F24" stroke-width="2" fill="none"/></g>',
    torso: '<path d="M32 116 Q60 108 88 116 L88 160 L32 160 Z" fill="#556B2F"/><rect x="38" y="124" width="16" height="12" rx="2" fill="#4D5D33" stroke="#2A1A12" stroke-width="1.5"/><rect x="66" y="124" width="16" height="12" rx="2" fill="#4D5D33" stroke="#2A1A12" stroke-width="1.5"/><path d="M60 112 V160" stroke="#3F4F24" stroke-width="2"/>',
    item: '<g class="mc-prop"><rect x="6" y="152" width="18" height="24" rx="8" fill="#4D5D33" stroke="#2A1A12" stroke-width="2"/><rect x="11" y="146" width="8" height="7" rx="2" fill="#1F2937"/></g>',
    lines: { panic: [['In the army we call this “a situation” 😬', 'בצבא קוראים לזה "סיטואציה" 😬']], rocket: [['Gear up and move out! 🪖', 'מתארגנים ויוצאים! 🪖']] } },
  { re: /family|משפח|kids|ילדים/i, id: 'family', label: ['in a family T-shirt', 'בחולצת משפחה'],
    torso: '<path d="M32 116 Q60 108 88 116 L86 160 L34 160 Z" fill="#FDE68A"/><path d="M60 146 q-14-10-10-18 q4-6 10 0 q6-6 10 0 q4 8-10 18z" fill="#EF4444" stroke="#2A1A12" stroke-width="1.6"/>',
    item: '<g class="mc-prop"><path d="M18 156 Q10 120 22 92" stroke="#2A1A12" stroke-width="1.2" fill="none"/><path d="M22 92 q-12-2-12-16 q0-14 12-14 q12 0 12 14 q0 14-12 16z" fill="#F472B6" stroke="#2A1A12" stroke-width="2"/><path d="M16 72 q2-4 6-4" stroke="#fff" stroke-width="2" fill="none"/></g>',
    lines: { coffee: [['Breakfast for everyone, then tasks 🥞', 'ארוחת בוקר לכולם, ואז משימות 🥞']], party: [['Family high-five! 🙌', 'כיף משפחתי! 🙌']] } },
  { re: /financ|money|כספ|כסף|פיננס|bank|בנק/i, id: 'money', label: ['with a money bag', 'עם שק כסף'],
    hat: '<g class="mc-hat"><path d="M20 40 Q60 22 100 40 L100 44 Q60 32 20 44 Z" fill="#16A34A"/><path d="M30 42 Q60 58 92 42 Q60 50 30 42 Z" fill="rgba(22,163,74,.55)" stroke="#2A1A12" stroke-width="1.6"/></g>',
    torso: '<path d="M36 116 h48 l2 44 h-52 z" fill="#475569"/><path d="M52 114 l8 6 l8-6 l-2 8 h-12 z" fill="#111827"/><circle cx="56" cy="134" r="1.8" fill="#FDE047"/><circle cx="56" cy="144" r="1.8" fill="#FDE047"/><circle cx="56" cy="154" r="1.8" fill="#FDE047"/>',
    item: '<g class="mc-prop"><path d="M8 150 q-10 6-10 18 q0 12 20 12 q20 0 20-12 q0-12-10-18 z" fill="#CA8A04" stroke="#2A1A12" stroke-width="2"/><path d="M10 150 l-2-6 h20 l-2 6" fill="#A16207" stroke="#2A1A12" stroke-width="1.6"/><text x="18" y="172" font-size="13" font-weight="900" text-anchor="middle" fill="#2A1A12">₪</text></g>',
    lines: { think: [['Budget check: on track… mostly 📊', 'בדיקת תקציב: בתוכנית… פחות או יותר 📊']], party: [['Profit! 💰', 'רווח! 💰']] } },
  { re: /health|בריאות|רפוא|doctor|sport|ספורט/i, id: 'sport', label: ['in sportswear', 'בבגדי ספורט'],
    hat: '<g class="mc-hat"><path d="M18 46 Q60 30 102 46 L102 54 Q60 38 18 54 Z" fill="#EF4444" stroke="#2A1A12" stroke-width="2"/><path d="M30 46 Q60 36 90 46" stroke="#fff" stroke-width="2" fill="none"/></g>',
    torso: '<path d="M34 116 Q60 108 86 116 L84 160 L36 160 Z" fill="#22C55E"/><text x="60" y="146" font-size="18" font-weight="900" text-anchor="middle" fill="#fff" stroke="#2A1A12" stroke-width=".8">1</text><path d="M34 120 l6 2 M86 120 l-6 2" stroke="#fff" stroke-width="2"/>',
    item: '<g class="mc-prop"><rect x="4" y="152" width="28" height="5" rx="2" fill="#475569" stroke="#2A1A12" stroke-width="1.5"/><rect x="0" y="145" width="8" height="19" rx="2" fill="#1F2937" stroke="#2A1A12" stroke-width="1.5"/><rect x="28" y="145" width="8" height="19" rx="2" fill="#1F2937" stroke="#2A1A12" stroke-width="1.5"/></g>',
    lines: { coffee: [['Protein shake instead of coffee 💪', 'שייק חלבון במקום קפה 💪']], rocket: [['Warm-up done. Go! 🏃', 'חימום נגמר. רוץ! 🏃']] } },
  { re: /personal|אישי|myself/i, id: 'chill', label: ['in a hoodie', 'בקפוצ׳ון'],
    hat: '<g class="mc-hat"><path d="M18 64 Q18 18 60 18 Q102 18 102 64" stroke="#2A1A12" stroke-width="5" fill="none"/><rect x="10" y="56" width="14" height="24" rx="6" fill="#8B5CF6" stroke="#2A1A12" stroke-width="2"/><rect x="96" y="56" width="14" height="24" rx="6" fill="#8B5CF6" stroke="#2A1A12" stroke-width="2"/></g>',
    torso: '<path d="M32 116 Q60 108 88 116 L86 160 L34 160 Z" fill="#A78BFA"/><path d="M46 140 h28 l-3 12 h-22 z" fill="#8B5CF6" stroke="#2A1A12" stroke-width="1.5"/><path d="M54 114 v12 M66 114 v12" stroke="#fff" stroke-width="2"/>',
    item: '<g class="mc-prop"><path d="M10 160 l8 22 l8-22 z" fill="#F59E0B" stroke="#2A1A12" stroke-width="1.8"/><circle cx="18" cy="152" r="9" fill="#F9A8D4" stroke="#2A1A12" stroke-width="2"/><circle cx="14" cy="146" r="2" fill="#fff"/></g>',
    lines: { coffee: [['Me-time: coffee and a good playlist 🎧', 'זמן לעצמי: קפה ופלייליסט טוב 🎧']] } }
];
function stOutfit(areas) {
  const fit = ST_OUTFITS.filter(o => (areas || []).some(a => o.re.test(a) || o.re.test(tr(a))));
  return fit.length ? fit[Math.floor(Math.random() * fit.length)] : null;
}
/* pick something not used last time */
function stPick(pool, avoid) { const fresh = pool.filter(x => avoid.indexOf(x[1]) < 0); const from = fresh.length ? fresh : pool; return from[Math.floor(Math.random() * from.length)]; }
function stCast(slides, areas) {
  let last = {}; try { last = store.get('ai.storyLast', {}) || {}; } catch (e) { last = {}; }
  const pool = ST_CAST, outfit = stOutfit(areas);
  const others = pool.filter(c => c.id !== last.ch && (last.chs || []).slice(-Math.min(3, pool.length - 1)).indexOf(c.id) < 0);
  const from = others.length ? others : pool.filter(c => c.id !== last.ch).length ? pool.filter(c => c.id !== last.ch) : pool;
  const ch = from[Math.floor(Math.random() * from.length)];
  const used = last.lines || [], now = [];
  const lines = slides.map(sl => {
    const md = sl.mood || ST_MOOD[sl.cls] || ['hi', 'intro'];
    const own = ((ch.lines && ch.lines[md[1]]) || []).concat((outfit && outfit.lines && outfit.lines[md[1]]) || []);
    const pool = md[1] === 'intro' ? ch.hi : (own.length && Math.random() < 0.55 ? own : (ST_LINES[md[1]] || [['', '']]).concat(own));
    const pick = stPick(pool, used.concat(now)); now.push(pick[1]); return [md[0], pick];
  });
  store.set('ai.storyLast', { ch: ch.id, chs: (last.chs || []).concat(ch.id).slice(-6), lines: now });
  return { ch, lines, outfit };
}
function confetti(host) {
  const cols = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6', '#FFFFFF'];
  const box = document.createElement('div'); box.className = 'st-confetti';
  for (let k = 0; k < 60; k++) { const c = document.createElement('i'); c.style.left = Math.random() * 100 + '%'; c.style.background = cols[k % cols.length];
    c.style.animationDelay = (Math.random() * 1.2) + 's'; c.style.animationDuration = (2.2 + Math.random() * 1.8) + 's'; c.style.transform = `rotate(${Math.random() * 360}deg)`;
    if (k % 3 === 0) c.style.borderRadius = '50%'; box.appendChild(c); }
  host.appendChild(box);
}
let mcSeq = 0;
const INK = '#2A1A12';
/* "drawn by hand": ink outlines on solid shapes */
function inked(svg, w) {
  return String(svg || '').replace(/<(ellipse|path|rect|circle)\b([^>]*?)\/>/g, (m, tag, attrs) => {
    const f = (attrs.match(/fill="([^"]*)"/) || [])[1] || '';
    if (!f || f === 'none' || /rgba|url|#fff\b|#FFFFFF/i.test(f) || /opacity/.test(attrs)) return m;
    return `<${tag}${attrs.replace(/\sstroke(-width)?="[^"]*"/g, '')} stroke="${INK}" stroke-width="${w || 2.6}" stroke-linejoin="round"/>`;
  });
}
function mascotSvg(ch, outfit) {
  ch = ch || ST_CAST[0];
  if (outfit) ch = Object.assign({}, ch, { hat: outfit.hat || ch.hat, itemL: outfit.item || ch.itemL, dress: outfit.torso || '' });
  const G = 'mcg' + (++mcSeq), limb = ch.limb || 'var(--mc)';
  const onlyMc = (svg) => (String(svg || '').match(/<(ellipse|path|rect|circle)[^>]*fill="var\(--mc\)"[^>]*\/>/g) || []).join('');
  const plain = (svg, fill) => onlyMc(svg).replace(/fill="var\(--mc\)"/g, `fill="${fill}"`).replace(/\s(stroke|stroke-width|class)="[^"]*"/g, '');
  const torso = ch.torso || `<ellipse cx="60" cy="138" rx="28" ry="25" fill="var(--mc)"/><ellipse cx="60" cy="143" rx="17" ry="15" fill="rgba(255,255,255,.3)"/>`;
  const forms = plain(ch.body, '#fff') + plain(torso, '#fff'), formsOff = plain(ch.body, '#000') + plain(torso, '#000');
  const legs = ch.noLegs ? '' : ['L', 'R'].map(sd => { const x = sd === 'L' ? 43 : 65, fx = sd === 'L' ? 46 : 74;
    return `<g class="mc-leg mc-leg${sd}"><path d="M${x + 6} 150 Q${x + (sd === 'L' ? 4 : 8)} 166 ${x + 6} 180" stroke="${INK}" stroke-width="15" fill="none" stroke-linecap="round"/><path d="M${x + 6} 150 Q${x + (sd === 'L' ? 4 : 8)} 166 ${x + 6} 180" stroke="${limb}" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M${fx - 12} 186 Q${fx - 11} 176 ${fx} 177 Q${fx + 12} 178 ${fx + 12} 186 Z" fill="${ch.shoe || '#1F2937'}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/></g>`; }).join('');
  const arm = (side) => { const L = side === 'L', sx = L ? 37 : 83, hx = L ? 18 : 102, d = `M${sx} 126 Q${L ? 22 : 98} 138 ${hx} 154`;
    return `<g class="mc-arm mc-arm${side}"><path d="${d}" stroke="${INK}" stroke-width="14.5" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${limb}" stroke-width="9.5" fill="none" stroke-linecap="round"/>
      ${L ? inked(ch.itemL || '', 2) : ''}<path d="M${hx - 7} 156 q0-8 7-8 q8 0 8 7 q0 3-2 4 q2 2 0 4 q-2 3-7 2 q-6-1-6-9z" fill="${ch.limb ? '#F5D0B5' : 'var(--mc)'}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>${L ? '' : `<g class="mc-extra mc-cup"><path d="M${hx - 8} 138 h16 l-2 18 h-12 z" fill="#fff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M${hx + 8} 143 q6 0 6 5 q0 5-6 5" fill="none" stroke="${INK}" stroke-width="2.4"/>
      <path class="mc-steam" d="M${hx - 3} 134 q-3-5 0-8 q3-3 0-8 M${hx + 3} 134 q-3-5 0-8 q3-3 0-8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></g>`}</g>`; };
  const wings = ch.wings ? `<g class="mc-wing mc-wingL"><path d="M34 120 Q4 126 8 162 Q14 152 20 156 Q24 148 36 146 Z" fill="#78350F" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/></g><g class="mc-wing mc-wingR"><path d="M86 120 Q116 126 112 162 Q106 152 100 156 Q96 148 84 146 Z" fill="#78350F" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/></g>` : '';
  const sparkle = ch.sparkle ? `<g class="mc-sparkles"><path d="M8 40 l2 6 l6 2 l-6 2 l-2 6 l-2-6 l-6-2 l6-2 Z" fill="#FDE047" stroke="${INK}" stroke-width="1.2"/><path d="M110 70 l1.5 4.5 l4.5 1.5 l-4.5 1.5 l-1.5 4.5 l-1.5-4.5 l-4.5-1.5 l4.5-1.5 Z" fill="#F9A8D4" stroke="${INK}" stroke-width="1.2"/><path d="M100 14 l1.5 4.5 l4.5 1.5 l-4.5 1.5 l-1.5 4.5 l-1.5-4.5 l-4.5-1.5 l4.5-1.5 Z" fill="#A5F3FC" stroke="${INK}" stroke-width="1.2"/></g>` : '';
  const eye = (cx, flip) => `<path d="M${cx - 11} ${62} q1-13 12-12 q11 1 10 13 q-1 11-11 11 q-11 0-11-12z" fill="#FFFDF7" stroke="${INK}" stroke-width="2.4" ${flip ? `transform="rotate(-6 ${cx} 62)"` : `transform="rotate(5 ${cx} 62)"`}/>`;
  return `<svg class="mc-svg mc-${ch.id} ${ch.quirk || ''} ${ch.hat ? 'has-hat' : ''}" viewBox="0 0 120 200" aria-hidden="true" style="--mc:${ch.c}">
    <defs>
      <filter id="${G}b" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="2"><animate attributeName="seed" values="2;7;12" dur="0.42s" repeatCount="indefinite" calcMode="discrete"/></feTurbulence><feDisplacementMap in="SourceGraphic" scale="2.4" xChannelSelector="R" yChannelSelector="G"/></filter>
      <pattern id="${G}x" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><path d="M0 0 V4.5" stroke="${INK}" stroke-width="1.1" opacity=".42"/></pattern>
      <pattern id="${G}y" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-50)"><path d="M0 0 V6" stroke="${INK}" stroke-width=".9" opacity=".25"/></pattern>
      <mask id="${G}m"><g>${forms}</g><g transform="translate(-10 -11)">${formsOff}</g></mask>
      <mask id="${G}n"><g>${forms}</g><g transform="translate(-5 -6)">${formsOff}</g></mask>
      <radialGradient id="${G}h" cx="35%" cy="28%" r="45%"><stop offset="0%" stop-color="#fff" stop-opacity=".5"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <path class="mc-shadow" d="M30 192 q8-6 30-6 q24 0 30 6 q-6 5-30 5 q-24 0-30-5z" fill="${INK}" opacity=".22"/>
    <g class="mc-all" filter="url(#${G}b)">
      <g class="mc-extra mc-rocket"><path d="M38 188 L46 200 L54 188 Z M66 188 L74 200 L82 188 Z" fill="#F97316" stroke="${INK}" stroke-width="1.6"/><path d="M42 188 L46 195 L50 188 Z M70 188 L74 195 L78 188 Z" fill="#FDE047"/></g>
      ${inked(ch.tail || '')}${wings}${legs}${arm('L')}${inked(torso)}${ch.dress ? `<g class="mc-dress">${inked(ch.dress, 2.2)}</g>` : ''}${arm('R')}
      <g class="mc-head">${inked(ch.back)}${inked(ch.body, 3)}${ch.front}
        <rect x="0" y="0" width="120" height="200" fill="url(#${G}x)" mask="url(#${G}m)"/><rect x="0" y="0" width="120" height="200" fill="url(#${G}y)" mask="url(#${G}n)"/>
        <path d="M30 46 Q36 30 54 26" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".55"/><path d="M28 56 Q29 52 31 49" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".45"/>
        <g class="mc-cheek" stroke="#E11D48" stroke-width="1.6" stroke-linecap="round" opacity=".55"><path d="M24 80 l4-5 M28 81 l4-5 M32 82 l4-5"/><path d="M84 82 l4-5 M88 81 l4-5 M92 80 l4-5"/></g>
        <g class="mc-eyes">${eye(44, true)}${eye(76, false)}
          <g class="mc-pupils"><ellipse class="mc-pupil" cx="46" cy="64" rx="5" ry="5.6" fill="${INK}"/><ellipse class="mc-pupil" cx="78" cy="64" rx="5" ry="5.6" fill="${INK}"/><circle cx="47.8" cy="61.6" r="1.8" fill="#fff"/><circle cx="79.8" cy="61.6" r="1.8" fill="#fff"/></g>
          <rect class="mc-lid" x="32" y="50" width="56" height="0" fill="var(--mc)"/></g>
        <g class="mc-brows"><path class="mc-browL" d="M33 46 Q42 40 52 44" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/><path class="mc-browR" d="M68 44 Q78 40 87 46" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/></g>
        <path class="mc-mouth m-smile" d="M44 86 Q52 97 61 95 Q70 94 76 85" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
        <path class="mc-mouth m-wavy" d="M42 90 q6-6 12 0 t12 0 t12 0" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
        <path class="mc-mouth m-o" d="M54 90 q0-9 6-9 q7 0 7 9 q0 9-7 9 q-6 0-6-9z" fill="${INK}"/>
        <g class="mc-mouth m-grin"><path d="M40 84 Q52 88 80 83 Q76 104 60 105 Q44 104 40 84 Z" fill="${INK}"/><path d="M46 86 Q60 89 74 85 L73 90 Q60 92 47 90 Z" fill="#fff"/><path d="M52 100 Q60 96 68 100 Q62 104 52 100 Z" fill="#F87171"/></g>
        <g class="mc-talk"><path d="M50 90 q0-8 10-8 q10 0 10 8 q0 8-10 8 q-10 0-10-8z" fill="${INK}"/><ellipse cx="60" cy="94" rx="6" ry="3.2" fill="#F87171"/></g>
        ${ch.over || ''}${inked(ch.hat || '', 2.2)}
        <g class="mc-extra mc-shades"><path d="M27 55 h29 q1 12-8 15 q-12 2-17-4 q-4-5-4-11z M64 55 h29 q0 6-4 11 q-5 6-17 4 q-9-3-8-15z" fill="#111827" stroke="${INK}" stroke-width="1.5"/><path d="M56 58 h8" stroke="#111827" stroke-width="3"/><path d="M31 58 L39 58" stroke="#fff" stroke-width="2" opacity=".6"/></g>
        <g class="mc-extra mc-crown"><path d="M36 22 L42 5 L51 19 L60 0 L69 19 L78 5 L84 22 Q60 27 36 22 Z" fill="#FDE047" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="60" cy="13" r="3" fill="#F87171" stroke="${INK}" stroke-width="1"/></g>
        <g class="mc-extra mc-sweat"><path d="M98 40 q6 10 0 14 q-6-4 0-14z M18 46 q5 8 0 11 q-5-3 0-11z" fill="#7DD3FC" stroke="${INK}" stroke-width="1.4"/></g>
        <g class="mc-extra mc-glass"><circle cx="76" cy="62" r="15" fill="rgba(186,230,253,.3)" stroke="${INK}" stroke-width="4"/><path d="M87 73 L100 88" stroke="${INK}" stroke-width="6" stroke-linecap="round"/></g>
      </g>${sparkle}
    </g>
  </svg>`;
}
/* ---- 🔊 sound for the video: soft music, sound effects, character voices (Web Audio + the phone's speech) ---- */
const stSnd = {
  ctx: null, master: null, music: null, beat: 0, next: 0, loop: null,
  init() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }   // play even when the phone is on silent (iOS 17+)
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain(); this.music.gain.value = 0.05; this.music.connect(this.master); }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    // a silent blip unlocks audio on iOS (must happen inside the tap)
    const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
  },
  tone(f, t, d, type, vol, to) { const c = this.ctx; if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.05); },
  noise(t, d, f1, f2, vol) { const c = this.ctx; if (!c) return; const n = c.createBuffer(1, Math.ceil(c.sampleRate * d), c.sampleRate), a = n.getChannelData(0); for (let k = 0; k < a.length; k++) a[k] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); s.buffer = n; bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(f1, t); bp.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.25, t + d * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(bp); bp.connect(g); g.connect(this.master); s.start(t); },
  fx(name, delay) {
    if (!this.ctx || (story && story.muted)) return; const t = this.ctx.currentTime + (delay || 0);
    if (name === 'whoosh') this.noise(t, 0.35, 300, 2400, 0.22);
    else if (name === 'pop') this.tone(520 + Math.random() * 200, t, 0.09, 'sine', 0.16, 900);
    else if (name === 'boing') { this.tone(180, t, 0.35, 'triangle', 0.25, 520); this.tone(520, t + 0.18, 0.25, 'triangle', 0.15, 260); }
    else if (name === 'uhoh') { this.tone(440, t, 0.22, 'square', 0.08); this.tone(330, t + 0.25, 0.4, 'square', 0.08); }
    else if (name === 'slurp') { this.noise(t, 0.25, 800, 300, 0.18); this.noise(t + 0.3, 0.3, 900, 250, 0.15); }
    else if (name === 'hmm') { this.tone(220, t, 0.5, 'sine', 0.12, 260); }
    else if (name === 'peek') { this.tone(880, t, 0.08, 'sine', 0.12); this.tone(660, t + 0.12, 0.08, 'sine', 0.12); this.tone(880, t + 0.24, 0.1, 'sine', 0.12); }
    else if (name === 'fanfare') [523, 659, 784, 1047].forEach((f, k) => { this.tone(f, t + k * 0.12, k === 3 ? 0.6 : 0.16, 'triangle', 0.18); this.tone(f / 2, t + k * 0.12, 0.2, 'sine', 0.08); });
    else if (name === 'launch') { this.noise(t, 2.2, 200, 3000, 0.25); this.tone(120, t, 2, 'sawtooth', 0.05, 900); }
    else if (name === 'tick') this.tone(1200, t, 0.03, 'square', 0.04);
    else if (name === 'meow') { this.tone(500, t, 0.18, 'sawtooth', 0.06, 900); this.tone(900, t + 0.18, 0.35, 'sawtooth', 0.05, 420); }
    else if (name === 'roar') { this.noise(t, 0.8, 200, 120, 0.3); this.tone(90, t, 0.8, 'sawtooth', 0.12, 60); }
    else if (name === 'beep') [880, 660, 990].forEach((f, k) => this.tone(f, t + k * 0.11, 0.09, 'square', 0.06));
    else if (name === 'boo') this.tone(300, t, 0.9, 'sine', 0.16, 180);
    else if (name === 'radio') { this.noise(t, 0.25, 2000, 1500, 0.12); this.tone(1400, t + 0.25, 0.12, 'sine', 0.1); this.tone(1400, t + 0.42, 0.12, 'sine', 0.1); }
    else if (name === 'squeak') { this.tone(1200, t, 0.08, 'sine', 0.12, 1800); this.tone(1500, t + 0.1, 0.1, 'sine', 0.1, 2200); }
    else if (name === 'growl') { this.noise(t, 0.6, 160, 100, 0.25); this.tone(110, t, 0.6, 'sawtooth', 0.07, 80); }
    else if (name === 'hoot') { this.tone(420, t, 0.25, 'sine', 0.18, 380); this.tone(420, t + 0.35, 0.45, 'sine', 0.18, 360); }
    else if (name === 'yip') { this.tone(700, t, 0.07, 'triangle', 0.15, 1300); this.tone(800, t + 0.12, 0.07, 'triangle', 0.15, 1500); }
    else if (name === 'chime') [1319, 1568, 1976, 2637].forEach((f, k) => this.tone(f, t + k * 0.07, 0.5, 'sine', 0.08));
    else if (name === 'arr') { this.tone(140, t, 0.6, 'sawtooth', 0.09, 100); this.noise(t, 0.6, 400, 200, 0.12); }
    else if (name === 'magic') { [784, 988, 1175, 1568, 1976].forEach((f, k) => this.tone(f, t + k * 0.06, 0.4, 'sine', 0.07)); this.noise(t, 0.6, 4000, 8000, 0.05); }
    else if (name === 'sizzle') this.noise(t, 0.9, 5000, 7000, 0.14);
    else if (name === 'blub') [0, 0.14, 0.26].forEach((d, k) => this.tone(300 + k * 120, t + d, 0.1, 'sine', 0.15, 700 + k * 150));
    else if (name === 'whistle') { this.tone(1800, t, 0.18, 'sine', 0.12, 2400); this.tone(2400, t + 0.22, 0.35, 'sine', 0.12, 1700); }
    else if (name === 'heart') [0, 0.18, 0.7, 0.88].forEach((d, k) => this.tone(k % 2 ? 60 : 75, t + d, 0.14, 'sine', 0.35, 45));
    else if (name === 'giggle') [0, 0.1, 0.2, 0.3, 0.4].forEach((d, k) => this.tone(800 - k * 40, t + d, 0.07, 'triangle', 0.12, 1100 - k * 40));
    else if (name === 'achoo') { this.tone(500, t, 0.3, 'sine', 0.06, 900); this.noise(t + 0.35, 0.3, 3000, 900, 0.3); }
  },
  noMusic: true,   // sound effects only — no background music
  startMusic() {
    if (this.noMusic || !this.ctx || this.loop) return;
    const prog = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]], step = 0.22;
    this.next = this.ctx.currentTime + 0.1; this.beat = 0;
    this.loop = setInterval(() => {
      if (!this.ctx || !story || story.muted) return;
      while (this.next < this.ctx.currentTime + 0.4) {
        const ch = prog[Math.floor(this.beat / 8) % 4], n = this.beat % 8, t = this.next, f = ch[[0, 1, 2, 1, 2, 1, 0, 2][n]] * (n === 4 ? 2 : 1);
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
        o.connect(g); g.connect(this.music); o.start(t); o.stop(t + step);
        if (n % 4 === 0) { const b = this.ctx.createOscillator(), bg = this.ctx.createGain(); b.type = 'sine'; b.frequency.value = ch[0] / 2; bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.7, t + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, t + step * 3.5); b.connect(bg); bg.connect(this.music); b.start(t); b.stop(t + step * 4); }
        this.beat++; this.next += step;
      }
    }, 100);
  },
  duck(on) { if (this.music) this.music.gain.setTargetAtTime(on ? 0.018 : 0.05, this.ctx.currentTime, 0.15); },
  stop() { clearInterval(this.loop); this.loop = null; if (this.ctx) this.ctx.suspend().catch(() => {}); }
};
const ST_FX = { 'st-intro': 'boing', 'st-red': 'uhoh', 'st-amber': 'slurp', 'st-blue': 'hmm', 'st-purple': 'peek', 'st-green': 'fanfare', 'st-outro': 'launch' };

function openStory(area) {
  if (story) storyClose();
  const slides = storySlides(typeof area === 'string' ? area : null);
  const areas = typeof area === 'string' ? [area] : areaSel();
  const cast = stCast(slides, areas);
  const catsHtml = (areas || []).length ? areas.map(a => `<span>${AREA_EMOJI[a] || '📁'} ${esc(tr(a))}</span>`).join('') : `<span>🗂 ${esc(L('All areas', 'כל התחומים'))}</span>`;
  const el = document.createElement('div'); el.className = 'story'; el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="st-bg"><i></i><i></i><i></i></div><div class="st-bars">${slides.map(() => '<i><b></b></i>').join('')}</div>
    <div class="st-top"><button class="st-x" data-st-x aria-label="${esc(tr('Close'))}">✕</button><span class="st-name">${esc(L(cast.ch.name[0], cast.ch.name[1]))}${cast.outfit ? ' · ' + esc(L(cast.outfit.label[0], cast.outfit.label[1])) : ''}</span><button class="st-snd" data-st-snd aria-label="sound"></button></div>
    <div class="st-cats" dir="auto"><small>${esc(L('This video covers', 'הסרטון על'))}:</small>${catsHtml}</div>
    <div class="st-stage"></div>
    <div class="st-mascot"><div class="mc-bubble" dir="auto"></div><div class="mc-wrap">${mascotSvg(cast.ch, cast.outfit)}</div></div>
    <p class="st-hint" hidden></p>
    <div class="st-tap st-prev"></div><div class="st-tap st-next"></div>`;
  document.body.appendChild(el); document.body.classList.add('story-open');
  story = { el, slides, cast, i: -1, tok: 0, muted: !!store.get('ai.storyMute', false), timer: null, safety: null, phase: '', t0: 0, dur: 0, paused: false, left: 0, hold: null };
  el.querySelector('[data-st-snd]').textContent = story.muted ? '🔇' : '🔊';
  el.addEventListener('click', storyClick);
  // hold to pause (a quick tap only moves between slides)
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('button,.mc-wrap')) return; clearTimeout(story && story.hold); if (story) story.hold = setTimeout(() => storyPause(true), 220); });
  const up = () => { if (!story) return; clearTimeout(story.hold); if (story.paused) { story.justResumed = true; storyPause(false); } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  document.addEventListener('keydown', storyKey);
  stSnd.init(); if (!story.muted) stSnd.startMusic();
  storyGo(0);
  // little surprises every few seconds: look around, spin, hop, double blink, sneeze, wave…
  const acts = ['look', 'look', 'spin', 'hop', 'blink2', 'sneeze', 'wave', 'shake'];
  const act = () => { const s = story; if (!s || s.el !== el) return; s.actT = setTimeout(act, 3500 + Math.random() * 3500);
    if (s.paused) return; const w = el.querySelector('.mc-wrap'), a = acts[Math.floor(Math.random() * acts.length)];
    if (w.className.indexOf('act-') >= 0) return; w.classList.add('act-' + a); if (a === 'sneeze') stSnd.fx('achoo', 0.1); if (a === 'spin') stSnd.fx('whoosh');
    setTimeout(() => w.classList.remove('act-' + a), 1300); };
  story.actT = setTimeout(act, 4000);
}
function stVoice() {
  const want = isHe() ? 'he' : 'en', vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  return vs.find(x => x.lang && x.lang.toLowerCase().startsWith(want) && /premium|enhanced|siri/i.test(x.name)) || vs.find(x => x.lang && x.lang.toLowerCase().startsWith(want)) || null;
}
function storySpeak(text, tok, done) {
  const s = story;
  if (s.muted || !window.speechSynthesis || !text) { done(false); return; }
  try { if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel(); } catch (e) { /* none */ }
  const u = new SpeechSynthesisUtterance(text); u.lang = isHe() ? 'he-IL' : 'en-US';
  const v = stVoice(); if (v) u.voice = v;
  const vc = s.cast.ch.voice || [1, 1]; u.pitch = vc[0]; u.rate = vc[1];
  const mc = s.el.querySelector('.st-mascot');
  let fired = false; const fin = (ok) => { if (fired) return; fired = true; mc.classList.remove('talking'); stSnd.duck(false); if (story === s && s.tok === tok) done(ok); };
  u.onstart = () => { if (story === s && s.tok === tok) { mc.classList.add('talking'); stSnd.duck(true); } };
  u.onboundary = () => { if (story !== s || s.tok !== tok) return; mc.classList.remove('flap'); void mc.offsetWidth; mc.classList.add('flap'); };
  u.onend = () => fin(true); u.onerror = (e) => { if (e && e.error === 'interrupted' || e && e.error === 'canceled') { fired = true; mc.classList.remove('talking'); return; } fin(false); };
  speechSynthesis.speak(u);
  // no voice at all after a moment → tell the user once
  setTimeout(() => { if (story === s && s.tok === tok && !fired && !speechSynthesis.speaking && !speechSynthesis.pending) { const h = s.el.querySelector('.st-hint'); h.hidden = false;
    h.textContent = L('🔈 No narration from this device — check that the phone isn’t on silent and the volume is up.', '🔈 אין קריינות מהמכשיר — בדוק שהטלפון לא על שקט ושהעוצמה למעלה.'); } }, 1800);
}
function storyGo(i) {
  const s = story; if (!s) return;
  if (i < 0) i = 0; if (i >= s.slides.length) { storyClose(); return; }
  clearTimeout(s.timer); clearTimeout(s.safety); s.tok++; const tok = s.tok; s.paused = false; s.phase = 'speak';
  const dir = i >= s.i ? 1 : -1; s.i = i;
  const sl = s.slides[i];
  s.el.className = 'story ' + sl.cls;
  const stage = s.el.querySelector('.st-stage'); stage.innerHTML = `<div class="st-slide ${dir < 0 ? 'back' : ''}">${sl.html}</div>`;
  const lis = stage.querySelectorAll('li'); lis.forEach((x, k) => { x.style.animationDelay = (0.35 + k * 0.22) + 's'; stSnd.fx('pop', 0.35 + k * 0.22); });
  const md = s.cast.lines[i], mc = s.el.querySelector('.st-mascot');
  mc.className = 'st-mascot mood-' + md[0] + (i === 0 ? ' walk-in' : ''); void mc.offsetWidth; mc.classList.add('mc-in');
  if (lis.length) mc.classList.add('look');
  mc.querySelector('.mc-bubble').textContent = L(md[1][0], md[1][1]);
  s.el.querySelectorAll('.st-confetti').forEach(c => c.remove()); if (md[0] === 'party') confetti(s.el);
  stSnd.fx(i === 0 ? 'boing' : 'whoosh'); if (i === 0 && s.cast.ch.sfx) stSnd.fx(s.cast.ch.sfx, 0.7); if (i > 0 && ST_FX[sl.cls]) stSnd.fx(ST_FX[sl.cls], 0.35);
  stage.querySelectorAll('[data-count]').forEach(b => { const n = Number(b.dataset.count) || 0, t0 = performance.now(); let last = 0; const step = (t) => { if (!story || story.tok !== tok) return; const p = Math.min(1, (t - t0) / 900), v = Math.round(n * (1 - Math.pow(1 - p, 3))); if (v !== last) { last = v; stSnd.fx('tick'); } b.textContent = v; if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); });
  s.el.querySelectorAll('.st-bars i').forEach((bar, k) => { const b = bar.firstChild; b.style.transition = 'none'; b.style.width = k < i ? '100%' : '0%'; });
  const minDur = 5200 + lis.length * 900;
  const start = (ms) => {
    if (!story || story.tok !== tok) return;
    s.phase = 'run'; const b = s.el.querySelectorAll('.st-bars i')[i].firstChild;
    requestAnimationFrame(() => { b.style.transition = `width ${ms}ms linear`; b.style.width = '100%'; });
    s.t0 = Date.now(); s.dur = ms; if (!s.paused) s.timer = setTimeout(() => { if (story && story.tok === tok) storyGo(i + 1); }, ms); else s.left = ms;
  };
  const t0 = Date.now();
  // the bubble line first, then the summary — in the character's voice
  const text = L(md[1][0], md[1][1]).replace(/[\u{1F000}-\u{1FAFF}☀-➿️]/gu, '') + '. ' + sl.say;
  // no spoken narration (it sounded robotic) — the character just "talks" silently while its bubble pops up
  try { if (window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel(); } catch (e) { /* none */ }
  setTimeout(() => { if (story && story.tok === tok) { mc.classList.add('talking'); setTimeout(() => mc.classList.remove('talking'), 1700); } }, 500);
  start(minDur); return;
  s.safety = setTimeout(() => { if (story && story.tok === tok && s.phase === 'speak' && !s.paused) { try { speechSynthesis.cancel(); } catch (e) { /* none */ } start(Math.max(1500, minDur - (Date.now() - t0))); } }, 20000);
  storySpeak(text, tok, () => { clearTimeout(s.safety); if (s.phase !== 'speak') return; start(Math.max(1500, minDur - (Date.now() - t0))); });
}
function storyPause(p) {
  const s = story; if (!s || s.paused === p) return; s.paused = p;
  s.el.classList.toggle('paused', p);
  if (s.phase === 'speak') { try { p ? speechSynthesis.pause() : speechSynthesis.resume(); } catch (e) { /* none */ } return; }
  const bi = s.el.querySelectorAll('.st-bars i')[s.i]; if (!bi) return; const bar = bi.firstChild, tok = s.tok, i = s.i;
  if (p) { clearTimeout(s.timer); s.left = Math.max(300, s.dur - (Date.now() - s.t0)); const w = getComputedStyle(bar).width; bar.style.transition = 'none'; bar.style.width = w; }
  else { s.t0 = Date.now(); s.dur = s.left; requestAnimationFrame(() => { bar.style.transition = `width ${s.left}ms linear`; bar.style.width = '100%'; }); s.timer = setTimeout(() => { if (story && story.tok === tok) storyGo(i + 1); }, s.left); }
}
function storyClick(e) {
  const s = story; if (!s) return;
  if (s.justResumed) { s.justResumed = false; return; }        // the end of a long press is not a tap
  if (e.target.closest('[data-st-x]')) { storyClose(); return; }
  if (e.target.closest('.mc-wrap')) {             // tickle the character
    const w = e.target.closest('.mc-wrap'), bb = s.el.querySelector('.mc-bubble'), ch = s.cast.ch; w.className = 'mc-wrap'; void w.offsetWidth; w.classList.add('act-tickle'); stSnd.fx('giggle'); if (ch.sfx) stSnd.fx(ch.sfx, 0.5);
    const T = [['Hehe, that tickles!', 'חחח זה מדגדג!'], ['Hey! I’m working here 😤', 'היי! אני באמצע עבודה 😤'], ['Again! Again! 😂', 'עוד! עוד! 😂'], ['Boop! 👉', 'בופ! 👉']][Math.floor(Math.random() * 4)];
    const keep = bb.textContent; bb.textContent = L(T[0], T[1]); clearTimeout(s.tickleT); s.tickleT = setTimeout(() => { if (story === s) bb.textContent = keep; w.classList.remove('act-tickle'); }, 1600); return; }
  if (e.target.closest('[data-st-snd]')) { s.muted = !s.muted; store.set('ai.storyMute', s.muted); e.target.textContent = s.muted ? '🔇' : '🔊';
    if (s.muted) { try { speechSynthesis.cancel(); } catch (x) { /* none */ } stSnd.stop(); } else { stSnd.init(); stSnd.startMusic(); } storyGo(s.i); return; }
  if (e.target.closest('[data-st-go]')) { storyClose(); ui.tab = 'focus'; store.set('ai.ui', ui); render(); return; }
  const fwd = e.target.closest('.st-next'), back = e.target.closest('.st-prev');
  if (fwd) storyGo(s.i + 1); else if (back) storyGo(s.i - 1);
}
function storyKey(e) { if (!story) return; if (e.key === 'Escape') storyClose(); if (e.key === 'ArrowLeft') storyGo(story.i + (isHe() ? 1 : -1)); if (e.key === 'ArrowRight') storyGo(story.i + (isHe() ? -1 : 1)); }
let storyAfter = null;   // what to show when the video ends or is stopped (set by the daily welcome)
function storyClose() {
  if (!story) return; const after = storyAfter; storyAfter = null; if (after) setTimeout(after, 60);
  clearTimeout(story.timer); clearTimeout(story.safety); clearTimeout(story.hold); clearTimeout(story.actT); clearTimeout(story.tickleT); story.tok++;
  try { speechSynthesis.cancel(); } catch (e) { /* none */ }
  stSnd.stop(); story.el.remove(); story = null; document.body.classList.remove('story-open'); document.removeEventListener('keydown', storyKey);
}

/* ---------- ▶ quick-actions button (bottom right) ---------- */
function qaAreas() {
  const pref = ['Work', 'Home'].filter(a => data.areas.includes(a));
  return pref.length ? pref : data.areas.slice(0, 2);
}
const AREA_EMOJI = { Work: '💼', Home: '🏠', Personal: '🙂', 'M.Sc': '🎓', 'Reserve Duty': '🪖', Family: '👨‍👩‍👧', Finance: '💰', Health: '🩺' };
function renderPlayMenu() {
  const open = (it) => !isClosed(it);
  const urgent = (a) => data.items.filter(it => it.area === a && open(it) && (horizon(it) === 'Overdue' || horizon(it) === 'Today')).length;
  const items = [];
  const inColl = ui.tab === 'notebook' && ui.nbBook === 'coll' && !isGuest();
  void inColl;   // new task / new Collection entry: the ＋ button next to ▶
  if (!isGuest()) items.push(['sync', '🔄', L('Sync calendars', 'סנכרון מהיומן'), L('New events to choose from', 'הצעות ממה שחדש ביומן')]);
  if (!isGuest()) items.push(['welcome', '🌅', L('What do we focus on today?', 'במה מתמקדים היום?'), L('Work & home daily videos', 'הסרטונים היומיים — עבודה ובית')]);
  { const n = data.items.filter(it => areaOk(it.area) && open(it) && (horizon(it) === 'Overdue' || horizon(it) === 'Today')).length;   // the video follows the area(s) on screen
    items.push(['story:', '🎬', L(`What’s urgent · ${areaSelLabel()}`, `מה דחוף · ${areaSelLabel()}`), n ? L(`${n} due today or late — 30-sec video`, `${n} להיום או באיחור — סרטון של 30 שנ׳`) : L('Nothing urgent 🎉 — 30-sec video', 'אין דחוף 🎉 — סרטון של 30 שנ׳')]); }
  if (!isGuest()) {
    items.push(['clip', '📋', L('Link → Collection', 'קישור לאוסף'), L('Paste the link you just copied', 'מדביק את הקישור שהעתקת עכשיו')]);
    items.push(['review', '🗓', L('Weekly review', 'סקירה שבועית'), L('Overdue · waiting · next week', 'באיחור · ממתין · השבוע הבא')]);
    items.push(['report', '✉️', L('Weekly report', 'דוח שבועי'), L('Ready to send', 'מוכן לשליחה')]);
  }
  $('#playMenu').innerHTML = items.map(([k, ic, t, sub]) => `<button data-play="${esc(k)}" class="${k === 'new' || k === 'newcoll' ? 'pm-main' : ''}"><span class="pm-ic">${ic}</span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span></button>`).join('');
}
function togglePlay(open) {
  const m = $('#playMenu'), b = $('#fabPlay');
  open = open === undefined ? m.hidden : open;
  if (open) renderPlayMenu();
  m.hidden = !open; b.classList.toggle('open', open); b.firstElementChild.textContent = open ? '✕' : '▶'; b.setAttribute('aria-expanded', open); $('#playShade').hidden = !open;
}
$('#fabPlay').addEventListener('click', () => togglePlay());
$('#playShade').addEventListener('click', () => togglePlay(false));
$('#playMenu').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-play]'); if (!b) return; const k = b.dataset.play; togglePlay(false);
  if (k === 'new') { isGuest() ? openSuggest() : openEdit(null); return; }
  if (k === 'review') { openReview(); return; }
  if (k === 'welcome') { openWelcome(false); return; }
  if (k === 'newcoll') { openColl({ cat: ui.collCat === '*' ? (collCats[0] || {}).id : ui.collCat, status: 'want' }); return; }
  if (k.startsWith('story:')) { openStory(k.slice(6) || null); return; }
  if (k === 'report') { openReport(); return; }
  if (k === 'sync') {
    if (settings.demo || !store.get('ai.ciReady', false)) { openImport(); return; }   // first time → the screen with the setup guide
    try { sessionStorage.setItem('ai.ciBack', String(Date.now())); } catch (err) { /* ignore */ }
    location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(ciName());
    return;
  }
  if (k === 'clip') {
    let txt = '';
    try { txt = await navigator.clipboard.readText(); } catch (err) { txt = ''; }
    const m = String(txt || '').match(/https?:\/\/\S+/);
    if (!m) { toast(L('No link on the clipboard — copy a link first', 'אין קישור בלוח — העתק קודם קישור')); return; }
    ui.tab = 'notebook'; ui.nbBook = 'coll'; if (!ui.collCat || ui.collCat === '*') ui.collCat = (collCats[0] || {}).id; store.set('ai.ui', ui); render();
    collQuickAdd(m[0]);
  }
});
// back from the calendar shortcut → show the new suggestions
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return; let t = 0; try { t = Number(sessionStorage.getItem('ai.ciBack') || 0); } catch (e) { t = 0; }
  if (t && Date.now() - t < 10 * 60000) { try { sessionStorage.removeItem('ai.ciBack'); } catch (e) { /* ignore */ } setTimeout(openImport, 400); }
});

/* ---------- statistics ---------- */
async function openStats() {
  $('#dlgStats').showModal(); $('#statsBody').innerHTML = `<p class="hint">${tr('Loading…')}</p>`;
  let archived = [];
  try { archived = (await api('POST', { action: 'stats' })).archived || []; } catch (e) { /* show what we have */ }
  const done = data.items.filter(it => it.status === 'Done').concat(archived.filter(a => a.status === 'Done'));
  const t = today(), d30 = addDays(t, -30);
  const recent = done.filter(it => parse(it.done) && parse(it.done) >= d30);
  const withDue = done.filter(it => parse(it.done) && parse(it.due));
  const onTime = withDue.filter(it => parse(it.done) <= parse(it.due)).length;
  const both = done.filter(it => parseFloat(it.hrs) > 0 && parseFloat(it.acthrs) > 0);
  const sum = (a, k) => a.reduce((s0, x) => s0 + (parseFloat(x[k]) || 0), 0);
  const ratio = both.length ? sum(both, 'acthrs') / sum(both, 'hrs') : null;
  const pct = (x) => Math.round(x * 100) + '%';
  const diffCell = (p, a) => { if (!p) return '—'; const r = a / p - 1; return `<span class="${r > 0.1 ? 'over' : r < -0.1 ? 'under' : ''}">${r > 0 ? '+' : ''}${pct(r)}</span>`; };
  let h = `<div class="st-kpis">
    <div class="st-kpi"><b>${recent.length}</b><span>${L('Done · 30 days', 'בוצעו · 30 יום')}</span></div>
    <div class="st-kpi"><b>${withDue.length ? pct(onTime / withDue.length) : '—'}</b><span>${L('On time', 'בזמן')}</span></div>
    <div class="st-kpi"><b>${ratio ? ratio.toFixed(2) + '×' : '—'}</b><span>${L('Actual ÷ planned', 'בפועל ÷ מתוכנן')}</span></div>
    <div class="st-kpi"><b>${data.items.filter(it => !isClosed(it)).length}</b><span>${L('Open now', 'פתוחות עכשיו')}</span></div></div>`;
  // weekly bars (last 8 weeks)
  const ws0 = weekStart(t); const weeks = [];
  for (let i = 7; i >= 0; i--) { const a = addDays(ws0, -7 * i), b = addDays(a, 7); weeks.push({ label: `${pad(a.getDate())}/${pad(a.getMonth() + 1)}`, n: done.filter(it => parse(it.done) >= a && parse(it.done) < b).length }); }
  const mx = Math.max(1, ...weeks.map(w => w.n));
  h += `<h3 class="nt-h">${L('Completed per week', 'הושלמו בכל שבוע')}</h3><div class="bars">${weeks.map(w => `<div><b>${w.n || ''}</b><i style="height:${Math.round(w.n / mx * 85)}%"></i>${w.label}</div>`).join('')}</div>`;
  // by area
  const areas = [...new Set(done.map(x => x.area).filter(Boolean))];
  h += `<h3 class="nt-h">${L('Planned vs actual hours by area', 'שעות מתוכננות מול בפועל לפי תחום')}</h3><table class="st-table"><tr><th>${tr('Area')}</th><th>${L('Done', 'בוצעו')}</th><th>${L('Planned h', 'מתוכנן')}</th><th>${L('Actual h', 'בפועל')}</th><th>${L('Difference', 'פער')}</th><th>${L('On time', 'בזמן')}</th></tr>` +
    areas.map(a => { const x = done.filter(it => it.area === a), b2 = x.filter(it => parseFloat(it.hrs) > 0 && parseFloat(it.acthrs) > 0), wd = x.filter(it => parse(it.done) && parse(it.due));
      return `<tr><td>${pill(a, areaColor(a))}</td><td>${x.length}</td><td>${sum(b2, 'hrs') || '—'}</td><td>${sum(b2, 'acthrs') || '—'}</td><td>${diffCell(sum(b2, 'hrs'), sum(b2, 'acthrs'))}</td><td>${wd.length ? pct(wd.filter(it => parse(it.done) <= parse(it.due)).length / wd.length) : '—'}</td></tr>`; }).join('') + '</table>';
  // topics with biggest gaps
  const topics = {}; both.forEach(it => { const k = it.topic || it.item; (topics[k] = topics[k] || { p: 0, a: 0, n: 0 }); topics[k].p += parseFloat(it.hrs); topics[k].a += parseFloat(it.acthrs); topics[k].n++; });
  const tl = Object.entries(topics).sort((x, y) => Math.abs(y[1].a - y[1].p) - Math.abs(x[1].a - x[1].p)).slice(0, 8);
  if (tl.length) h += `<h3 class="nt-h">${L('Biggest estimate gaps (topic)', 'הפערים הגדולים בהערכה (לפי נושא)')}</h3><table class="st-table"><tr><th>${tr('Topic')}</th><th>#</th><th>${L('Planned h', 'מתוכנן')}</th><th>${L('Actual h', 'בפועל')}</th><th>${L('Difference', 'פער')}</th></tr>` +
    tl.map(([k, v]) => `<tr><td dir="auto">${esc(k)}</td><td>${v.n}</td><td>${v.p}</td><td>${v.a}</td><td>${diffCell(v.p, v.a)}</td></tr>`).join('') + '</table>';
  if (!done.length) h += `<p class="hint">${L('Statistics appear once you complete items (and enter actual hours).', 'הסטטיסטיקה תופיע אחרי שתסיים משימות (ותזין שעות בפועל).')}</p>`;
  $('#statsBody').innerHTML = h;
}

/* ---------- Outlook calendar subscription ---------- */
let feed = null;
function renderFeed() {
  const b = $('#feedBody');
  if (!feed || !feed.url) {
    b.innerHTML = `<p>${L('No calendar link yet.', 'עדיין אין קישור ללוח שנה.')}</p><button class="btn primary" id="feedCreate">${L('Create my calendar link', 'צור קישור ללוח השנה')}</button>`;
    return;
  }
  const sel = feed.areas && feed.areas.length ? feed.areas : data.areas;
  b.innerHTML = `<div class="rep-areas"><span>${tr('Areas:')}</span><div class="chips">${data.areas.map(a => `<button type="button" class="chip ${sel.includes(a) ? 'on' : ''}" data-farea="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>
    <div class="feed-url"><code class="no-i18n">${esc(feed.url)}</code><button class="btn ghost" id="feedCopy">${tr('Copy')}</button></div>
    <ol class="steps">${isHe()
      ? '<li><b>Outlook באינטרנט:</b> לוח שנה › הוספת לוח שנה › <b>הירשם מהאינטרנט</b> › הדבק את הקישור › שם: Action Items › ייבוא.</li><li><b>Outlook במחשב:</b> לוח שנה › הוספת לוח שנה › <b>מהאינטרנט…</b> › הדבק › אישור.</li><li><b>אייפון:</b> הגדרות › יומן › חשבונות › הוסף חשבון › אחר › <b>הוסף לוח שנה מנוי</b> › הדבק.</li>'
      : '<li><b>Outlook on the web:</b> Calendar › Add calendar › <b>Subscribe from web</b> › paste the link › name it "Action Items" › Import.</li><li><b>Outlook desktop:</b> Calendar › Add calendar › <b>From Internet…</b> › paste › OK.</li><li><b>iPhone:</b> Settings › Calendar › Accounts › Add Account › Other › <b>Add Subscribed Calendar</b> › paste.</li>'}</ol>
    <p class="hint">${L('The link is private — anyone who has it can see these items. Items with a start time appear as meetings with their duration; others as all-day reminders. Done items disappear.', 'הקישור פרטי — כל מי שמחזיק בו יכול לראות את המשימות. משימות עם שעה מופיעות כפגישה עם המשך שלהן; האחרות כתזכורת לכל היום. משימות שבוצעו נעלמות.')}</p>
    <div class="sheet-actions"><button class="btn danger" id="feedOff">${L('Turn off link', 'בטל קישור')}</button><button class="btn ghost" id="feedReset">${L('New link (old stops working)', 'קישור חדש (הישן יפסיק לעבוד)')}</button></div>`;
}
async function openFeed() {
  $('#dlgFeed').showModal(); $('#feedBody').innerHTML = `<p class="hint">${tr('Loading…')}</p>`;
  try { feed = await api('POST', { action: 'getFeed' }); renderFeed(); } catch (e) { $('#feedBody').textContent = e.message; }
}
$('#feedBody').addEventListener('click', async (e) => {
  try {
    if (e.target.closest('#feedCreate')) { feed = await api('POST', { action: 'setFeed', areas: data.areas }); renderFeed(); }
    else if (e.target.closest('#feedReset')) { if (confirm(L('Create a new link? Calendars subscribed with the old link stop updating.', 'ליצור קישור חדש? לוחות שנרשמו עם הקישור הישן יפסיקו להתעדכן.'))) { feed = await api('POST', { action: 'setFeed', reset: true, areas: feed.areas }); renderFeed(); } }
    else if (e.target.closest('#feedOff')) { if (confirm(L('Turn off the calendar link?', 'לבטל את הקישור ללוח השנה?'))) { feed = await api('POST', { action: 'setFeed', areas: null }); renderFeed(); } }
    else if (e.target.closest('#feedCopy')) { await navigator.clipboard.writeText(feed.url); toast(L('Link copied', 'הקישור הועתק')); }
    else {
      const ch = e.target.closest('[data-farea]'); if (!ch) return;
      const sel = (feed.areas && feed.areas.length ? feed.areas : data.areas).slice(); const i = sel.indexOf(ch.dataset.farea);
      if (i >= 0) { if (sel.length === 1) return; sel.splice(i, 1); } else sel.push(ch.dataset.farea);
      feed = await api('POST', { action: 'setFeed', areas: sel }); renderFeed();
    }
  } catch (err) { toast(err.message); }
});

/* ---------- archive & backup ---------- */
let maint = null;
const when = (s) => s ? new Date(s).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
function renderMaint() {
  $('#maintBody').innerHTML = `
    <p class="rep-status" style="color:${maint.on ? '#15803D' : '#B45309'}">${maint.on ? L('✓ Daily archive & backup are ON (every night ~02:00)', '✓ ארכוב וגיבוי יומי פעילים (כל לילה ~02:00)') : L('Daily archive & backup are OFF', 'ארכוב וגיבוי יומי כבויים')}</p>
    <label class="full">${L('Move Done items to the "Archive" tab after (days)', 'העבר משימות שבוצעו ללשונית "Archive" אחרי (ימים)')}<input type="number" id="mDays" min="7" max="365" value="${maint.cfg.archiveDays}"></label>
    <label class="full">${L('Keep this many daily backups', 'מספר גיבויים יומיים לשמור')}<input type="number" id="mKeep" min="3" max="60" value="${maint.cfg.keepBackups}"></label>
    <p class="hint">${L('Backups are full copies of the sheet in Google Drive › "Action Items Backups".', 'הגיבויים הם עותקים מלאים של הגיליון ב-Google Drive › "Action Items Backups".')}<br>${L('Last backup', 'גיבוי אחרון')}: ${when(maint.lastBackup)} · ${L('Last archive', 'ארכוב אחרון')}: ${when(maint.lastArchive)}</p>
    <div class="sheet-actions">
      <button class="btn ghost" id="mArchive">${L('Archive now', 'ארכב עכשיו')}</button>
      <button class="btn ghost" id="mBackup">${L('Back up now', 'גבה עכשיו')}</button>
      <span class="grow"></span>
      <button class="btn primary" id="mSave">${maint.on ? tr('Save') : L('Save & turn on', 'שמור והפעל')}</button>
    </div><p class="rep-status" id="mStatus"></p>`;
}
async function openMaint() {
  $('#dlgMaint').showModal(); $('#maintBody').innerHTML = `<p class="hint">${tr('Loading…')}</p>`;
  try { maint = await api('POST', { action: 'getMaint' }); renderMaint(); } catch (e) { $('#maintBody').textContent = e.message; }
}
$('#maintBody').addEventListener('click', async (e) => {
  const st = (m) => { $('#mStatus').textContent = m; };
  try {
    if (e.target.closest('#mSave')) { maint = await api('POST', { action: 'saveMaint', cfg: { archiveDays: $('#mDays').value, keepBackups: $('#mKeep').value, on: true } }); renderMaint(); st(maint.note || L('✓ Saved', '✓ נשמר')); }
    if (e.target.closest('#mArchive')) { st(L('Archiving…', 'מארכב…')); const j = await api('POST', { action: 'archiveNow' }); st(L(`✓ ${j.moved} item(s) moved to the Archive tab`, `✓ ${j.moved} משימות הועברו ללשונית Archive`)); load(true); }
    if (e.target.closest('#mBackup')) { st(L('Backing up…', 'מגבה…')); const j = await api('POST', { action: 'backupNow' }); st(L(`✓ Backup created: ${j.backup.name}`, `✓ נוצר גיבוי: ${j.backup.name}`)); }
  } catch (err) { st(err.message.includes('DriveApp') || err.message.includes('permission') ? L('Needs one-time permission: in the sheet choose ✉ Manager Report › App: turn on daily archive & backup.', 'נדרשת הרשאה חד-פעמית: בגיליון בחר ✉ Manager Report › App: turn on daily archive & backup.') : err.message); }
});

/* ---------- roles: owner / guest ---------- */
function applyList(j) {
  role = j.role === 'guest' ? 'guest' : 'owner';
  me = { name: j.name || '', canSuggest: !!j.canSuggest };
  pending = j.pending || [];
  pwReq = j.pwRequests || [];
  if (j.calCfg) calCfg = j.calCfg;
  if (ciOpenAfterLoad && j.role !== 'guest') { ciOpenAfterLoad = false; history.replaceState(null, '', location.pathname); setTimeout(openImport, 50); }
  if (Array.isArray(j.coll)) coll = j.coll;
  if (Array.isArray(j.collCats) && (j.collCats.length || j.role === 'guest')) collCats = j.collCats;
  if (j.role === 'guest' && !Array.isArray(j.collCats)) { collCats = []; coll = []; }
  mySugg = j.mySuggestions || [];
  if (j.myDay) myDay = { date: j.myDay.date || '', rows: (j.myDay.rows || []).map(Number) };
  focusRemote = j.focus || null;
  data = { items: j.items || [], areas: j.areas && j.areas.length ? j.areas : Object.keys(AREA_C), people: j.people || [], report: j.report, areaHints: j.areaHints || {} };
  if (!data.areas.includes(ui.area) && ui.area !== 'All') ui.area = 'All';
  ui.areas = (ui.areas || []).filter(a => data.areas.includes(a));
  if (isGuest() && (ui.tab === 'waiting')) ui.tab = 'focus';
  if (!settings.demo && remembered()) store.set('ai.cache', data);
  setTimeout(() => { if (typeof fsRestore === 'function') fsRestore(); if (typeof startOfDay === 'function') startOfDay(); }, 0);
}
function suggHtml() {
  const col = { Pending: '#B45309', Approved: '#15803D', Rejected: '#B91C1C' };
  return `<section class="group"><h3>Your suggestions <span class="n">${mySugg.length}</span></h3>` +
    mySugg.slice(0, 8).map(x => `<div class="card sugg"><div class="body"><div class="title" dir="auto">${esc(x.item)}</div>
      <div class="meta">${pill(x.area, areaColor(x.area))}<span class="st" style="color:${col[x.status] || '#6B7280'}">${x.status === 'Pending' ? '⏳ Waiting for approval' : x.status === 'Approved' ? '✓ Approved' : '✕ Not approved'}</span>${x.due ? `<span>${fmt(x.due, true)}</span>` : ''}</div></div></div>`).join('') + '</section>';
}

/* guest: suggest */
function openSuggest() {
  const f = $('#frmSuggest');
  f.reset();
  f.elements.namedItem('area').innerHTML = data.areas.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  $('#dlgSuggest').showModal(); setTimeout(() => f.elements.namedItem('item').focus(), 50);
}
$('#frmSuggest').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, g = (k) => f.elements.namedItem(k).value.trim();
  const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    await api('POST', { action: 'suggest', item: { item: g('item'), area: g('area'), prio: g('prio'), due: g('due'), com: g('com') } });
    $('#dlgSuggest').close(); toast('Sent ✓ — it will appear once approved'); load(true);
  } catch (err) { toast('Not sent: ' + err.message); }
  finally { btn.disabled = false; }
});

/* owner: sharing & guests */
let guests = [], gAreas = [], gColl = [];
const appBase = () => location.origin + location.pathname;
const inviteLink = (u) => appBase() + '#join=' + encodeURIComponent(settings.url || '') + (u ? '&u=' + encodeURIComponent(u) : '');
function renderGuests() {
  $('#guestList').innerHTML = guests.length ? guests.map(g => `<div class="gcard ${g.on === false ? 'off' : ''}" data-gid="${esc(g.id)}">
      <b dir="auto">${esc(g.name)}</b>${(g.areas || []).map(a => pill(a, areaColor(a))).join('')}${(g.coll || []).map(id => { const c = collCats.find(x => x.id === id); return c ? `<span class="pill c-gpill">${esc(c.name)}</span>` : ''; }).join('')}
      <span class="hint" style="margin:0">${tr(g.canSuggest ? '✎ can suggest' : 'view only')}${g.on === false ? L(' · access off', ' · גישה כבויה') : ''}</span>
      <span class="cred"><span>👤 <code class="no-i18n">${esc(g.user || '—')}</code></span>
        <span>🔑 <code class="no-i18n pw-mask" data-pw="${esc(g.pw || '')}">${g.pw ? '••••••' : L('(set before — type a new one to see it)', '(הוגדרה בעבר — הקלד חדשה כדי לראות)')}</code>${g.pw ? `<button type="button" class="linkish" data-gshow>👁</button>` : ''}</span></span>
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-gwa ${g.pw ? '' : 'disabled'}>💬 WhatsApp</button>
      <button type="button" class="btn ghost" data-ginvite>🔗 Invite</button>
      <button type="button" class="btn ghost" data-gedit>Edit</button>
      <button type="button" class="btn danger" data-gdel>Remove</button></div>`).join('')
    : '<p class="hint">No guests yet — add one below.</p>';
}
function renderGuestAreas() {
  $('#guestAreas').innerHTML = (data.areas || []).map(a => `<button type="button" class="chip ${gAreas.includes(a) ? 'on' : ''}" data-garea="${esc(a)}">${esc(a)}</button>`).join('');
  $('#guestColl').innerHTML = collCats.map(c => `<button type="button" class="chip ${gColl.includes(c.id) ? 'on' : ''}" data-gcoll="${esc(c.id)}">${esc(c.name)}</button>`).join('');
}
function resetGuestForm(g) {
  const f = $('#frmGuest'), E = (k) => f.elements.namedItem(k);
  E('id').value = g ? g.id : ''; E('name').value = g ? g.name : ''; E('gpw').value = g && g.pw ? g.pw : '';
  E('guser').value = g ? (g.user || '') : '';
  E('gphone').value = g ? (g.phone || '') : '';
  E('gpw').placeholder = tr(g ? 'leave empty to keep the current password' : 'at least 6 characters');
  E('canSuggest').checked = g ? !!g.canSuggest : true; E('on').checked = g ? g.on !== false : true;
  gAreas = g ? (g.areas || []).slice() : ['Home'].filter(a => data.areas.includes(a));
  gColl = g ? (g.coll || []).slice() : [];
  $('#guestFormTitle').textContent = g ? L(`Edit ${g.name}`, `עריכת ${g.name}`) : tr('Add a guest');
  $('#guestSave').textContent = tr(g ? 'Save changes' : 'Add guest');
  $('#guestCancel').hidden = !g;
  renderGuestAreas();
}
async function openShare() {
  $('#dlgShare').showModal(); $('#shareStatus').textContent = ''; $('#guestList').innerHTML = '<p class="hint">Loading…</p>';
  resetGuestForm(null);
  try { guests = (await api('POST', { action: 'getGuests' })).guests || []; renderGuests(); }
  catch (e) { $('#guestList').innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
}
$('#guestColl').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gcoll]'); if (!b) return;
  const a = b.dataset.gcoll, i = gColl.indexOf(a); if (i >= 0) gColl.splice(i, 1); else gColl.push(a); renderGuestAreas();
});
$('#guestAreas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-garea]'); if (!b) return;
  const a = b.dataset.garea, i = gAreas.indexOf(a); if (i >= 0) gAreas.splice(i, 1); else gAreas.push(a); renderGuestAreas();
});
$('#guestCancel').addEventListener('click', () => resetGuestForm(null));
$('#frmGuest').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, E = (k) => f.elements.namedItem(k);
  if (!gAreas.length && !gColl.length) { $('#shareStatus').textContent = L('Choose at least one area or collection category the guest can see.', 'בחר לפחות תחום אחד או קטגוריה מהאוסף שהאורח יראה.'); return; }
  const orig = guests.find(x => x.id === E('id').value);
  const g = { id: E('id').value || undefined, name: E('name').value.trim(), user: E('guser').value.trim().toLowerCase(), phone: E('gphone').value.trim(), areas: gAreas, coll: gColl, canSuggest: E('canSuggest').checked, on: E('on').checked };
  const pw = E('gpw').value;
  if (pw && (!orig || orig.pw !== pw)) g.password = pw;
  if (!g.user) { $('#shareStatus').textContent = L('Choose a username for the guest (e.g. neta).', 'בחר שם משתמש לאורח (למשל neta).'); return; }
  if (!g.id && (!pw || pw.length < 6)) { $('#shareStatus').textContent = L('Give the guest a password (at least 6 characters) — 🎲 makes one.', 'תן לאורח סיסמה (לפחות 6 תווים) — 🎲 יוצר אחת.'); return; }
  try {
    guests = (await api('POST', { action: 'saveGuest', guest: g })).guests || [];
    renderGuests(); resetGuestForm(null);
    $('#shareStatus').textContent = L(`✓ Saved. Tap 💬 WhatsApp or 🔗 Invite next to ${g.name} to send the login details.`, `✓ נשמר. לחץ 💬 וואטסאפ או 🔗 הזמנה ליד ${g.name} כדי לשלוח את פרטי הכניסה.`);
  } catch (err) { $('#shareStatus').textContent = 'Not saved: ' + err.message; }
});
$('#guestList').addEventListener('click', async (e) => {
  const card = e.target.closest('[data-gid]'); if (!card) return;
  const g = guests.find(x => x.id === card.dataset.gid); if (!g) return;
  if (e.target.closest('[data-gwa]')) { window.open(waLink(g), '_blank'); return; }
  if (e.target.closest('[data-gshow]')) { const c = card.querySelector('.pw-mask'); c.textContent = c.textContent === '••••••' ? c.dataset.pw : '••••••'; return; }
  if (e.target.closest('[data-gedit]')) { resetGuestForm(g); $('#frmGuest').scrollIntoView({ behavior: 'smooth' }); }
  if (e.target.closest('[data-gdel]')) {
    if (!confirm(`Remove ${g.name}'s access?`)) return;
    try { guests = (await api('POST', { action: 'deleteGuest', id: g.id })).guests || []; renderGuests(); $('#shareStatus').textContent = `✓ ${g.name} can no longer sign in.`; }
    catch (err) { $('#shareStatus').textContent = err.message; }
  }
  if (e.target.closest('[data-ginvite]')) {
    if (!settings.url) { $('#shareStatus').textContent = L('Connect your sheet first.', 'חבר קודם את הגיליון.'); return; }
    const msg = loginText(g);
    try { await navigator.clipboard.writeText(msg); $('#shareStatus').innerText = L('✓ Invite copied — paste it into WhatsApp/SMS:', '✓ ההזמנה הועתקה — הדבק אותה בוואטסאפ/SMS:') + '\n\n' + msg; }
    catch (err) { $('#shareStatus').innerText = L('Copy this invite:', 'העתק את ההזמנה:') + '\n\n' + msg; }
  }
});

/* owner: approvals */
function renderPwReq() {
  if (!pwReq.length) return '';
  return `<h3 class="nt-h">${L('Forgot password', 'שכחו סיסמה')}</h3>` + pwReq.map(r => {
    const g = guests.find(x => x.id === r.guestId || x.user === r.user);
    return `<div class="pcard" data-rid="${esc(r.id)}"><div class="who">🔑 <b>${esc(r.name)}</b> (${esc(r.user)}) · ${new Date(r.at).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
      <div class="sheet-actions">${g && g.pw ? `<button type="button" class="btn link" data-rwa="${esc(g.id)}">💬 ${L('Send login on WhatsApp', 'שלח פרטי כניסה בוואטסאפ')}</button>` : `<span class="hint">${L('No visible password yet — set a new one in Sharing & guests.', 'אין סיסמה גלויה — הגדר חדשה בשיתוף ואורחים.')}</span>`}
      <span class="grow"></span><button type="button" class="btn ghost" data-rdone>✓ ${L('Done', 'טופל')}</button></div></div>`;
  }).join('');
}
function renderPending() {
  if (!pending.length && pwReq.length) { $('#pendingList').innerHTML = renderPwReq(); return; }
  if (!pending.length) { $('#pendingList').innerHTML = '<div class="empty"><b>📭</b>No suggestions waiting.</div>'; return; }
  $('#pendingList').innerHTML = renderPwReq() + (pwReq.length ? `<h3 class="nt-h">${L('Suggestions', 'הצעות')}</h3>` : '') + pending.map(p => `<div class="pcard" data-pid="${esc(p.id)}">
    <div class="who">${L('From', 'מאת')} <b>${esc(p.from)}</b> · ${fmt(p.submitted, true)}</div>
    <div class="grid">
      <label>Action item<input class="p-item" value="${esc(p.item)}" dir="auto"></label>
      <label>Area<select class="p-area">${data.areas.map(a => `<option value="${esc(a)}" ${a === p.area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
      <label>Due<input type="date" class="p-due" value="${esc(p.due)}"></label>
      <label>Priority<select class="p-prio">${PRIO.map(x => `<option value="${x}" ${x === p.prio ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
    ${p.com ? `<p class="hint" dir="auto">💬 ${esc(p.com)}</p>` : ''}
    <div class="sheet-actions"><button type="button" class="btn danger" data-preject>Reject</button><span class="grow"></span><button type="button" class="btn primary" data-papprove>✓ Approve &amp; add</button></div>
  </div>`).join('');
}
async function openPending() {
  $('#dlgPending').showModal(); renderPending(); await load(true);
  if (pwReq.length) { try { guests = (await api('POST', { action: 'getGuests' })).guests || []; } catch (e) { /* ignore */ } }
  renderPending();
}
$('#pendingList').addEventListener('click', async (e) => {
  const wa = e.target.closest('[data-rwa]');
  if (wa) { const g = guests.find(x => x.id === wa.dataset.rwa); if (g) window.open(waLink(g), '_blank'); return; }
  const rd = e.target.closest('[data-rdone]');
  if (rd) { const id = rd.closest('[data-rid]').dataset.rid; try { await api('POST', { action: 'pwHandled', id }); pwReq = pwReq.filter(r => r.id !== id); renderPending(); render(); } catch (err) { toast(err.message); } return; }
  const card = e.target.closest('[data-pid]'); if (!card) return;
  const id = card.dataset.pid, q = (c) => card.querySelector(c).value;
  const approve = e.target.closest('[data-papprove]'), reject = e.target.closest('[data-preject]');
  if (!approve && !reject) return;
  e.target.disabled = true;
  try {
    if (approve) { await api('POST', { action: 'approve', id, item: { item: q('.p-item'), area: q('.p-area'), due: q('.p-due'), prio: q('.p-prio') } }); toast('Approved ✓ — added to your list'); }
    else { await api('POST', { action: 'reject', id }); toast('Rejected'); }
    pending = pending.filter(x => x.id !== id); renderPending(); load(true);
  } catch (err) { toast(err.message); e.target.disabled = false; }
});


/* ---------- my account (owner and guests) ---------- */
function openAccount() {
  const f = $('#frmAccount'), E = (k) => f.elements.namedItem(k);
  f.reset(); E('newUsername').value = username; $('#accStatus').textContent = '';
  $('#accPw').hidden = isGuest();
  $('#accHint').textContent = isGuest()
    ? L(`Signed in as ${me.name}. You can change your username. Your password is set by the list owner — use "Forgot password?" on the sign-in screen if you need it again.`, `מחובר/ת בתור ${me.name}. אפשר לשנות את שם המשתמש. את הסיסמה קובע בעל הרשימה — אם שכחת, יש "שכחתי סיסמה" במסך הכניסה.`)
    : L('Your own sign-in. Guests never see it.', 'פרטי הכניסה שלך. אורחים לא רואים אותם.');
  $('#dlgAccount').showModal();
}
$('#btnAccount').addEventListener('click', openAccount);
/* appearance: auto (follow the phone) / light / dark */
function applyTheme(t) {
  t = (t === 'light' || t === 'dark') ? t : 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  document.querySelectorAll('[data-theme-set]').forEach(b => b.classList.toggle('on', b.dataset.themeSet === t));
}
applyTheme(store.get('ai.theme', 'auto'));
/* font size: small / medium / large (scales the whole app) */
function applyFont(f) {
  f = (f === 's' || f === 'l') ? f : 'm';
  if (f === 'm') document.documentElement.removeAttribute('data-font'); else document.documentElement.setAttribute('data-font', f);
  document.querySelectorAll('[data-font-set]').forEach(b => b.classList.toggle('on', b.dataset.fontSet === f));
}
[['s', 'Small', 'קטן'], ['m', 'Medium', 'בינוני'], ['l', 'Large', 'גדול']].forEach(([k, en, he]) => { const b = document.querySelector(`[data-font-set="${k}"]`); if (b) b.textContent = L(en, he); });
applyFont(store.get('ai.font', 'm'));
$('#fontSeg').addEventListener('click', e => { const b = e.target.closest('[data-font-set]'); if (!b) return; store.set('ai.font', b.dataset.fontSet); applyFont(b.dataset.fontSet); });
$('#themeSeg').addEventListener('click', e => { const b = e.target.closest('[data-theme-set]'); if (!b) return; store.set('ai.theme', b.dataset.themeSet); applyTheme(b.dataset.themeSet); });
$('#frmAccount').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, E = (k) => f.elements.namedItem(k).value;
  const nu = E('newUsername').trim().toLowerCase(), np = isGuest() ? '' : E('newPassword'), np2 = isGuest() ? '' : E('newPassword2');
  if (np !== np2) { $('#accStatus').textContent = L('The two passwords are different.', 'שתי הסיסמאות שונות.'); return; }
  if (nu === username && !np) { $('#dlgAccount').close(); return; }
  try {
    const j = await api('POST', { action: 'updateAccount', newUsername: nu, newPassword: np || undefined });
    username = j.user || nu; if (np) password = np;
    store.set('ai.lastUser', username);
    if (remembered()) { store.set('ai.user', username); if (np) store.set('ai.pw', password); } else { sess.set('ai.user', username); if (np) sess.set('ai.pw', password); }
    $('#dlgAccount').close(); toast(L('Account updated ✓', 'החשבון עודכן ✓'));
  } catch (err) { $('#accStatus').textContent = err.message; }
});
$('#gpwGen').addEventListener('click', () => {
  const words = 'sun moon star tree lake hill rose blue gold mint fox owl bee sky sea'.split(' ');
  const pick = () => words[Math.floor(Math.random() * words.length)];
  $('#frmGuest').elements.namedItem('gpw').value = pick() + '-' + pick() + '-' + (10 + Math.floor(Math.random() * 90));
});
$('#frmGuest').elements.namedItem('name').addEventListener('input', (e) => {
  const u = $('#frmGuest').elements.namedItem('guser');
  if (!$('#frmGuest').elements.namedItem('id').value && !u.dataset.touched) u.value = e.target.value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
});
$('#frmGuest').elements.namedItem('guser').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });


/* ---------- WhatsApp: send a guest's login (you press Send yourself) ---------- */
function waPhone(p) { let d = String(p || '').replace(/[^\d+]/g, ''); if (!d) return ''; if (d.startsWith('+')) return d.slice(1); if (d.startsWith('00')) return d.slice(2); if (d.startsWith('0')) return '972' + d.slice(1); return d; }
function loginText(g) {
  const conn = settings.url || '';
  return isHe()
    ? `היי ${g.name} 👋\nפרטי הכניסה שלך לרשימת המשימות:\n\n👤 שם משתמש: ${g.user}\n🔑 סיסמה: ${g.pw}\n\n📲 *כניסה ראשונה (פעם אחת בלבד):*\n1. פתח/י את האפליקציה:\n${appBase()}\n2. בחלון הכניסה יש שדה בשם *"כתובת ה-Web app (בפעם הראשונה במכשיר)"* — העתק/י לתוכו את הקישור הבא:\n${conn}\n3. הקלד/י שם משתמש וסיסמה ולחץ/י *כניסה*.\n\nמהפעם הבאה מספיקים שם משתמש וסיסמה.`
    : `Hi ${g.name} 👋\nYour login for my Action Items list:\n\n👤 Username: ${g.user}\n🔑 Password: ${g.pw}\n\n📲 *First sign-in (one time only):*\n1. Open the app:\n${appBase()}\n2. On the sign-in screen there is a field called *"Web-app URL (first time on this device)"* — paste this link into it:\n${conn}\n3. Enter your username and password and tap *Unlock*.\n\nAfter that, only the username and password are needed.`;
}
function waLink(g) {
  const text = loginText(g);
  const ph = waPhone(g.phone);
  return `https://wa.me/${ph}?text=${encodeURIComponent(text)}`;
}

/* ---------- forgot password (sign-in screen) ---------- */
$('#lockForgot').addEventListener('click', async () => {
  const u = LK('username').value.trim().toLowerCase();
  const url = !$('#lockUrlWrap').hidden ? cleanUrl(LK('url').value) : settings.url;
  if (!u) { $('#lockErr').textContent = L('Type your username first, then tap "Forgot password?".', 'הקלד קודם את שם המשתמש ואז לחץ "שכחתי סיסמה".'); LK('username').focus(); return; }
  if (!validUrl(url || '')) { $('#lockErr').textContent = L('The app is not connected to a sheet yet — use the invite link you received.', 'האפליקציה עוד לא מחוברת לגיליון — השתמש בקישור ההזמנה שקיבלת.'); return; }
  try { await fetch(url, { method: 'POST', body: JSON.stringify({ action: 'forgot', username: u }) }); } catch (e) { /* ignore — same message either way */ }
  $('#lockErr').textContent = '';
  $('#lockInfo').textContent = L('✓ Request sent. The list owner will send you your password.', '✓ הבקשה נשלחה. בעל הרשימה ישלח לך את הסיסמה.');
});

/* invite links: #join=<sheet url> pre-fills the connection */
(function readJoin() {
  const m = location.hash.match(/^#join=([^&]+)(?:&u=([^&]+))?/);
  if (!m) return;
  try {
    if (m[2]) { const nu = decodeURIComponent(m[2]).toLowerCase(); if (nu !== username) { username = ''; password = ''; } store.set('ai.lastUser', nu); }
    const u = decodeURIComponent(m[1]);
    if (/^https:\/\/script\.google\.com\/.*\/exec$/.test(u) && settings.url !== u) { settings = { url: u, demo: false }; store.set('ai.settings', settings); password = ''; }
  } catch (e) { /* ignore bad links */ }
  history.replaceState(null, '', location.pathname);
})();

/* ---------- lock screen ---------- */
const cleanUrl = (u) => String(u || '').trim().replace(/\?.*$/, '');
const validUrl = (u) => /^https:\/\/script\.google\.com\/.*\/exec$/.test(u);
const lockEl = $('#lock'), frmLock = $('#frmLock'), LK = (k) => frmLock.elements.namedItem(k);
function showLock(msg) {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  $('#lockUrlWrap').hidden = !!settings.url && validUrl(settings.url);
  LK('url').value = settings.url || '';
  LK('password').value = '';
  LK('username').value = username || store.get('ai.lastUser', '') || '';
  $('#lockErr').textContent = msg || ''; $('#lockInfo').textContent = '';
  lockEl.hidden = false;
  setTimeout(() => (!$('#lockUrlWrap').hidden ? LK('url') : LK('username').value ? LK('password') : LK('username')).focus(), 50);
}
function hideLock() { lockEl.hidden = true; }
function lockApp(msg) {
  password = ''; username = ''; sess.set('ai.pw', null); store.set('ai.pw', null); sess.set('ai.user', null); store.set('ai.user', null);
  try { localStorage.removeItem('ai.pw'); localStorage.removeItem('ai.cache'); } catch (e) { /* ignore */ }
  data = EMPTY(); role = 'owner'; pending = []; mySugg = []; hist.undo = []; hist.redo = []; render(); showLock(msg);
}
frmLock.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!$('#lockUrlWrap').hidden) {
    const u = cleanUrl(LK('url').value);
    if (!validUrl(u)) { $('#lockErr').textContent = 'The Web-app URL must start with https://script.google.com/ and end with /exec'; return; }
    settings = { url: u, demo: false }; store.set('ai.settings', settings);
  }
  settings.demo = false; store.set('ai.settings', settings);
  password = LK('password').value;
  username = LK('username').value.trim().toLowerCase();
  const btn = $('#btnUnlock'); btn.disabled = true; btn.textContent = 'Checking…'; $('#lockErr').textContent = '';
  try {
    const j = await api('GET');
    store.set('ai.lastUser', username);
    if (LK('remember').checked) { store.set('ai.pw', password); store.set('ai.user', username); }
    else { sess.set('ai.pw', password); sess.set('ai.user', username); try { localStorage.removeItem('ai.pw'); localStorage.removeItem('ai.user'); } catch (err) { /* ignore */ } }
    applyList(j);
    hideLock(); setSync(L('synced ', 'סונכרן ') + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })); render();
  } catch (err) {
    password = '';
    $('#lockErr').textContent = err.message;
  } finally { btn.disabled = false; btn.textContent = 'Unlock'; }
});
$('#lockChangeUrl').addEventListener('click', () => { $('#lockUrlWrap').hidden = false; LK('url').focus(); });
$('#lockDemo').addEventListener('click', startDemo);
/* =====================================================================
   🧭 Setup wizard — for someone starting their own copy (public edition)
   Steps: own Google Sheet → script → deploy as web app → connect → username & password → areas
   ===================================================================== */
let wz = null;
const SCRIPT_PATH = EDITION === 'public' ? 'ActionItems_Script.gs' : 'apps-script/ActionItems_Script.gs';
const WZ_AREAS = [['Work', '💼'], ['Home', '🏠'], ['Personal', '🙂'], ['Family', '👨‍👩‍👧'], ['Finance', '💰'], ['Health', '🩺'], ['Studies', '🎓'], ['Reserve Duty', '🪖'], ['Sport', '🏃'], ['Hobbies', '🎨']];
function openWizard() {
  wz = { step: 0, url: '', user: '', pw: '', areas: ['Work', 'Home', 'Personal'], script: null, err: '' };
  fetch(SCRIPT_PATH, { cache: 'no-cache' }).then(r => r.ok ? r.text() : null).then(t => { if (wz) wz.script = t; }).catch(() => {});   // ready before the copy tap (iPhone needs the copy inside the tap)
  $('#dlgSetup').showModal(); wzRender();
}
function wzRender() {
  const T = [L('Your sheet', 'הגיליון שלך'), L('The script', 'הסקריפט'), L('Publish', 'פרסום'), L('Connect', 'חיבור'), L('Sign-in', 'כניסה'), L('Areas', 'תחומים')];
  const steps = `<ol class="wz-steps">${T.map((t, k) => `<li class="${k === wz.step ? 'on' : k < wz.step ? 'done' : ''}"><i>${k < wz.step ? '✓' : k + 1}</i><span>${t}</span></li>`).join('')}</ol>`;
  const tip = (t) => `<p class="wz-tip">💡 ${t}</p>`;
  let b = '';
  if (wz.step === 0) b = `<h3>${L('Your own copy, your own data', 'עותק משלך, נתונים משלך')}</h3>
    <p>${L('Your tasks live in a Google Sheet in <b>your</b> Google Drive. Nobody else — including whoever sent you this app — can see them.', 'המשימות שלך נשמרות בגיליון Google ב<b>דרייב שלך</b>. אף אחד אחר — גם לא מי ששלח לך את האפליקציה — לא רואה אותן.')}</p>
    ${tip(L('Do steps 1–3 on a computer (about 10 minutes). The phone part comes at the end.', 'את שלבים 1–3 כדאי לעשות במחשב (כ-10 דקות). החלק של הטלפון מגיע בסוף.'))}
    ${TEMPLATE_URL ? `<a class="btn primary wz-big" href="${esc(TEMPLATE_URL)}" target="_blank" rel="noopener">📄 ${L('Make my copy of the template', 'יצירת עותק של התבנית')}</a><p class="hint">${L('Google asks “Make a copy?” — tap <b>Make a copy</b>. The script is already inside, so you can skip step 2.', 'גוגל ישאל "ליצור עותק?" — לחץ <b>יצירת עותק</b>. הסקריפט כבר בפנים, אפשר לדלג על שלב 2.')}</p>`
      : `<a class="btn primary wz-big" href="https://sheets.new" target="_blank" rel="noopener">📄 ${L('Open a new Google Sheet', 'פתיחת גיליון Google חדש')}</a><p class="hint">${L('Give it a name, e.g. “My tasks”. Keep the tab open.', 'תן לו שם, למשל "המשימות שלי". השאר את הלשונית פתוחה.')}</p>`}`;
  else if (wz.step === 1) b = `<h3>${L('Add the script to the sheet', 'הוספת הסקריפט לגיליון')}</h3>
    <ol class="wz-list"><li>${L('Tap the button to copy the script.', 'לחץ על הכפתור כדי להעתיק את הסקריפט.')}</li>
      <li>${L('In the sheet: <b>Extensions › Apps Script</b>.', 'בגיליון: <b>תוספים › Apps Script</b> (<bdi dir="ltr">Extensions › Apps Script</bdi>).')}</li>
      <li>${L('Delete everything in the editor, paste, and click 💾 <b>Save</b>.', 'מחק את כל מה שיש בעורך, הדבק, ולחץ 💾 <b>שמירה</b>.')}</li></ol>
    <button type="button" class="btn primary wz-big" data-wz="copy">📋 ${L('Copy the script', 'העתקת הסקריפט')}</button>
    <a class="linkish" href="${SCRIPT_PATH}" target="_blank" rel="noopener">${L('or open it as a file', 'או לפתוח אותו כקובץ')}</a>`;
  else if (wz.step === 2) b = `<h3>${L('Publish it as a web app', 'פרסום כאפליקציית אינטרנט')}</h3>
    <ol class="wz-list"><li>${L('In Apps Script: <b>Deploy › New deployment</b>.', 'ב-Apps Script: <bdi dir="ltr"><b>Deploy › New deployment</b></bdi> (פריסה › פריסה חדשה).')}</li>
      <li>${L('Click ⚙ next to “Select type” › <b>Web app</b>.', 'לחץ ⚙ ליד <bdi dir="ltr">"Select type" › <b>Web app</b></bdi>.')}</li>
      <li>${L('<b>Execute as: Me</b> · <b>Who has access: Anyone</b> › <b>Deploy</b>.', '<bdi dir="ltr"><b>Execute as: Me</b> · <b>Who has access: Anyone</b> › <b>Deploy</b></bdi>.')}</li>
      <li>${L('<b>Authorize access</b> › choose your account.', '<bdi dir="ltr"><b>Authorize access</b></bdi> › בחר את החשבון שלך.')}</li>
      <li>${L('If you see “Google hasn’t verified this app”: <b>Advanced › Go to … (unsafe) › Allow</b>. It is your own script, running in your own account.', 'אם מופיע <bdi dir="ltr">"Google hasn’t verified this app"</bdi>: <bdi dir="ltr"><b>Advanced › Go to … (unsafe) › Allow</b></bdi>. זה הסקריפט שלך, שרץ בחשבון שלך.')}</li>
      <li>${L('Copy the <b>Web app URL</b> (ends with <code>/exec</code>).', 'העתק את ה-<bdi dir="ltr"><b>Web app URL</b></bdi> (נגמר ב-<code dir="ltr">/exec</code>).')}</li></ol>
    ${tip(L('“Anyone” only lets the app reach it — every request still needs your password.', '"Anyone" רק מאפשר לאפליקציה להגיע אליו — כל בקשה עדיין דורשת את הסיסמה שלך.'))}`;
  else if (wz.step === 3) b = `<h3>${L('Connect the app', 'חיבור האפליקציה')}</h3>
    <label class="full">${L('Web app URL', 'כתובת ה-Web app')}<input id="wzUrl" inputmode="url" autocomplete="off" dir="ltr" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(wz.url)}"></label>
    <p class="wz-err" id="wzErr">${esc(wz.err)}</p>`;
  else if (wz.step === 4) b = wz.hasPw ? `<h3>${L('Sign in', 'כניסה')}</h3><p>${L('This sheet already has a password. Sign in with it.', 'לגיליון הזה כבר יש סיסמה. היכנס איתה.')}</p>
      <label class="full">${L('Username', 'שם משתמש')}<input id="wzUser" autocapitalize="none" autocorrect="off" dir="ltr" value="${esc(wz.user)}"></label>
      <label class="full">${L('Password', 'סיסמה')}<input id="wzPw" type="password" autocomplete="current-password"></label><p class="wz-err" id="wzErr">${esc(wz.err)}</p>`
    : `<h3>${L('Choose your sign-in', 'בחר שם משתמש וסיסמה')}</h3>
      <label class="full">${L('Username', 'שם משתמש')}<input id="wzUser" autocapitalize="none" autocorrect="off" spellcheck="false" dir="ltr" placeholder="dana" value="${esc(wz.user)}"></label>
      <label class="full">${L('Password (8+ characters)', 'סיסמה (8 תווים לפחות)')}<input id="wzPw" type="password" autocomplete="new-password"></label>
      <label class="full">${L('Password again', 'שוב את הסיסמה')}<input id="wzPw2" type="password" autocomplete="new-password"></label>
      ${tip(L('Stored only as a hash inside your script. You can change it later from the sheet: ⚙ Action Items › App: set / change password.', 'נשמרת רק כ-hash בתוך הסקריפט שלך. אפשר לשנות בהמשך מהגיליון: ⚙ Action Items › App: set / change password.'))}<p class="wz-err" id="wzErr">${esc(wz.err)}</p>`;
  else if (wz.step === 5) b = `<h3>${L('Which areas of life?', 'אילו תחומים?')}</h3><p class="hint">${L('Pick what fits — you can rename, add or reorder later in ☰ › Manage areas.', 'בחר מה שמתאים — אפשר לשנות, להוסיף ולסדר אחר כך ב-☰ › ניהול תחומים.')}</p>
    <div class="wz-areas">${WZ_AREAS.map(([a, ic]) => `<button type="button" class="${wz.areas.includes(a) ? 'on' : ''}" data-wzarea="${esc(a)}" aria-pressed="${wz.areas.includes(a)}">${ic} ${esc(tr(a))}</button>`).join('')}</div><p class="wz-err" id="wzErr">${esc(wz.err)}</p>`;
  else b = `<div class="wz-done"><b>🎉 ${L('All set!', 'הכול מוכן!')}</b><p>${L('To open it on your phone, send yourself this link — it connects that phone to your sheet:', 'כדי לפתוח בטלפון, שלח לעצמך את הקישור הזה — הוא מחבר את הטלפון לגיליון שלך:')}</p>
    <button type="button" class="btn ghost wz-big" data-wz="phone">📲 ${L('Send the link to my phone', 'שליחת הקישור לטלפון')}</button>
    <p class="hint">${L('On the phone: open the link in Safari › Share › <b>Add to Home Screen</b>.', 'בטלפון: פתח את הקישור ב-Safari › שיתוף › <b>הוסף למסך הבית</b>.')}</p></div>`;
  const last = wz.step === 6;
  $('#wzBody').innerHTML = steps + `<div class="wz-body">${b}</div><div class="sheet-actions">${wz.step && !last ? `<button type="button" class="btn ghost" data-wz="back">‹ ${L('Back', 'חזרה')}</button>` : ''}<span class="grow"></span>
    ${last ? `<button type="button" class="btn primary" data-wz="go">${L('Open my app', 'לאפליקציה שלי')}</button>` : `<button type="button" class="btn primary" data-wz="next">${wz.step === 0 && TEMPLATE_URL ? L('I made a copy ›', 'יצרתי עותק ›') : wz.step === 4 || wz.step === 5 ? L('Continue ›', 'המשך ›') : L('Next ›', 'הבא ›')}</button>`}</div>`;
}
async function wzNext() {
  const err = (m) => { wz.err = m; wzRender(); };
  wz.err = '';
  if (wz.step === 0 && TEMPLATE_URL) { wz.step = 2; wzRender(); return; }   // the template already contains the script
  if (wz.step === 3) {
    const u = cleanUrl($('#wzUrl').value); wz.url = u;
    if (!validUrl(u)) return err(L('That isn’t a web-app URL — it should start with https://script.google.com/ and end with /exec.', 'זו לא כתובת Web app — היא צריכה להתחיל ב-https://script.google.com/ ולהיגמר ב-/exec.'));
    $('#wzErr').textContent = L('Checking…', 'בודק…');
    try { const j = await (await fetch(u)).json(); if (!j || !j.ok) throw new Error('bad'); wz.hasPw = !!j.passwordSet; }
    catch (e) { return err(L('Couldn’t reach it. Check that “Who has access” is “Anyone”, and that you copied the newest deployment URL.', 'לא הצלחתי להגיע אליו. בדוק ש-"Who has access" הוא "Anyone" ושהעתקת את הכתובת של הפריסה האחרונה.')); }
    wz.step = 4; wzRender(); return;
  }
  if (wz.step === 4) {
    wz.user = ($('#wzUser').value || '').trim().toLowerCase(); wz.pw = $('#wzPw').value;
    if (wz.hasPw) { wz.step = 6; wzRender(); return; }
    if (!/^[a-z0-9._-]{3,30}$/.test(wz.user)) return err(L('Username: 3–30 English letters, numbers or . _ -', 'שם משתמש: 3–30 אותיות באנגלית, מספרים או . _ -'));
    if (wz.pw.length < 8) return err(L('Password: at least 8 characters.', 'סיסמה: לפחות 8 תווים.'));
    if (wz.pw !== $('#wzPw2').value) return err(L('The two passwords are different.', 'שתי הסיסמאות שונות.'));
    wz.step = 5; wzRender(); return;
  }
  if (wz.step === 5) {
    if (!wz.areas.length) return err(L('Pick at least one area.', 'בחר לפחות תחום אחד.'));
    $('#wzErr').textContent = L('Setting up your sheet…', 'מכין את הגיליון שלך…');
    try { const j = await (await fetch(wz.url, { method: 'POST', body: JSON.stringify({ action: 'initPassword', username: wz.user, password: wz.pw, areas: wz.areas }) })).json();
      if (!j.ok) return err(j.error || L('Something went wrong', 'משהו השתבש')); }
    catch (e) { return err(L('No connection to your sheet — try again.', 'אין חיבור לגיליון — נסה שוב.')); }
    wz.step = 6; wzRender(); return;
  }
  wz.step++; wzRender();
}
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-wzarea]'); if (a && wz) { const k = a.dataset.wzarea; wz.areas = wz.areas.includes(k) ? wz.areas.filter(x => x !== k) : wz.areas.concat(k); wzRender(); return; }
  const b = e.target.closest('#dlgSetup [data-wz]'); if (!b || !wz) return;
  const k = b.dataset.wz;
  if (k === 'next') { wzNext(); return; }
  if (k === 'back') { wz.err = ''; wz.step = wz.step === 2 && TEMPLATE_URL ? 0 : wz.step - 1; wzRender(); return; }
  if (k === 'copy') { if (!wz.script) { toast(L('Still loading — try again in a second', 'עדיין נטען — נסה שוב עוד שנייה')); return; }
    try { await navigator.clipboard.writeText(wz.script); b.textContent = '✓ ' + L('Copied — now paste it in Apps Script', 'הועתק — עכשיו הדבק ב-Apps Script'); }
    catch (x) { window.open(SCRIPT_PATH, '_blank'); } return; }
  if (k === 'phone') { const link = location.origin + location.pathname + '#join=' + encodeURIComponent(wz.url) + '&u=' + encodeURIComponent(wz.user);
    const text = L('My Action Items app: ', 'האפליקציה שלי: ') + link;
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (x) { return; }
    try { await navigator.clipboard.writeText(link); toast(L('Link copied — send it to yourself', 'הקישור הועתק — שלח אותו לעצמך')); } catch (x) { prompt('', link); } return; }
  if (k === 'go') { const w = wz; $('#dlgSetup').close(); wz = null; store.set('ai.tourPending', true);
    $('#lockUrlWrap').hidden = false; LK('url').value = w.url; LK('username').value = w.user; LK('password').value = w.pw; LK('remember').checked = true; frmLock.requestSubmit(); }
});

/* =====================================================================
   🧭 Guided tour — spotlights the main parts of the app, one at a time
   Starts by itself once after a new copy is set up; ☰ › Guided tour runs it again.
   ===================================================================== */
let tour = null;
const TOUR = () => [
  { t: L('Welcome! 👋', 'ברוכים הבאים! 👋'), d: L('A one-minute tour of the main things you can do. You can stop any time.', 'סיור של דקה על הדברים העיקריים באפליקציה. אפשר לעצור בכל רגע.') },
  { el: '#kpis', t: L('Your day at a glance', 'היום שלך במבט אחד'), d: L('How many tasks are late, due today and this week. Tap a number to jump there.', 'כמה משימות באיחור, להיום והשבוע. לחיצה על מספר קופצת אליהן.') },
  { el: '#tabs', t: L('Screens', 'מסכים'), d: L('<b>Focus</b> — what matters now · <b>Notebook</b> — tasks without a date, plus a Collection of restaurants, trips, recipes and wishes · <b>Week</b> — a calendar view · <b>More</b> — all, waiting, people, done.', '<b>פוקוס</b> — מה חשוב עכשיו · <b>פנקס</b> — משימות בלי תאריך, ואוסף של מסעדות, טיולים, מתכונים ומשאלות · <b>שבוע</b> — תצוגת לוח · <b>עוד</b> — הכול, ממתין, אנשים, בוצעו.') },
  { el: '.area-row', t: L('Areas of life', 'תחומי חיים'), d: L('Tap an area to see only it. <b>Choose areas</b> shows several together — the counts and the video follow.', 'לחיצה על תחום מציגה רק אותו. <b>בחירת תחומים</b> מציגה כמה יחד — הספירות והסרטון מתאימים את עצמם.') },
  { el: '.story-row', t: L('Today’s recap', 'תקציר היום'), d: L('A 30-second animated video of what’s urgent, told by a funny character.', 'סרטון מונפש של 30 שניות על מה שדחוף, עם דמות מצחיקה.') },
  { el: '.myday, .empty-day', t: L('My day ☀', 'שלי להיום ☀'), d: L('Pick up to 3 tasks you intend to work on today — from ⋯ on a task. Due dates don’t change.', 'בחר עד 3 משימות שאתה מתכוון לעבוד עליהן היום — דרך ⋯ במשימה. התאריכים לא משתנים.') },
  { el: '#list .card', t: L('A task', 'משימה'), d: L('Tap the circle when it’s done 🎉. Tap the task to edit it. <b>⋯</b> starts <b>Focus time</b>, defers to tomorrow or adds it to My day.', 'לחיצה על העיגול כשסיימת 🎉. לחיצה על המשימה פותחת עריכה. <b>⋯</b> מתחיל <b>זמן פוקוס</b>, דוחה למחר או מוסיף לשלי להיום.') },
  { el: '#fab', t: L('Add a task', 'הוספת משימה'), d: L('Just type: “tomorrow 9:30 call the bank !1 ~1h” — date, time, priority and hours are picked up.', 'פשוט לכתוב: "מחר 9:30 להתקשר לבנק !1 ~1h" — התאריך, השעה, העדיפות והשעות מזוהים לבד.') },
  { el: '#fabPlay', t: L('Quick actions', 'פעולות מהירות'), d: L('Calendar sync, the daily videos, a link to the Collection and the weekly review.', 'סנכרון מהיומן, הסרטונים היומיים, קישור לאוסף והסקירה השבועית.') },
  { el: '#btnSearch', t: L('Search', 'חיפוש'), d: L('One search across tasks, the Notebook and the Collection.', 'חיפוש אחד במשימות, בפנקס ובאוסף.') },
  { el: '#btnMenu', t: L('Menu', 'תפריט'), d: L('Areas, sharing with family, phone notifications, dark mode, font size — and this tour again.', 'תחומים, שיתוף עם המשפחה, התראות לטלפון, מצב כהה, גודל גופן — וגם הסיור הזה שוב.') },
  { t: L('⏱ Focus time', '⏱ זמן פוקוס'), d: L('Pick a task › ⋯ › <b>Start focus</b>. A quiet screen with a timer; breaks don’t count, and the time can go into the task’s hours.', 'בוחרים משימה › ⋯ › <b>מתחילים פוקוס</b>. מסך שקט עם טיימר; הפסקות לא נספרות, והזמן יכול להיכנס לשעות של המשימה.') },
  { t: L('That’s it! 🚀', 'זהו! 🚀'), d: L('Add your first task with ＋ below. Good luck!', 'הוסף את המשימה הראשונה עם ＋ למטה. בהצלחה!'), last: true }
];
function startTour() {
  if (isGuest()) return;
  document.querySelectorAll('dialog[open]').forEach(d => d.close()); closeWelcome && closeWelcome();
  if (ui.tab !== 'focus') { ui.tab = 'focus'; store.set('ai.ui', ui); render(); }
  store.set('ai.tourDone', true); store.set('ai.tourPending', false);
  const steps = TOUR().filter(st => !st.el || document.querySelector(st.el));   // skip what isn't on screen (e.g. no tasks yet)
  let el = $('#tour');
  if (!el) { el = document.createElement('div'); el.id = 'tour'; el.className = 'tour'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="tour-hole"></div><div class="tour-card"></div>'; document.body.appendChild(el); }
  tour = { steps, i: 0, el }; el.hidden = false; document.body.classList.add('tour-open'); tourShow();
}
function tourShow() {
  const st = tour.steps[tour.i], n = tour.steps.length, hole = tour.el.querySelector('.tour-hole'), card = tour.el.querySelector('.tour-card');
  const target = st.el ? document.querySelector(st.el) : null;
  card.innerHTML = `<div class="tour-step" dir="ltr">${tour.i + 1} / ${n}</div><h3>${st.t}</h3><p>${st.d}</p>
    <div class="tour-dots">${tour.steps.map((x, k) => `<i class="${k === tour.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-act">${st.last ? '' : `<button type="button" class="linkish" data-tour="end">${L('Skip the tour', 'דילוג על הסיור')}</button>`}<span class="grow"></span>
      ${tour.i ? `<button type="button" class="btn ghost" data-tour="back">${L('Back', 'הקודם')}</button>` : ''}<button type="button" class="btn primary" data-tour="${st.last ? 'end' : 'next'}">${st.last ? L('Let’s start', 'יאללה מתחילים') : L('Next', 'הבא')}</button></div>`;
  card.querySelector('[data-tour="' + (st.last ? 'end' : 'next') + '"]').focus({ preventScroll: true });
  const place = () => {
    if (!tour) return;
    if (!target) { hole.style.cssText = 'top:50%;left:50%;width:0;height:0'; card.classList.add('center'); card.style.top = ''; card.style.left = ''; return; }
    card.classList.remove('center');
    const r = target.getBoundingClientRect(), pad = 6;
    hole.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const ch = card.offsetHeight, cw = card.offsetWidth, below = r.bottom + 14 + ch < innerHeight - 8;
    card.style.top = (below ? r.bottom + 14 : Math.max(8, r.top - 14 - ch)) + 'px';
    card.style.left = Math.max(12, Math.min(innerWidth - cw - 12, r.left + r.width / 2 - cw / 2)) + 'px';
  };
  if (target) { const r = target.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 20) target.scrollIntoView({ block: 'center' }); }
  requestAnimationFrame(place); tour.place = place;
}
function tourEnd() { if (!tour) return; tour.el.hidden = true; document.body.classList.remove('tour-open'); tour = null; }
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tour]'); if (!b || !tour) return;
  const k = b.dataset.tour;
  if (k === 'end') { tourEnd(); return; }
  tour.i = Math.max(0, Math.min(tour.steps.length - 1, tour.i + (k === 'next' ? 1 : -1))); tourShow();
});
document.addEventListener('keydown', (e) => { if (!tour) return; if (e.key === 'Escape') tourEnd(); if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const fwd = (e.key === 'ArrowLeft') === isHe(); tour.i = Math.max(0, Math.min(tour.steps.length - 1, tour.i + (fwd ? 1 : -1))); tourShow(); } });
window.addEventListener('resize', () => tour && tour.place && tour.place());
window.addEventListener('scroll', () => tour && tour.place && tour.place(), { passive: true });
$('#btnTour').addEventListener('click', () => { $('#dlgMenu').close(); setTimeout(startTour, 150); });

$('#lockSetup').addEventListener('click', openWizard);
if (EDITION === 'public') document.documentElement.classList.add('ed-public');

$('#btnLock').addEventListener('click', () => { if (settings.demo) { settings.demo = false; store.set('ai.settings', settings); } lockApp(); });

/* ---------- start ---------- */
const APP_VERSION = 69;
$('#appVer').textContent = L('Version ', 'גרסה ') + APP_VERSION;
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
render();
if (settings.demo) load(true);
else if (settings.url && password && username) load(true);
else showLock();
