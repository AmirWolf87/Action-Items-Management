# Action Items

A small personal app for Work / Home / Life action items.
It runs in any browser and can be installed on iPhone, iPad, Android and PC.
**Your data is not stored here** — it lives in your own Google Sheet; this repo only holds the app's code.

## One-time setup (≈10 minutes)

### 1. Add the script to your Google Sheet
1. Open your Action Items Google Sheet › **Extensions › Apps Script**.
2. Delete everything there, paste the contents of [`apps-script/ActionItems_Script.gs`](apps-script/ActionItems_Script.gs), click **Save**.
3. Reload the sheet. The **✉ Manager Report** menu appears.

### 2. Publish the script as a web app
1. In Apps Script: **Deploy › New deployment** › gear icon › **Web app**.
2. *Execute as*: **Me** · *Who has access*: **Anyone** › **Deploy**.
3. Approve the permissions (it's your own script) and **copy the Web app URL** (ends with `/exec`).

> "Anyone" only means the URL can be reached — every request must carry your app password, otherwise it is refused.
> After 10 wrong passwords the script blocks all logins for 15 minutes.

### 3. Choose your app password
Reload the sheet › **✉ Manager Report › App: set / change password** › type it twice (8+ characters).
It is stored only as a salted hash inside the script.

### 4. Open the app
1. Open `https://amirwolf87.github.io/Action-Items-Management/`
2. The first time on each device: paste the **Web-app URL** and your **password** › **Unlock**.
3. Tick **Remember on this device** to skip the password on your own phone/PC; leave it off on shared computers.
   The 🔒 button locks the app any time.

### 5. Install it like an app
- **iPhone / iPad (Safari):** Share › **Add to Home Screen**.
- **Android (Chrome):** ⋮ › **Install app**.
- **PC (Chrome / Edge):** install icon in the address bar.

## Using it
- **Focus** = overdue, today and this week. **All open**, **Waiting**, **Done** tabs; filter by Area; search.
- Tap **＋** to add; tap an item to edit; tap the circle to complete.
  Recurring items don't close — their due date moves to the next occurrence.
- **✉** builds the weekly report for your manager (Work items only): copy it formatted and paste into Outlook or Gmail.
- Everything you change appears in the Google Sheet (and the sheet's Dashboard / Manager Report) right away.

## If you change the script later
After pasting a new script version: Apps Script › **Deploy › Manage deployments** › ✏ › Version: **New version** › Deploy (the URL stays the same).

## Security notes
- The password is checked by your Google script, not by the web page — the app's public code contains no secrets.
- To change it: sheet menu › **App: set / change password**. Every device will then ask for the new one.
- The app only writes the white input columns of the sheet; formulas are never touched.
