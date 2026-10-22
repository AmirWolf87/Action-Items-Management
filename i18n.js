/* Action Items — English / Hebrew interface.
   Exact-text dictionary: any interface text that matches a key is shown in Hebrew.
   Item titles, comments and the manager email are never translated. */
'use strict';
const HE = {
  // header, tabs, KPIs, groups
  'Action Items': 'משימות', 'Focus': 'פוקוס', 'Week': 'שבוע', 'All open': 'כל הפתוחות', 'Waiting': 'ממתין', 'Done': 'בוצע',
  'Overdue': 'באיחור', 'Today': 'היום', 'This week': 'השבוע', 'Next week': 'שבוע הבא', 'This month': 'החודש', 'Later': 'בהמשך',
  'No date': 'ללא תאריך', 'Done wk': 'בוצעו השבוע', 'Open': 'פתוחות', 'Completed': 'הושלמו', 'Waiting on others': 'ממתין לאחרים',
  'All': 'הכל', 'Search…': 'חיפוש…', 'Refresh': 'רענון', 'Menu': 'תפריט', 'Weekly report': 'דוח שבועי', 'Close': 'סגירה',
  'Add action item': 'הוספת משימה', 'Pending approvals': 'ממתינות לאישור', 'Suggestions waiting for approval': 'הצעות שממתינות לאישור',
  'Nothing overdue, due today or this week.': 'אין משימות באיחור, להיום או לשבוע הזה.',
  'Check "All open" for later items.': 'משימות מאוחרות יותר נמצאות ב"כל הפתוחות".', 'No items here.': 'אין כאן משימות.',
  'Your suggestions': 'ההצעות שלך',
  // areas / status / priority / recurrence
  'Work': 'עבודה', 'Home': 'בית', 'Personal': 'אישי', 'M.Sc': 'תואר שני', 'Reserve Duty': 'מילואים', 'Family': 'משפחה',
  'Finance': 'כספים', 'Health': 'בריאות',
  'Not started': 'טרם התחיל', 'In progress': 'בתהליך', 'Cancelled': 'בוטל',
  '1 - High': '1 - גבוהה', '2 - Medium': '2 - בינונית', '3 - Low': '3 - נמוכה', 'High': 'גבוהה', 'Medium': 'בינונית', 'Low': 'נמוכה',
  'None': 'ללא', 'Daily': 'יומי', 'Weekly': 'שבועי', 'Monthly': 'חודשי', 'Quarterly': 'רבעוני', 'Yearly': 'שנתי',
  // edit dialog
  'New action item': 'משימה חדשה', 'Edit action item': 'עריכת משימה', 'Action item': 'משימה', 'Status': 'סטטוס', 'Area': 'תחום',
  'Priority': 'עדיפות', 'Due date': 'תאריך יעד', 'Start time': 'שעת התחלה', 'Start time (24h)': 'שעת התחלה (24 שעות)', 'HH:MM': 'HH:MM', 'Topic': 'נושא', 'Focal / who': 'אחראי',
  'Recurring': 'חוזרת', 'Est. hours (duration)': 'שעות מוערכות (משך)', 'Done on': 'בוצע בתאריך', 'Actual hours': 'שעות בפועל',
  'Comments / next step': 'הערות / צעד הבא', '🔒 Private — never shown to guests': '🔒 פרטי — לא יוצג לאורחים',
  'Delete': 'מחיקה', 'Cancel': 'ביטול', 'Save': 'שמירה',
  // hours / confirm
  'Nice work! ✓': 'כל הכבוד! ✓', 'How many hours did it actually take?': 'כמה שעות זה לקח בפועל?', 'Skip': 'דלג',
  'Update the plan?': 'לעדכן את התכנון?', 'Check your estimate': 'בדוק את ההערכה',
  // settings / lock
  'Settings': 'הגדרות', 'Web-app URL': 'כתובת ה-Web app', 'Test in browser': 'בדיקה בדפדפן', 'Try demo data': 'נסה נתוני דמו',
  "The Web-app URL of your sheet's Apps Script (ends with /exec). Saved only on this device.": 'כתובת ה-Web app של הסקריפט בגיליון (מסתיימת ב-/exec). נשמרת רק במכשיר הזה.',
  '"Test in browser" should show {"ok":true,"app":"Action Items API"…}. A Google sign-in page means the deployment access isn\'t set to Anyone.':
    '"בדיקה בדפדפן" צריכה להציג {"ok":true,"app":"Action Items API"…}. דף התחברות של Google אומר שהגישה בפרסום אינה "Anyone".',
   'Web-app URL (first time on this device)': 'כתובת ה-Web app (בפעם הראשונה במכשיר)',
  'Password': 'סיסמה', 'Remember on this device': 'זכור במכשיר הזה', 'Unlock': 'כניסה', 'Change sheet URL': 'שינוי כתובת גיליון',
  'Try demo': 'נסה דמו', 'Checking…': 'בודק…',
  // menu
  'Phone notifications': 'התראות לטלפון', 'Sharing & guests': 'שיתוף ואורחים', 'Suggestions to approve': 'הצעות לאישור',
  'Other ingredients': 'מצרכים נוספים',
  "Choose areas": "בחירת תחומים", "All areas": "כל התחומים", "Show": "הצג", "New task": "משימה חדשה", "Search": "חיפוש", "Help": "עזרה", "Quick actions": "פעולות מהירות", "⇅ Order": "⇅ סדר", "Pick one or more areas — tasks, counts and the summary video follow your choice.": "בחר תחום אחד או יותר — המשימות, הספירות וסרטון הסיכום יתאימו לבחירה.", "Type naturally — the app picks up:": "כתוב חופשי — האפליקציה מזהה:", "Open the full editor ›": "לעורך המלא ›",
  "Overdue — one at a time": "באיחור — אחת אחת", "Focus time": "זמן פוקוס",
  "Weekly review": "סקירה שבועית",
  "What now?": "מה עכשיו?", "Daily start screen": "מסך פתיחה יומי",
  "🧭 First time? Set up your own copy": "🧭 פעם ראשונה? הקמת עותק משלך", "Set up your own copy": "הקמת עותק משלך", "Studies": "לימודים", "Sport": "ספורט", "Hobbies": "תחביבים",
  "Guided tour": "סיור מודרך",
  'Sheet connection': 'חיבור לגיליון', "Base": "בסיס", "Go to": "היכנס ל-", "✨ Smart reading (AI)": "✨ קריאה חכמה (AI)", "Smart reading (AI)": "קריאה חכמה (AI)", "With a free Google Gemini key, links are read by AI: a restaurant gets “name, city”, a trip gets the trail or spring name, an activity a short description — and YouTube videos are actually watched. Without a key, simpler rules are used.": "עם מפתח חינמי של Google Gemini, הקישורים נקראים ע\"י AI: מסעדה מקבלת \"שם, עיר\", טיול — שם המסלול או המעיין, פעילות — תיאור קצר, וסרטוני יוטיוב ממש נצפים. בלי מפתח משתמשים בכללים פשוטים יותר.", "and sign in with your Google account.": "והתחבר עם חשבון הגוגל שלך.", "Tap “Create API key” and copy it (starts with AIza).": "לחץ \"Create API key\" והעתק אותו (מתחיל ב-AIza).", "Paste it here and tap Save.": "הדבק אותו כאן ולחץ שמירה.", "Remove key": "הסר מפתח", "The key is kept only in your sheet’s script (never in the app). The free tier is plenty for personal use.": "המפתח נשמר רק בסקריפט של הגיליון שלך (לא באפליקציה). המכסה החינמית מספיקה בהחלט לשימוש אישי.", "Summary video": "סרטון סיכום", "Link (Instagram, TikTok, YouTube, Maps, website…)": "קישור (אינסטגרם, טיקטוק, יוטיוב, מפות, אתר…)", "📆 New in your calendars": "📆 חדש בלוחות השנה שלך", "Events from your iPhone calendars (yours and the shared ones). Choose what becomes a task — what you decline won’t be offered again.": "אירועים מלוחות השנה באייפון (שלך והמשותפים). בחר מה ייכנס למשימות — מה שתדחה לא יוצע שוב.", "🔄 Sync now": "🔄 סנכרן עכשיו", "↻ Refresh list": "↻ רענן רשימה", "One-time iPhone setup — the “Import calendar” shortcut": "הגדרה חד-פעמית באייפון — קיצור \"ייבוא יומן\"", "Import from calendar": "ייבוא מהיומן", "📍 Here": "📍 כאן", "For whom": "בשביל מי", "✨ Ideas — tap to add": "✨ רעיונות — לחץ כדי להוסיף", "💡 Collection:": "💡 אוסף:", "Rename, reorder or add categories. “Recommendations” have “tried it” and stars, “Wishes” have “for whom”, “Notes” are plain text. 🗺 = show on the map.": "שנה שם, סדר או הוסף קטגוריות. ב\"המלצות\" יש \"ניסינו\" וכוכבים, ב\"משאלות\" — בשביל מי, \"רשימות\" הן טקסט חופשי. 🗺 = הצגה במפה.", "Category": "קטגוריה", "Place": "מקום", "Recommended by": "המליץ/ה", "Link": "קישור", "Notes": "הערות", "☆ Want to try": "☆ רוצה לנסות", "✓ Tried": "✓ ניסינו", "Collection categories": "קטגוריות האוסף", "Rename, reorder or add categories. “Recommendations” have “tried it” and stars; “Notes” are plain text.": "שנה שם, סדר או הוסף קטגוריות. ב\"המלצות\" יש \"ניסינו\" וכוכבים; \"רשימות\" הן טקסט חופשי.", "＋ Add category": "＋ הוספת קטגוריה", "Tel Aviv, Galilee…": "תל אביב, גליל…", "📅 Add to iPhone calendar": "📅 להוסיף ליומן האייפון", "Give it a due date — only dated items go to the calendar.": "צריך תאריך יעד — רק משימות עם תאריך נכנסות ליומן.", "📅 iPhone calendar": "📅 יומן אייפון", "iPhone calendar": "יומן אייפון", "🎙 Add items with Siri": "🎙 הוספת משימות עם סירי", "Siri (add by voice)": "סירי (הוספה בקול)", "Order of areas": "סדר התחומים", "Drag ☰ (or use the arrows) to set the order. It applies to the area tabs on the main screen and in the Notebook.": "גרור את ☰ (או השתמש בחצים) כדי לקבוע את הסדר. הסדר חל על לשוניות התחומים במסך הראשי ובפנקס.", '📒 Notebook': '📒 פנקס', 'Font size': 'גודל גופן', "Sign up free at": "הירשם בחינם ב-", "Go to": "היכנס ל-", "› Access tokens › Create access token (no expiry).": "› Access tokens › Create access token (בלי תפוגה).", "🔑 ntfy account token": "🔑 טוקן חשבון ntfy", "Without an account, ntfy.sh limits messages per sending address — and Google's servers are shared by everyone, so the free daily limit is often already used up (\"429 limit reached\"). A free ntfy.sh account gives you your own limit:": "בלי חשבון, ntfy.sh מגביל הודעות לפי כתובת השולח, והשרתים של גוגל משותפים לכולם, כך שהמכסה היומית החינמית לרוב כבר נוצלה (\"429 limit reached\"). חשבון חינמי ב-ntfy.sh נותן לך מכסה משלך:", "Paste it here (starts with tk_) and press Save below.": "הדבק אותו כאן (מתחיל ב-tk_) ולחץ שמירה למטה.", "The phone app doesn't need to sign in — it stays subscribed to the same topic.": "אין צורך להתחבר באפליקציה בטלפון — היא נשארת רשומה לאותו נושא.", "If a push fails, send it to my email instead": "אם התראה לטלפון נכשלת, שלח אותה במקום זה למייל שלי", '📲 Test from this device': '📲 בדיקה מהמכשיר הזה', '🌐 See messages on ntfy.sh': '🌐 הצג הודעות ב-ntfy.sh', '🩺 Check status': '🩺 בדיקת מצב', 'Appearance': 'מראה', 'Auto': 'אוטומטי', 'Light': 'בהיר', 'Dark': 'כהה', 'Lock the app': 'נעילת האפליקציה',
  // report
  'Coming week': 'השבוע הבא', 'To (name)': 'אל (שם)', 'To (email)': 'אל (מייל)', 'Areas in the email:': 'תחומים במייל:',
  '📋 Copy formatted email': '📋 העתק מייל מעוצב', 'Outlook web': 'Outlook באינטרנט', 'Outlook app': 'אפליקציית Outlook', 'Gmail': 'Gmail',
  'Copy, open Outlook or Gmail (recipient and subject are filled in), click in the message body and paste (Ctrl+V / long-press › Paste).':
    'העתק, פתח את Outlook או Gmail (הנמען והנושא ממולאים), לחץ בגוף ההודעה והדבק (Ctrl+V / לחיצה ארוכה › הדבק).',
  // calendar export
  'Export week to Outlook': 'ייצוא השבוע ל-Outlook', 'Areas:': 'תחומים:', 'Give items without a start time a slot from 09:00': 'שבץ משימות ללא שעה החל מ-09:00',
  'Reminder 15 minutes before': 'תזכורת 15 דקות לפני', '⬇ Download .ics': '⬇ הורדת קובץ .ics', '📅 Export to Outlook': '📅 ייצוא ל-Outlook',
  'Outlook (PC): double-click the file › Save & Close / Import. Outlook web: Calendar › Add calendar › Upload from file. iPhone: tap the file › Add All.':
    'Outlook במחשב: לחיצה כפולה על הקובץ › שמירה וסגירה / ייבוא. Outlook באינטרנט: לוח שנה › הוספת לוח שנה › העלאה מקובץ. אייפון: הקש על הקובץ › הוסף הכל.',
  'Changes save to your sheet automatically · Undo reverses them': 'שינויים נשמרים לגיליון אוטומטית · ביטול מחזיר אותם',
  // notifications
  'One-time phone setup': 'הגדרה חד-פעמית בטלפון', 'Install the free': 'התקן את האפליקציה החינמית', 'app (App Store / Google Play).': '(App Store / Google Play).',
  'In ntfy tap': 'ב-ntfy לחץ', ', subscribe to this topic (server': ', הירשם לנושא הזה (שרת', ') and allow notifications:': ') ואשר התראות:',
  "The topic name works like a password for your notifications — don't share it.": 'שם הנושא משמש כמו סיסמה להתראות שלך — אל תשתף אותו.',
  'Copy': 'העתקה', 'Notification content': 'תוכן ההתראה', 'Show item titles': 'הצג את שמות המשימות', 'Counts only (more private)': 'מספרים בלבד (פרטי יותר)',
  'Schedules': 'תזמונים', '＋ Add schedule': '＋ הוספת תזמון', 'Test': 'בדיקה', '📱 Push': '📱 פוש', '✉ Email': '✉ מייל', 'Both': 'שניהם',
  // sharing
  "Guests open the same app with their own password. They only see the areas you choose, never items marked 🔒 Private, and can't change anything. If allowed, they can suggest items — you approve them in 📥.":
    'אורחים פותחים את אותה אפליקציה עם סיסמה משלהם. הם רואים רק את התחומים שבחרת, לעולם לא משימות שסומנו 🔒 פרטי, ולא יכולים לשנות דבר. אם תאפשר, הם יכולים להציע משימות — ואתה מאשר אותן ב-📥.',
  'Add a guest': 'הוספת אורח', 'Name': 'שם', 'Can see:': 'יכול לראות:', 'Can suggest new items (you approve them)': 'יכול להציע משימות (באישורך)',
  'Access active': 'גישה פעילה', 'Cancel edit': 'ביטול עריכה', 'Add guest': 'הוספת אורח', 'Save changes': 'שמירת שינויים',
  'e.g. Neta': 'למשל נטע', 'at least 6 characters': 'לפחות 6 תווים', 'leave empty to keep the current password': 'השאר ריק כדי לשמור את הסיסמה הנוכחית',
  '🔗 Invite': '🔗 הזמנה', 'Edit': 'עריכה', 'Remove': 'הסרה', 'No guests yet — add one below.': 'אין עדיין אורחים — הוסף למטה.',
  '✎ can suggest': '✎ יכול להציע', 'view only': 'צפייה בלבד',
  // approvals / suggestions
  'Due': 'יעד', 'Reject': 'דחייה', '✓ Approve & add': '✓ אישור והוספה', 'No suggestions waiting.': 'אין הצעות ממתינות.',
  'Suggest an action item': 'הצעת משימה', 'What needs doing?': 'מה צריך לעשות?', 'Comments': 'הערות',
  'It will be added after approval.': 'המשימה תתווסף לאחר אישור.', 'Send suggestion': 'שליחת הצעה',
  '⏳ Waiting for approval': '⏳ ממתין לאישור', '✓ Approved': '✓ אושר', '✕ Not approved': '✕ לא אושר',
  // toasts (exact)
  'Saved': 'נשמר', 'Added': 'נוסף', 'Deleted': 'נמחק', 'Done ✓': 'בוצע ✓', 'Copied ✓': 'הועתק ✓', 'Topic copied': 'הנושא הועתק',
  'Notification schedules saved': 'התזמונים נשמרו', 'Test sent — check your phone': 'נשלחה בדיקה — בדוק את הטלפון',
  'Approved ✓ — added to your list': 'אושר ✓ — נוסף לרשימה', 'Rejected': 'נדחה', 'Sent ✓ — it will appear once approved': 'נשלח ✓ — יופיע לאחר אישור',
  'Deleted — tap ↶ Undo to bring it back': 'נמחק — לחץ ↶ ביטול כדי להחזיר', 'Keep at least one area': 'השאר לפחות תחום אחד',
  'Demo mode — nothing is saved to your sheet': 'מצב דמו — דבר לא נשמר בגיליון', 'Nothing to export for these areas': 'אין מה לייצא בתחומים האלה',
  'Paste the Web-app URL first': 'הדבק קודם את כתובת ה-Web app', 'Wrong password': 'סיסמה שגויה',
  'Too many wrong attempts — try again in 15 minutes': 'יותר מדי ניסיונות שגויים — נסה שוב בעוד 15 דקות',
  // v11 additions
  'People': 'אנשים', 'Tomorrow': 'מחר', '+7': '+7', 'Checklist': "צ'קליסט", 'Add a step…': 'הוסף שלב…', '✉ Send a reminder': '✉ שלח תזכורת',
  'Quick add: tomorrow 9:30 Send forecast to Ezra !1 ~2h': 'הוספה מהירה: מחר 9:30 לשלוח תחזית לעזרא !1 ~2h',
  'Which area?': 'לאיזה תחום?', "I couldn't tell where this belongs:": 'לא הצלחתי לזהות לאיזה תחום זה שייך:',
  'Statistics': 'סטטיסטיקה', 'Outlook calendar sync': 'סנכרון ללוח השנה של Outlook', 'Archive & backup': 'ארכוב וגיבוי',
  'Subscribe once and your action items appear in Outlook as a separate "Action Items" calendar that updates by itself (Outlook refreshes subscribed calendars every few hours).':
    'נרשמים פעם אחת והמשימות מופיעות ב-Outlook כלוח שנה נפרד "Action Items" שמתעדכן לבד (Outlook מרענן לוחות מנויים כל כמה שעות).',
  "📋 Today's items": '📋 משימות היום', '📊 Weekly summary': '📊 סיכום שבועי', 'Add': 'הוספה', 'Defer to tomorrow': 'דחה למחר',
  'Suggestions from guests': 'הצעות מאורחים', 'Notify me when someone suggests a new item': 'שלח לי התראה כשמישהו מציע משימה חדשה',
  'Manage areas': 'ניהול תחומים', 'Add, rename, reorder or remove areas. Renaming updates all items, guests and schedules. The number shows open items in each area. Keywords help quick add recognise the area.':
    'הוסף, שנה שם, שנה סדר או מחק תחומים. שינוי שם מעדכן את כל המשימות, האורחים והתזמונים. המספר מציג משימות פתוחות בכל תחום. מילות מפתח עוזרות להוספה המהירה לזהות את התחום.',
  '＋ Add area': '＋ הוספת תחום', 'Move items': 'העברת משימות', 'Move & remove area': 'העבר ומחק את התחום', 'Up': 'למעלה', 'Down': 'למטה',
  'Username': 'שם משתמש', 'My account': 'החשבון שלי', 'New password (leave empty to keep)': 'סיסמה חדשה (השאר ריק כדי לא לשנות)',
  'Repeat new password': 'הקלד שוב את הסיסמה החדשה', 'e.g. neta': 'למשל neta', 'Generate': 'יצירה',
  'Wrong username or password': 'שם משתמש או סיסמה שגויים', 'Please sign in with your username and password': 'יש להתחבר עם שם משתמש וסיסמה',
  'That username is taken': 'שם המשתמש תפוס', 'Sign in to continue': 'התחבר כדי להמשיך',
  'Quick add': 'הקלדה מהירה', 'Type naturally — date, time, !1, @person, ~2h': 'כתוב חופשי — תאריך, שעה, !1, @אדם, ~2h',
  'tomorrow 9:30 Send forecast to Ezra !1 ~2h': 'מחר 9:30 לשלוח תחזית לעזרא !1 ~2h',
  'Forgot password?': 'שכחתי סיסמה', 'WhatsApp number (optional)': 'מספר וואטסאפ (לא חובה)', '💬 WhatsApp': '💬 וואטסאפ',
  'Read-only access': 'גישת צפייה בלבד', 'Loading…': 'טוען…', 'Saving…': 'שומר…', 'Sending…': 'שולח…'
};

