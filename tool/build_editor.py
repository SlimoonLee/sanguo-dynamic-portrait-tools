# -*- coding: utf-8 -*-
"""Build the multi-role dynamic-portrait tuning tool (server-backed)."""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BG = os.path.dirname(os.path.abspath(__file__))  # serve.py serves this dir
JSZIP_SRC = open(os.path.join(BG, "jszip.min.js"), encoding="utf-8").read()
BODY = open(os.path.join(BG, "editor_body.js"), encoding="utf-8").read()

HEAD = r"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>动态立绘微调工具（多角色版）</title>
<style>
body{margin:0;background:#1c1c20;color:#ddd;font:13px/1.5 "Microsoft YaHei",sans-serif;display:flex;height:100vh}
#left{flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
#right{width:340px;overflow-y:auto;padding:10px 14px;background:#242429;border-left:1px solid #333}
canvas#view{background:#111;cursor:crosshair;max-height:98vh}
h3{margin:10px 0 4px;color:#eb5;font-size:14px;border-bottom:1px solid #3a3a40;padding-bottom:2px}
label{display:inline-block;margin:2px 6px 2px 0}
button{background:#3a5;border:0;color:#fff;padding:4px 12px;margin:3px 4px 3px 0;border-radius:3px;cursor:pointer}
button.gray{background:#556}
input[type=range]{vertical-align:middle;width:110px}
input[type=number]{width:64px;background:#111;color:#eee;border:1px solid #444;padding:2px 4px}
input[type=text]{background:#111;color:#eee;border:1px solid #444;padding:2px;width:100%;box-sizing:border-box}
select{background:#111;color:#eee;border:1px solid #444;padding:2px}
.row{margin:3px 0}
.layer{margin:4px 0}
.hint{color:#888;font-size:12px}
#exportOut{color:#7c7}
#swapBar,#fitPanel,#roleBar{position:absolute;left:50%;transform:translateX(-50%);display:flex;gap:6px;align-items:center;background:rgba(20,20,24,0.85);padding:5px 8px;border-radius:6px;border:1px solid #444;z-index:5}
#swapBar{top:8px}
#fitPanel{bottom:8px;display:none}
#roleBar{bottom:8px}
#roleSel{max-width:180px}
#brushSub{transition:opacity .2s}
</style>
</head>
<body>
<div id="left">
<canvas id="view" width="1000" height="1400"></canvas>
<canvas id="pvGL" width="1000" height="1400" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;pointer-events:none;max-height:98vh"></canvas>
<div id="swapBar">
<button id="btnBase" style="min-width:150px;background:#e95;color:#111;font-weight:bold">底图: 新立绘 [空格]</button>
<button class="gray" id="btnOnion" style="min-width:80px">叠影: 关</button>
<button id="btnFit" style="min-width:120px;background:#5af;color:#111;font-weight:bold">对位模式: 关</button>
<button id="btnImport" style="min-width:130px;background:#888;color:#fff">导入素材包</button>
<button id="btnPreview" style="min-width:130px;background:#7a5;color:#fff">动态预览: 关</button>
<canvas id="pvHalf" width="256" height="256" style="position:absolute;right:10px;top:70px;display:none;border:1px solid #666;background:#111;z-index:6" title="半身像预览"></canvas>
<canvas id="pvIcon" width="260" height="340" style="position:absolute;right:10px;top:340px;display:none;border:1px solid #666;background:#111;z-index:6" title="头像预览"></canvas>
</div>
<div id="fitPanel">
<label>新图不透明度 <input type="range" id="fitAlpha" min="20" max="100" value="70"></label>
<label>缩放 <input type="range" id="fitScale" min="30" max="200" value="95"></label>
<span id="fitInfo" style="margin-left:8px;color:#8f8"></span>
<button class="gray" id="btnFitReset">重置</button>
<button id="btnFitExport" style="background:#3a5">导出对位立绘 1000x1400</button>
<span class="hint">拖拽移动 · 滚轮缩放</span>
</div>
<div id="roleBar">
<span>角色:</span>
<select id="roleSel"><option>加载中…</option></select>
<span id="roleFlags" class="hint"></span>
</div>
</div>
<div id="right">
<h3>目录配置</h3>
<div class="row"><input type="text" id="cfgOrig"></div>
<div class="row"><input type="text" id="cfgNew"></div>
<div class="row"><input type="text" id="cfgRoles"></div>
<div class="row"><button class="gray" id="btnCfgSave">保存目录并刷新角色列表</button></div>

<h3>图层显示</h3>
<div class="layer"><label><input type="checkbox" id="lyPortrait" checked> 立绘</label>
<label><input type="checkbox" id="lyWind" checked> 原版RG遮罩</label>
<label>透明度 <input type="range" id="windAlpha" min="0" max="100" value="55"></label></div>
<div class="layer"><label><input type="checkbox" id="lyBones" checked> 骨骼点</label>
<label>大小 <input type="range" id="boneSize" min="2" max="14" value="5"></label></div>
<div class="layer"><label><input type="checkbox" id="lyCrop" checked> 原版眼区框</label>
<label><input type="checkbox" id="lyNewCrop" checked> 新眼区框(可拖)</label>
解读 <select id="cropMode"><option value="E" selected>E: 素材系(X左缘/Y顶缘)★已验证</option><option value="D">D: 素材系(X中心/Y顶缘)</option></select></div>
<div class="layer"><label><input type="checkbox" id="lyGrid"> 21x29网格</label></div>

<h3>新眼区框（当前工具=眼区框时拖拽）</h3>
<div class="row">X <input type="number" id="cx"> Y <input type="number" id="cy">
W <input type="number" id="cw"> H <input type="number" id="ch"></div>
<div class="hint">原版框: <span id="origCropTxt"></span>（新框已按模板匹配预置到新图眼位,可微调）</div>

<h3>半身像 / 头像框</h3>
<div class="layer"><label><input type="checkbox" id="lyHalf" checked> 半身框</label>
<span class="hint">源 1000x1000 → 导出 1024x1024</span></div>
<div class="layer"><label><input type="checkbox" id="lyIcon" checked> 头像框</label>
<span class="hint">源按 260:340 比例 → 导出 260x340</span></div>
<div class="hint">选中对应工具后拖拽移动、拖角或滚轮缩放。</div>

<h3>当前工具（互斥开关）</h3>
<div class="row">
<label><input type="radio" name="tool" value="crop" checked> 眼区框</label>
<label><input type="radio" name="tool" value="half"> 半身框</label>
<label><input type="radio" name="tool" value="icon"> 头像框</label></div>
<div class="row">
<label><input type="radio" name="tool" value="bone"> 骨骼编辑</label>
<label><input type="radio" name="tool" value="brush"> 遮罩画笔</label>
<label><input type="radio" name="tool" value="none"> 仅查看</label></div>

<h3>原版眨眼图集（3x3 九帧,非长条）</h3>
<div class="row"><img id="atlasPrev" style="width:170px;image-rendering:pixelated;border:1px solid #555;background:#222">
<span class="hint" style="display:inline-block;vertical-align:top;width:130px">播序(行优先): 睁→半闭→将闭→闭→闭→将闭→半闭→睁→睁<br>shader按_Cols=3/_Rows=3切格, 整帧缩放进眼区框显示。_FPS=14, 停留3s。</span></div>

<h3>RG遮罩画笔（400x560 分辨率编辑）</h3>
<div class="row" id="brushSub" style="opacity:0.35">
<label><input type="radio" name="brush" value="Y" checked> 黄=R+G(官方常用)</label>
<label><input type="radio" name="brush" value="R"> R=径向呼吸(红)</label>
<label><input type="radio" name="brush" value="G"> G=切向摆动(绿)</label>
<label><input type="radio" name="brush" value="E"> 擦除</label>
<label><input type="radio" name="brush" value="C"> 精确(R/G独立,取色用)</label></div>
<div class="row">笔刷 <input type="range" id="brushR" min="2" max="40" value="10">
力度 <input type="range" id="brushA" min="5" max="100" value="77"></div>
<div class="row"><button class="gray" id="btnUndo">撤回(Ctrl+Z)</button>
<button class="gray" id="btnRedo">重做(Ctrl+Y)</button>
<button class="gray" id="btnResetWind">恢复原版遮罩</button>
<button class="gray" id="btnClearWind">清空遮罩</button></div>
<div class="hint">遮罩通道: R=径向(呼吸式)形变强度, G=切向(布料摆动)强度。
黄色(R+G 同写)=官方布料区标准画法; 纯红=仅径向, 纯绿=仅切向。
方形硬边笔刷(与官方一致), 默认力度77%≈官方中位值196。<b>Ctrl+左键 = 取色</b>(对位模式下也有效; 官方橙色等 R/G 不等的区域会自动切到"精确"模式, 涂出来与原色一致)。Ctrl+Z 撤回 / Ctrl+Y 重做。</div>

<h3>骨骼编辑（609点 21x29 网格）</h3>
<div class="row"><span id="boneInfo" class="hint">点击网格点选中（骨骼工具下显示全部格点）</span></div>
<div class="row">y偏移 <input type="range" id="boneY" min="0" max="100" value="0">
<input type="number" id="boneYn" min="0" max="1" step="0.01" style="width:60px"></div>
<div class="row">x偏移 <input type="number" id="boneX" step="0.01" style="width:60px">
<button class="gray" id="btnBoneClear">清除此点</button></div>
<div class="hint">原版数据: x≈0, y=0.28~0.75(呼吸偏移), z≈0。清零=该点不振动。<br>Ctrl+点击多选 · Ctrl+C复制末选点 · Ctrl+V粘贴到所选点 · 方向键统一调y(Shift大步进,左右调x)</div>

<h3>眨眼参数（该角色原版值）</h3>
<div class="row">FPS <input type="number" id="pFps" step="1"> 停留 <input type="number" id="pPause" step="0.1">s</div>
<div class="row">MaskTop <input type="number" id="pMtop" step="0.01"> MaskBottom <input type="number" id="pMbot" step="0.01"></div>
<div class="row">Feather <input type="number" id="pFea" step="0.01"> SideFeather <input type="number" id="pSFea" step="0.01"></div>

<h3>风场参数（该角色原版值）</h3>
<div class="row">MaskThreshold <input type="number" id="wMt" step="0.01"> G_ <input type="number" id="wGmt" step="0.01"></div>
<div class="row">WindStrength <input type="number" id="wWs" step="0.05"> G_ <input type="number" id="wGws" step="0.05"></div>

<h3>导出</h3>
<div class="row"><button id="btnExpAll" style="background:#e95;color:#111;font-weight:bold;width:100%">★ 一键保存全部(ZIP: 立绘+遮罩+图集占位+半身+头像+网格数据+参数)</button></div>
<div id="exportOut"></div>
<p class="hint">导出文件名带角色名和时间戳。导入素材包可继续编辑。</p>
</div>
<input type="file" id="importFile" accept=".zip" style="display:none">
<script>
"""

TAIL = """
</script>
</body>
</html>
"""

FULL = HEAD + JSZIP_SRC + '\n</script>\n<script>\n' + BODY + '\n' + TAIL
out = os.path.join(BG, "动态立绘微调工具.html")
open(out, "w", encoding="utf-8").write(FULL)
print("written", out, f"{len(FULL)//1024} KB")
