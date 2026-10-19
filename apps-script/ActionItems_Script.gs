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
    .addItem('App: send a test push (and authorize)', 'authorizeAndTestPush')
    .addItem('App: turn on daily archive & backup', 'enableMaintenance')
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
                   hrs: 11, rec: 12, done: 14, acthrs: 15, com: 16, time: 23, private: 24, checklist: 25, wsince: 26, cal: 27 };
// added by the app:  W = Start Time · X = Private · Y = Checklist (JSON) · Z = Waiting since · AA = iPhone calendar
const API_NCOLS = 27;
const API_HEADS = { time: 'Start Time', private: 'Private', checklist: 'Checklist', wsince: 'Waiting Since', cal: 'iPhone Calendar' };
function ensureCols_(sh) { if (sh.getMaxColumns() < API_NCOLS) sh.insertColumnsAfter(sh.getMaxColumns(), API_NCOLS - sh.getMaxColumns()); }
const APP_URL = 'https://amirwolf87.github.io/Action-Items-Management/';
const API_DATES = ['due', 'created', 'done', 'wsince'];

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
  const r3 = ui.prompt('App username', 'Your username for signing in (current: ' + ownerUser_() + '). Leave empty to keep it:', ui.ButtonSet.OK_CANCEL);
  let user = r3.getSelectedButton() === ui.Button.OK ? r3.getResponseText().trim().toLowerCase() : '';
  if (user && !/^[a-z0-9._-]{3,30}$/.test(user)) { ui.alert('Username: 3-30 characters, letters/numbers/._- only. Nothing was changed.'); return; }
  if (user && guests_().some(g => (g.user || '') === user)) { ui.alert('A guest already uses that username. Nothing was changed.'); return; }
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({ PW_SALT: salt, PW_HASH: hash_(pw, salt) });
  if (user) PropertiesService.getScriptProperties().setProperty('OWNER_USER', user);
  PropertiesService.getScriptProperties().deleteProperty('APP_KEY');
  ui.alert('Saved. Sign in to the app with username "' + ownerUser_() + '" and your new password.');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- who is calling: the owner, a guest, or nobody ----------
 * 10 wrong passwords (any account) → all logins blocked for 15 minutes */
function guests_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('GUESTS') || '[]'); } catch (e) { return []; }
}
function ownerUser_() { return PropertiesService.getScriptProperties().getProperty('OWNER_USER') || 'admin'; }
const cleanUser_ = (u) => String(u || '').trim().toLowerCase();
/* username + password. 10 wrong tries for one username (or 30 overall) → blocked for 15 minutes */
function authenticate_(user, pw) {
  const props = PropertiesService.getScriptProperties();
  const salt = props.getProperty('PW_SALT'), h = props.getProperty('PW_HASH');
  if (!salt || !h) return { err: 'No password set yet — in the sheet: ✉ Manager Report › App: set / change password' };
  user = cleanUser_(user);
  if (!user) return { err: 'Please sign in with your username and password' };
  const cache = CacheService.getScriptCache();
  const key = 'pw_fails_' + Utilities.base64EncodeWebSafe(user).slice(0, 40);
  const fails = Number(cache.get(key) || 0), all = Number(cache.get('pw_fails_all') || 0);
  if (fails >= 10 || all >= 30) return { err: 'Too many wrong attempts — try again in 15 minutes' };
  if (pw) {
    if (user === ownerUser_() && hash_(String(pw), salt) === h) return { role: 'owner' };
    const g = guests_().find(x => x.on !== false && cleanUser_(x.user) === user);
    if (g && g.hash && hash_(String(pw), g.salt) === g.hash) return { role: 'guest', guest: g };
  }
  cache.put(key, String(fails + 1), 900); cache.put('pw_fails_all', String(all + 1), 900);
  return { err: 'Wrong username or password' };
}

