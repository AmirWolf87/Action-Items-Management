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

let settings = store.get('ai.settings', { url: '', key: '', demo: false });
let ui = store.get('ai.ui', { tab: 'focus', area: 'All' });
let data = store.get('ai.cache', null) || { items: [], areas: Object.keys(AREA_C), people: ['Me'], report: null };
let search = '';

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
  if (!settings.url || !settings.key) throw new Error('Not connected — open ⚙ Settings');
  let res;
  if (method === 'GET') {
    res = await fetch(`${settings.url}?action=list&key=${encodeURIComponent(settings.key)}&t=${Date.now()}`);
  } else {
    res = await fetch(settings.url, { method: 'POST', body: JSON.stringify(Object.assign({ key: settings.key }, body)) });
  }
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'Server error');
  return j;
}

function setSync(text) { $('#sync').textContent = text ? '· ' + text : ''; }
async function load(quiet) {
  if (!settings.demo && (!settings.url || !settings.key)) { render(); openSettings(); return; }
  setSync('syncing…');
  try {
    const j = await api('GET');
    data = { items: j.items || [], areas: j.areas && j.areas.length ? j.areas : Object.keys(AREA_C), people: j.people || [], report: j.report };
    if (!settings.demo) store.set('ai.cache', data);
    setSync('synced ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setSync('offline');
    if (!quiet) toast(e.message);
  }
  render();
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
    if (!settings.demo) store.set('ai.cache', data);
    render();
    return true;
  } catch (e) {
    data.items = JSON.parse(before); render(); toast('Not saved: ' + e.message); return false;
  }
}
async function remove(row) {
  const before = JSON.stringify(data.items);
  data.items = data.items.filter(x => x.row !== row); render();
  try { await api('POST', { action: 'delete', row }); if (!settings.demo) store.set('ai.cache', data); toast('Deleted'); }
  catch (e) { data.items = JSON.parse(before); render(); toast('Not deleted: ' + e.message); }
}

/* ---------- complete / reopen ---------- */
async function toggleDone(it) {
  const copy = Object.assign({}, it);
  if (isClosed(it)) { copy.status = 'In progress'; copy.done = ''; await save(copy); return; }
  const nd = nextDue(it);
  if (nd && it.rec && it.rec !== 'None') {
    copy.due = iso(nd); copy.status = 'Not started';
    if (await save(copy)) toast(`Done ✓  Next: ${fmt(copy.due, true)}`);
  } else {
    copy.status = 'Done'; copy.done = iso(today());
    if (await save(copy)) toast('Done ✓');
  }
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
  if (!settings.demo && (!settings.url || !settings.key)) html = `<div class="empty"><b>🔌</b>Not connected yet.<br>Tap ⚙ to connect your Google Sheet, or try the demo.</div>`;
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
  ['item', 'status', 'area', 'prio', 'due', 'topic', 'focal', 'rec', 'hrs', 'done', 'acthrs', 'com'].forEach(k => { F(k).value = v[k] ?? ''; });
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
  ['item', 'status', 'area', 'prio', 'due', 'topic', 'focal', 'rec', 'hrs', 'done', 'acthrs', 'com'].forEach(k => { it[k] = String(F(k).value).trim(); });
  if (!it.item) return;
  if (it.status === 'Done' && !it.done) it.done = iso(today());
  if (!editing) it.created = iso(today());
  dlgEdit.close();
  if (await save(it)) toast(editing ? 'Saved' : 'Added');
});
$('#btnDelete').addEventListener('click', () => {
  if (editing && confirm('Delete this action item?')) { dlgEdit.close(); remove(editing.row); }
});

/* ---------- settings ---------- */
const dlgSet = $('#dlgSettings'), frmSet = $('#frmSettings');
const S = (k) => frmSet.elements.namedItem(k);
function openSettings() { S('url').value = settings.url || ''; S('key').value = settings.key || ''; if (!dlgSet.open) dlgSet.showModal(); }
frmSet.addEventListener('submit', (e) => {
  e.preventDefault();
  settings = { url: S('url').value.trim(), key: S('key').value.trim(), demo: false };
  store.set('ai.settings', settings); dlgSet.close(); load();
});
$('#btnDemo').addEventListener('click', () => { settings = { url: '', key: '', demo: true }; store.set('ai.settings', settings); dlgSet.close(); load(); toast('Demo mode — nothing is saved to your sheet'); });

/* ---------- weekly report ---------- */
const dlgRep = $('#dlgReport');
function reportData(offset) {
  const area = (data.report && data.report.area) || 'Work';
  const ws = addDays(weekStart(today()), 7 * offset), we = addDays(ws, 6), prevWs = addDays(ws, -7);
  const W = data.items.filter(it => it.area === area);
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
  store.set('ai.report', { name: $('#repName').value, email: to, week: $('#repWeek').value });
}
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });

let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800); }

/* ---------- demo backend (no sheet needed) ---------- */
let demoItems = null;
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
  return Promise.resolve({ ok: false, error: 'Unknown' });
}

/* ---------- start ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
load(true);
