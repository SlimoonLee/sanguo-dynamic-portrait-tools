@echo off
chcp 65001 >nul
setlocal
REM ============================================================
REM  动态立绘批量打包: 素材包 zip -> 游戏 MOD
REM  用法: 把要打包的素材包 zip 拖到本文件上 (可多选), 或命令行传参
REM        "latest" = 每个角色取缓存里最新的包
REM  以下路径可用环境变量覆盖 (SDPT_PY/UNITY/PROJ/OUT/MODS), 否则用默认值——
REM  默认值是作者本机布局, 请按需修改:
set PY=%SDPT_PY%
if "%PY%"=="" set PY=python
set UNITY=%SDPT_UNITY%
if "%UNITY%"=="" set UNITY=C:\Program Files\Unity\Hub\Editor\2021.3.45f2\Editor\Unity.exe
set PROJ=%SDPT_PROJ%
if "%PROJ%"=="" set PROJ=D:\FORSANGUO\hero-vow-portrait-prototype\UnityProject
set OUT=%SDPT_OUT%
if "%OUT%"=="" set OUT=D:\FORSANGUO\batch_mod\动态立绘批量
set MODS=%SDPT_MODS%
if "%MODS%"=="" set MODS=D:\SteamLibrary\steamapps\common\LegendOfHeros\MODs

if "%~1"=="" (
    echo 用法: 把素材包 zip 拖到本文件图标上 ^(可多选^)
    pause
    exit /b 1
)

echo [1/4] 预处理素材包 ^(眼区补丁 + 参数提取 + Hero.json^)...
"%PY%" "%~dp0prep_batch.py" %*
if errorlevel 1 (
    echo [FAIL] 预处理失败
    pause
    exit /b 1
)

echo [2/4] Unity 构建 bundle...
"%UNITY%" -batchmode -nographics -quit -projectPath "%PROJ%" -executeMethod BatchModBuilder.Build -logFile "%OUT%\unity-build.log"
if errorlevel 1 (
    echo [FAIL] Unity 构建失败, 日志: %OUT%\unity-build.log
    pause
    exit /b 1
)

echo [3/4] 部署到游戏 MODs...
set MODDIR=%MODS%\原版女将动态立绘美化GPT2.5版本
if exist "%MODDIR%" rmdir /s /q "%MODDIR%"
mkdir "%MODDIR%\AssetBundlesImage"
copy /y "%OUT%\AssetBundlesImage\image_bbat" "%MODDIR%\AssetBundlesImage\" >nul
copy /y "%OUT%\AssetBundlesImage\image_bbat.manifest" "%MODDIR%\AssetBundlesImage\" >nul
copy /y "%OUT%\Hero.json" "%MODDIR\" >nul
if exist "%OUT%\_preview.jpg" copy /y "%OUT%\_preview.jpg" "%MODDIR\" >nul
> "%MODDIR%\ModInfo.json" (
    echo [
    echo {
    echo "TKEditor":"20260923C",
    echo "Date":"%date:~0,4%-%date:~5,2%-%date:~8,2% %time:~0,8%",
    echo "Creator":"100",
    echo "name":"原版女将动态立绘美化GPT2.5版本",
    echo "remark":"使用GPT IMAGE 2.5美化的全女将，并手工对骨骼和风场进行了优化，没有做眨眼（这个需要等官方工具了，自制效果很差），但少个眨眼似乎观感影响不大。未做随机女将，因为每个都要手动核对骨骼风场等，工作量很大，后续我会开源相关工具，有兴趣者可自行完成。",
    echo "strIDEnd":"bbat"
    }
    echo ]
)

echo [4/4] 完成! MOD 已部署: %MODDIR%
echo        重启游戏后生效。
pause