/* Opening the URL in a browser only shows that the API is alive — never any data */
function doGet(e) {
  const p = PropertiesService.getScriptProperties();
  if (e && e.parameter && e.parameter.feed) {                 // Outlook / Google Calendar subscription
    const f = feedCfg_();
    if (!f.token || e.parameter.feed !== f.token) return ContentService.createTextOutput('Not found');
    return ContentService.createTextOutput(buildFeed_(f)).setMimeType(ContentService.MimeType.ICAL);
  }
  return json_({ ok: true, app: 'Action Items API', passwordSet: !!p.getProperty('PW_HASH') });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  if (req.action === 'calImport') { try { return json_(calImport_(req)); } catch (err) { return json_({ ok: false, message: 'שגיאה: ' + err.message }); } }
  if (req.action === 'calFeed' || req.action === 'calAck') { try { return json_(req.action === 'calFeed' ? calFeed_(req) : calAck_(req)); } catch (err) { return json_({ ok: false, message: 'שגיאה: ' + err.message, events: [] }); } }
  if (req.action === 'siriAdd') { try { return json_(siriAdd_(req)); } catch (err) { return json_({ ok: false, message: 'שגיאה: ' + err.message, error: err.message }); } }   // own key, no password
  if (req.action === 'forgot') { try { forgotPassword_(req.username); } catch (e) { console.error(e); } return json_({ ok: true }); }   // no sign-in needed; never reveals if the user exists
  const who = authenticate_(req.username, req.password);
  if (who.err) return json_({ ok: false, auth: true, error: who.err });
  try {
    /* ---- guests: read-only + suggestions ---- */
    if (who.role === 'guest') {
      const g = who.guest;
      if (req.action === 'list') return json_(Object.assign({ ok: true }, guestView_(g)));
      if (req.action === 'updateAccount') return withLock_(() => json_(Object.assign({ ok: true }, updateGuestAccount_(g.id, req))));
      if (req.action === 'suggest') {
        if (!g.canSuggest) return json_({ ok: false, error: 'Suggestions are not enabled for you' });
        return withLock_(() => json_({ ok: true, id: addPending_(g, req.item || {}) }));
      }
      return json_({ ok: false, error: 'Read-only access' });
    }
    /* ---- owner ---- */
    switch (req.action) {
      case 'list': return json_(Object.assign({ ok: true, role: 'owner', name: 'Owner', user: ownerUser_() }, readAll_(), { pending: readPending_().filter(x => x.status === 'Pending'), pwRequests: pwRequests_().filter(r => !r.handled), calCfg: calCfg_(), coll: collRead_(), collCats: collCats_() }));
      case 'pwHandled': { const L = pwRequests_(); L.forEach(r => { if (r.id === req.id) r.handled = true; }); PropertiesService.getScriptProperties().setProperty('PW_REQUESTS', JSON.stringify(L)); return json_({ ok: true }); }
      case 'getNotify': return json_(Object.assign({ ok: true }, getNotify_()));
      case 'saveNotify': return json_(Object.assign({ ok: true }, saveNotify_(req.config)));
      case 'testNotify': return json_(Object.assign({ ok: true }, sendRule_(req.rule, true)));
      case 'collSave': return withLock_(() => json_({ ok: true, entry: collSave_(req.entry) }));
      case 'collDelete': return withLock_(() => { collDelete_(req.id); return json_({ ok: true }); });
      case 'collCats': return json_({ ok: true, collCats: collSaveCats_(req.cats) });
      case 'calInbox': return json_(Object.assign({ ok: true }, calInbox_(!!req.all)));
      case 'calDecide': return withLock_(() => json_(Object.assign({ ok: true }, calDecide_(req))));
      case 'getCal': return json_(Object.assign({ ok: true, key: siriKey_(false) }, calStatus_()));
      case 'saveCal': return json_(Object.assign({ ok: true }, saveCalCfg_(req.config), calStatus_()));
      case 'calResend': { PropertiesService.getScriptProperties().deleteProperty('CAL_SYNCED'); return json_(Object.assign({ ok: true }, calStatus_())); }
      case 'getSiri': return json_({ ok: true, key: siriKey_(false) });
      case 'resetSiri': return json_({ ok: true, key: siriKey_(true) });
      case 'notifyStatus': return json_(Object.assign({ ok: true }, notifyStatus_()));
      case 'updateAccount': return json_(Object.assign({ ok: true }, updateOwnerAccount_(req)));
      case 'getGuests': return json_({ ok: true, guests: guests_().map(publicGuest_) });
      case 'saveGuest': return json_({ ok: true, guests: saveGuest_(req.guest).map(publicGuest_) });
      case 'deleteGuest': return json_({ ok: true, guests: deleteGuest_(req.id).map(publicGuest_) });
      case 'save': return withLock_(() => json_({ ok: true, row: saveItem_(req.item) }));
      case 'delete': return withLock_(() => { clearRow_(req.row); return json_({ ok: true }); });
      case 'approve': return withLock_(() => json_({ ok: true, row: approvePending_(req.id, req.item || {}) }));
      case 'reject': return withLock_(() => { decidePending_(req.id, 'Rejected'); return json_({ ok: true }); });
      case 'getFeed': return json_(Object.assign({ ok: true }, feedInfo_()));
      case 'setFeed': return json_(Object.assign({ ok: true }, setFeed_(req.areas, req.reset)));
      case 'stats': return json_({ ok: true, archived: readArchive_() });
      case 'getMaint': return json_(Object.assign({ ok: true }, maintInfo_()));
      case 'saveMaint': return json_(Object.assign({ ok: true }, saveMaint_(req.cfg || {})));
      case 'archiveNow': return withLock_(() => json_({ ok: true, moved: archiveDone_() }));
      case 'backupNow': return json_({ ok: true, backup: backupNow_() });
      case 'saveAreas': return withLock_(() => json_(Object.assign({ ok: true }, saveAreas_(req))));
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
/* the owner sees guests' usernames AND passwords (by design) */
function publicGuest_(g) { return { id: g.id, name: g.name, user: g.user || '', pw: g.pw || '', phone: g.phone || '', areas: g.areas, coll: g.coll || [], canSuggest: !!g.canSuggest, on: g.on !== false, hasPassword: !!g.hash }; }
function checkNewUser_(user, selfId) {
  if (!/^[a-z0-9._-]{3,30}$/.test(user)) throw new Error('Username: 3-30 characters — English letters, numbers, . _ -');
  if (user === ownerUser_()) throw new Error('That username is taken');
  if (guests_().some(x => x.id !== selfId && cleanUser_(x.user) === user)) throw new Error('That username is taken');
}
function setGuestPw_(g, pw) {
  if (String(pw).length < 6) throw new Error('Password: at least 6 characters');
  g.salt = Utilities.getUuid(); g.hash = hash_(String(pw), g.salt); g.pw = String(pw);
}
function updateGuestAccount_(id, req) {
  const list = guests_(); const g = list.find(x => x.id === id); if (!g) throw new Error('Account not found');
  if (req.newUsername !== undefined && cleanUser_(req.newUsername) !== cleanUser_(g.user)) { const u = cleanUser_(req.newUsername); checkNewUser_(u, g.id); g.user = u; }
  if (req.newPassword) throw new Error('Only the list owner can change passwords');
  PropertiesService.getScriptProperties().setProperty('GUESTS', JSON.stringify(list));
  return { user: g.user };
}
function updateOwnerAccount_(req) {
  const P = PropertiesService.getScriptProperties();
  if (req.newUsername !== undefined && cleanUser_(req.newUsername) !== ownerUser_()) {
    const u = cleanUser_(req.newUsername);
    if (!/^[a-z0-9._-]{3,30}$/.test(u)) throw new Error('Username: 3-30 characters — English letters, numbers, . _ -');
    if (guests_().some(x => cleanUser_(x.user) === u)) throw new Error('That username is taken');
    P.setProperty('OWNER_USER', u);
  }
  if (req.newPassword) {
    if (String(req.newPassword).length < 8) throw new Error('Your password: at least 8 characters');
    const salt = Utilities.getUuid(); P.setProperties({ PW_SALT: salt, PW_HASH: hash_(String(req.newPassword), salt) });
  }
  return { user: ownerUser_() };
}
function saveGuest_(in_) {
  if (!in_ || !String(in_.name || '').trim()) throw new Error('Guest name is required');
  const list = guests_();
  let g = list.find(x => x.id === in_.id);
  if (!g) { g = { id: Utilities.getUuid().slice(0, 8) }; list.push(g); }
  g.name = String(in_.name).trim().slice(0, 40);
  g.areas = (in_.areas || []).map(String).slice(0, 20);
  g.canSuggest = !!in_.canSuggest;
  g.on = in_.on !== false;
  g.phone = String(in_.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
  g.coll = (in_.coll || []).map(String).slice(0, 20);
  const u = cleanUser_(in_.user || g.user);
  if (!u) throw new Error('Choose a username for ' + g.name);
  if (u !== cleanUser_(g.user)) { checkNewUser_(u, g.id); g.user = u; }
  if (in_.password) setGuestPw_(g, in_.password);
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
  const gc = g.coll || [], cats = collCats_().filter(c => gc.indexOf(c.id) >= 0);
  return { role: 'guest', name: g.name, canSuggest: !!g.canSuggest, items: items, areas: g.areas, people: [], report: null, mySuggestions: mine,
    collCats: cats, coll: cats.length ? collRead_().filter(e => gc.indexOf(e.cat) >= 0) : [] };
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
  try { notifySuggestion_(g.name, area, text); } catch (e) { console.error(e); }   // never block the suggestion
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
  ensureCols_(sh);
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
      if (k === 'checklist') { try { o[k] = v ? JSON.parse(v) : []; } catch (e) { o[k] = []; } }
    });
    items.push(o);
  });
  const lists = ss.getSheetByName('Lists');
  const col = (c) => lists.getRange(5, c === 'B' ? 2 : 5, 20, 1).getValues().map(x => String(x[0]).trim()).filter(String);
  const mr = ss.getSheetByName('Manager Report');
  return {
    items: items, areas: col('B'), people: col('E'), areaHints: areaHints_(),
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
  if (k === 'checklist') return Array.isArray(v) ? (v.length ? JSON.stringify(v) : '') : String(v || '');
  return v;
}

function saveItem_(it) {
  if (!it || String(it.item || '').trim() === '') throw new Error('Action Item text is required');
  const sh = SpreadsheetApp.getActive().getSheetByName(API_SHEET);
  ensureCols_(sh);
  let row = Number(it.row) || 0;
  if (!row) {
    const a = sh.getRange(API_FIRST, 1, API_LAST - API_FIRST + 1, 1).getValues();
    const idx = a.findIndex(x => String(x[0]).trim() === '');
    if (idx < 0) throw new Error('The sheet is full (500 rows). Clear some Done items first.');
    row = API_FIRST + idx;
    if (!it.created) it.created = Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  if (row < API_FIRST || row > API_LAST) throw new Error('Bad row');
  Object.keys(API_HEADS).forEach(k => { if (sh.getRange(5, API_COLS[k]).getValue() === '') sh.getRange(5, API_COLS[k]).setValue(API_HEADS[k]); });
  Object.keys(API_COLS).forEach(k => {
    if (!(k in it)) return;
    const cell = sh.getRange(row, API_COLS[k]);
    if (k === 'time' || k === 'checklist') cell.setNumberFormat('@');          // keep as plain text
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
  if (!cfg.topic) {                                   // create the topic ONCE and keep it, so the phone subscription stays valid
    cfg.topic = 'ai-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    try { p.setProperty('NOTIFY_CFG', JSON.stringify(cfg)); } catch (e) { /* read-only context */ }
  }
  if (!cfg.rules) cfg.rules = [];
  if (!cfg.tz) cfg.tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  if (!cfg.detail) cfg.detail = 'titles';
  if (!cfg.onSuggest) cfg.onSuggest = { on: true, channel: 'push' };
  if (cfg.fallbackEmail === undefined) cfg.fallbackEmail = true;
  return cfg;
}
function triggerOn_() {
  return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'notifyTick');
}
function getNotify_() {
  const cfg = notifyConfig_();
  let on = false; try { on = triggerOn_(); } catch (e) { on = false; }
  const tk = PropertiesService.getScriptProperties().getProperty('NTFY_TOKEN') || '';
  return { config: cfg, triggerOn: on, email: Session.getEffectiveUser().getEmail(), hasToken: !!tk, tokenHint: tk ? tk.slice(0, 5) + '…' + tk.slice(-4) : '' };
}
function saveNotify_(cfg) {
  if (!cfg || !Array.isArray(cfg.rules)) throw new Error('Bad settings');
  const clean = {
    topic: String(cfg.topic || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || notifyConfig_().topic,
    tz: String(cfg.tz || 'Asia/Jerusalem'),
    detail: cfg.detail === 'counts' ? 'counts' : 'titles',
    onSuggest: { on: !cfg.onSuggest || cfg.onSuggest.on !== false, channel: cfg.onSuggest && ['push', 'email', 'both'].indexOf(cfg.onSuggest.channel) >= 0 ? cfg.onSuggest.channel : 'push' },
    rules: cfg.rules.slice(0, 30).map(r => ({
      id: String(r.id || Utilities.getUuid().slice(0, 8)), on: r.on !== false,
      area: String(r.area || 'All'), time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : '08:00',
      days: (r.days || []).map(Number).filter(d => d >= 0 && d <= 6),
      channel: ['push', 'email', 'both'].indexOf(r.channel) >= 0 ? r.channel : 'push',
      kind: r.kind === 'weekly' ? 'weekly' : 'today'
    }))
  };
  PropertiesService.getScriptProperties().setProperty('NOTIFY_CFG', JSON.stringify(clean));
  if (typeof cfg.token === 'string') {                 // '' = remove; otherwise a ntfy.sh access token (tk_…)
    const tk = cfg.token.trim();
    if (!tk) PropertiesService.getScriptProperties().deleteProperty('NTFY_TOKEN');
    else if (/^tk_[A-Za-z0-9]{10,}$/.test(tk)) PropertiesService.getScriptProperties().setProperty('NTFY_TOKEN', tk);
    else throw new Error('The ntfy token should start with tk_');
  }
  clean.fallbackEmail = cfg.fallbackEmail !== false;
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

/* one place that talks to ntfy; logs every push so problems can be seen in the app */
function pushNtfy_(topic, title, message, tags, priority) {
  let code = 0, err = '', via = 'push';
  const token = PropertiesService.getScriptProperties().getProperty('NTFY_TOKEN') || '';
  try {
    const r = UrlFetchApp.fetch('https://ntfy.sh/', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      payload: JSON.stringify({ topic: topic, title: title, message: message, tags: tags || [], click: APP_URL, priority: priority || 3 })
    });
    code = r.getResponseCode();
    if (code >= 300) err = 'ntfy.sh answered ' + code + ': ' + String(r.getContentText()).slice(0, 160);
  } catch (e) {
    err = /permission|authoriz|UrlFetchApp/i.test(String(e)) ? 'NOT_AUTHORIZED: ' + e.message : String(e.message || e);
  }
  // push failed (e.g. ntfy daily limit) → don't lose the alert: send it by email instead
  if (err && notifyConfig_().fallbackEmail !== false) {
    try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), title, message + '\n\n' + APP_URL + '\n\n(Sent by email because the phone push failed: ' + err.slice(0, 120) + ')'); via = 'email'; } catch (e) { /* ignore */ }
  }
  try {
    const p = PropertiesService.getScriptProperties();
    let log = []; try { log = JSON.parse(p.getProperty('NOTIFY_LOG') || '[]'); } catch (e) { log = []; }
    log.push({ at: new Date().toISOString(), title: String(title).slice(0, 80), ok: !err, via: via, err: err.slice(0, 200) });
    p.setProperty('NOTIFY_LOG', JSON.stringify(log.slice(-10)));
  } catch (e) { /* ignore */ }
  if (err) throw new Error(err + (via === 'email' ? ' [EMAIL_SENT]' : ''));
}
function notifyStatus_() {
  const p = PropertiesService.getScriptProperties();
  let log = []; try { log = JSON.parse(p.getProperty('NOTIFY_LOG') || '[]'); } catch (e) { log = []; }
  let on = false; try { on = triggerOn_(); } catch (e) { on = false; }
  let lastTick = p.getProperty('NOTIFY_TICK') || '';
  return { triggerOn: on, lastTick: lastTick, log: log.reverse() };
}
/* Run this ONCE from the Apps Script editor (select it › ▶ Run) if push doesn't arrive:
   it asks Google for the needed permissions, turns the schedule on and sends a test push. */
function authorizeAndTestPush() {
  if (!triggerOn_()) ScriptApp.newTrigger('notifyTick').timeBased().everyMinutes(5).create();
  const cfg = notifyConfig_();
  pushNtfy_(cfg.topic, '✅ Action Items — test', 'If you see this, push notifications work.\nTopic: ' + cfg.topic, ['white_check_mark'], 4);
  console.log('Test push sent to topic: ' + cfg.topic);
  try { SpreadsheetApp.getUi().alert('Test push sent ✅\n\nTopic: ' + cfg.topic + '\n\nIf nothing arrives, check that the ntfy app is subscribed to exactly this topic (server ntfy.sh) and that notifications for ntfy are allowed in the phone settings.'); } catch (e) { /* run from the editor */ }
}

/* runs every 5 minutes */
function notifyTick() {
  try { PropertiesService.getScriptProperties().setProperty('NOTIFY_TICK', new Date().toISOString()); } catch (e) { /* ignore */ }
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
  const d = rule.kind === 'weekly' ? weeklyDigest_(rule.area || 'All', cfg) : digest_(rule.area || 'All', cfg);
  const title = (isTest ? '[Test] ' : '') + d.title;
  const ch = rule.channel || 'push';
  if (ch === 'push' || ch === 'both') pushNtfy_(cfg.topic, title, d.message, ['clipboard'], 3);
  if (ch === 'email' || ch === 'both') {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), title, d.message + '\n\n' + APP_URL);
  }
  return { sent: true, title: title, message: d.message };
}


