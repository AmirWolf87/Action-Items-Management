/**
 * Action Items — Google Sheet script
 *  1) "✉ Manager Report" menu: formatted email for Outlook (copy-paste) or a Gmail draft
 *  2) API for the Action Items web app (GitHub Pages) — protected by your app password
 * Paste into: Extensions › Apps Script (replace everything), Save, reload the sheet.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('✉ Manager Report')
    .addItem('Copy formatted email for Outlook', 'showOutlookDialog')
    .addItem('Create formatted Gmail draft', 'createManagerDraft')
    .addSeparator()
    .addItem('App: set / change password', 'setAppPassword')
    .addItem('App: turn on phone notifications', 'enableNotifications')
    .addItem('App: turn off phone notifications', 'disableNotifications')
    .addToUi();
}

function buildEmail_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Manager Report');
  const v = sh.getRange('A1:J60').getDisplayValues();
  const cell = (a1) => sh.getRange(a1).getDisplayValue();

  const managerName = cell('C3'), to = cell('E3'), fromName = cell('C4');
  const week = cell('E5'), he = cell('C6') === 'Hebrew';
  const subject = cell('J3');
  const plain = cell('A56');
  const dir = he ? 'rtl' : 'ltr', align = he ? 'right' : 'left';

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const PRIO = { '1': ['#FDE2E1', '#B91C1C'], '2': ['#FEF3C7', '#92400E'], '3': ['#E0F2FE', '#075985'] };
  const sections = [
    { row: 10, color: '#059669' }, { row: 21, color: '#2563EB' },
    { row: 32, color: '#DC2626' }, { row: 43, color: '#7C3AED' }
  ];

  let counts = [];
  let blocks = '';
  sections.forEach(sec => {
    const title = v[sec.row - 1][0];
    const hdr = v[sec.row];                       // # | Item | Topic | Date | Priority | Status | Comments
    const rows = [];
    for (let r = sec.row + 1; r <= sec.row + 8; r++) if (v[r][1] !== '') rows.push(v[r]);
    counts.push(rows.length);

    let t = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:860px;margin:0 0 22px 0;font-size:13px;">`;
    t += `<tr><td colspan="6" style="background:${sec.color};color:#fff;font-weight:bold;font-size:14px;padding:9px 12px;text-align:${align};">${esc(title)}</td></tr>`;
    if (rows.length === 0) {
      t += `<tr><td colspan="6" style="padding:10px 12px;color:#9CA3AF;font-style:italic;border-bottom:1px solid #E5E7EB;text-align:${align};">${he ? 'אין' : 'None'}</td></tr>`;
    } else {
      const th = (s) => `<th style="background:#F3F4F6;color:#4B5563;font-size:11px;text-transform:uppercase;padding:7px 12px;text-align:${align};border-bottom:1px solid #E5E7EB;">${esc(s)}</th>`;
      t += `<tr>${th(hdr[1])}${th(hdr[2])}${th(hdr[3])}${th(hdr[4])}${th(hdr[5])}${th(hdr[6])}</tr>`;
      rows.forEach((x, i) => {
        const bg = i % 2 ? '#F9FAFB' : '#FFFFFF';
        const p = PRIO[String(x[4]).charAt(0)] || ['#F3F4F6', '#374151'];
        const td = (s, extra) => `<td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;background:${bg};text-align:${align};vertical-align:top;${extra || ''}">${s}</td>`;
        t += '<tr>' +
          td(`<b>${esc(x[1])}</b>`) +
          td(esc(x[2]), 'color:#4B5563;') +
          td(esc(x[3]), 'white-space:nowrap;') +
          td(x[4] ? `<span style="background:${p[0]};color:${p[1]};font-weight:bold;padding:2px 8px;border-radius:10px;white-space:nowrap;">${esc(x[4])}</span>` : '') +
          td(esc(x[5]), 'white-space:nowrap;') +
          td(esc(x[6]), 'color:#4B5563;') +
          '</tr>';
      });
    }
    blocks += t + '</table>';
  });

  const chip = (label, n, c) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:14px;background:${c}1A;color:${c};font-weight:bold;">${label} ${n}</span>`;
  const L = he ? ['בוצעו', 'מתוכננות', 'באיחור', 'ממתינות'] : ['Completed', 'Planned', 'Carried over', 'Waiting'];
  const summary = chip(L[0], counts[0], '#059669') + chip(L[1], counts[1], '#2563EB') + chip(L[2], counts[2], '#DC2626') + chip(L[3], counts[3], '#7C3AED');

  const intro = he
    ? `<p>היי ${esc(managerName)},</p><p>להלן סיכום המשימות שלי לשבוע <b>${esc(week)}</b>.</p>`
    : `<p>Hi ${esc(managerName)},</p><p>Please find below my action items for the week of <b>${esc(week)}</b>.</p>`;
  const outro = he
    ? `<p>אשמח לעדכן סדרי עדיפויות במידת הצורך.</p><p>תודה,<br><b>${esc(fromName)}</b></p>`
    : `<p>Happy to adjust priorities if needed.</p><p>Best regards,<br><b>${esc(fromName)}</b></p>`;

  const html = `<div dir="${dir}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1F2937;text-align:${align};">` +
    intro + `<div style="margin:6px 0 16px 0;">${summary}</div>` + blocks + outro + `</div>`;

  return { to: to, subject: subject, plain: plain, html: html, he: he };
}

/** Gmail: creates a formatted draft in your Gmail › Drafts */
function createManagerDraft() {
  const e = buildEmail_();
  GmailApp.createDraft(e.to, e.subject, e.plain, { htmlBody: e.html });
  SpreadsheetApp.getUi().alert(e.he ? 'הטיוטה נוצרה ב-Gmail › טיוטות.' : 'Draft created — open Gmail › Drafts to review and send.');
}

