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
const remembered = () => !!store.get('ai.pw', null);
let ui = store.get('ai.ui', { tab: 'focus', area: 'All' });
const EMPTY = () => ({ items: [], areas: Object.keys(AREA_C), people: ['Me'], report: null });
let data = (store.get('ai.pw', null) && store.get('ai.cache', null)) || EMPTY();
let search = '';
let weekOff = 0;

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { if (!s) return null; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(d.getDate(), last)); return x; };
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const dayDiff = (a, b) => Math.round((a - b) / 86400000);
const fmt = (s, withDay) => { const d = parse(s); if (!d) return ''; return (withDay ? d.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' : '') + `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
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
  const payload = Object.assign({ password }, method === 'GET' ? { action: 'list' } : body);
  try {
    res = await fetch(settings.url, { method: 'POST', body: JSON.stringify(payload) });
  } catch (e) {
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
  if (!settings.demo && (!settings.url || !password)) { showLock(); return false; }
  setSync('syncing…');
  try {
    const j = await api('GET');
    data = { items: j.items || [], areas: j.areas && j.areas.length ? j.areas : Object.keys(AREA_C), people: j.people || [], report: j.report };
    if (!settings.demo && remembered()) store.set('ai.cache', data);
    setSync('synced ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    if (e.auth) { lockApp(e.message); return false; }
    setSync('offline');
    if (!quiet) toast(e.message);
    render(); return false;
  }
  render(); return true;
}

async function save(it) {
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
    render();
    return true;
  } catch (e) {
    data.items = JSON.parse(before); render(); toast('Not saved: ' + e.message); return false;
  }
}
async function remove(row) {
  const before = JSON.stringify(data.items);
  data.items = data.items.filter(x => x.row !== row); render();
  try { await api('POST', { action: 'delete', row }); if (!settings.demo && remembered()) store.set('ai.cache', data); toast('Deleted'); }
  catch (e) { data.items = JSON.parse(before); render(); toast('Not deleted: ' + e.message); }
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
    copy.due = iso(nd); copy.status = 'Not started';
    const plan = parseFloat(it.hrs);
    if (h !== '' && plan && Math.abs(h - plan) > 1) {
      const upd = await confirmBox('Update the plan?',
        `This took you ${h} h, but "${it.item}" is planned for ${plan} h.\n\nPlan ${h} h for the next time (${fmt(copy.due, true)})?`,
        `Plan ${h} h`, `Keep ${plan} h`);
      if (upd) copy.hrs = String(h);
    }
    if (await save(copy)) toast(`Done ✓  Next: ${fmt(copy.due, true)}`);
  } else {
    copy.status = 'Done'; copy.done = iso(today());
    if (await save(copy)) toast('Done ✓');
  }
}

/* ---------- small modal helpers ---------- */
function askHours(it) {
  return new Promise(resolve => {
    const d = $('#dlgHours'), f = $('#frmHours'), inp = f.elements.namedItem('h');
    $('#hoursTitle').textContent = `"${it.item}"` + (parseFloat(it.hrs) ? ` — planned ${it.hrs} h` : '');
    inp.value = it.hrs || '';
    $('#hoursQuick').innerHTML = [0.25, 0.5, 1, 1.5, 2, 3, 4, 8].map(v => `<button type="button" data-h="${v}">${v} h</button>`).join('');
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
  if (isClosed(it)) return it.done ? `<span>Done ${fmt(it.done)}</span>` : '';
  const d = parse(it.due); if (!d) return '<span>No date</span>';
  const n = dayDiff(d, today());
  const cls = n < 0 ? 'late' : n <= 3 ? 'soon' : 'ok';
  const txt = n < 0 ? `${-n}d late` : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `in ${n}d`;
  return `<span class="due ${cls}">${txt}</span><span>${fmt(it.due, true)}</span>`;
}
function card(it) {
  const h = horizon(it);
  const cls = isClosed(it) ? 'closed' : h === 'Overdue' ? 'overdue' : h === 'Today' ? 'today' : '';
  const st = it.status && it.status !== 'Not started' && !isClosed(it) ? pill(it.status, STATUS_C[it.status]) : '';
  const pr = it.prio ? pill(it.prio.replace(/^\d - /, ''), PRIO_C[String(it.prio).charAt(0)]) : '';
  const who = it.focal && it.focal !== 'Me' ? `<span>👤 ${esc(it.focal)}</span>` : '';
  const rec = it.rec && it.rec !== 'None' ? `<span title="Recurring">↻ ${esc(it.rec)}</span>` : '';
  return `<div class="card ${cls}" data-row="${it.row}">
    <button class="check ${isClosed(it) ? 'on' : ''}" data-check="${it.row}" aria-label="Mark done">${isClosed(it) ? '✓' : ''}</button>
    <div class="body">
      <div class="title" dir="auto">${esc(it.item)}</div>
      <div class="meta">${it.area ? pill(it.area, AREA_C[it.area]) : ''}${pr}${st}${dueLabel(it)}${who}${rec}</div>
      ${it.com ? `<div class="note" dir="auto">${esc(it.com)}</div>` : ''}
    </div></div>`;
}

function filtered() {
  const q = search.trim().toLowerCase();
  return data.items.filter(it =>
    (ui.area === 'All' || it.area === ui.area) &&
    (!q || [it.item, it.topic, it.com, it.focal].join(' ').toLowerCase().includes(q)));
}

function render() {
  $('#today').textContent = today().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
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
  if (ui.tab === 'week') { $('#list').innerHTML = renderWeek(items); return; }
  if (ui.tab === 'done') {
    const done = items.filter(isClosed).sort((a, b) => (parse(b.done) || 0) - (parse(a.done) || 0));
    html = group('Completed', done, '');
  } else if (ui.tab === 'waiting') {
    html = group('Waiting on others', items.filter(it => it.status === 'Waiting').sort(sortOpen), '');
  } else {
    const hs = ui.tab === 'focus' ? ['Overdue', 'Today', 'This week'] : HORIZONS;
    const openF = items.filter(it => !isClosed(it)).sort(sortOpen);
    html = hs.map(h => group(h, openF.filter(it => horizon(it) === h), h.toLowerCase().replace(' ', ''))).join('');
  }
  if (!html) html = ui.tab === 'focus'
    ? `<div class="empty"><b>🎉</b>Nothing overdue, due today or this week.<br>Check "All open" for later items.</div>`
    : `<div class="empty"><b>🗂</b>No items here.</div>`;
  $('#list').innerHTML = html;
}
function group(title, arr, cls) {
  if (!arr.length) return '';
  return `<section class="group ${cls}"><h3>${esc(title)} <span class="n">${arr.length}</span></h3>${arr.map(card).join('')}</section>`;
}

/* ---------- edit dialog ---------- */
const dlgEdit = $('#dlgEdit'), frm = $('#frmEdit');
const F = (k) => frm.elements.namedItem(k);
function fillSelect(sel, opts, blank) { sel.innerHTML = (blank ? '<option value=""></option>' : '') + opts.map(o => `<option>${esc(o)}</option>`).join(''); }
let editing = null;
function openEdit(it) {
  editing = it || null;
  fillSelect(F('status'), STATUS); fillSelect(F('area'), data.areas, true); fillSelect(F('prio'), PRIO, true); fillSelect(F('rec'), REC);
  $('#peopleList').innerHTML = data.people.map(p => `<option value="${esc(p)}">`).join('');
  const v = it || { status: 'Not started', area: ui.area !== 'All' ? ui.area : 'Work', prio: '2 - Medium', rec: 'None', focal: 'Me', due: iso(today()) };
  ['item', 'status', 'area', 'prio', 'due', 'time', 'topic', 'focal', 'rec', 'hrs', 'done', 'acthrs', 'com'].forEach(k => { F(k).value = v[k] ?? ''; });
  $('#editTitle').textContent = it ? 'Edit action item' : 'New action item';
  $('#btnDelete').style.display = it ? '' : 'none';
  updateHint();
  dlgEdit.showModal();
  if (!it) setTimeout(() => F('item').focus(), 50);
}
function updateHint() {
  const nd = nextDue({ due: F('due').value, rec: F('rec').value });
  $('#nextHint').textContent = nd ? `↻ Recurring — ticking it done moves the due date to ${fmt(iso(nd), true)}.` : '';
}
frm.addEventListener('input', (e) => { if (e.target === F('due') || e.target === F('rec')) updateHint(); });
frm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const it = Object.assign({}, editing || {});
  ['item', 'status', 'area', 'prio', 'due', 'time', 'topic', 'focal', 'rec', 'hrs', 'done', 'acthrs', 'com'].forEach(k => { it[k] = String(F(k).value).trim(); });
  if (!it.item) return;
  if (it.status === 'Done' && !it.done) it.done = iso(today());
  if (!editing) it.created = iso(today());
  const plan = parseFloat(it.hrs);
  const changed = !editing || String(editing.hrs || '') !== it.hrs || (editing.rec || 'None') !== it.rec || norm(editing.item) !== norm(it.item);
  if (plan && changed && !isClosed(it)) {
    const ref = lastActual(it, editing);
    if (ref && Math.abs(plan - ref.h) > 1) {
      const ok = await confirmBox('Check your estimate',
        `Last time "${ref.title}" took you ${ref.h} h, but now you plan ${plan} h.\n\nApprove ${plan} h?`,
        `Approve ${plan} h`, `Use ${ref.h} h`);
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
function buildReport() {
  const offset = +$('#repWeek').value;
  const name = $('#repName').value.trim() || 'Ezra';
  const from = (data.report && data.report.from) || 'Amir Wolf';
  const r = reportData(offset);
  const range = `${pad(r.ws.getDate())}/${pad(r.ws.getMonth() + 1)} – ${pad(r.we.getDate())}/${pad(r.we.getMonth() + 1)}/${r.we.getFullYear()}`;
  const subject = `Weekly Action Items | ${range} | ${from}`;
  const chip = (l, n, c) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:14px;background:${c}1A;color:${c};font-weight:bold;">${l} ${n}</span>`;
  const labels = ['Completed', 'Planned', 'Carried over', 'Waiting'];
  let html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1F2937;">`;
  html += `<p>Hi ${esc(name)},</p><p>Please find below my action items for the week of <b>${range}</b>.</p>`;
  html += `<div style="margin:6px 0 16px 0;">${r.sections.map((s, i) => chip(labels[i], s.items.length, s.color)).join('')}</div>`;
  let text = `Hi ${name},\n\nPlease find below my action items for the week of ${range}.\n\n`;
  r.sections.forEach(s => {
    html += `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:860px;margin:0 0 22px 0;font-size:13px;">`;
    html += `<tr><td colspan="6" style="background:${s.color};color:#fff;font-weight:bold;font-size:14px;padding:9px 12px;">${esc(s.title)} (${s.items.length})</td></tr>`;
    text += `${s.title.replace(/\s+/g, ' ')}\n────────────────────────────\n`;
    if (!s.items.length) {
      html += `<tr><td colspan="6" style="padding:10px 12px;color:#9CA3AF;font-style:italic;border-bottom:1px solid #E5E7EB;">None</td></tr>`;
      text += 'None\n';
    } else {
      const th = (t) => `<th style="background:#F3F4F6;color:#4B5563;font-size:11px;text-transform:uppercase;padding:7px 12px;text-align:left;border-bottom:1px solid #E5E7EB;">${t}</th>`;
      html += `<tr>${th('Action item')}${th('Topic')}${th(s.dateLabel)}${th('Priority')}${th('Status')}${th('Comments / next step')}</tr>`;
      s.items.forEach((it, i) => {
        const bg = i % 2 ? '#F9FAFB' : '#FFFFFF';
        const p = PRIO_C[String(it.prio).charAt(0)] || ['#F3F4F6', '#374151'];
        const td = (v, x) => `<td dir="auto" style="padding:8px 12px;border-bottom:1px solid #E5E7EB;background:${bg};vertical-align:top;${x || ''}">${v}</td>`;
        html += '<tr>' + td(`<b>${esc(it.item)}</b>`) + td(esc(it.topic), 'color:#4B5563;') + td(fmt(it[s.dateKey], true), 'white-space:nowrap;') +
          td(it.prio ? `<span style="background:${p[0]};color:${p[1]};font-weight:bold;padding:2px 8px;border-radius:10px;white-space:nowrap;">${esc(it.prio)}</span>` : '') +
          td(esc(it.status), 'white-space:nowrap;') + td(esc(it.com), 'color:#4B5563;') + '</tr>';
        text += `${i + 1}.  ${it.item}${it[s.dateKey] ? `   |   ${s.dateLabel} ${fmt(it[s.dateKey])}` : ''}${it.prio ? '   |   ' + it.prio.replace(/^\d - /, '') : ''}\n${it.com ? '       ↳ ' + it.com + '\n' : ''}`;
      });
    }
    html += '</table>'; text += '\n';
  });
  html += `<p>Happy to adjust priorities if needed.</p><p>Best regards,<br><b>${esc(from)}</b></p></div>`;
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
  refreshReport(); dlgRep.showModal();
}
['repWeek', 'repName', 'repEmail'].forEach(id => $('#' + id).addEventListener('input', refreshReport));
$('#repCopy').addEventListener('click', async () => {
  const r = buildReport();
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([r.html], { type: 'text/html' }), 'text/plain': new Blob([r.text], { type: 'text/plain' }) })]);
    toast('Copied — open Outlook/Gmail and paste into the message');
  } catch (e) {
    const el = $('#repPreview'); const range = document.createRange(); range.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) { /* ignore */ }
    if (ok) { sel.removeAllRanges(); toast('Copied — open Outlook/Gmail and paste'); } else toast('Select the preview and copy it manually');
  }
});

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-close]')) { t.closest('dialog').close(); return; }
  const mv = t.closest('[data-mv]');
  if (mv) { e.stopPropagation(); moveDay(mv.dataset.r, +mv.dataset.mv); return; }
  const wk = t.closest('[data-wk]');
  if (wk) { weekOff = wk.dataset.wk === '0' ? 0 : weekOff + Number(wk.dataset.wk); render(); return; }
  if (t.closest('[data-ics]')) { openIcs(); return; }
  const wi = t.closest('.wi');
  if (wi) { const it = data.items.find(x => String(x.row) === wi.dataset.row); if (it) openEdit(it); return; }
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
$('#fab').addEventListener('click', () => openEdit(null));
$('#btnSettings').addEventListener('click', openSettings);
$('#btnRefresh').addEventListener('click', () => load());
$('#btnReport').addEventListener('click', openReport);
$('#btnNotify').addEventListener('click', openNotify);
document.addEventListener('visibilitychange', () => { if (!document.hidden && lockEl.hidden) load(true); });