/* ---------- weekly summary notification ---------- */
function weeklyDigest_(area, cfg) {
  const tz = cfg.tz, now = new Date();
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const dow = Number(Utilities.formatDate(now, tz, 'u')) % 7;
  const ws = new Date(now.getTime() - dow * 86400000), we = new Date(ws.getTime() + 6 * 86400000);
  const nws = new Date(ws.getTime() + 7 * 86400000), nwe = new Date(ws.getTime() + 13 * 86400000);
  const f = (d) => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const all = readAll_().items.filter(it => area === 'All' || it.area === area);
  const done = all.filter(it => it.status === 'Done' && it.done >= f(ws) && it.done <= f(we));
  const open = all.filter(it => it.status !== 'Done' && it.status !== 'Cancelled');
  const over = open.filter(it => it.due && it.due < todayStr);
  const next = open.filter(it => it.due && it.due >= f(nws) && it.due <= f(nwe));
  const title = (area === 'All' ? 'Week' : area + ' · week') + ' — ' + done.length + ' done, ' + next.length + ' next week';
  let msg;
  if (cfg.detail === 'counts') msg = 'Done this week: ' + done.length + '\nCarried over / overdue: ' + over.length + '\nPlanned next week: ' + next.length;
  else {
    const L = [];
    if (done.length) { L.push('✔ Done this week:'); done.slice(0, 8).forEach(it => L.push('  • ' + it.item)); }
    if (over.length) { L.push('⚠ Carried over:'); over.slice(0, 6).forEach(it => L.push('  • ' + it.item)); }
    if (next.length) { L.push('▶ Next week:'); next.slice(0, 8).forEach(it => L.push('  • ' + it.item)); }
    msg = L.length ? L.join('\n') : 'A quiet week — nothing done or planned.';
  }
  return { title: title, message: msg };
}

/* ---------- Outlook / calendar subscription feed ---------- */
function feedCfg_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('FEED_CFG') || '{}'); } catch (e) { return {}; } }
function feedInfo_() {
  const f = feedCfg_();
  let base = ''; try { base = ScriptApp.getService().getUrl(); } catch (e) { base = ''; }
  return { on: !!f.token, areas: f.areas || [], url: f.token && base ? base + '?feed=' + f.token : '' };
}
function setFeed_(areas, reset) {
  const f = feedCfg_();
  if (reset || !f.token) f.token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  if (Array.isArray(areas)) f.areas = areas.map(String);
  if (areas === null) { delete f.token; }
  PropertiesService.getScriptProperties().setProperty('FEED_CFG', JSON.stringify(f));
  return feedInfo_();
}
function icsEsc_(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsFold_(line) {
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) { const b = Utilities.newBlob(ch).getBytes().length; if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; } cur += ch; bytes += b; }
  out.push(cur); return out.join('\r\n');
}
function buildFeed_(f) {
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const now = new Date(), from = Utilities.formatDate(new Date(now.getTime() - 14 * 86400000), tz, 'yyyy-MM-dd');
  const items = readAll_().items.filter(it => it.due && it.due >= from && it.status !== 'Cancelled' && it.status !== 'Done' &&
    (!f.areas || !f.areas.length || f.areas.indexOf(it.area) >= 0));
  const stamp = Utilities.formatDate(now, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Action Items//feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Action Items', 'X-WR-TIMEZONE:' + tz, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  items.forEach(it => {
    const d = it.due.replace(/-/g, '');
    const dur = Math.max(0.25, Number(it.hrs) || 1);
    L.push('BEGIN:VEVENT', 'UID:ai-row' + it.row + '@action-items', 'DTSTAMP:' + stamp);
    if (it.time && /^\d{1,2}:\d{2}$/.test(it.time)) {
      const p = it.time.split(':'); const st = d + 'T' + ('0' + p[0]).slice(-2) + p[1] + '00';
      const endMin = Number(p[0]) * 60 + Number(p[1]) + Math.round(dur * 60);
      const en = d + 'T' + ('0' + Math.floor(endMin / 60) % 24).slice(-2) + ('0' + endMin % 60).slice(-2) + '00';
      L.push('DTSTART;TZID=' + tz + ':' + st, 'DTEND;TZID=' + tz + ':' + (endMin >= 1440 ? st : en));
    } else {
      const nd = Utilities.formatDate(new Date(new Date(it.due + 'T12:00:00Z').getTime() + 86400000), 'UTC', 'yyyyMMdd');
      L.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + nd, 'TRANSP:TRANSPARENT');
    }
    const desc = [it.prio && 'Priority: ' + it.prio, it.status && 'Status: ' + it.status, it.topic && 'Topic: ' + it.topic, it.com && 'Next step: ' + it.com].filter(String).join('\n');
    L.push('SUMMARY:' + icsEsc_((it.area ? '[' + it.area + '] ' : '') + it.item), 'DESCRIPTION:' + icsEsc_(desc));
    if (it.area) L.push('CATEGORIES:' + icsEsc_(it.area));
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(icsFold_).join('\r\n') + '\r\n';
}

