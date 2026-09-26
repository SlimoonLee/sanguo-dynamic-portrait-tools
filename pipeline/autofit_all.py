# -*- coding: utf-8 -*-
"""Auto-fit all pending improved portraits to the original composition.

Method (same as the verified 宝菓 fit):
  - character bbox from alpha channel
  - scale = original char height / improved char height
  - anchor bottom-center of character
  - paste onto 1000x1400 canvas
Writes:
  - EXPORTADJ/autofit/<role>/canvas_1000x1400.png
  - EXPORTADJ/autofit/<role>/fit.json  (scale/offset, for reference)
  - a side-by-side check sheet per role
"""
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
from PIL import Image

ORIG = os.environ.get("SDPT_ORIG", r"D:\FORSANGUO\export\HeroCG\female")
NEW = os.environ.get("SDPT_NEW",  r"D:\FORSANGUO\export\HeroCG\female - 副本")
OUT = os.environ.get("SDPT_AUTOFIT", r"D:\FORSANGUO\export\EXPORTADJ\autofit")
CW, CH = 1000, 1400
DONE = {'宝菓', '鲍三娘', '卑弥呼', '步练师', '卞氏'}
os.makedirs(OUT, exist_ok=True)

def bbox_of(img, thr=16):
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.where(a > thr)
    if len(ys) == 0: return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())

names = sorted(f[:-4] for f in os.listdir(NEW) if f.endswith('.png'))
done_list, fail_list = [], []
for name in names:
    if name in DONE: continue
    orig_p = os.path.join(ORIG, name + '.png')
    new_p = os.path.join(NEW, name + '.png')
    if not (os.path.isfile(orig_p) and os.path.isfile(new_p)):
        fail_list.append((name, 'missing files')); continue
    try:
        orig = Image.open(orig_p).convert('RGBA')
        new = Image.open(new_p).convert('RGBA')
        ob = bbox_of(orig); nb = bbox_of(new)
        if not ob or not nb:
            fail_list.append((name, 'empty alpha')); continue
        oh = ob[3] - ob[1] + 1
        nh = nb[3] - nb[1] + 1
        s = oh / nh
        sw, sh = round(new.width * s), round(new.height * s)
        scaled = new.resize((sw, sh), Image.LANCZOS)
        sb = bbox_of(scaled)
        target_cx = (ob[0] + ob[2]) / 2
        cur_cx = (sb[0] + sb[2]) / 2
        dx = round(target_cx - cur_cx)
        dy = round(ob[3] - sb[3])
        canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        canvas.paste(scaled, (dx, dy), scaled)
        fb = bbox_of(canvas)
        if fb[0] < -2 or fb[1] < -2 or fb[2] > CW + 2 or fb[3] > CH + 2:
            fail_list.append((name, f'overflow bbox {fb}')); continue
        rdir = os.path.join(OUT, name)
        os.makedirs(rdir, exist_ok=True)
        canvas.save(os.path.join(rdir, 'canvas_1000x1400.png'))
        sheet = Image.new('RGBA', (CW * 2 + 16, CH), (30, 30, 30, 255))
        sheet.paste(orig, (0, 0), orig)
        sheet.paste(canvas, (CW + 16, 0), canvas)
        sheet.thumbnail((900, 640))
        sheet.convert('RGB').save(os.path.join(rdir, '对位检查.png'))
        json.dump({"role": name, "scale": round(float(s), 5),
                   "offset": [int(dx), int(dy)],
                   "orig_char_bbox": list(ob), "fitted_char_bbox": [int(v) for v in fb]},
                  open(os.path.join(rdir, 'fit.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        done_list.append(name)
        print(f"{name}: s={s:.3f} off=({dx},{dy})")
    except Exception as e:
        fail_list.append((name, str(e)))

print(f"\nDONE: {len(done_list)} fitted, {len(fail_list)} failed")
for f in fail_list:
    print("  FAIL:", f)
json.dump({"ok": done_list, "fail": fail_list},
          open(os.path.join(OUT, '_report.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
