# -*- coding: utf-8 -*-
"""Generate the mod cover: 4x4 montage of finished portraits + title band."""
import os, sys
from PIL import Image, ImageDraw, ImageFont

WORK = os.environ.get("SDPT_WORK",  r"D:\FORSANGUO\export\EXPORTADJ\batch_work")
OUT = os.environ.get("SDPT_COVER", r"D:\FORSANGUO\batch_mod\动态立绘批量\_preview.jpg")
SIZE = 1254
COLS, ROWS = 4, 4
CELL = SIZE // COLS  # 313

# star roster first (if their prep exists), rest filled alphabetically
PREFERRED = ["貂蝉", "大乔", "小乔", "甄宓", "孙尚香", "黄月英", "祝融", "王元姬",
             "蔡琰", "吕姬", "关银屏", "董白", "步练师", "卞氏", "宝菓", "王异"]
preps = sorted(d[:-5] for d in os.listdir(WORK) if d.endswith("_prep"))
picked = [r for r in PREFERRED if r in preps]
for r in preps:
    if len(picked) >= COLS * ROWS: break
    if r not in picked: picked.append(r)

canvas = Image.new("RGB", (SIZE, SIZE), (16, 14, 12))
for idx, role in enumerate(picked[:COLS * ROWS]):
    p = os.path.join(WORK, role + "_prep", "portrait_1000x1400.png")
    im = Image.open(p).convert("RGB")
    # center-crop to square with a top bias so faces stay in frame
    w, h = im.size
    side = min(w, h)
    x0 = (w - side) // 2
    y0 = max(0, int((h - side) * 0.25))
    im = im.crop((x0, y0, x0 + side, y0 + side)).resize((CELL, CELL), Image.LANCZOS)
    canvas.paste(im, (idx % COLS * CELL, idx // COLS * CELL))

d = ImageDraw.Draw(canvas, "RGBA")
band_h = 230
d.rectangle([0, SIZE - band_h, SIZE, SIZE], fill=(10, 8, 6, 215))
title_font = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 78)
sub_font = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 40)
title = "原版女将动态立绘美化"
sub = "GPT 2.5 版本 · 130位女将 · 呼吸/布料摆动 全动态"
tw = d.textlength(title, font=title_font)
d.text(((SIZE - tw) / 2, SIZE - band_h + 28), title, font=title_font, fill=(240, 224, 190))
sw = d.textlength(sub, font=sub_font)
d.text(((SIZE - sw) / 2, SIZE - band_h + 132), sub, font=sub_font, fill=(212, 175, 120))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT, "JPEG", quality=88)
print("cover saved:", OUT, canvas.size, "roles:", picked)
