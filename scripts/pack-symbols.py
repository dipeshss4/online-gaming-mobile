"""
Lays the 3D renders from scripts/render-symbols.py out into the symbol sheets the games draw from.

    python3 scripts/pack-symbols.py <render-dir>

The classic sheet is 3x3 cells of 418px in the order the games index it (7, BAR, CHERRY / LEMON, BELL, GRAPE /
ORANGE, WATERMELON, STAR) and is written to both the app's and the website's copy. Devil Heart's symbols are
written one image each (they are drawn at different shapes on the website), to assets/devil/ and public/art/devil/.
"""
import os, sys
from PIL import Image

RENDERS = sys.argv[1] if len(sys.argv) > 1 else 'renders'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLASSIC = ['7', 'BAR', 'CHERRY', 'LEMON', 'BELL', 'GRAPE', 'ORANGE', 'WATERMELON', 'STAR']
CELL = 418

def sheet(names, columns, cell):
    rows = (len(names) + columns - 1) // columns
    out = Image.new('RGBA', (columns * cell, rows * cell), (0, 0, 0, 0))
    for i, name in enumerate(names):
        art = Image.open(os.path.join(RENDERS, f'{name}.png')).convert('RGBA').resize((cell, cell), Image.LANCZOS)
        out.paste(art, ((i % columns) * cell, (i // columns) * cell), art)
    return out

classic = sheet(CLASSIC, 3, CELL)
for target in ('assets/web/slot-symbols.png', '../frontend/public/art/slot-symbols.png'):
    path = os.path.join(ROOT, target)
    classic.save(path, optimize=True); print('wrote', os.path.relpath(path, ROOT), os.path.getsize(path) // 1024, 'KB')

def trimmed(path, longest=384, margin=.04):
    """The render cut to its visible art (plus a small margin), so it fills whatever shape of cell it is drawn in."""
    art = Image.open(path).convert('RGBA')
    box = art.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    pad = int(max(box[2] - box[0], box[3] - box[1]) * margin)
    art = art.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(art.width, box[2] + pad), min(art.height, box[3] + pad)))
    scale = longest / max(art.size)
    return art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)

DEVIL = ['SEVEN', 'BAR1', 'BAR2', 'BAR3', 'WILD', 'X2', 'JACKPOT']
for target in ('assets/devil', '../frontend/public/art/devil'):
    folder = os.path.join(ROOT, target); os.makedirs(folder, exist_ok=True)
    for name in DEVIL:
        art = trimmed(os.path.join(RENDERS, f'DH_{name}.png'))
        art.save(os.path.join(folder, f'{name}.png'), optimize=True)
    print('wrote', target, sum(os.path.getsize(os.path.join(folder, f)) for f in os.listdir(folder)) // 1024, 'KB')

VIDEO = ['WILD', 'SCATTER']
for target in ('assets/video', '../frontend/public/art/video'):
    folder = os.path.join(ROOT, target); os.makedirs(folder, exist_ok=True)
    for name in VIDEO:
        art = trimmed(os.path.join(RENDERS, f'VS_{name}.png'))
        art.save(os.path.join(folder, f'{name}.png'), optimize=True)
    print('wrote', target)

FIRE = ['FIRE', 'MINI', 'MINOR', 'MAJOR']
for target in ('assets/firelink', '../frontend/public/art/firelink'):
    folder = os.path.join(ROOT, target); os.makedirs(folder, exist_ok=True)
    for name in FIRE:
        trimmed(os.path.join(RENDERS, f'FB_{name}.png'), 320).save(os.path.join(folder, f'{name}.png'), optimize=True)
    print('wrote', target)

LUXURY = ['YACHT', 'JET', 'LIMO', 'RING', 'WATCH', 'GOLD', 'COIN', 'SILVER', 'DOUBLE']
for target in ('assets/luxury', '../frontend/public/art/luxury'):
    folder = os.path.join(ROOT, target); os.makedirs(folder, exist_ok=True)
    for name in LUXURY:
        trimmed(os.path.join(RENDERS, f'LX_{name}.png'), 320).save(os.path.join(folder, f'{name}.png'), optimize=True)
    print('wrote', target)
