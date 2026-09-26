# 三国志动态立绘工具箱 (Sanguo Dynamic Portrait Tools)

为《英雄立志传：三国志》(Legend of Heros) 制作**动态立绘替换 MOD** 的全流程工具链：

- **浏览器端微调工具**（纯本地网页）：新立绘对位、RG 风场遮罩画笔（含取色/精确 R/G）、609 点网格骨骼编辑（多选/框选/复制粘贴/方向键批量调整）、半身·头像框、眨眼眼区框、GPU 实时预览（与游戏渲染一致的 Y 轴 / 骨骼振荡 / 风场近似）
- **批量打包管线**：素材包 → 眼区补丁 + 官方风场参数提取 + Hero.json 补丁 → Unity AssetBundle → 游戏 MODs 一键部署

> 本仓库**只包含工具与文档**，不含任何游戏素材、提取产物或成品 MOD。

## 原理摘要

详见 [docs/动态立绘系统解析报告.md](docs/动态立绘系统解析报告.md)。要点：

- 游戏 v1.0.1 的动态立绘 = **609 点网格顶点呼吸**（`DynamicCG/Data/<名>.json`）+ **RG 遮罩风场材质**（`Custom/LeafWindSwing_Final_Smooth_EdgeFix`，R=径向呼吸、G=切向摆动）+ **3×3 眨眼图集**（`Custom/JU/SequenceFrame_Blink_PS_Correct`，FPS=14 / 停留 3s）
- **fromMod 硬门**：立绘 Sprite 若在模组 bundle 中被查到 → `SetCG` 直接 `return false`，回退静态显示（官方刻意设计）
- **绕行通道（本工具链的核心）**：改 Hero.json 将武将 `icon` 指向新名（如 `貂蝉_D`），bundle **不放** `herocg/<新名>`，只提供 `dynamiccg/{windmaterial,data,eyes}/<新名>.*` 与**非 HeroCG 路径**的主图纹理——Sprite 查找落空（`sprite=null, fromMod=false`），动态管线照常，画面用风场材质自带的 `_MainTex` 渲染 → 换画 + 动态同时成立
- 副产品：只覆盖 `dynamiccg/<原名>` 三件套（不动 Hero.json、不放图）即可给**原版立绘**加呼吸/摆动，零风险

## 目录结构

```
tool/                     浏览器微调工具（serve.py 直接服务本目录）
  serve.py                本地服务器(8791)：角色列表 / 素材读取 / 一键保存入缓存 / 自动对位种子下发
  build_editor.py         把 editor_body.js + 模板 + jszip 构建成 动态立绘微调工具.html
  editor_body.js          工具全部前端逻辑
  jszip.min.js            JSZip v3.10.1 (MIT)
  启动服务.bat / 停止服务.bat
pipeline/
  prep_batch.py           素材包预处理：眼区零补丁、官方风场参数、合并 Hero.json 补丁、roles.txt
  BatchModBuilder.cs      Unity 编辑器脚本：按 roles.txt 构建单一 image_bbat bundle
  打包MOD.bat              一键：预处理 → Unity 构建 → 部署到游戏 MODs
  make_cover.py           生成 MOD 封面 (_preview.jpg 1254×1254)
  autofit_all.py          批量自动对位（按人体 bbox 高度 + 底部中心锚点），参数下发到浏览器缓存
  seed_states.py          把自动对位参数生成 localStorage 种子（仅未手动编辑过的角色生效）
docs/
  动态立绘系统解析报告.md     游戏动态立绘系统逆向分析（机制 / 数据格式 / mod 通道 / 门语义）
```

## 使用流程

0. **自备素材**（提取环节不在本仓库范围）：原版 1000×1400 立绘目录、AI 美化版目录，以及每个角色的原版动态三件套（`orig_data.json` / `orig_wind.png` / `orig_wind_mat.json` / `orig_eyes.png` / `orig_eyes_mat.json` / `orig_boxes.json`，放在 roles/<角色名>/ 下，`tool/serve.py` 按此约定读取）
1. **微调**：`tool/启动服务.bat` → 浏览器打开 <http://127.0.0.1:8791>
   - 对位模式：新立绘缩放/平移，原画 40% 底 + 遮罩 + 骨骼参考层
   - 遮罩画笔：方形硬边与官方一致；Ctrl+取色（R/G 不等区域自动精确模式）；对位模式下也可用
   - 骨骼编辑：点击/Ctrl 多选/拖动框选，Ctrl+C/V 复制粘贴，方向键批量调整
   - ★一键保存：打包 7 件套素材 zip 并写入服务器缓存（同角色以最新为准）
2. **打包**：`pipeline/打包MOD.bat`（拖入素材包 zip 或传 `latest`），内部执行：
   - `prep_batch.py`：解包、眼区零补丁（data rows 4-14 × cols 5-15，防胸口呼吸波及面部）、提取官方风场 float 参数、写合并 Hero.json 补丁
   - Unity `BatchModBuilder.Build`：构建单一 `image_bbat`（LZ4，贴图无损 RGBA32）
   - 自动部署到游戏 `MODs\` 并写 ModInfo.json / 封面
3. **游戏内**：重启游戏生效。开发工具的"选择MOD工程"列表读 `MODProjects\`，如需显示工程名与封面，按仓库 docs 说明放置 `DataInfo.json`(strProjectName) 与 `_preview.jpg`

## 路径配置

脚本默认值沿用作者的 Windows 目录布局（`D:\FORSANGUO\...`、游戏在 Steam 库），全部可用环境变量覆盖：
`SDPT_ROOT / SDPT_WORK / SDPT_CACHE / SDPT_DONE / SDPT_SEED / SDPT_ORIG / SDPT_NEW / SDPT_AUTOFIT / SDPT_HEROJSON / SDPT_OUT / SDPT_COVER / SDPT_ROLES / SDPT_PY / SDPT_UNITY / SDPT_PROJ / SDPT_MODS`
（`tool/serve.py` 的角色/素材目录也可在工具页面顶栏配置，存于 `server_config.json`。）

## 免责声明

- 仅供学习与个人研究使用，与游戏官方无关
- 本仓库不分发任何游戏提取素材；使用前请自备正版游戏并自行承担修改风险
- 反编译分析仅用于互操作性研究

## License

MIT —— 仓库内附第三方组件：JSZip v3.10.1 (MIT)
