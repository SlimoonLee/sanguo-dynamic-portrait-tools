# -*- coding: utf-8 -*-
"""Local server for the tuning tool with caching disabled + role directory API.

Serves the directory this script lives in (tool html) on 127.0.0.1:8791.

API:
  /api/config                      -> configured directories (json)
  /api/roles                       -> role list with availability flags (json)
  /img/orig/<Role>.png             -> original portrait  (from ORIG_DIR)
  /img/new/<Role>.png              -> improved portrait  (from NEW_DIR)
  /role/<Role>/<file>              -> per-role original dynamic assets
                                      (orig_eyes.png / orig_wind.png / orig_data.json / orig_*_mat.json)

Directory layout expected (configurable below):
  ORIG_DIR = D:\FORSANGUO\export\HeroCG\female          (original 1000x1400 portraits)
  NEW_DIR  = D:\FORSANGUO\export\HeroCG\female - 副本   (improved portraits)
  ROLES    = D:\FORSANGUO\roles                          (per-role extracted triples)
"""
import http.server
import json
import os
import urllib.parse
import shutil
from pypinyin import lazy_pinyin

def pinyin_key(name):
    return lazy_pinyin(name)

PORT = 8791
BASE = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.join(BASE, 'server_config.json')

DEFAULT_CFG = {
    'orig_dir': r'D:\FORSANGUO\export\HeroCG\female',
    'new_dir': r"D:\FORSANGUO\export\HeroCG\female - 副本",
    'roles_dir': r'D:\FORSANGUO\roles',
}

def load_cfg():
    try:
        return json.load(open(CFG_PATH, encoding='utf-8'))
    except Exception:
        return dict(DEFAULT_CFG)

def save_cfg(cfg):
    json.dump(cfg, open(CFG_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=BASE, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def send_file_raw(self, path):
        if not os.path.isfile(path):
            self.send_json({'error': 'not found', 'path': path}, 404)
            return
        b = open(path, 'rb').read()
        ext = os.path.splitext(path)[1].lower()
        ctype = {'.png': 'image/png', '.json': 'application/json'}.get(ext, 'application/octet-stream')
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    # ---- configurable dirs (override with environment variables) ----
    ROOT      = os.environ.get('SDPT_ROOT',  r'D:\FORSANGUO')
    CACHE_DIR = os.environ.get('SDPT_CACHE', os.path.join(ROOT, 'export', 'EXPORTADJ', 'cache'))
    DONE_DIR  = os.environ.get('SDPT_DONE',  os.path.join(ROOT, 'export', 'EXPORTADJ', 'COMPLETED'))
    SEED_JSON = os.environ.get('SDPT_SEED',  os.path.join(ROOT, 'export', 'EXPORTADJ', 'autofit', 'localStorage_seed.json'))
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        cfg = load_cfg()
        if path == '/api/config':
            return self.send_json(cfg)
        if path == '/api/seed_states':
            seed_path = os.path.join(BASE, 'seed_states.json')
            try:
                data = json.load(open(seed_path, encoding='utf-8'))
                return self.send_json({'ok': True, 'states': data})
            except Exception as e:
                return self.send_json({'error': str(e)}, 500)
        if path == '/api/roles':
            orig = cfg['orig_dir']; new = cfg['new_dir']; roles = cfg['roles_dir']
            def pngs(d):
                try: return {f[:-4] for f in os.listdir(d) if f.lower().endswith('.png')}
                except Exception: return set()
            o, n = pngs(orig), pngs(new)
            allnames = sorted(o | n, key=pinyin_key)
            out = []
            for name in allnames:
                rd = os.path.join(roles, name)
                has_new = name in n
                has_data = os.path.isfile(os.path.join(rd, 'orig_data.json'))
                has_eyes = os.path.isfile(os.path.join(rd, 'orig_eyes.png'))
                has_wind = os.path.isfile(os.path.join(rd, 'orig_wind.png'))
                out.append({'name': name,
                            'hasOrig': name in o,
                            'hasNew': has_new,
                            'hasData': has_data,
                            'hasEyes': has_eyes,
                            'hasWind': has_wind,
                            'dynamicReady': has_data and has_eyes and has_wind})
            return self.send_json({'roles': out, 'cfg': cfg})
        if path.startswith('/img/orig/'):
            name = urllib.parse.unquote(path[len('/img/orig/'):])
            return self.send_file_raw(os.path.join(cfg['orig_dir'], name))
        if path.startswith('/img/new/'):
            name = urllib.parse.unquote(path[len('/img/new/'):])
            return self.send_file_raw(os.path.join(cfg['new_dir'], name))
        if path.startswith('/role/'):
            rest = urllib.parse.unquote(path[len('/role/'):])
            name, _, fname = rest.partition('/')
            if '/' in fname or '..' in fname or '..' in name:
                return self.send_json({'error': 'bad path'}, 400)
            return self.send_file_raw(os.path.join(cfg['roles_dir'], name, fname))
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/seed_states':
            seed_path = SEED_JSON
            try:
                data = json.load(open(seed_path, encoding='utf-8'))
                return self.send_json({'ok': True, 'states': data})
            except Exception as e:
                return self.send_json({'error': str(e)}, 500)
        if self.path == '/api/save_role':
            ln = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(ln) or b'{}')
            role = body.get('role', 'role')
            data_url = body.get('zip', '')
            if not data_url.startswith('data:application/zip'):
                return self.send_json({'error': 'bad payload'}, 400)
            import base64, time
            b64 = data_url.split(',', 1)[1]
            raw = base64.b64decode(b64)
            cache_dir = CACHE_DIR
            done_dir = DONE_DIR
            os.makedirs(cache_dir, exist_ok=True)
            os.makedirs(done_dir, exist_ok=True)
            ts = time.strftime('%Y%m%d_%H%M%S')
            name = role + '_素材_' + ts + '.zip'
            # keep only the newest per role in cache; COMPLETED keeps history
            for f in os.listdir(cache_dir):
                if f.startswith(role + '_素材_') and f.endswith('.zip'):
                    os.remove(os.path.join(cache_dir, f))
            open(os.path.join(cache_dir, name), 'wb').write(raw)
            shutil.copy(os.path.join(cache_dir, name), os.path.join(done_dir, name))
            return self.send_json({'ok': True, 'file': name})
        if self.path == '/api/config':
            ln = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(ln) or b'{}')
            cfg = load_cfg()
            for k in ('orig_dir', 'new_dir', 'roles_dir'):
                if body.get(k): cfg[k] = body[k]
            save_cfg(cfg)
            return self.send_json({'ok': True, 'cfg': cfg})
        return self.send_json({'error': 'unknown'}, 404)

    def log_message(self, fmt, *args):
        pass  # quiet

if __name__ == '__main__':
    if not os.path.isfile(CFG_PATH):
        save_cfg(DEFAULT_CFG)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'serving http://127.0.0.1:{PORT}/  (Ctrl+C to stop)')
    server.serve_forever()