/* ---------- archive, backup, statistics ---------- */
const ARCH_HEAD = ['Action Item', 'Status', 'Area', 'Priority', 'Due Date', 'Topic', 'Focal / Who', 'Created', 'Est. Hrs', 'Recurring', 'Done On', 'Act. Hrs', 'Comments', 'Archived On'];
function archiveSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Archive');
  if (!sh) {
    sh = ss.insertSheet('Archive');
    sh.getRange(1, 1, 1, ARCH_HEAD.length).setValues([ARCH_HEAD]).setFontWeight('bold').setBackground('#26355D').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}
function maintCfg_() { try { return Object.assign({ archiveDays: 60, keepBackups: 14 }, JSON.parse(PropertiesService.getScriptProperties().getProperty('MAINT_CFG') || '{}')); } catch (e) { return { archiveDays: 60, keepBackups: 14 }; } }
function maintOn_() { try { return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyMaintenance'); } catch (e) { return false; } }
function maintInfo_() {
  const c = maintCfg_();
  return { cfg: c, on: maintOn_(), lastBackup: PropertiesService.getScriptProperties().getProperty('LAST_BACKUP') || '',
           lastArchive: PropertiesService.getScriptProperties().getProperty('LAST_ARCHIVE') || '' };
}
function saveMaint_(c) {
  const cur = maintCfg_();
  cur.archiveDays = Math.max(7, Math.min(365, Number(c.archiveDays) || 60));
  cur.keepBackups = Math.max(3, Math.min(60, Number(c.keepBackups) || 14));
  PropertiesService.getScriptProperties().setProperty('MAINT_CFG', JSON.stringify(cur));
  let note = '';
  if (c.on === true && !maintOn_()) {
    try { ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(2).create(); }
    catch (e) { note = 'To switch it on, open the sheet once and choose ✉ Manager Report › App: turn on daily archive & backup.'; }
  }
  if (c.on === false) ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyMaintenance').forEach(t => ScriptApp.deleteTrigger(t));
  return Object.assign(maintInfo_(), { note: note });
}
function enableMaintenance() {
  if (!maintOn_()) ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(2).create();
  const b = backupNow_();
  SpreadsheetApp.getUi().alert('Daily archive & backup are ON (every night ~02:00).\n\nFirst backup created: ' + b.name);
}
function dailyMaintenance() {
  try { archiveDone_(); } catch (e) { console.error(e); }
  try { backupNow_(); } catch (e) { console.error(e); }
}
function archiveDone_() {
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const cutoff = Utilities.formatDate(new Date(Date.now() - maintCfg_().archiveDays * 86400000), tz, 'yyyy-MM-dd');
  const items = readAll_().items.filter(it => (it.status === 'Done' || it.status === 'Cancelled') && (it.done || it.due || '') && (it.done || it.due) < cutoff);
  if (!items.length) { PropertiesService.getScriptProperties().setProperty('LAST_ARCHIVE', new Date().toISOString()); return 0; }
  const toD = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : ''; };
  const rows = items.map(it => [it.item, it.status, it.area, it.prio, toD(it.due), it.topic, it.focal, toD(it.created), it.hrs, it.rec, toD(it.done), it.acthrs, it.com, new Date()]);
  const ar = archiveSheet_();
  ar.getRange(ar.getLastRow() + 1, 1, rows.length, ARCH_HEAD.length).setValues(rows);
  items.forEach(it => clearRow_(it.row));
  PropertiesService.getScriptProperties().setProperty('LAST_ARCHIVE', new Date().toISOString());
  return items.length;
}
function backupNow_() {
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const name = ss.getName() + ' — backup ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  const it = DriveApp.getFoldersByName('Action Items Backups');
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder('Action Items Backups');
  DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
  const files = []; const fi = folder.getFiles(); while (fi.hasNext()) files.push(fi.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  files.slice(maintCfg_().keepBackups).forEach(f => f.setTrashed(true));
  PropertiesService.getScriptProperties().setProperty('LAST_BACKUP', new Date().toISOString());
  return { name: name, folder: folder.getUrl() };
}
function readArchive_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Archive');
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const d = (v) => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v || '');
  return sh.getRange(2, 1, Math.min(sh.getLastRow() - 1, 3000), ARCH_HEAD.length).getValues().filter(r => r[0]).map(r => ({
    item: String(r[0]), status: String(r[1]), area: String(r[2]), prio: String(r[3]), due: d(r[4]), topic: String(r[5]),
    hrs: r[8], done: d(r[10]), acthrs: r[11]
  }));
}


/* ---------- tell the owner when a guest suggests an item ---------- */
function notifySuggestion_(from, area, text) {
  const cfg = notifyConfig_();
  if (!cfg.onSuggest || cfg.onSuggest.on === false) return;
  const title = '📥 New suggestion from ' + from;
  const message = (cfg.detail === 'counts' ? 'A new item is waiting for your approval' : '[' + area + '] ' + text) + '\nOpen the app › 📥 to approve or reject.';
  const ch = cfg.onSuggest.channel || 'push';
  if (ch === 'push' || ch === 'both') {
    try { pushNtfy_(cfg.topic, title, message, ['inbox_tray'], 4); } catch (e) { console.error(e); }
  }
  if (ch === 'email' || ch === 'both') MailApp.sendEmail(Session.getEffectiveUser().getEmail(), title, message + '\n\n' + APP_URL);
}


/* ---------- manage areas (add / remove / rename / reorder) ---------- */
function areaHints_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('AREA_HINTS') || '{}'); } catch (e) { return {}; } }
function saveAreas_(req) {
  const names = (req.areas || []).map(a => String(a || '').trim().slice(0, 30)).filter(String);
  if (!names.length) throw new Error('Keep at least one area');
  if (names.length > 20) throw new Error('Up to 20 areas');
  if (new Set(names.map(n => n.toLowerCase())).size !== names.length) throw new Error('Two areas have the same name');
  const renames = req.renames || {};          // { oldName: newName }
  const moveTo = req.moveTo || {};            // { removedName: targetName or '' }
  const ss = SpreadsheetApp.getActive();
  const mapArea = (a) => {
    a = String(a || '');
    if (renames[a] !== undefined) return renames[a];
    if (moveTo[a] !== undefined) return moveTo[a];
    return a;
  };
  // 1) Action Items (column C)
  const sh = ss.getSheetByName(API_SHEET);
  const rng = sh.getRange(API_FIRST, API_COLS.area, API_LAST - API_FIRST + 1, 1);
  const vals = rng.getValues(); let changed = 0;
  vals.forEach(r => { const n = mapArea(r[0]); if (n !== r[0]) { r[0] = n; changed++; } });
  if (changed) rng.setValues(vals);
  // 2) Pending + Archive keep history consistent for renames only
  [['Pending', 4], ['Archive', 3]].forEach(([name, col]) => {
    const s2 = ss.getSheetByName(name); if (!s2 || s2.getLastRow() < 2) return;
    const r2 = s2.getRange(2, col, s2.getLastRow() - 1, 1), v2 = r2.getValues(); let c2 = 0;
    v2.forEach(r => { if (renames[r[0]] !== undefined) { r[0] = renames[r[0]]; c2++; } });
    if (c2) r2.setValues(v2);
  });
  // 3) Lists tab (B5:B24) — the dropdowns and Dashboard read from here
  const lists = ss.getSheetByName('Lists');
  const out = []; for (let i = 0; i < 20; i++) out.push([names[i] || '']);
  lists.getRange(5, 2, 20, 1).setValues(out);
  // 4) guests, calendar feed, notification rules, keywords
  const fix = (arr) => (arr || []).map(mapArea).filter(a => a && names.indexOf(a) >= 0).filter((a, i, x) => x.indexOf(a) === i);
  const P = PropertiesService.getScriptProperties();
  // guests: follow renames only — a removed area is never replaced by another one (no accidental extra access)
  const gs = guests_(); gs.forEach(g => { g.areas = (g.areas || []).map(a => renames[a] !== undefined ? renames[a] : a).filter(a => names.indexOf(a) >= 0).filter((a, i, x) => x.indexOf(a) === i); });
  P.setProperty('GUESTS', JSON.stringify(gs));
  const f = feedCfg_(); if (f.areas) { f.areas = fix(f.areas); P.setProperty('FEED_CFG', JSON.stringify(f)); }
  const nc = notifyConfig_(); nc.rules.forEach(r => { if (r.area !== 'All') { const a = mapArea(r.area); r.area = names.indexOf(a) >= 0 ? a : 'All'; } }); P.setProperty('NOTIFY_CFG', JSON.stringify(nc));
  const hints = {}; const inH = req.hints || {};
  names.forEach(n => { const h = String(inH[n] || '').trim().slice(0, 500); if (h) hints[n] = h; });
  P.setProperty('AREA_HINTS', JSON.stringify(hints));
  return Object.assign({ moved: changed }, readAll_());
}


