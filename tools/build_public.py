#!/usr/bin/env python3
"""Builds the public edition (public/) from the personal app at the repo root.

The personal app stays exactly as it is. The public copy:
  * runs with window.AI_EDITION = 'public' (setup wizard, drawn focus character)
  * keeps its own storage keys ('aip.*') and its own offline cache, so both can live on one device
  * has no personal names or settings, and ships a clean Apps Script for people's own sheets
Run from the repo root:  python3 tools/build_public.py
"""
import os, re, shutil, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public')
PUBLIC_URL = 'https://amirwolf87.github.io/Action-Items-Management/public/'
TEMPLATE_URL = os.environ.get('AI_TEMPLATE', '')   # e.g. https://docs.google.com/spreadsheets/d/<id>/copy

def rd(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
def wr(p, s):
    full = os.path.join(OUT, p); os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, 'w', encoding='utf-8').write(s)

# names and settings that belong to the original owner only
PERSONAL = [
    ('Send forecast to Ezra', 'Send the report to Dana'), ('לשלוח תחזית לעזרא', 'לשלוח את הדוח לדנה'),
    ("L('Ezra', 'עזרא')", "L('Dana', 'דנה')"), ("|| 'Ezra'", "|| ''"), ("|| 'Amir Wolf'", "|| ''"),
    ("L('Neta', 'נטע')", "L('My partner', 'בן/בת הזוג')"), ('e.g. Neta', 'e.g. Dana'), ('למשל נטע', 'למשל דנה'),
    (' manager ezra ', ' manager '), (' מנהל עזרא', ' מנהל'), (' neta בית', ' בית'), (' שכירות נטע', ' שכירות'),
    ('amirwolf87.github.io', 'action-items'),
]
def depersonalize(s):
    for a, b in PERSONAL: s = s.replace(a, b)
    return s
def own_storage(s):   # 'ai.x' → 'aip.x' (localStorage / sessionStorage keys)
    return re.sub(r"(['\"])ai\.(?=[a-zA-Z])", r"\1aip.", s)

if os.path.isdir(OUT): shutil.rmtree(OUT)
os.makedirs(OUT)

app = own_storage(depersonalize(rd('app.js')))
wr('app.js', app)
wr('i18n.js', own_storage(depersonalize(rd('i18n.js'))))
wr('styles.css', rd('styles.css'))

idx = own_storage(depersonalize(rd('index.html')))
idx = idx.replace('<script src="i18n.js', '<script>window.AI_EDITION = \'public\'; window.AI_TEMPLATE = ' + json.dumps(TEMPLATE_URL) + ';</script>\n<script src="i18n.js', 1)
idx = idx.replace('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="manifest.webmanifest">\n<meta name="robots" content="noindex">', 1)
wr('index.html', idx)

man = json.loads(rd('manifest.webmanifest')); man['id'] = 'action-items-public'
wr('manifest.webmanifest', json.dumps(man, ensure_ascii=False, indent=2))

sw = rd('sw.js').replace("const CACHE = 'action-items-v", "const CACHE = 'action-items-public-v")
wr('sw.js', sw)

for f in os.listdir(os.path.join(ROOT, 'icons')):
    os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True); shutil.copy(os.path.join(ROOT, 'icons', f), os.path.join(OUT, 'icons', f))

gs = rd('apps-script/ActionItems_Script.gs')
gs = gs.replace("const APP_URL = 'https://amirwolf87.github.io/Action-Items-Management/';", "const APP_URL = '" + PUBLIC_URL + "';")
gs = gs.replace("const EDITION = 'personal';", "const EDITION = 'public';")
gs = re.sub(r"const CAL_DEFAULT_NAMES_ = \[[^\]]*\];", "const CAL_DEFAULT_NAMES_ = [];", gs)
gs = depersonalize(gs).replace(' עזרא', '').replace(' נטע', '').replace(' ezra', '').replace(' neta', '')
assert "EDITION = 'public'" in gs and 'amirwolf' not in gs.split('APP_URL')[0]
wr('ActionItems_Script.gs', gs)

wr('README.md', """# Action Items — your own copy

Open **""" + PUBLIC_URL + """** and tap **🧭 First time? Set up your own copy** on the sign-in screen.
The wizard walks you through it (about 10 minutes, best on a computer):

1. A Google Sheet of your own (in your Google Drive).
2. Paste the script (`ActionItems_Script.gs`) into *Extensions › Apps Script* and save.
3. *Deploy › New deployment › Web app* — Execute as **Me**, Who has access **Anyone** — and authorize.
4. Paste the Web-app URL in the wizard, choose a username, password and your areas.

Your tasks stay in your sheet. Nobody else can read them.
""")
print('public/ built', 'template' if TEMPLATE_URL else '(no template link yet)')
