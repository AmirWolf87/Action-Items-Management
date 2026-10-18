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

function setSync(text) { $('#sync').textContent = text ? '· ' + text : ''; }
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
    setSync(L('offline', 'לא מחובר') + (queue().length ? L(` · ${queue().length} waiting to sync`, ` · ${queue().length} ממתינים לסנכרון`) : ''));
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
async function toggleDone(it) {
  const copy = Object.assign({}, it);
  if (isClosed(it)) { copy.status = 'In progress'; copy.done = ''; await save(copy); return; }
  const h = await askHours(it);
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
    if (await save(copy)) toast(L(`Done ✓  Next: ${fmt(copy.due, true)}`, `בוצע ✓  הבא: ${fmt(copy.due, true)}`));
  } else {
    copy.status = 'Done'; copy.done = iso(today());
    if (await save(copy)) toast('Done ✓');
  }
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
function card(it) {
  const h = horizon(it);
  const cls = isClosed(it) ? 'closed' : h === 'Overdue' ? 'overdue' : h === 'Today' ? 'today' : '';
  const st = it.status && it.status !== 'Not started' && !isClosed(it) ? pill(it.status, STATUS_C[it.status]) : '';
  const pr = it.prio ? pill(it.prio.replace(/^\d - /, ''), PRIO_C[String(it.prio).charAt(0)]) : '';
  const who = it.focal && it.focal !== 'Me' ? `<span>👤 ${esc(it.focal)}</span>` : '';
  const rec = it.rec && it.rec !== 'None' ? `<span title="Recurring">↻ ${esc(it.rec)}</span>` : '';
  const priv = it.private ? '<span class="private-ic" title="Private — hidden from guests">🔒</span>' : '';
  const cl = Array.isArray(it.checklist) && it.checklist.length ? `<span>☑ ${it.checklist.filter(x => x.d).length}/${it.checklist.length}</span>` : '';
  const wd = waitDays(it);
  const wait = wd !== null ? `<span class="${wd >= 3 ? 'wait-late' : ''}">⏳ ${L(`waiting ${wd}d`, `ממתין ${wd} ימ׳`)}</span>` : '';
  return `<div class="card ${cls}" data-row="${it.row}">
    <button class="check ${isClosed(it) ? 'on' : ''}" data-check="${it.row}" aria-label="Mark done">${isClosed(it) ? '✓' : ''}</button>
    <div class="body">
      <div class="title" dir="auto">${esc(it.item)}</div>
      <div class="meta">${it.area ? pill(it.area, areaColor(it.area)) : ''}${pr}${st}${dueLabel(it)}${who}${wait}${cl}${rec}${priv}</div>
      ${it.com ? `<div class="note" dir="auto">${esc(it.com)}</div>` : ''}
    </div>${isClosed(it) ? '' : `<button class="snooze" data-snooze="${it.row}" title="${L('Defer to tomorrow', 'דחה למחר')}" aria-label="${L('Defer to tomorrow', 'דחה למחר')}">⏭<span class="snz-t"> ${L('Tomorrow', 'מחר')}</span></button>`}</div>`;
}

function filtered() {
  const q = search.trim().toLowerCase();
  return data.items.filter(it =>
    (ui.area === 'All' || it.area === ui.area) &&
    (!q || [it.item, it.topic, it.com, it.focal].join(' ').toLowerCase().includes(q)));
}