let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800); }

/* ---------- demo backend (no sheet needed) ---------- */
let demoItems = null, demoNotify = null;
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
  if (method === 'GET') return Promise.resolve({ ok: true, items: JSON.parse(JSON.stringify(demoItems)), areas: Object.keys(AREA_C), people: ['Me', 'Colleague'], report: { manager: 'Manager', email: '', from: 'Me', area: 'Work' } });
  if (body.action === 'save') {
    const it = Object.assign({}, body.item);
    if (!it.row) it.row = Math.max(5, ...demoItems.map(x => x.row)) + 1;
    const i = demoItems.findIndex(x => x.row === it.row); if (i >= 0) demoItems[i] = it; else demoItems.push(it);
    return Promise.resolve({ ok: true, row: it.row });
  }
  if (body.action === 'delete') { demoItems = demoItems.filter(x => x.row !== body.row); return Promise.resolve({ ok: true }); }
  if (body.action === 'getNotify') return Promise.resolve({ ok: true, config: demoNotify || { topic: 'ai-demo-topic', rules: [], detail: 'titles' }, triggerOn: !!demoNotify, email: 'you@example.com' });
  if (body.action === 'saveNotify') { demoNotify = body.config; return Promise.resolve({ ok: true, config: demoNotify, triggerOn: true }); }
  if (body.action === 'testNotify') return Promise.resolve({ ok: true, sent: true, title: '[Test] ' + body.rule.area + ' · today', message: '(demo — nothing was sent)' });
  return Promise.resolve({ ok: false, error: 'Unknown' });
}


