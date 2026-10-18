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

> "Anyone" only means the URL can be reached — every request must carry your private key, otherwise it is refused.

### 3. Get your private key
In the sheet: **✉ Manager Report › App: show my private key** › copy it.

### 4. Connect the app
1. Open the app: `https://<your-username>.github.io/<repo>/`
2. Tap **⚙** › paste the **Web-app URL** and the **key** › **Connect**.
3. Repeat once on every device (the key is saved only on that device).

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
Apps Script › **Deploy › Manage deployments** › ✏ › Version: **New version** › Deploy (the URL stays the same).

## Security notes
- Keep the key private. If it leaks: sheet menu › **App: create a NEW key**, then re-enter it in the app.
- The app only writes the white input columns of the sheet; formulas are never touched.