const LANG_KEY = 'ai.lang';
let LANG = (() => { try { const v = localStorage.getItem(LANG_KEY); if (v) return JSON.parse(v); } catch (e) { /* ignore */ } return /^he\b/i.test(navigator.language || '') ? 'he' : 'en'; })();
const isHe = () => LANG === 'he';
const L = (en, he) => (isHe() ? he : en);                 // for texts with numbers/names inside
const tr = (s) => (isHe() && Object.prototype.hasOwnProperty.call(HE, s) ? HE[s] : s);
const locale = () => (isHe() ? 'he-IL' : 'en-GB');

const I18N_SKIP = 'script,style,textarea,code,.title,.note,.t,#repPreview,#repSubject,.no-i18n';
function skipText(node) {
  const el = node.parentElement;
  if (!el || el.closest(I18N_SKIP)) return true;
  if (el.tagName === 'OPTION' && !el.hasAttribute('value')) return true;   // option text = its value → never change
  return false;
}
function trTextNode(n) {
  if (skipText(n)) return;
  if (n.__en === undefined) {
    const key = n.nodeValue.trim();
    if (!key || !Object.prototype.hasOwnProperty.call(HE, key)) return;
    n.__en = n.nodeValue;
  }
  const key = n.__en.trim();
  n.nodeValue = isHe() ? n.__en.replace(key, HE[key]) : n.__en;
}
function trAttrs(el) {
  ['placeholder', 'title', 'aria-label'].forEach(a => {
    if (!el.hasAttribute || !el.hasAttribute(a)) return;
    el.__enA = el.__enA || {};
    if (el.__enA[a] === undefined) { const v = el.getAttribute(a); if (!Object.prototype.hasOwnProperty.call(HE, v)) return; el.__enA[a] = v; }
    el.setAttribute(a, isHe() ? HE[el.__enA[a]] : el.__enA[a]);
  });
}
function translateTree(root) {
  if (root.nodeType === 3) { trTextNode(root); return; }
  if (root.nodeType !== 1) return;
  trAttrs(root);
  root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(trAttrs);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) trTextNode(n);
}
function applyDir() {
  document.documentElement.lang = isHe() ? 'he' : 'en';
  document.documentElement.dir = isHe() ? 'rtl' : 'ltr';
  document.querySelectorAll('.lang-btn').forEach(b => { b.textContent = isHe() ? 'EN' : 'עב'; b.title = isHe() ? 'Switch to English' : 'החלף לעברית'; });
}
function setLang(l) {
  LANG = l === 'he' ? 'he' : 'en';
  try { localStorage.setItem(LANG_KEY, JSON.stringify(LANG)); } catch (e) { /* ignore */ }
  applyDir(); translateTree(document.body);
  if (typeof render === 'function') render();
  if (typeof load === 'function' && typeof lockEl !== 'undefined' && lockEl.hidden && typeof settings !== 'undefined' && (settings.demo || settings.url)) load(true);
}
new MutationObserver(muts => {
  if (!isHe()) return;
  muts.forEach(m => m.addedNodes.forEach(translateTree));
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', () => { applyDir(); translateTree(document.body); });
