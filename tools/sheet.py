"""Contact sheets from tools/shoot.mjs output: one sheet per size (rows = pose
times, columns = normal/night/thermal, centre crop) and one for ground views.
    python3 tools/sheet.py <shotsDir>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

src = Path(sys.argv[1])
FILTERS = ['normal', 'night', 'thermal']
CROP = 760
CELL = 380


def label(img, text):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, len(text) * 7 + 8, 16], fill=(0, 0, 0))
    d.text((4, 2), text, fill=(230, 230, 230))


for size in ['small', 'medium', 'large', 'nuclear']:
    shots = sorted(src.glob(f'top-{size}-*-normal.png'))
    times = [p.name.split('-')[2] for p in shots]
    if not times:
        continue
    sheet = Image.new('RGB', (CELL * 3, CELL * len(times)), (20, 20, 20))
    for r, t in enumerate(times):
        for c, f in enumerate(FILTERS):
            im = Image.open(src / f'top-{size}-{t}-{f}.png').convert('RGB')
            w, h = im.size
            box = ((w - CROP) // 2, (h - CROP) // 2, (w + CROP) // 2, (h + CROP) // 2)
            cell = im.crop(box).resize((CELL, CELL), Image.LANCZOS)
            label(cell, f'{size} {int(t)} ms {f}')
            sheet.paste(cell, (c * CELL, r * CELL))
    sheet.save(src / f'sheet-top-{size}.png')

ground = sorted(src.glob('ground-*-normal.png'))
if ground:
    GW, GH = 640, 360
    sheet = Image.new('RGB', (GW * 2, GH * len(ground)), (20, 20, 20))
    for r, p in enumerate(ground):
        for c, f in enumerate(['normal', 'night']):
            q = src / p.name.replace('-normal', f'-{f}')
            cell = Image.open(q).convert('RGB').resize((GW, GH), Image.LANCZOS)
            label(cell, q.stem)
            sheet.paste(cell, (c * GW, r * GH))
    sheet.save(src / 'sheet-ground.png')
print('\n'.join(sorted(p.name for p in src.glob('sheet-*.png'))))