function render() {
  document.body.classList.toggle('guest', isGuest());
  $('#guestBar').hidden = !isGuest();
  if (isGuest()) $('#guestBar').textContent = L(`👀 Viewing as ${me.name} · read-only`, `👀 צפייה בתור ${me.name} · קריאה בלבד`) + (me.canSuggest ? L(' · tap ＋ to suggest an item', ' · לחץ ＋ כדי להציע משימה') : '');
  $('#fab').classList.toggle('can-suggest', isGuest() && me.canSuggest);
  $('#btnPending').hidden = isGuest() || !(pending.length + pwReq.length);
  $('#pendingBadge').textContent = (pending.length + pwReq.length) || '';
  $('#today').textContent = today().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const open = data.items.filter(it => !isClosed(it));
  const cnt = (h) => open.filter(it => horizon(it) === h).length;
  const ws = weekStart(today());
  const doneWeek = data.items.filter(it => it.status === 'Done' && parse(it.done) >= ws).length;
  $('#kpis').innerHTML = [
    ['Overdue', cnt('Overdue'), 'red', 'focus'], ['Today', cnt('Today'), 'amber', 'focus'],
    ['This week', cnt('This week'), 'green', 'focus'], ['Waiting', open.filter(i => i.status === 'Waiting').length, 'purple', 'waiting'],
    ['Done wk', doneWeek, '', 'done'], ['Open', open.length, '', 'all']
  ].map(([l, n, c, tab]) => `<button class="kpi ${c}" data-goto="${tab}"><b>${n}</b><span>${l}</span></button>`).join('');

  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $('#areaChips').innerHTML = ['All'].concat(data.areas).map(a => `<button class="chip ${ui.area === a ? 'on' : ''}" data-area="${esc(a)}">${esc(a)}</button>`).join('');

  const items = filtered();
  let html = '';
  $('#list').classList.toggle('weekmode', ui.tab === 'week');
  if (ui.tab !== 'notebook') document.body.classList.remove('nb-mode');
  if (ui.tab === 'week') { $('#list').innerHTML = renderWeek(items); return; }
  document.body.classList.toggle('nb-mode', ui.tab === 'notebook');
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
    const openF = items.filter(it => !isClosed(it)).sort(sortOpen);
    html = hs.map(h => group(h, openF.filter(it => horizon(it) === h), h.toLowerCase().replace(' ', ''))).join('');
    const nd = openF.filter(it => !it.due).length;
    if (ui.tab === 'all' && nd) html += `<button class="nb-link" data-goto="notebook">📒 ${L(`${nd} items without a date are in the Notebook`, `${nd} משימות ללא תאריך נמצאות בפנקס`)} <span>›</span></button>`;
  }
  if (isGuest() && ui.tab === 'focus' && mySugg.length) html = suggHtml() + html;
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
      ${it.private ? '<span class="private-ic">🔒</span>' : ''}</li>`;
  };
  const openN = list.filter(it => !isClosed(it)).length;
  return `<div class="nb-wrap">
    <div class="nb-tabs">${tabs}</div>
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
async function nbToggle(it) {
  const copy = Object.assign({}, it);
  if (isClosed(it)) { copy.status = 'Not started'; copy.done = ''; } else { copy.status = 'Done'; copy.done = iso(today()); }
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
});
function group(title, arr, cls) {
  if (!arr.length) return '';
  return `<section class="group ${cls}"><h3>${esc(title)} <span class="n">${arr.length}</span></h3>${arr.map(card).join('')}</section>`;
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
frm.addEventListener('input', (e) => { if (e.target === F('due') || e.target === F('rec')) updateHint(); if (e.target === F('status')) updateWaitBox(Object.assign({}, editing || {}, { status: F('status').value, focal: F('focal').value })); });
frm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const it = Object.assign({}, editing || {});
  ['item', 'status', 'area', 'prio', 'due', 'time', 'topic', 'focal', 'rec', 'hrs', 'done', 'acthrs', 'com'].forEach(k => { it[k] = String(F(k).value).trim(); });
  if (it.time) { const nt = normTime(it.time); if (nt === null) { toast(L('Start time: use 24-hour HH:MM, e.g. 17:30', 'שעת התחלה: פורמט 24 שעות HH:MM, למשל 17:30')); F('time').focus(); return; } it.time = nt; }
  if (!it.item || isGuest()) return;
  it.private = F('private').checked;
  it.checklist = curCl.filter(x => x.t);
  if (it.status === 'Waiting' && (!editing || editing.status !== 'Waiting' || !editing.wsince)) it.wsince = (editing && editing.status === 'Waiting' && editing.wsince) || iso(today());
  if (it.status !== 'Waiting') it.wsince = '';
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
  if (await save(it)) toast(editing ? 'Saved' : 'Added');
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

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-close]')) { t.closest('dialog').close(); return; }
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
  if (t.closest('[data-undo]')) { undo(); return; }
  if (t.closest('[data-redo]')) { redo(); return; }
  const wi = t.closest('.wi');
  if (wi) { const it = data.items.find(x => String(x.row) === wi.dataset.row); if (it) openEdit(it); return; }
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
  if (ch) { ui.area = ch.dataset.area; store.set('ai.ui', ui); render(); }
});
$('#search').addEventListener('input', (e) => { search = e.target.value; render(); });
$('#fab').addEventListener('click', () => isGuest() ? openSuggest() : openEdit(null));
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
function toast(msg) {
  const t = $('#toast');
  // dialogs sit in the browser's top layer — move the toast inside the open dialog so it is visible
  const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  if (t.parentNode !== host) host.appendChild(t);
  t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
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
  if (method === 'GET') return Promise.resolve({ ok: true, role: 'owner', pending: demoPending, items: JSON.parse(JSON.stringify(demoItems)), areas: demoAreas || Object.keys(AREA_C), people: ['Me', 'Colleague'], report: { manager: 'Manager', email: '', from: 'Me', area: 'Work' } });
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
      ${weekOff !== 0 ? '<button class="chip" data-wk="0">This week</button>' : ''}<button class="btn link" data-ics>📅 Export to Outlook</button></div>
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
  if (await save(copy)) toast(L(`Deferred to ${fmt(copy.due, true)}`, `נדחה ל-${fmt(copy.due, true)}`));
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
  $('#qa').value = ''; qaPreview();
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
  mySugg = j.mySuggestions || [];
  data = { items: j.items || [], areas: j.areas && j.areas.length ? j.areas : Object.keys(AREA_C), people: j.people || [], report: j.report, areaHints: j.areaHints || {} };
  if (!data.areas.includes(ui.area) && ui.area !== 'All') ui.area = 'All';
  if (isGuest() && (ui.tab === 'waiting')) ui.tab = 'focus';
  if (!settings.demo && remembered()) store.set('ai.cache', data);
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
let guests = [], gAreas = [];
const appBase = () => location.origin + location.pathname;
const inviteLink = (u) => appBase() + '#join=' + encodeURIComponent(settings.url || '') + (u ? '&u=' + encodeURIComponent(u) : '');
function renderGuests() {
  $('#guestList').innerHTML = guests.length ? guests.map(g => `<div class="gcard ${g.on === false ? 'off' : ''}" data-gid="${esc(g.id)}">
      <b dir="auto">${esc(g.name)}</b>${(g.areas || []).map(a => pill(a, areaColor(a))).join('')}
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
}
function resetGuestForm(g) {
  const f = $('#frmGuest'), E = (k) => f.elements.namedItem(k);
  E('id').value = g ? g.id : ''; E('name').value = g ? g.name : ''; E('gpw').value = g && g.pw ? g.pw : '';
  E('guser').value = g ? (g.user || '') : '';
  E('gphone').value = g ? (g.phone || '') : '';
  E('gpw').placeholder = tr(g ? 'leave empty to keep the current password' : 'at least 6 characters');
  E('canSuggest').checked = g ? !!g.canSuggest : true; E('on').checked = g ? g.on !== false : true;
  gAreas = g ? (g.areas || []).slice() : ['Home'].filter(a => data.areas.includes(a));
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
$('#guestAreas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-garea]'); if (!b) return;
  const a = b.dataset.garea, i = gAreas.indexOf(a); if (i >= 0) gAreas.splice(i, 1); else gAreas.push(a); renderGuestAreas();
});
$('#guestCancel').addEventListener('click', () => resetGuestForm(null));
$('#frmGuest').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, E = (k) => f.elements.namedItem(k);
  if (!gAreas.length) { $('#shareStatus').textContent = 'Choose at least one area the guest can see.'; return; }
  const orig = guests.find(x => x.id === E('id').value);
  const g = { id: E('id').value || undefined, name: E('name').value.trim(), user: E('guser').value.trim().toLowerCase(), phone: E('gphone').value.trim(), areas: gAreas, canSuggest: E('canSuggest').checked, on: E('on').checked };
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
$('#btnLock').addEventListener('click', () => { if (settings.demo) { settings.demo = false; store.set('ai.settings', settings); } lockApp(); });

/* ---------- start ---------- */
const APP_VERSION = 26;
$('#appVer').textContent = L('Version ', 'גרסה ') + APP_VERSION;
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
render();
if (settings.demo) load(true);
else if (settings.url && password && username) load(true);
else showLock();
