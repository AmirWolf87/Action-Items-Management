#!/usr/bin/env python3
"""Builds 💡 Dump (dump/) from 🎯 Focus (the app at the repo root) — and then the public copies.

Orbit is split into two apps that share one code base, one Google Sheet, one script and one login:
  * Focus  — the root folder: tasks, Week, Waiting… and the 📒 Notebook (long-term items without a date)
  * Dump   — dump/: the 💡 Collection only (ideas, places, recipes, links…)
Only the root files are edited by hand. After changing them run, from the repo root:
    python3 tools/build_apps.py
It writes dump/, public/ (Focus for other people) and public/dump/.
"""
import os, re, shutil, json, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# warm colours for Dump's ring (Focus keeps the blue Orbit ring)
WARM = {'#5EEAF5': '#FFE27A', '#2F8BFF': '#FFA53D', '#2450F0': '#FF6A3D', '#3B5BFF': '#FF4F6E',
        '#C4B5FD': '#FFC2E2', '#9F7AFA': '#FF7AB8', '#5B3BF0': '#E23C8F', '#3730C8': '#B0266F',
        '#BFE3FF': '#FFE9B8', '#3B6BFF': '#FF8A3D', '#1E1B6B': '#5A0F2E'}
DUMP_THEME = '#7A1E4B'


def rd(p): return open(p, encoding='utf-8').read()


def wr(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write(s)


def must(s, a, b, count=1):
    assert s.count(a) >= count, 'build_apps: could not find ' + repr(a[:60])
    return s.replace(a, b)


def make_dump(src, out, icons_src):
    """src = a built Focus folder (root or public/), out = where Dump goes."""
    if os.path.isdir(out): shutil.rmtree(out)
    os.makedirs(out)
    for f in ('app.js', 'i18n.js', 'styles.css'):
        shutil.copy(os.path.join(src, f), os.path.join(out, f))
    os.makedirs(os.path.join(out, 'icons'))
    for f in os.listdir(icons_src):
        if f.endswith(('.png', '.svg')): shutil.copy(os.path.join(icons_src, f), os.path.join(out, 'icons', f))

    idx = rd(os.path.join(src, 'index.html'))
    idx = must(idx, '<title>Focus</title>', '<title>Dump</title>')
    idx = must(idx, 'name="apple-mobile-web-app-title" content="Focus"', 'name="apple-mobile-web-app-title" content="Dump"')
    idx = re.sub(r'<meta name="theme-color" content="[^"]*">', '<meta name="theme-color" content="' + DUMP_THEME + '">', idx, count=1)
    idx = must(idx, '<link rel="manifest"', '<script>window.ORBIT_APP = \'dump\'; document.documentElement.classList.add(\'app-dump\');</script>\n<link rel="manifest"')
    idx = must(idx, 'data-brand="name">FOCUS<', 'data-brand="name">DUMP<', 2)
    idx = must(idx, 'data-brand="tag">What matters.<br>Right now.<', 'data-brand="tag">Dump it here.<br>Sort it later.<')
    idx = must(idx, 'data-brand="tag1">What matters. Right now.<', 'data-brand="tag1">Dump it here. Sort it later.<')
    idx = must(idx, '<h1 id="screenTitle" class="no-i18n">Focus</h1>', '<h1 id="screenTitle" class="no-i18n">Dump</h1>')
    idx = idx.replace(' src="assets/focus/focus_idle_small.webp"', '')      # the focus timer lives in Focus only
    head, rest = idx.split('</defs></svg>', 1)          # recolour only the ring's gradients
    for a, b in WARM.items(): head = head.replace(a, b)
    wr(os.path.join(out, 'index.html'), head + '</defs></svg>' + rest)

    man = json.loads(rd(os.path.join(src, 'manifest.webmanifest')))
    man.update({'name': 'Dump', 'short_name': 'Dump', 'id': man.get('id', 'orbit') + '-dump', 'theme_color': DUMP_THEME, 'background_color': '#12040F'})
    wr(os.path.join(out, 'manifest.webmanifest'), json.dumps(man, ensure_ascii=False, indent=2))

    sw = rd(os.path.join(src, 'sw.js'))
    sw = re.sub(r"const CACHE = '([a-z-]+)-v", lambda m: "const CACHE = '" + m.group(1) + "-dump-v", sw, count=1)
    assert '-dump-v' in sw
    wr(os.path.join(out, 'sw.js'), sw)


if __name__ == '__main__':
    make_dump(ROOT, os.path.join(ROOT, 'dump'), os.path.join(ROOT, 'icons', 'dump'))
    print('dump/ built')
    # public/ is built from the root (Focus), then its own Dump next to it
    subprocess.check_call([sys.executable, os.path.join(ROOT, 'tools', 'build_public.py')])
    make_dump(os.path.join(ROOT, 'public'), os.path.join(ROOT, 'public', 'dump'), os.path.join(ROOT, 'icons', 'dump'))
    print('public/dump/ built')