/* =====================================================================
 *  💡 Collection notebook — restaurants, recipes, trips, drinks, anecdotes…
 *  Stored in its own "Collection" tab, separate from the action items.
 * ===================================================================== */
const COLL_SHEET = 'Collection';
const COLL_HEAD = ['ID', 'Category', 'Title', 'Notes', 'Link', 'Place', 'Recommended by', 'Status', 'Rating', 'Added', 'Updated', 'For', 'Lat', 'Lng'];
const COLL_DEFAULT_CATS_ = [
  { id: 'food', name: '🍽 מסעדות', kind: 'try', map: true }, { id: 'trip', name: '🧭 טיולים', kind: 'try', map: true },
  { id: 'activity', name: '🎯 פעילויות', kind: 'try', map: true }, { id: 'recipe', name: '🍳 מתכונים', kind: 'try', map: false },
  { id: 'drink', name: '🍸 קוקטיילים ומשקאות', kind: 'try', map: false }, { id: 'wish', name: '🎁 משאלות', kind: 'wish', map: false },
  { id: 'story', name: '💬 אנקדוטות', kind: 'note', map: false }];
function collCats_() {
  let c = null; try { c = JSON.parse(PropertiesService.getScriptProperties().getProperty('COLL_CATS') || 'null'); } catch (e) { c = null; }
  if (!Array.isArray(c) || !c.length) return COLL_DEFAULT_CATS_.map(x => Object.assign({}, x));
  // older saved lists: add the new defaults (wishes, activities) and the map switch
  const MAPDEF = { food: true, trip: true, activity: true };
  c.forEach(x => { if (x.map === undefined) x.map = !!MAPDEF[x.id]; });
  if (!c.some(x => x.kind === 'wish')) c.push(Object.assign({}, COLL_DEFAULT_CATS_[5]));
  if (!c.some(x => x.id === 'activity')) c.splice(Math.min(2, c.length), 0, Object.assign({}, COLL_DEFAULT_CATS_[2]));
  return c;
}
function collSaveCats_(cats) {
  const clean = (cats || []).map(c => ({ id: String(c.id || Utilities.getUuid().slice(0, 6)).replace(/[^\w-]/g, '').slice(0, 20) || Utilities.getUuid().slice(0, 6),
    name: String(c.name || '').trim().slice(0, 40), kind: ['note', 'wish'].indexOf(c.kind) >= 0 ? c.kind : 'try', map: !!c.map && c.kind !== 'note' })).filter(c => c.name).slice(0, 20);
  if (!clean.length) throw new Error('Keep at least one category');
  PropertiesService.getScriptProperties().setProperty('COLL_CATS', JSON.stringify(clean));
  return clean;
}
function collSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(COLL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(COLL_SHEET);
    sh.getRange(1, 1, 1, COLL_HEAD.length).setValues([COLL_HEAD]).setFontWeight('bold').setBackground('#26355D').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  if (sh.getRange(1, 12).getValue() === '') sh.getRange(1, 12, 1, 3).setValues([COLL_HEAD.slice(11)]).setFontWeight('bold').setBackground('#26355D').setFontColor('#FFFFFF');
  return sh;
}
function collRead_() {
  const sh = collSheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const d = (v) => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v || '');
  return sh.getRange(2, 1, n, COLL_HEAD.length).getValues().filter(r => r[0] && r[2]).map(r => ({
    id: String(r[0]), cat: String(r[1]), title: String(r[2]), notes: String(r[3]), link: String(r[4]), place: String(r[5]),
    by: String(r[6]), status: String(r[7]) === 'tried' ? 'tried' : 'want', rating: Number(r[8]) || 0, added: d(r[9]), updated: d(r[10]),
    for: String(r[11] || ''), lat: r[12] === '' ? null : Number(r[12]), lng: r[13] === '' ? null : Number(r[13]) }));
}
function collSave_(e) {
  if (!e || !String(e.title || '').trim()) throw new Error('A title is required');
  const sh = collSheet_(), tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const link = String(e.link || '').trim();
  const out = { id: e.id ? String(e.id) : Utilities.getUuid().slice(0, 12), cat: String(e.cat || '').slice(0, 20), title: String(e.title).trim().slice(0, 200),
    notes: String(e.notes || '').slice(0, 3000), link: /^https?:\/\//i.test(link) ? link.slice(0, 500) : '', place: String(e.place || '').slice(0, 120),
    by: String(e.by || '').slice(0, 60), status: e.status === 'tried' ? 'tried' : 'want', rating: Math.max(0, Math.min(5, Number(e.rating) || 0)), added: e.added || today, updated: today,
    for: String(e.for || '').slice(0, 60), lat: null, lng: null, geo: '' };
  const n = sh.getLastRow() - 1;
  const ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
  const i = ids.indexOf(out.id);
  // location: pin chosen in the app › coordinates in a maps link › look up the place name
  const cat = collCats_().find(c => c.id === out.cat) || {};
  const prev = i >= 0 ? sh.getRange(i + 2, 1, 1, COLL_HEAD.length).getValues()[0] : null;
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
  if (num(e.lat) !== null && num(e.lng) !== null) { out.lat = num(e.lat); out.lng = num(e.lng); out.geo = 'pin'; }
  else if (cat.map) {
    const same = prev && String(prev[5]) === out.place && String(prev[4]) === out.link && num(prev[12]) !== null;
    if (same) { out.lat = num(prev[12]); out.lng = num(prev[13]); out.geo = 'kept'; }
    else { const g = collLocate_(out.link, out.place); if (g) { out.lat = g.lat; out.lng = g.lng; out.geo = g.how; } else out.geo = (out.place || out.link) ? 'none' : ''; }
  }
  const row = [out.id, out.cat, out.title, out.notes, out.link, out.place, out.by, out.status, out.rating || '', out.added, out.updated, out.for,
    out.lat === null ? '' : out.lat, out.lng === null ? '' : out.lng];
  if (i >= 0) sh.getRange(i + 2, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  return out;
}
/* find coordinates: from a Google Maps link (also short maps.app.goo.gl links), else by geocoding the place name */
function collLocate_(link, place) {
  const fromUrl = (u) => {
    u = decodeURIComponent(String(u || ''));
    let m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || u.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    return m ? { lat: Number(m[1]), lng: Number(m[2]), how: 'link' } : null;
  };
  try {
    if (link) {
      let g = fromUrl(link); if (g) return g;
      if (/goo\.gl|maps\.app|g\.co\//i.test(link)) {
        let u = link;
        for (let k = 0; k < 3; k++) {
          const r = UrlFetchApp.fetch(u, { followRedirects: false, muteHttpExceptions: true });
          const loc = r.getHeaders()['Location'] || r.getHeaders()['location']; if (!loc) break;
          g = fromUrl(loc); if (g) return g; u = loc;
        }
        const q = decodeURIComponent(u).match(/\/place\/([^/@?]+)/); if (q && !place) place = q[1].replace(/\+/g, ' ');
      }
    }
    if (place) {
      const res = Maps.newGeocoder().setLanguage('he').setRegion('il').geocode(place);
      if (res && res.status === 'OK' && res.results && res.results.length) { const l = res.results[0].geometry.location; return { lat: l.lat, lng: l.lng, how: 'place' }; }
    }
  } catch (err) { console.error('locate: ' + err); }
  return null;
}
function collDelete_(id) {
  const sh = collSheet_(), n = sh.getLastRow() - 1; if (n < 1) return;
  const i = sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0])).indexOf(String(id));
  if (i >= 0) sh.deleteRow(i + 2);
}

