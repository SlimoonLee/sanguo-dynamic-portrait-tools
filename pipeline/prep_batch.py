# -*- coding: utf-8 -*-
"""Prepare batch assets from exported role packs (one zip per role).

Usage:
  python prep_batch.py <pack.zip|rolename|latest> [more...]

Each arg resolves to pack(s):
  - explicit zip path
  - bare filename inside EXPORTADJ/cache
  - role-name prefix -> newest matching pack in cache
  - 'latest' -> newest pack per role in cache

Per pack: unzip, apply eye-region zero patch, extract official wind params,
then write a combined Hero.json patch + roles.txt for BatchModBuilder.
"""
import sys, io, os, json, zipfile, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

WORK = os.environ.get("SDPT_WORK",  r"D:\FORSANGUO\export\EXPORTADJ\batch_work")
OUT_MOD = os.environ.get("SDPT_OUT",   r"D:\FORSANGUO\batch_mod\动态立绘批量")
ROLES_DIR = os.environ.get("SDPT_ROLES", r"D:\FORSANGUO\roles")
GAME_HERO = os.environ.get("SDPT_HEROJSON", r"D:\SteamLibrary\steamapps\common\LegendOfHeros\ThreeKingdom_Data\StreamingAssets\Json\Hero.json")
CACHE = os.environ.get("SDPT_CACHE", r"D:\FORSANGUO\export\EXPORTADJ\cache")
os.makedirs(WORK, exist_ok=True)
os.makedirs(OUT_MOD, exist_ok=True)

roles = []

def resolve_packs(z):
    out = []
    cands = [z, os.path.join(CACHE, z)]
    for c in cands:
        if os.path.isfile(c):
            out.append(c)
            return out
    prefix = '' if z == 'latest' else z
    best = {}
    if os.path.isdir(CACHE):
        for f in os.listdir(CACHE):
            if not f.endswith('.zip'):
                continue
            r0 = f.split('_素材_')[0]
            if prefix and not r0.startswith(prefix):
                continue
            fp = os.path.join(CACHE, f)
            if r0 not in best or os.path.getmtime(fp) > os.path.getmtime(best[r0]):
                best[r0] = fp
    out.extend(best.values())
    return out

def process_pack(zpath):
    base = os.path.splitext(os.path.basename(zpath))[0]
    role = base.split("_素材_")[0]
    exdir = os.path.join(WORK, base)
    if os.path.isdir(exdir):
        shutil.rmtree(exdir)
    with zipfile.ZipFile(zpath) as zf:
        zf.extractall(exdir)
    files = {}
    for f in os.listdir(exdir):
        lf = f.lower()
        if "portrait" in lf:
            files["portrait"] = os.path.join(exdir, f)
        elif "windmask" in lf:
            files["mask"] = os.path.join(exdir, f)
        elif "half" in lf:
            files["half"] = os.path.join(exdir, f)
        elif "icon" in lf:
            files["icon"] = os.path.join(exdir, f)
        elif "data" in lf and f.endswith(".json"):
            files["data"] = os.path.join(exdir, f)
    missing = [k for k in ("portrait", "mask", "data", "half", "icon") if k not in files]
    if missing:
        print("SKIP (missing", missing, "):", role)
        return
    prep = os.path.join(WORK, role + "_prep")
    if os.path.isdir(prep):
        shutil.rmtree(prep)
    os.makedirs(prep)
    shutil.copy(files["portrait"], os.path.join(prep, "portrait_1000x1400.png"))
    shutil.copy(files["mask"], os.path.join(prep, "windmask_400x560.png"))
    shutil.copy(files["half"], os.path.join(prep, "half_1024x1024.png"))
    shutil.copy(files["icon"], os.path.join(prep, "icon_260x340.png"))
    d = json.load(open(files["data"], encoding="utf-8"))
    cleared = 0
    for i, p in enumerate(d["sortedWorldPositions"]):
        col, row = i % 21, i // 21
        if 5 <= col <= 15 and 4 <= row <= 14:
            if abs(p["x"]) > 1e-6 or abs(p["y"]) > 1e-6 or abs(p.get("z", 0)) > 1e-6:
                cleared += 1
            p["x"] = p["y"] = p["z"] = 0.0
    json.dump(d, open(os.path.join(prep, "data_patched.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    wp = {}
    try:
        om = json.load(open(os.path.join(ROLES_DIR, role, "orig_wind_mat.json"), encoding="utf-8"))
        wp = om.get("floats", {})
    except Exception:
        pass
    with open(os.path.join(prep, "wind_params.json"), "w", encoding="utf-8") as f:
        for k, v in wp.items():
            f.write(f"{k}={v}\n")
    roles.append((role, prep))
    print(f"{role}: prep done (eye patch cleared {cleared}, wind params {len(wp)})")

for z in sys.argv[1:]:
    for zpath in resolve_packs(z):
        process_pack(zpath)

if not roles:
    print("no valid packs")
    sys.exit(1)

hero_json = json.loads(open(GAME_HERO, encoding="utf-8").read(), strict=False)
patch = []
for h in hero_json:
    if h.get("icon") in [r for r, _ in roles]:
        h["icon"] = h["icon"] + "_D"
        patch.append(h)
hp = os.path.join(OUT_MOD, "Hero.json")
open(hp, "w", encoding="utf-8").write(json.dumps(patch, ensure_ascii=False, separators=(",", ":")))
print("Hero.json patch:", [(h['id'], h['icon']) for h in patch])

rl = os.path.join(OUT_MOD, "roles.txt")
with open(rl, "w", encoding="utf-8") as f:
    for role, prep in roles:
        f.write(f"{role}|{prep}\n")
print("roles.txt ->", rl)
print("DONE:", len(roles), "roles ready for BatchModBuilder")