/* ---------- week view ---------- */
const byTime = (a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')) || prioRank(a.prio) - prioRank(b.prio);
const weekRange = (ws) => { const we = addDays(ws, 6); return `${pad(ws.getDate())}/${pad(ws.getMonth() + 1)} – ${pad(we.getDate())}/${pad(we.getMonth() + 1)}/${we.getFullYear()}`; };
function wiHtml(it, overdue) {
  const c = AREA_C[it.area] || ['#F3F4F6', '#94A3B8'];
  const h = parseFloat(it.hrs);
  return `<div class="wi" data-row="${it.row}" style="border-inline-start-color:${c[1]}">
    <span class="tm">${esc(it.time || '')}</span>
    <span class="t" dir="auto" title="${esc(it.item)}">${esc(it.item)}</span>
    <span class="tm">${h ? h + 'h' : ''}${overdue ? ' · ' + fmt(it.due) : ''}</span>
    <button class="mv" data-mv="-1" data-r="${it.row}" aria-label="Previous day" ${overdue ? 'hidden' : ''}>‹</button>
    <button class="mv" data-mv="1" data-r="${it.row}" aria-label="${overdue ? 'Move to today' : 'Next day'}">›</button></div>`;
}
function renderWeek(items) {
  const ws = addDays(weekStart(today()), 7 * weekOff);
  const open = items.filter(it => !isClosed(it));
  let html = `<div class="week-head"><button class="nav" data-wk="-1" aria-label="Previous week">◀</button>
    <div class="range">${weekOff === 0 ? 'This week' : weekOff === 1 ? 'Next week' : 'Week'} · ${weekRange(ws)}</div>
    <button class="nav" data-wk="1" aria-label="Next week">▶</button></div>
    <div class="week-tools">${weekOff !== 0 ? '<button class="chip" data-wk="0">Back to this week</button>' : ''}<button class="btn link" data-ics>📅 Export to Outlook</button></div><div class="week-grid">`;
  const t = today();
  const over = weekOff === 0 ? open.filter(it => parse(it.due) && parse(it.due) < t).sort(sortOpen) : [];
  if (over.length) html += `<div class="day over"><h4><b>Overdue</b><span>${over.length}</span></h4>${over.map(it => wiHtml(it, true)).join('')}</div>`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i), key = iso(d);
    const its = open.filter(it => it.due === key).sort(byTime);
    const hrs = its.reduce((s0, it) => s0 + (parseFloat(it.hrs) || 0), 0);
    html += `<div class="day ${+d === +t ? 'today' : ''}"><h4><b>${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${+d === +t ? ' · Today' : ''}</b><span>${hrs ? hrs + 'h' : ''}</span></h4>
      ${its.length ? its.map(it => wiHtml(it, false)).join('') : '<div class="empty-day">—</div>'}</div>`;
  }
  return html + '</div>';
}
async function moveDay(row, delta) {
  const it = data.items.find(x => String(x.row) === String(row)); if (!it) return;
  const d = parse(it.due), t = today();
  const nd = (!d || d < t) ? t : addDays(d, delta);
  const copy = Object.assign({}, it, { due: iso(nd) });
  if (await save(copy)) toast(`Moved to ${fmt(copy.due, true)}`);
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
  $('#icsRange').textContent = 'Week ' + weekRange(ws) + ' — open items with a due date in this week.';
  refreshIcs(); $('#dlgIcs').showModal();
}
function refreshIcs() {
  $('#icsAreas').innerHTML = data.areas.map(a => `<button type="button" class="chip ${icsSel.indexOf(a) >= 0 ? 'on' : ''}" data-iarea="${esc(a)}">${esc(a)}</button>`).join('');
  const n = icsWeekItems().length;
  $('#icsCount').textContent = n ? `${n} item${n > 1 ? 's' : ''} will be added to your calendar.` : 'No items match — pick other areas or another week.';
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
  $('#dlgIcs').close(); toast(`Downloaded ${items.length} item${items.length > 1 ? 's' : ''} — open the file to add them to Outlook`);
});