/* =====================================================================
 *  iPhone (iCloud) calendar sync — done by an iPhone Shortcut:
 *  calFeed → list of events to add / remove (each tagged #AI-…) · calAck → mark them synced.
 *  Adding always removes the old copy first (by its tag), so running twice never duplicates.
 * ===================================================================== */
const CAL_DEFAULT_NAMES_ = ['נטע ואמיר', 'עבודה', 'משפחת וולף', 'אמיר', 'מילואים'];
function calCfg_() {
  let c = {}; try { c = JSON.parse(PropertiesService.getScriptProperties().getProperty('CAL_CFG') || '{}'); } catch (e) { c = {}; }
  if (!Array.isArray(c.names) || !c.names.length) c.names = CAL_DEFAULT_NAMES_.slice();
  if (!c.map) c.map = {};
  if (!c.time) c.time = '';                                         // '' = items without a time become all-day events
  return c;
}
function saveCalCfg_(cfg) {
  const names = (cfg && cfg.names || []).map(n => String(n || '').trim().slice(0, 50)).filter(String).slice(0, 20);
  if (!names.length) throw new Error('Add at least one calendar name');
  const map = {}; Object.keys(cfg.map || {}).forEach(a => { if (names.indexOf(cfg.map[a]) >= 0) map[String(a)] = cfg.map[a]; });
  const c = { names: names, map: map, time: /^\d{2}:\d{2}$/.test(cfg.time || '') ? cfg.time : '' };
  PropertiesService.getScriptProperties().setProperty('CAL_CFG', JSON.stringify(c));
  return { calCfg: c };
}
function calSynced_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('CAL_SYNCED') || '{}'); } catch (e) { return {}; } }
function calTag_(it) { return 'AI-' + it.row + '-' + String(it.created || '').replace(/-/g, ''); }
function calWanted_() {
  const cfg = calCfg_(), out = {};
  readAll_().items.forEach(it => {
    if (!it.cal || !it.due || it.status === 'Cancelled') return;
    const tag = calTag_(it), time = it.time || cfg.time || '', allDay = !time;
    const hrs = parseFloat(it.hrs) > 0 ? parseFloat(it.hrs) : 1;
    let start = it.due, end = it.due;
    if (!allDay) {
      const p = it.due.split('-').map(Number), t = time.split(':').map(Number);
      const s0 = new Date(p[0], p[1] - 1, p[2], t[0], t[1]), e0 = new Date(s0.getTime() + hrs * 3600000);
      const f = (d) => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      start = f(s0); end = f(e0);
    }
    const ev = { tag: tag, op: 'add', cal: String(it.cal), title: String(it.item), start: start, end: end, allday: allDay ? 'yes' : 'no',
      notes: (it.com ? it.com + '\n\n' : '') + 'Action Items · ' + it.area + '\n' + APP_URL + '\n#' + tag };
    ev.sig = hash_([ev.cal, ev.title, ev.start, ev.end, ev.allday, ev.notes].join('|'), 'cal').slice(0, 16);
    out[tag] = ev;
  });
  return out;
}
function calCheckKey_(req) {
  const key = PropertiesService.getScriptProperties().getProperty('SIRI_KEY') || '';
  return key && String(req.key || '') === key;
}
function calFeed_(req) {
  if (!calCheckKey_(req)) return { ok: false, message: 'המפתח לא נכון — העתק אותו שוב מהאפליקציה (☰ › יומן אייפון).', events: [] };
  const want = calWanted_(), synced = calSynced_(), events = [], apply = {};
  Object.keys(synced).forEach(tag => { if (!want[tag]) { events.push({ tag: tag, op: 'del', cal: '', title: '', start: '', end: '', allday: 'no', notes: '' }); apply[tag] = null; } });
  Object.keys(want).forEach(tag => { if (synced[tag] !== want[tag].sig) { const e = Object.assign({}, want[tag]); delete e.sig; events.push(e); apply[tag] = want[tag].sig; } });
  const list = events.slice(0, 40), batch = Utilities.getUuid().slice(0, 8);
  const ap = {}; list.forEach(e => { ap[e.tag] = apply[e.tag]; });
  const P = PropertiesService.getScriptProperties();
  P.setProperty('CAL_BATCH', JSON.stringify({ id: batch, apply: ap })); P.setProperty('CAL_LASTFEED', new Date().toISOString());
  const adds = list.filter(e => e.op === 'add').length, dels = list.length - adds;
  return { ok: true, batch: batch, events: list, count: list.length,
    message: list.length ? 'יומן: ' + (adds ? adds + ' לעדכון' : '') + (adds && dels ? ', ' : '') + (dels ? dels + ' להסרה' : '') : 'היומן מעודכן ✓' };
}
function calAck_(req) {
  if (!calCheckKey_(req)) return { ok: false, message: 'המפתח לא נכון' };
  const P = PropertiesService.getScriptProperties();
  let b = {}; try { b = JSON.parse(P.getProperty('CAL_BATCH') || '{}'); } catch (e) { b = {}; }
  if (!b.id || b.id !== String(req.batch || '')) return { ok: true, message: 'אין מה לאשר' };
  const s = calSynced_(); Object.keys(b.apply || {}).forEach(t => { if (b.apply[t] === null) delete s[t]; else s[t] = b.apply[t]; });
  P.setProperty('CAL_SYNCED', JSON.stringify(s)); P.deleteProperty('CAL_BATCH'); P.setProperty('CAL_LASTACK', new Date().toISOString());
  return { ok: true, message: 'היומן סונכרן ✓' };
}
function calStatus_() {
  const P = PropertiesService.getScriptProperties(), want = calWanted_(), synced = calSynced_();
  let pending = 0; Object.keys(want).forEach(t => { if (synced[t] !== want[t].sig) pending++; }); Object.keys(synced).forEach(t => { if (!want[t]) pending++; });
  return { calCfg: calCfg_(), linked: Object.keys(want).length, pending: pending, lastFeed: P.getProperty('CAL_LASTFEED') || '', lastAck: P.getProperty('CAL_LASTACK') || '' };
}

/* =====================================================================
 *  📆 Import from the iPhone calendars (yours + shared ones).
 *  An iPhone Shortcut sends the upcoming events (calImport); the app shows only the NEW ones,
 *  you choose Add / No / Never — decisions are kept in the "Calendar Inbox" tab.
 * ===================================================================== */
