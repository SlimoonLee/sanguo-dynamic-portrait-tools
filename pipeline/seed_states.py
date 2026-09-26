# -*- coding: utf-8 -*-
"""Seed the browser tool's localStorage with auto-fit parameters for every
pending role, so each role opens pre-aligned — ready for manual refinement.

Writes: EXPORTADJ/autofit/localStorage_seed.json
  { "bg_state_v2_<role>": {fit, crop, halfBox, iconBox}, ... }
"""
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
from PIL import Image

ORIG = os.environ.get("SDPT_ORIG", r"D:\FORSANGUO\export\HeroCG\female")
NEW = os.environ.get("SDPT_NEW",  r"D:\FORSANGUO\export\HeroCG\female - 副本")
AUTOFIT = os.environ.get("SDPT_AUTOFIT", r"D:\FORSANGUO\export\EXPORTADJ\autofit")
CW, CH = 1000, 1400
DONE = {'宝菓', '鲍三娘', '卑弥呼', '步练师', '卞氏'}

def bbox_of(img, thr=16):
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.where(a > thr)
    if len(ys) == 0: return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())

states = {}
names = sorted(f[:-4] for f in os.listdir(NEW) if f.endswith('.png') and f[:-4] not in DONE)
ok, fail = 0, []
for name in names:
    try:
        orig = Image.open(os.path.join(ORIG, name + '.png')).convert('RGBA')
        new = Image.open(os.path.join(NEW, name + '.png')).convert('RGBA')
        fit = json.load(open(os.path.join(AUTOFIT, name, 'fit.json'), encoding='utf-8'))
        ob = bbox_of(orig); nb = bbox_of(new)
        fs = fit['scale']; fox, foy = fit['offset']
        fb = fit['fitted_char_bbox']
        sb = (fb[0], fb[1], fb[2], fb[3])
        # original face estimate: eyes at ~11.5% of char height from top, centered
        w = ob[2] - ob[0] + 1; h = ob[3] - ob[1] + 1
        eye_cx_orig = (ob[0] + ob[2]) / 2
        eye_y_from_top = h * 0.115
        # map through alignment: char-top aligned at fb[1], scale fs
        eye_cx_aligned = (sb[0] + sb[2]) / 2 + (eye_cx_orig - (ob[0] + ob[2]) / 2) * 1.0
        eye_cy_aligned = fb[1] + eye_y_from_top * fs
        eye_w = max(90, min(140, round(w * 0.24 * fs * 1.35)))
        # tool crop system: x=center, y=center measured from BOTTOM, w=h
        crop = {"x": round(eye_cx_aligned), "y": round(CH - eye_cy_aligned), "w": eye_w, "h": eye_w}
        # half box: covers head-to-knee of the aligned character
        char_h_aligned = (ob[3] - ob[1] + 1) * fs
        half_size = max(700, min(1200, round(char_h_aligned * 0.75)))
        half_cy = fb[1] + char_h_aligned * 0.42
        # icon box: face + neck
        icon_w = max(300, min(500, round(eye_w * 3.0)))
        icon_cy = eye_cy_aligned + eye_w * 0.9
        states["bg_state_v2_" + name] = {
            "fit": {"scale": round(fs, 5), "ox": fox, "oy": foy},
            "crop": crop,
            "halfBox": {"cx": int(eye_cx_aligned), "cy": int(half_cy), "size": half_size},
            "iconBox": {"cx": int(eye_cx_aligned), "cy": int(icon_cy), "w": icon_w},
        }
        ok += 1
    except Exception as e:
        fail.append((name, str(e)))

outp = os.path.join(AUTOFIT, 'localStorage_seed.json')
json.dump(states, open(outp, 'w', encoding='utf-8'), ensure_ascii=False)
print(f"seeded {ok} roles -> {outp}")
for f in fail[:8]:
    print("  FAIL:", f)
sample = sorted(states.keys())[0]
print("SAMPLE", sample, json.dumps(states[sample], ensure_ascii=False)[:300])