/* ---------- notifications ---------- */
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
let ntCfg = null;
const newRule = (area, time, days) => ({ id: Math.random().toString(36).slice(2, 10), on: true, area, time, days, channel: 'push' });
function ruleHtml(r) {
  const areas = ['All'].concat(data.areas);
  return `<div class="rule" data-id="${esc(r.id)}">
    <input type="checkbox" class="r-on" ${r.on !== false ? 'checked' : ''} title="On / off">
    <select class="r-area">${areas.map(a => `<option ${a === r.area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <input type="time" class="r-time" value="${esc(r.time)}">
    <select class="r-ch"><option value="push" ${r.channel === 'push' ? 'selected' : ''}>📱 Push</option><option value="email" ${r.channel === 'email' ? 'selected' : ''}>✉ Email</option><option value="both" ${r.channel === 'both' ? 'selected' : ''}>Both</option></select>
    <button type="button" class="btn ghost r-test">Test</button>
    <button type="button" class="icon-btn dark r-del" aria-label="Delete">✕</button>
    <div class="days">${DAYS.map((d, i) => `<button type="button" data-d="${i}" class="${r.days.indexOf(i) >= 0 ? 'on' : ''}" title="${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}">${d}</button>`).join('')}</div>
  </div>`;
}
function readRules() {
  return [...document.querySelectorAll('#ntRules .rule')].map(el => ({
    id: el.dataset.id, on: el.querySelector('.r-on').checked, area: el.querySelector('.r-area').value,
    time: el.querySelector('.r-time').value || '08:00', channel: el.querySelector('.r-ch').value,
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
    if (fresh) rules = [newRule('Work', '08:30', [0, 1, 2, 3, 4]), newRule('Home', '07:00', [0, 1, 2, 3, 4]), newRule('Home', '08:00', [5, 6])];
    $('#ntTopic').textContent = ntCfg.topic; $('#ntDetail').value = ntCfg.detail || 'titles';
    $('#ntRules').innerHTML = rules.map(ruleHtml).join('');
    $('#ntStatus').textContent = fresh ? 'Suggested schedules — adjust and press Save.'
      : (j.triggerOn ? '✓ Notifications are active.' : 'Saved schedules found, but notifications are not switched on yet — press Save.');
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
    } catch (err) { $('#ntStatus').textContent = 'Test failed: ' + err.message; }
    finally { test.disabled = false; test.textContent = 'Test'; }
  }
});
$('#ntAdd').addEventListener('click', () => { $('#ntRules').insertAdjacentHTML('beforeend', ruleHtml(newRule('Work', '08:00', [0, 1, 2, 3, 4]))); });
$('#ntCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#ntTopic').textContent); toast('Topic copied'); } catch (e) { toast('Select the topic and copy it'); } });
const currentNotify = () => ({ topic: $('#ntTopic').textContent, detail: $('#ntDetail').value, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem', rules: readRules() });
$('#ntSave').addEventListener('click', async () => {
  const cfg = currentNotify();
  const bad = cfg.rules.find(r => r.on && !r.days.length);
  if (bad) { $('#ntStatus').textContent = 'Pick at least one day for each schedule.'; return; }
  $('#ntStatus').textContent = 'Saving…';
  try {
    const j = await api('POST', { action: 'saveNotify', config: cfg });
    ntCfg = j.config;
    $('#ntStatus').textContent = j.triggerOn ? '✓ Saved — notifications are active.' : (j.note || 'Saved.');
    toast('Notification schedules saved');
  } catch (e) { $('#ntStatus').textContent = 'Not saved: ' + e.message; }
});

/* ---------- lock screen ---------- */
const cleanUrl = (u) => String(u || '').trim().replace(/\?.*$/, '');
const validUrl = (u) => /^https:\/\/script\.google\.com\/.*\/exec$/.test(u);
const lockEl = $('#lock'), frmLock = $('#frmLock'), LK = (k) => frmLock.elements.namedItem(k);
function showLock(msg) {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  $('#lockUrlWrap').hidden = !!settings.url && validUrl(settings.url);
  LK('url').value = settings.url || '';
  LK('password').value = '';
  $('#lockErr').textContent = msg || '';
  lockEl.hidden = false;
  setTimeout(() => ($('#lockUrlWrap').hidden ? LK('password') : LK('url')).focus(), 50);
}
function hideLock() { lockEl.hidden = true; }
function lockApp(msg) {
  password = ''; sess.set('ai.pw', null); store.set('ai.pw', null);
  try { localStorage.removeItem('ai.pw'); localStorage.removeItem('ai.cache'); } catch (e) { /* ignore */ }
  data = EMPTY(); render(); showLock(msg);
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
  const btn = $('#btnUnlock'); btn.disabled = true; btn.textContent = 'Checking…'; $('#lockErr').textContent = '';
  try {
    const j = await api('GET');
    if (LK('remember').checked) store.set('ai.pw', password); else { sess.set('ai.pw', password); try { localStorage.removeItem('ai.pw'); } catch (err) { /* ignore */ } }
    data = { items: j.items || [], areas: j.areas && j.areas.length ? j.areas : Object.keys(AREA_C), people: j.people || [], report: j.report };
    if (remembered()) store.set('ai.cache', data);
    hideLock(); setSync('synced ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })); render();
  } catch (err) {
    password = '';
    $('#lockErr').textContent = err.message;
  } finally { btn.disabled = false; btn.textContent = 'Unlock'; }
});
$('#lockChangeUrl').addEventListener('click', () => { $('#lockUrlWrap').hidden = false; LK('url').focus(); });
$('#lockDemo').addEventListener('click', startDemo);
$('#btnLock').addEventListener('click', () => { if (settings.demo) { settings.demo = false; store.set('ai.settings', settings); } lockApp(); });

/* ---------- start ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
if (settings.demo) load(true);
else if (settings.url && password) load(true);
else showLock();