const CI_SHEET = 'Calendar Inbox';
const CI_VER = 5;                                   // shown in the shortcut's message, so you can see the new script is live
const CI_HEAD = ['ID', 'Calendar', 'Title', 'Start', 'End', 'All day', 'Location', 'Notes', 'First seen', 'Decision', 'Decided', 'Row'];
function ciSheet_() {
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(CI_SHEET);
  if (!sh) { sh = ss.insertSheet(CI_SHEET); sh.getRange(1, 1, 1, CI_HEAD.length).setValues([CI_HEAD]).setFontWeight('bold').setBackground('#26355D').setFontColor('#FFFFFF'); sh.setFrozenRows(1); }
  return sh;
}
function ciRead_() {
  const sh = ciSheet_(), n = sh.getLastRow() - 1; if (n < 1) return [];
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const T = (v) => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm') : String(v || '');
  return sh.getRange(2, 1, n, CI_HEAD.length).getValues().map((r, i) => ({ _r: i + 2, id: String(r[0]), cal: String(r[1]), title: String(r[2]), start: T(r[3]), end: T(r[4]),
    allday: String(r[5]) === 'yes', location: String(r[6]), notes: String(r[7]), seen: T(r[8]), decision: String(r[9]), decided: T(r[10]), row: r[11] })).filter(x => x.id);
}
function ciNorm_(t) { return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function ciIgnore_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('CAL_IGNORE') || '[]'); } catch (e) { return []; } }
/* "2026-10-20T10:30:00+03:00", "2026-10-20 10:30", or anything Date can read → local 'yyyy-MM-dd HH:mm' */
function ciDate_(v, tz) {
  if (v === null || v === undefined || v === '') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v).trim())) return String(v).trim() + ' 00:00';       // date only = that local day
  let d = v instanceof Date ? v : new Date(String(v).trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, '$1T$2'));
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm');
}
function calImport_(req) {
  if (!calCheckKey_(req)) return { ok: false, message: 'המפתח לא נכון — העתק אותו שוב מהאפליקציה (☰ › ייבוא מהיומן).' };
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone(), now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  let evs = req.events;
  if (typeof evs === 'string') {
    const t = evs.replace(/^[^\[{]+/, '').trim();
    if (!t) evs = [];
    else if (t.charAt(0) === '[') { try { evs = JSON.parse(t); } catch (e) { evs = []; } }
    else if (t.indexOf('{') >= 0) {             // a Text field holding the dictionaries one after another
      const out = []; let depth = 0, start = -1, inStr = false, esc = false;
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === '{') { if (depth === 0) start = i; depth++; }
        else if (ch === '}') { depth--; if (depth === 0 && start >= 0) { try { out.push(JSON.parse(t.slice(start, i + 1))); } catch (e) { /* skip */ } start = -1; } }
      }
      evs = out;
    } else {                                    // text format: one event per line, fields separated by |||
      evs = t.split(/\n(?=[^\n]*\|\|\|)/).map(l => { const f = l.split('|||'); return { title: f[0], start: f[1], end: f[2], calendar: f[3], location: f[4], allday: f[5], notes: f[6] }; });
    }
  }
  if (evs && !Array.isArray(evs) && typeof evs === 'object') evs = [evs];      // a single event
  if (Array.isArray(evs)) evs = evs.map(e => {                                 // iOS may send each dictionary as text
    if (typeof e !== 'string') return e;
    const a = e.indexOf('{'), b = e.lastIndexOf('}');                         // ignore invisible marks (e.g. RTL) around the text
    if (a < 0) return e;
    const t = b > a ? e.slice(a, b + 1) : e.slice(a);
    try { return JSON.parse(t); } catch (err) { /* try again below */ }
    try { return JSON.parse(t.replace(/[\u0000-\u001F]+/g, ' ')); } catch (err) { /* last resort below */ }
    const o = {}, re = /"(title|start|end|calendar|allday|location|notes)"\s*:\s*"((?:[^"\\]|\\.)*)"/g; let m;
    while ((m = re.exec(t))) o[m[1]] = m[2].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    return Object.keys(o).length ? o : e;
  });
  if (!Array.isArray(evs)) return { ok: false, message: 'לא התקבלו אירועים מהקיצור.' };
  // keys may carry spaces or invisible RTL marks (typed on a Hebrew keyboard) — compare letters only
  const nk = (k) => String(k).replace(/[^A-Za-z\u0590-\u05FF]/g, '').toLowerCase();
  const pick = (o, ks) => {
    const want = ks.map(nk);
    for (const k of Object.keys(o)) { const v = o[k]; if (want.indexOf(nk(k)) >= 0 && v !== undefined && v !== null && v !== '') return typeof v === 'string' ? v.replace(/^[\s\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]+|[\s\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]+$/g, '') : v; }
    return '';
  };
  const items = readAll_().items, have = {};
  items.forEach(it => { have[ciNorm_(it.item) + '|' + it.due] = it.row; });
  const ign = ciIgnore_();
  const sh = ciSheet_(), old = ciRead_(), byId = {}; old.forEach(x => { byId[x.id] = x; });
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  let fresh = 0, total = 0, got = 0, noTitle = 0, own = 0, badDate = 0, past = 0, exists = 0, sample = ''; const add = [];
  evs.slice(0, 400).forEach(e => {
    got++;
    if (!e || typeof e !== 'object') { noTitle++; if (!sample) sample = '[' + typeof e + ' U+' + String(e).charCodeAt(0).toString(16) + '] ' + String(e).slice(0, 70); return; }
    const title = String(pick(e, ['title', 'Title', 'כותרת'])).trim().slice(0, 200); if (!title) { noTitle++; if (!sample) sample = 'keys: ' + Object.keys(e).map(k => JSON.stringify(k)).join(',').slice(0, 90); return; }
    const notes = String(pick(e, ['notes', 'Notes'])).slice(0, 500);
    if (/#AI-\d+-/.test(notes)) { own++; return; }                            // our own events (from "📅 iPhone calendar") — never offer them back
    const start = ciDate_(pick(e, ['start', 'Start Date', 'startDate']), tz); if (!start) { badDate++; if (!sample) sample = String(pick(e, ['start', 'Start Date', 'startDate'])).slice(0, 60); return; }
    const cal = String(pick(e, ['calendar', 'Calendar'])).slice(0, 60);
    const ad = String(pick(e, ['allday', 'All Day', 'isAllDay'])).toLowerCase(); const allday = /^(1|true|yes|כן)$/.test(ad);
    let end = ciDate_(pick(e, ['end', 'End Date', 'endDate']), tz) || start;
    if (allday) end = (end > start ? end : start).slice(0, 10) + ' 23:59';
    if (end < now) { past++; return; }                                         // already over
    const id = hash_([ciNorm_(cal), ciNorm_(title), start.slice(0, allday ? 10 : 16)].join('|'), 'ci').slice(0, 16);
    total++;
    if (byId[id]) { exists++; return; }                                        // seen before (decided or still waiting)
    let decision = '';
    if (have[ciNorm_(title) + '|' + start.slice(0, 10)]) decision = 'exists';  // already in my items
    else if (ign.some(r => r.t === ciNorm_(title) && (!r.c || r.c === cal))) decision = 'ignored';
    if (!decision) fresh++;
    byId[id] = true;
    add.push([id, cal, title, start, end, allday ? 'yes' : '', String(pick(e, ['location', 'Location'])).slice(0, 200), notes, stamp, decision, decision ? stamp : '', '']);
  });
  if (add.length) { const rg = sh.getRange(sh.getLastRow() + 1, 1, add.length, CI_HEAD.length); rg.setNumberFormat('@'); rg.setValues(add); }   // plain text, so times are kept
  const P = PropertiesService.getScriptProperties(); P.setProperty('CAL_LASTIMPORT', new Date().toISOString());
  const waiting = ciRead_().filter(x => !x.decision && x.end >= now).length;
  P.setProperty('CAL_LASTRAW', JSON.stringify({ at: stamp, got: got, sample: sample, first: evs.length ? JSON.stringify(evs[0]).slice(0, 400) : String(req.events || '').slice(0, 400) }));
  let msg;
  if (!got) msg = 'לא התקבלו אירועים מהאייפון. בדוק שבפעולת חיפוש האירועים מופיע רק המסנן של 30 הימים, ושבשדה events נבחר "חזרה על תוצאות".';
  else if (badDate && badDate + noTitle + own === got) msg = 'התקבלו ' + got + ' אירועים, אבל התאריך לא בפורמט ISO 8601 (התקבל: "' + sample + '"). לחץ על הבועות "תאריך התחלה" ו"תאריך סיום" במילון › פורמט ISO 8601 › הפעל שעה.';
  else if (noTitle === got) msg = 'התקבלו ' + got + ' פריטים אבל בלי כותרת (דוגמה: ' + sample + '). בדוק במילון את השורה title.';
  else msg = (fresh ? 'נמצאו ' + fresh + ' אירועים חדשים — אפשר לבחור באפליקציה מה להוסיף.' : (waiting ? 'אין חדשים. ' + waiting + ' עדיין ממתינים להחלטה באפליקציה.' : 'אין אירועים חדשים ✓')) +
    ' (נבדקו ' + got + (exists ? ', כבר מוכרים ' + exists : '') + (past ? ', עברו ' + past : '') + (own ? ', של האפליקציה ' + own : '') + (badDate ? ', תאריך לא תקין ' + badDate : '') + ')';
  return { ok: true, fresh: fresh, waiting: waiting, total: total, got: got, ver: CI_VER, message: msg + ' · v' + CI_VER };
}
function calInbox_(all) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone(), now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  const list = ciRead_().filter(x => x.end >= now && (x.decision === '' || (all && (x.decision === 'skipped' || x.decision === 'ignored'))))
    .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 300).map(x => { const o = Object.assign({}, x); delete o._r; return o; });
  return { events: list, lastImport: PropertiesService.getScriptProperties().getProperty('CAL_LASTIMPORT') || '', ignore: ciIgnore_() };
}
function calDecide_(req) {
  const sh = ciSheet_(), all = ciRead_(), tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone(), stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  const set = (x, d, row) => { sh.getRange(x._r, 10, 1, 3).setNumberFormat('@').setValues([[d, stamp, String(row || '')]]); };
  const ids = Array.isArray(req.ids) ? req.ids.map(String) : [String(req.id)];
  let added = 0, skipped = 0;
  ids.forEach(id => {
    const x = all.find(e => e.id === id); if (!x) return;
    if (req.decision === 'add') {
      const it = Object.assign({ item: x.title, status: 'Not started', due: x.start.slice(0, 10), created: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), focal: 'Me' }, (req.items || {})[id] || req.item || {});
      if (!x.allday && !it.time) it.time = x.start.slice(11, 16);
      if (!x.allday && !it.hrs) { const h = (new Date(x.end.replace(' ', 'T')) - new Date(x.start.replace(' ', 'T'))) / 3600000; if (h > 0 && h <= 24) it.hrs = String(Math.round(h * 4) / 4); }
      if (!it.com) it.com = ['📆 ' + x.cal, x.location ? '📍 ' + x.location : ''].filter(Boolean).join(' · ');
      delete it.cal;                                                           // never send it back to the calendar
      const row = saveItem_(it); set(x, 'added', row); added++;
    } else { set(x, 'skipped'); skipped++; }
  });
  if (req.never && req.decision !== 'add') {                                   // "never offer events with this name"
    const x = all.find(e => e.id === ids[0]);
    if (x) {
      const ign = ciIgnore_(); const rule = { t: ciNorm_(x.title), c: req.never === 'calendar-only' ? x.cal : '', label: x.title };
      if (!ign.some(r => r.t === rule.t && r.c === rule.c)) { ign.push(rule); PropertiesService.getScriptProperties().setProperty('CAL_IGNORE', JSON.stringify(ign.slice(-200))); }
      all.filter(e => e.decision === '' && ciNorm_(e.title) === rule.t && e.id !== x.id).forEach(e => { set(e, 'ignored'); skipped++; });
    }
  }
  if (req.unignore !== undefined) {
    const ign = ciIgnore_().filter((r, i) => i !== Number(req.unignore)); PropertiesService.getScriptProperties().setProperty('CAL_IGNORE', JSON.stringify(ign));
  }
  const out = calInbox_(!!req.all); out.added = added; out.skipped = skipped;
  if (added) out.items = readAll_().items;
  return out;
}