/** Outlook: preview + one-click copy, then paste into a new Outlook email */
function showOutlookDialog() {
  const e = buildEmail_();
  const q = (s) => encodeURIComponent(s);
  const web = 'https://outlook.office.com/mail/deeplink/compose?to=' + q(e.to) + '&subject=' + q(e.subject);
  const app = 'mailto:' + e.to + '?subject=' + q(e.subject);
  const T = e.he
    ? { copy: '📋 העתק מייל מעוצב', web: '🌐 פתח Outlook באינטרנט', app: '✉ פתח אפליקציית Outlook',
        ok: '✓ הועתק! בהודעה החדשה ב-Outlook לחץ בגוף ההודעה ואז Ctrl+V', fail: 'סמן את התוכן ולחץ Ctrl+C', subj: 'נושא:' }
    : { copy: '📋 Copy formatted email', web: '🌐 Open Outlook on the web', app: '✉ Open Outlook app',
        ok: '✓ Copied! In the new Outlook message click in the body and press Ctrl+V', fail: 'Select the email below and press Ctrl+C', subj: 'Subject:' };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const page = `<!doctype html><html><head><base target="_blank"><style>
    body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#F3F4F6;color:#1F2937}
    .bar{position:sticky;top:0;background:#26355D;padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;z-index:2}
    .btn{border:0;border-radius:6px;padding:9px 14px;font-weight:bold;font-size:13px;cursor:pointer;text-decoration:none;display:inline-block}
    .copy{background:#10B981;color:#fff}.link{background:#0F6CBD;color:#fff}
    #msg{color:#D1FAE5;font-size:12px;margin-inline-start:6px}
    .subj{padding:10px 18px 0 18px;font-size:12px;color:#4B5563}
    .card{background:#fff;margin:10px 14px 18px;padding:18px 20px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  </style></head><body>
    <div class="bar">
      <button class="btn copy" onclick="copyMail()">${T.copy}</button>
      <a class="btn link" href="${esc(web)}">${T.web}</a>
      <a class="btn link" href="${esc(app)}">${T.app}</a>
      <span id="msg"></span>
    </div>
    <div class="subj"><b>${T.subj}</b> ${esc(e.subject)}</div>
    <div class="card"><div id="mail">${e.html}</div></div>
    <script>
      async function copyMail(){
        const el=document.getElementById('mail'); const msg=document.getElementById('msg');
        try{
          await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([el.innerHTML],{type:'text/html'}),
            'text/plain': new Blob([el.innerText],{type:'text/plain'})})]);
          msg.textContent=${JSON.stringify(T.ok)}; return;
        }catch(err){}
        const r=document.createRange(); r.selectNodeContents(el);
        const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        let ok=false; try{ ok=document.execCommand('copy'); }catch(err){}
        if(ok){ sel.removeAllRanges(); msg.textContent=${JSON.stringify(T.ok)}; }
        else { msg.textContent=${JSON.stringify(T.fail)}; }
      }
    </script></body></html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(page).setWidth(940).setHeight(680),
    e.he ? 'מייל למנהל — Outlook' : 'Email to manager — Outlook');
}


/* =====================================================================
 *  Web-app API  (deploy: Deploy › New deployment › Web app,
 *                Execute as: Me · Who has access: Anyone)
 *  Every request must carry the app password (set it from the sheet menu).
 *  Only the white (input) columns are ever written — formulas are never touched.
 * ===================================================================== */
const API_SHEET = 'Action Items';
const API_FIRST = 6, API_LAST = 505;
const API_COLS = { item: 1, status: 2, area: 3, prio: 4, due: 5, topic: 8, focal: 9, created: 10,
                   hrs: 11, rec: 12, done: 14, acthrs: 15, com: 16, time: 23, private: 24 };   // W = Start Time, X = Private (added by the app)
const API_NCOLS = 24;
const APP_URL = 'https://amirwolf87.github.io/Action-Items-Management/';
const API_DATES = ['due', 'created', 'done'];

/* ---------- password (stored only as a salted SHA-256 hash) ---------- */
function hash_(pw, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function setAppPassword() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt('App password', 'Choose a password for the Action Items app (at least 8 characters):', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const pw = r1.getResponseText();
  if (pw.length < 8) { ui.alert('Too short — use at least 8 characters.'); return; }
  const r2 = ui.prompt('App password', 'Type the same password again:', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  if (r2.getResponseText() !== pw) { ui.alert('The two passwords are different — nothing was changed.'); return; }
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({ PW_SALT: salt, PW_HASH: hash_(pw, salt) });
  PropertiesService.getScriptProperties().deleteProperty('APP_KEY');
  ui.alert('Password saved. Use it on the app\'s lock screen. (Devices that remembered the old password will ask again.)');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- who is calling: the owner, a guest, or nobody ----------
 * 10 wrong passwords (any account) → all logins blocked for 15 minutes */
function guests_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('GUESTS') || '[]'); } catch (e) { return []; }
}
function authenticate_(pw) {
  const props = PropertiesService.getScriptProperties();
  const salt = props.getProperty('PW_SALT'), h = props.getProperty('PW_HASH');
  if (!salt || !h) return { err: 'No password set yet — in the sheet: ✉ Manager Report › App: set / change password' };
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pw_fails') || 0);
  if (fails >= 10) return { err: 'Too many wrong attempts — try again in 15 minutes' };
  if (pw) {
    if (hash_(String(pw), salt) === h) return { role: 'owner' };
    const g = guests_().find(x => x.on !== false && x.hash && hash_(String(pw), x.salt) === x.hash);
    if (g) return { role: 'guest', guest: g };
  }
  cache.put('pw_fails', String(fails + 1), 900);
  return { err: 'Wrong password' };
}

/* Opening the URL in a browser only shows that the API is alive — never any data */
function doGet(e) {
  const p = PropertiesService.getScriptProperties();
  return json_({ ok: true, app: 'Action Items API', passwordSet: !!p.getProperty('PW_HASH') });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  const who = authenticate_(req.password);
  if (who.err) return json_({ ok: false, auth: true, error: who.err });
  try {
    /* ---- guests: read-only + suggestions ---- */
    if (who.role === 'guest') {
      const g = who.guest;
      if (req.action === 'list') return json_(Object.assign({ ok: true }, guestView_(g)));
      if (req.action === 'suggest') {
        if (!g.canSuggest) return json_({ ok: false, error: 'Suggestions are not enabled for you' });
        return withLock_(() => json_({ ok: true, id: addPending_(g, req.item || {}) }));
      }
      return json_({ ok: false, error: 'Read-only access' });
    }
    /* ---- owner ---- */
    switch (req.action) {
      case 'list': return json_(Object.assign({ ok: true, role: 'owner', name: 'Owner' }, readAll_(), { pending: readPending_().filter(x => x.status === 'Pending') }));
      case 'getNotify': return json_(Object.assign({ ok: true }, getNotify_()));
      case 'saveNotify': return json_(Object.assign({ ok: true }, saveNotify_(req.config)));
      case 'testNotify': return json_(Object.assign({ ok: true }, sendRule_(req.rule, true)));
      case 'getGuests': return json_({ ok: true, guests: guests_().map(publicGuest_) });
      case 'saveGuest': return json_({ ok: true, guests: saveGuest_(req.guest).map(publicGuest_) });
      case 'deleteGuest': return json_({ ok: true, guests: deleteGuest_(req.id).map(publicGuest_) });
      case 'save': return withLock_(() => json_({ ok: true, row: saveItem_(req.item) }));
      case 'delete': return withLock_(() => { clearRow_(req.row); return json_({ ok: true }); });
      case 'approve': return withLock_(() => json_({ ok: true, row: approvePending_(req.id, req.item || {}) }));
      case 'reject': return withLock_(() => { decidePending_(req.id, 'Rejected'); return json_({ ok: true }); });
      default: return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}
function withLock_(fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- guests ---------- */
function publicGuest_(g) { return { id: g.id, name: g.name, areas: g.areas, canSuggest: !!g.canSuggest, on: g.on !== false, hasPassword: !!g.hash }; }
function saveGuest_(in_) {
  if (!in_ || !String(in_.name || '').trim()) throw new Error('Guest name is required');
  const list = guests_();
  let g = list.find(x => x.id === in_.id);
  if (!g) { g = { id: Utilities.getUuid().slice(0, 8) }; list.push(g); }
  g.name = String(in_.name).trim().slice(0, 40);
  g.areas = (in_.areas || []).map(String).slice(0, 20);
  g.canSuggest = !!in_.canSuggest;
  g.on = in_.on !== false;
  if (in_.password) {
    if (String(in_.password).length < 6) throw new Error('Guest password: at least 6 characters');
    const ownerSalt = PropertiesService.getScriptProperties().getProperty('PW_SALT');
    if (ownerSalt && hash_(String(in_.password), ownerSalt) === PropertiesService.getScriptProperties().getProperty('PW_HASH'))
      throw new Error('Use a different password from your own');
    if (list.some(x => x !== g && x.hash && hash_(String(in_.password), x.salt) === x.hash)) throw new Error('Another guest already uses this password');
    g.salt = Utilities.getUuid(); g.hash = hash_(String(in_.password), g.salt);
  }
  if (!g.hash) throw new Error('Set a password for ' + g.name);
  PropertiesService.getScriptProperties().setProperty('GUESTS', JSON.stringify(list));
  return list;
}
function deleteGuest_(id) {
  const list = guests_().filter(x => x.id !== id);
  PropertiesService.getScriptProperties().setProperty('GUESTS', JSON.stringify(list));
  return list;
}
const GUEST_FIELDS = ['row', 'item', 'status', 'area', 'prio', 'due', 'time', 'topic', 'focal', 'rec', 'done', 'com'];
function guestView_(g) {
  const all = readAll_();
  const items = all.items
    .filter(it => g.areas.indexOf(it.area) >= 0 && !it.private)
    .map(it => { const o = {}; GUEST_FIELDS.forEach(k => { o[k] = it[k]; }); return o; });
  const mine = readPending_().filter(x => x.from === g.name).slice(-30).reverse();
  return { role: 'guest', name: g.name, canSuggest: !!g.canSuggest, items: items, areas: g.areas, people: [], report: null, mySuggestions: mine };
}

/* ---------- pending suggestions (sheet "Pending") ---------- */
const PENDING_HEAD = ['ID', 'Submitted', 'From', 'Area', 'Action Item', 'Due Date', 'Priority', 'Comments', 'Status', 'Decided', 'Added as row'];
function pendingSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Pending');
  if (!sh) {
    sh = ss.insertSheet('Pending');
    sh.getRange(1, 1, 1, PENDING_HEAD.length).setValues([PENDING_HEAD]).setFontWeight('bold').setBackground('#26355D').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}
function readPending_() {
  const sh = pendingSheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const d = (v) => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v || '');
  return sh.getRange(2, 1, n, PENDING_HEAD.length).getValues().filter(r => r[0]).map(r => ({
    id: String(r[0]), submitted: d(r[1]), from: String(r[2]), area: String(r[3]), item: String(r[4]),
    due: d(r[5]), prio: String(r[6]), com: String(r[7]), status: String(r[8] || 'Pending'), decided: d(r[9])
  }));
}
function addPending_(g, it) {
  const text = String(it.item || '').trim().slice(0, 300);
  if (!text) throw new Error('Write the action item first');
  const area = g.areas.indexOf(it.area) >= 0 ? it.area : g.areas[0];
  const m = String(it.due || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const id = Utilities.getUuid().slice(0, 8);
  pendingSheet_().appendRow([id, new Date(), g.name, area, text, m ? new Date(+m[1], +m[2] - 1, +m[3]) : '',
    ['1 - High', '2 - Medium', '3 - Low'].indexOf(it.prio) >= 0 ? it.prio : '2 - Medium', String(it.com || '').slice(0, 500), 'Pending', '', '']);
  return id;
}
function findPendingRow_(id) {
  const sh = pendingSheet_(), n = sh.getLastRow() - 1;
  if (n < 1) throw new Error('Suggestion not found');
  const ids = sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(id));
  if (i < 0) throw new Error('Suggestion not found');
  return { sh: sh, row: i + 2 };
}
function decidePending_(id, status, addedRow) {
  const f = findPendingRow_(id);
  f.sh.getRange(f.row, 9, 1, 3).setValues([[status, new Date(), addedRow || '']]);
}
function approvePending_(id, edits) {
  const p = readPending_().find(x => x.id === String(id));
  if (!p) throw new Error('Suggestion not found');
  if (p.status !== 'Pending') throw new Error('Already ' + p.status.toLowerCase());
  const it = {
    item: edits.item || p.item, area: edits.area || p.area, due: edits.due !== undefined ? edits.due : p.due,
    prio: edits.prio || p.prio, status: 'Not started', focal: 'Me', rec: 'None',
    com: [edits.com !== undefined ? edits.com : p.com, '(suggested by ' + p.from + ')'].filter(String).join(' ')
  };
  const row = saveItem_(it);
  decidePending_(id, 'Approved', row);
  return row;
}

function readAll_() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(API_SHEET);
  const vals = sh.getRange(API_FIRST, 1, API_LAST - API_FIRST + 1, API_NCOLS).getValues();
  const items = [];
  vals.forEach((r, i) => {
    if (String(r[0]).trim() === '') return;
    const o = { row: API_FIRST + i };
    Object.keys(API_COLS).forEach(k => {
      let v = r[API_COLS[k] - 1];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, k === 'time' ? 'HH:mm' : 'yyyy-MM-dd');
      o[k] = v === null || v === undefined ? '' : v;
      if (k === 'private') o[k] = v === true || String(v).toUpperCase() === 'TRUE';
    });
    items.push(o);
  });
  const lists = ss.getSheetByName('Lists');
  const col = (c) => lists.getRange(c + '5:' + c + '24').getValues().map(x => String(x[0]).trim()).filter(String);
  const mr = ss.getSheetByName('Manager Report');
  return {
    items: items, areas: col('B'), people: col('E'),
    report: mr ? { manager: mr.getRange('C3').getDisplayValue(), email: mr.getRange('E3').getDisplayValue(),
                   from: mr.getRange('C4').getDisplayValue(), area: mr.getRange('C5').getDisplayValue() } : null
  };
}

function toCell_(k, v) {
  if (v === null || v === undefined) return '';
  if (API_DATES.indexOf(k) >= 0) {
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : '';
  }
  if (k === 'hrs' || k === 'acthrs') return v === '' ? '' : Number(v);
  if (k === 'private') return v === true || v === 'TRUE' || v === 'true' ? true : '';
  return v;
}

function saveItem_(it) {
  if (!it || String(it.item || '').trim() === '') throw new Error('Action Item text is required');
  const sh = SpreadsheetApp.getActive().getSheetByName(API_SHEET);
  let row = Number(it.row) || 0;
  if (!row) {
    const a = sh.getRange(API_FIRST, 1, API_LAST - API_FIRST + 1, 1).getValues();
    const idx = a.findIndex(x => String(x[0]).trim() === '');
    if (idx < 0) throw new Error('The sheet is full (500 rows). Clear some Done items first.');
    row = API_FIRST + idx;
    if (!it.created) it.created = Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  if (row < API_FIRST || row > API_LAST) throw new Error('Bad row');
  if (sh.getRange(5, API_COLS.time).getValue() === '') sh.getRange(5, API_COLS.time).setValue('Start Time');
  if (sh.getRange(5, API_COLS.private).getValue() === '') sh.getRange(5, API_COLS.private).setValue('Private');
  Object.keys(API_COLS).forEach(k => {
    if (!(k in it)) return;
    const cell = sh.getRange(row, API_COLS[k]);
    if (k === 'time') cell.setNumberFormat('@');          // keep "08:30" as text
    cell.setValue(toCell_(k, it[k]));
  });
  return row;
}

function clearRow_(row) {
  row = Number(row);
  if (!(row >= API_FIRST && row <= API_LAST)) throw new Error('Bad row');
  const sh = SpreadsheetApp.getActive().getSheetByName(API_SHEET);
  Object.keys(API_COLS).forEach(k => sh.getRange(row, API_COLS[k]).clearContent());
}


/* =====================================================================
 *  Scheduled phone notifications ("what I have today")
 *  Rules are edited in the app (🔔). A trigger runs notifyTick() every 5 minutes.
 *  Channels: "push" = ntfy app (free, https://ntfy.sh) · "email" = your Gmail
 * ===================================================================== */
function notifyConfig_() {
  const p = PropertiesService.getScriptProperties();
  let cfg = {};
  try { cfg = JSON.parse(p.getProperty('NOTIFY_CFG') || '{}'); } catch (e) { cfg = {}; }
  if (!cfg.topic) cfg.topic = 'ai-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  if (!cfg.rules) cfg.rules = [];
  if (!cfg.tz) cfg.tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  if (!cfg.detail) cfg.detail = 'titles';
  return cfg;
}
function triggerOn_() {
  return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'notifyTick');
}
function getNotify_() {
  const cfg = notifyConfig_();
  let on = false; try { on = triggerOn_(); } catch (e) { on = false; }
  return { config: cfg, triggerOn: on, email: Session.getEffectiveUser().getEmail() };
}
function saveNotify_(cfg) {
  if (!cfg || !Array.isArray(cfg.rules)) throw new Error('Bad settings');
  const clean = {
    topic: String(cfg.topic || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || notifyConfig_().topic,
    tz: String(cfg.tz || 'Asia/Jerusalem'),
    detail: cfg.detail === 'counts' ? 'counts' : 'titles',
    rules: cfg.rules.slice(0, 30).map(r => ({
      id: String(r.id || Utilities.getUuid().slice(0, 8)), on: r.on !== false,
      area: String(r.area || 'All'), time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : '08:00',
      days: (r.days || []).map(Number).filter(d => d >= 0 && d <= 6),
      channel: ['push', 'email', 'both'].indexOf(r.channel) >= 0 ? r.channel : 'push'
    }))
  };
  PropertiesService.getScriptProperties().setProperty('NOTIFY_CFG', JSON.stringify(clean));
  let on = false, note = '';
  try { if (!triggerOn_()) ScriptApp.newTrigger('notifyTick').timeBased().everyMinutes(5).create(); on = true; }
  catch (e) { note = 'Saved. To activate, open the sheet once and choose ✉ Manager Report › App: turn on phone notifications.'; }
  return { config: clean, triggerOn: on, note: note };
}
function enableNotifications() {
  if (!triggerOn_()) ScriptApp.newTrigger('notifyTick').timeBased().everyMinutes(5).create();
  const cfg = notifyConfig_();
  PropertiesService.getScriptProperties().setProperty('NOTIFY_CFG', JSON.stringify(cfg));
  SpreadsheetApp.getUi().alert('Notifications are ON.\n\nSet your schedules in the app (🔔).\nPush topic for the ntfy app: ' + cfg.topic);
}
function disableNotifications() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'notifyTick').forEach(t => ScriptApp.deleteTrigger(t));
  SpreadsheetApp.getUi().alert('Notifications are OFF.');
}

/* runs every 5 minutes */
function notifyTick() {
  const cfg = notifyConfig_();
  if (!cfg.rules.length) return;
  const now = new Date();
  const dow = Number(Utilities.formatDate(now, cfg.tz, 'u')) % 7;          // 0 = Sunday
  const hm = Utilities.formatDate(now, cfg.tz, 'HH:mm');
  const nowMin = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const day = Utilities.formatDate(now, cfg.tz, 'yyyy-MM-dd');
  const p = PropertiesService.getScriptProperties();
  let sent = {}; try { sent = JSON.parse(p.getProperty('NOTIFY_SENT') || '{}'); } catch (e) { sent = {}; }
  let changed = false;
  cfg.rules.forEach(r => {
    if (!r.on || r.days.indexOf(dow) < 0) return;
    const m = Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3));
    if (nowMin < m || nowMin >= m + 30 || sent[r.id] === day) return;      // 30-min window, once a day
    try { sendRule_(r, false, cfg); sent[r.id] = day; changed = true; } catch (e) { console.error(e); }
  });
  if (changed) p.setProperty('NOTIFY_SENT', JSON.stringify(sent));
}

function digest_(area, cfg) {
  const tz = cfg.tz;
  const todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const items = readAll_().items.filter(it =>
    (area === 'All' || it.area === area) && it.status !== 'Done' && it.status !== 'Cancelled' && it.due);
  const overdue = items.filter(it => it.due < todayStr).sort((a, b) => a.due < b.due ? -1 : 1);
  const today = items.filter(it => it.due === todayStr).sort((a, b) => String(a.time || '99').localeCompare(String(b.time || '99')));
  const daysLate = (d) => Math.round((new Date(todayStr) - new Date(d)) / 86400000);
  const title = (area === 'All' ? 'Today' : area + ' · today') + ' — ' + today.length + ' due' + (overdue.length ? ', ' + overdue.length + ' overdue' : '');
  let msg;
  if (!today.length && !overdue.length) msg = 'Nothing due today 🎉';
  else if (cfg.detail === 'counts') msg = 'Due today: ' + today.length + (overdue.length ? '\nOverdue: ' + overdue.length : '') + '\nOpen the app for details.';
  else {
    const lines = [];
    today.forEach(it => lines.push('• ' + (it.time ? it.time + '  ' : '') + it.item));
    overdue.forEach(it => lines.push('⚠ ' + it.item + ' (' + daysLate(it.due) + 'd late)'));
    msg = lines.slice(0, 15).join('\n') + (lines.length > 15 ? '\n…and ' + (lines.length - 15) + ' more' : '');
  }
  return { title: title, message: msg };
}

function sendRule_(rule, isTest, cfg) {
  cfg = cfg || notifyConfig_();
  const d = digest_(rule.area || 'All', cfg);
  const title = (isTest ? '[Test] ' : '') + d.title;
  const ch = rule.channel || 'push';
  if (ch === 'push' || ch === 'both') {
    UrlFetchApp.fetch('https://ntfy.sh/', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: false,
      payload: JSON.stringify({ topic: cfg.topic, title: title, message: d.message, tags: ['clipboard'], click: APP_URL, priority: 3 })
    });
  }
  if (ch === 'email' || ch === 'both') {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), title, d.message + '\n\n' + APP_URL);
  }
  return { sent: true, title: title, message: d.message };
}