/* =====================================================================
 *  Siri / iPhone Shortcuts: add an item by voice.
 *  The shortcut POSTs {action:'siriAdd', key, text, area} — it uses its own key, never your password.
 * ===================================================================== */
function siriKey_(reset) {
  const P = PropertiesService.getScriptProperties();
  let k = P.getProperty('SIRI_KEY');
  if (!k || reset) { k = 'sk_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); P.setProperty('SIRI_KEY', k); }
  return k;
}
const SIRI_HE_ = { 'בית': 'Home', 'עבודה': 'Work', 'אישי': 'Personal', 'תואר שני': 'M.Sc', 'תואר': 'M.Sc', 'מילואים': 'Reserve Duty', 'משפחה': 'Family', 'כספים': 'Finance', 'בריאות': 'Health' };
const SIRI_HINTS_ = {
  'Work': 'work report forecast budget capex opex cogs aop sap closing quarter audit invoice meeting presentation excel kpi manager ezra עבודה דוח דו"ח תחזית תקציב ישיבה פגישה מצגת סגירה רבעון ספק לקוח חשבונית פחת עלויות הכנסות מנהל עזרא',
  'Home': 'home house buy groceries shopping clean laundry fix repair plumber electrician bill garden kitchen neta בית קניות סופר לקנות לנקות ניקיון כביסה לתקן תיקון דוד אינסטלטור חשמלאי ארנונה חשבון מים חשמל גז גינה מטבח מקלחת נטע',
  'Personal': 'car insurance license haircut passport hobby book personal רכב ביטוח רישיון תספורת דרכון תחביב ספר אישי טסט מוסך',
  'M.Sc': 'thesis paper course exam lecture homework seminar advisor university research תזה מאמר קורס מבחן הרצאה תרגיל סמינר מנחה אוניברסיטה מחקר תואר',
  'Reserve Duty': 'reserve army base מילואים צו יחידה בסיס צבא',
  'Family': 'kids parents mom dad birthday family school ילדים הורים אמא אבא יומולדת משפחה ביקור גן סבתא סבא',
  'Finance': 'bank invest savings pension tax mortgage loan salary בנק להשקיע השקעה חיסכון פנסיה מס משכנתא הלוואה מניות משכורת תלוש',
  'Health': 'doctor dentist clinic appointment gym medicine pharmacy רופא רופאה שיניים קופת מרפאה תור אימון תרופה בדיקה'
};
function siriAdd_(req) {
  const key = PropertiesService.getScriptProperties().getProperty('SIRI_KEY') || '';
  if (!key || String(req.key || '') !== key) return { ok: false, message: 'המפתח של סירי לא נכון — העתק אותו שוב מהאפליקציה (☰ › סירי).' };
  const cache = CacheService.getScriptCache(), n = Number(cache.get('siri_n') || 0);
  if (n >= 60) return { ok: false, message: 'יותר מדי משימות בשעה האחרונה — נסה שוב מאוחר יותר.' };
  cache.put('siri_n', String(n + 1), 3600);
  let text = String(req.text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) return { ok: false, message: 'לא נאמרה משימה.' };
  const all = readAll_(), areas = all.areas || [];
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone(), fmt = (d) => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  // date words: today / tomorrow / the day after tomorrow (anything else → no date → Notebook)
  let due = '';
  const rules = [[/(^|\s)(מחרתיים|the day after tomorrow)(?=\s|$)/i, 2], [/(^|\s)(מחר|tomorrow)(?=\s|$)/i, 1], [/(^|\s)(היום|today)(?=\s|$)/i, 0]];
  for (const [re, add] of rules) { if (re.test(text)) { due = fmt(new Date(Date.now() + add * 86400000)); text = text.replace(re, ' ').replace(/\s+/g, ' ').trim(); break; } }
  // area: as chosen in the shortcut (English or Hebrew name), otherwise guessed from the words
  const norm = (x) => String(x || '').trim().toLowerCase();
  let area = '', a = norm(req.area);
  if (a && a !== 'auto' && a !== 'אוטומטי') {
    area = areas.find(x => norm(x) === a) || (SIRI_HE_[String(req.area).trim()] && areas.indexOf(SIRI_HE_[String(req.area).trim()]) >= 0 ? SIRI_HE_[String(req.area).trim()] : '');
  }
  if (!area) {
    const hints = areaHints_(), w = norm(text).replace(/["'׳״.,!?]/g, ' ').split(/\s+/).filter(x => x.length > 1);
    let best = '', score = 0;
    areas.forEach(ar => {
      const he = Object.keys(SIRI_HE_).filter(k => SIRI_HE_[k] === ar).join(' ');
      const bag = (String(SIRI_HINTS_[ar] || '') + ' ' + String(hints[ar] || '') + ' ' + ar + ' ' + he).toLowerCase().replace(/,/g, ' ').split(/\s+/);
      const sc = w.filter(x => bag.some(b => b && (b === x || (x.length > 3 && b.length > 3 && (x.indexOf(b) === 0 || b.indexOf(x) === 0))))).length;
      if (sc > score) { score = sc; best = ar; }
    });
    area = best || areas[0] || 'Home';
  }
  const heName = Object.keys(SIRI_HE_).find(k => SIRI_HE_[k] === area) || area;
  const when = due ? (due === fmt(new Date()) ? ' להיום' : ' ל-' + due.slice(8) + '/' + due.slice(5, 7)) : ' (בפנקס)';
  if (req.dry) return { ok: true, dry: true, message: 'יתווסף: ' + text + ' — ' + heName + when, item: text, area: area, due: due };
  const row = withLock_(() => saveItem_({ item: text, area: area, status: 'Not started', due: due, focal: 'Me' }));
  return { ok: true, row: row, message: 'נוסף: ' + text + ' — ' + heName + when };
}

/* ---------- "forgot password" requests (owner sends the password himself, e.g. on WhatsApp) ---------- */
function pwRequests_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('PW_REQUESTS') || '[]'); } catch (e) { return []; } }
function forgotPassword_(user) {
  user = cleanUser_(user); if (!user) return;
  const cache = CacheService.getScriptCache();
  const k = 'forgot_' + Utilities.base64EncodeWebSafe(user).slice(0, 40);
  const all = Number(cache.get('forgot_all') || 0);
  if (cache.get(k) || all >= 20) return;                     // max once per 10 min per user, 20 per hour overall
  cache.put(k, '1', 600); cache.put('forgot_all', String(all + 1), 3600);
  const g = guests_().find(x => cleanUser_(x.user) === user && x.on !== false);
  if (!g) return;
  const list = pwRequests_().filter(r => !(r.user === g.user && !r.handled));
  list.push({ id: Utilities.getUuid().slice(0, 8), guestId: g.id, user: g.user, name: g.name, at: new Date().toISOString(), handled: false });
  PropertiesService.getScriptProperties().setProperty('PW_REQUESTS', JSON.stringify(list.slice(-20)));
  const cfg = notifyConfig_();
  const title = '🔑 ' + g.name + ' forgot the password';
  const message = 'Username: ' + g.user + '\nOpen the app › 📥 to send the login on WhatsApp.';
  const ch = (cfg.onSuggest && cfg.onSuggest.channel) || 'push';
  if (ch === 'push' || ch === 'both') { try { pushNtfy_(cfg.topic, title, message, ['key'], 4); } catch (e) { console.error(e); } }
  if (ch === 'email' || ch === 'both') MailApp.sendEmail(Session.getEffectiveUser().getEmail(), title, message + '\n\n' + APP_URL);
}
