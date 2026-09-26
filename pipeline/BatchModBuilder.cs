using System;
using System.IO;
using UnityEditor;
using UnityEngine;

// Batch mod builder: reads roles.txt (written by tools/prep_batch.py),
// builds ONE bundle with all roles + the prepared Hero.json patch.
public static class BatchModBuilder
{
    const string OutRoot = @"D:\FORSANGUO\batch_mod";
    const string ModName = "动态立绘批量";
    const string Suffix = "bbat";
    // MODProjects overlay: the game's own dev-preview layer. When a project is
    // loaded (开发工具→选择MOD工程) its bundle is registered as the TOP lookup
    // layer WITHOUT the fromMod flag — so current-namespace sprites here feed
    // every static UI (舌战 etc.) while the main dynamic pipeline stays intact.
    const string ProjDir = @"D:\SteamLibrary\steamapps\common\LegendOfHeros\MODProjects\原版女将动态立绘美化GPT2.5版本";
    const string ProjBundleName = "image_pj01";

    [MenuItem("Tools/Build Project Overlay Bundle")]
    public static void BuildProjectBundle()
    {
        try
        {
            string rolesFile = Path.Combine(OutRoot, ModName, "roles.txt");
            if (!File.Exists(rolesFile)) throw new Exception("roles.txt not found: run tools/prep_batch.py first");
            var roles = new System.Collections.Generic.List<string[]>();
            foreach(var line in File.ReadAllLines(rolesFile)){
                if (string.IsNullOrWhiteSpace(line)) continue;
                var kv = line.Split('|');
                if (kv.Length == 2 && Directory.Exists(kv[1])) roles.Add(new[]{ kv[0], kv[1] });
            }
            if (roles.Count == 0) throw new Exception("no valid roles in roles.txt");

            var names = new System.Collections.Generic.List<string>();
            string bundleDir = Path.Combine(ProjDir, "AssetBundlesImage");
            Directory.CreateDirectory(bundleDir);

            var copied = new System.Collections.Generic.List<string>();
            foreach(var rd in roles)
            {
                string n = rd[0], dir = rd[1], sfx = n + "_D";
                string cg = "Assets/Resource/Image/HeroCG/Female/" + sfx + ".png";
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(cg)));
                File.Copy(Path.Combine(dir, "portrait_1000x1400.png"), Path.GetFullPath(cg), true);
                copied.Add(cg);
                Debug.Log("PROJECT ROLE: " + n);
            }
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            foreach(var cg in copied)
            {
                ConfigureTextureHQ(cg);
                names.Add(cg);
            }
            AssetDatabase.SaveAssets();

            var build = new AssetBundleBuild
            {
                assetBundleName = ProjBundleName,
                assetNames = names.ToArray()
            };
            var manifest = BuildPipeline.BuildAssetBundles(bundleDir, new[] { build },
                BuildAssetBundleOptions.ChunkBasedCompression, BuildTarget.StandaloneWindows64);
            if (manifest == null) throw new Exception("BuildAssetBundles returned null");
            Debug.Log("PROJECT OVERLAY BUILT: " + bundleDir + " roles=" + roles.Count);
        }
        catch (Exception ex)
        {
            Debug.LogError("PROJECT BUNDLE FAILED " + ex);
            throw;
        }
    }

    static void ConfigureTextureHQ(string path)
    {
        var importer = AssetImporter.GetAtPath(path) as TextureImporter;
        if (importer == null) throw new Exception("no importer: " + path);
        importer.textureType = TextureImporterType.Sprite;
        importer.spriteImportMode = SpriteImportMode.Single;
        importer.sRGBTexture = true;
        importer.alphaIsTransparency = true;
        importer.mipmapEnabled = false;
        importer.isReadable = false;
        importer.wrapMode = TextureWrapMode.Clamp;
        importer.filterMode = FilterMode.Bilinear;
        importer.textureCompression = TextureImporterCompression.CompressedHQ; // BC7, near-lossless
        importer.npotScale = TextureImporterNPOTScale.None;
        importer.maxTextureSize = 2048;
        importer.SaveAndReimport();
    }

    [MenuItem("Tools/Build Batch Mod")]
    public static void Build()
    {
        try
        {
            string rolesFile = Path.Combine(OutRoot, ModName, "roles.txt");
            if (!File.Exists(rolesFile)) throw new Exception("roles.txt not found: run tools/prep_batch.py first");
            var roles = new System.Collections.Generic.List<string[]>();
            foreach(var line in File.ReadAllLines(rolesFile)){
                if (string.IsNullOrWhiteSpace(line)) continue;
                var kv = line.Split('|');
                if (kv.Length == 2 && Directory.Exists(kv[1])) roles.Add(new[]{ kv[0], kv[1] });
            }
            if (roles.Count == 0) throw new Exception("no valid roles in roles.txt");

            var names = new System.Collections.Generic.List<string>();
            string bundleDir = Path.Combine(OutRoot, ModName, "AssetBundlesImage");
            Directory.CreateDirectory(bundleDir);

            foreach(var rd in roles)
            {
                string n = rd[0], dir = rd[1], sfx = n + "_D";
                string art   = "Assets/Resource/Image/DynamicCG/WindMaterial/" + sfx + "_art.png";
                string mask  = "Assets/Resource/Image/DynamicCG/WindMaterial/" + sfx + ".png";
                string wmat  = "Assets/Resource/Image/DynamicCG/WindMaterial/" + sfx + ".mat";
                string data  = "Assets/Resource/Image/DynamicCG/Data/" + sfx + ".json";
                string half  = "Assets/Resource/Image/HeroCGHalf/Female/" + sfx + ".png";
                string icon  = "Assets/Resource/Image/HeroIcon/Female/" + sfx + ".png";
                // legacy ("Old") namespaces: read by some UIs (e.g. the debate/舌战
                // scene) — these paths are NOT in LEOLIJNNIHL's candidate list, so
                // they never trip the main dynamic portrait's fromMod gate.
                string halfOld = "Assets/Resource/Image/HeroCGHalfOld/Female/" + sfx + ".png";
                string cgOld   = "Assets/Resource/Image/HeroCGOld/Female/" + sfx + ".png";
                string eyesTex = "Assets/Resource/Image/DynamicCG/Eyes/" + sfx + ".png";
                string eyesMat = "Assets/Resource/Image/DynamicCG/Eyes/" + sfx + ".mat";

                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(art)));
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(data)));
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(half)));
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(icon)));
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(halfOld)));
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(cgOld)));

                File.Copy(Path.Combine(dir, "portrait_1000x1400.png"), Path.GetFullPath(art), true);
                File.Copy(Path.Combine(dir, "windmask_400x560.png"), Path.GetFullPath(mask), true);
                File.Copy(Path.Combine(dir, "data_patched.json"), Path.GetFullPath(data), true);
                File.Copy(Path.Combine(dir, "half_1024x1024.png"), Path.GetFullPath(half), true);
                File.Copy(Path.Combine(dir, "icon_260x340.png"), Path.GetFullPath(icon), true);
                File.Copy(Path.Combine(dir, "half_1024x1024.png"), Path.GetFullPath(halfOld), true);
                File.Copy(Path.Combine(dir, "portrait_1000x1400.png"), Path.GetFullPath(cgOld), true);
                string eyesSrc = Path.Combine(dir, "eyesatlas_512x512.png");
                bool hasEyes = File.Exists(eyesSrc);
                if (hasEyes) File.Copy(eyesSrc, Path.GetFullPath(eyesTex), true);
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

                ConfigureTexture(art,  true,  true, false);
                ConfigureTexture(mask, false, true, false);
                ConfigureTexture(half, true,  true, false, true);
                ConfigureTexture(icon, true,  true, false, true);
                ConfigureTexture(halfOld, true,  true, false, true,  true);
                ConfigureTexture(cgOld,   true,  true, false, false, true);
                if (hasEyes) ConfigureTexture(eyesTex, true, true, false);

                var wm = new Material(AssetDatabase.LoadAssetAtPath<Shader>("Assets/Shaders/LeafWindSwing_Final_Smooth_EdgeFix.shader")) { name = sfx };
                var pj = ReadParams(Path.Combine(dir, "wind_params.json"));
                wm.SetTexture("_MainTex", AssetDatabase.LoadAssetAtPath<Texture2D>(art));
                wm.SetTexture("_MaskTex", AssetDatabase.LoadAssetAtPath<Texture2D>(mask));
                wm.SetFloat("_WindSpeed",     Pf(pj, "_WindSpeed", 3f));
                wm.SetFloat("_WindStrength",  Pf(pj, "_WindStrength", 0.25f));
                wm.SetFloat("_WindFreq",      Pf(pj, "_WindFreq", 1.2f));
                wm.SetFloat("_MaskThreshold", Pf(pj, "_MaskThreshold", 0.1f));
                wm.SetFloat("_G_WindSpeed",   Pf(pj, "_G_WindSpeed", 2.5f));
                wm.SetFloat("_G_WindStrength",Pf(pj, "_G_WindStrength", 0.2f));
                wm.SetFloat("_G_WindFreq",    Pf(pj, "_G_WindFreq", 3f));
                wm.SetFloat("_G_DirAngle",    Pf(pj, "_G_DirAngle", 75f));
                wm.SetFloat("_G_MaskThreshold", Pf(pj, "_G_MaskThreshold", 0.1f));
                wm.SetFloat("_RootFalloff",   Pf(pj, "_RootFalloff", 2f));
                wm.SetFloat("_RootFix",       Pf(pj, "_RootFix", 0.3f));
                wm.SetFloat("_NoiseScale",    Pf(pj, "_NoiseScale", 4f));
                wm.SetFloat("_NoisePower",    Pf(pj, "_NoisePower", 0.5f));
                wm.SetFloat("_UVGrid",        Pf(pj, "_UVGrid", 100f));
                wm.SetFloat("_GridSplit",     Pf(pj, "_GridSplit", 100f));
                wm.SetFloat("_GammaToLinearMask", Pf(pj, "_GammaToLinearMask", 1f));
                wm.SetFloat("_GammaConvertPower", Pf(pj, "_GammaConvertPower", 1.7f));
                wm.SetFloat("_GammaAmplitudeBoost", Pf(pj, "_GammaAmplitudeBoost", 1f));
                wm.SetFloat("_MasterWeight",  1f);
                AssetDatabase.CreateAsset(wm, wmat);

                // NOTE: eyes assets intentionally NOT bundled — SetCG disables the
                // eye renderer when the material is missing (clean face). Bundling
                // the placeholder atlas makes the overlay visible as a ghost patch.

                names.AddRange(new[] { art, mask, wmat, data, half, icon, halfOld, cgOld });
                Debug.Log("ROLE PREPARED: " + n);
            }

            AssetDatabase.SaveAssets();

            var Build = new AssetBundleBuild
            {
                assetBundleName = "image_" + Suffix,
                assetNames = names.ToArray()
            };
            var manifest = BuildPipeline.BuildAssetBundles(bundleDir, new[] { Build },
                BuildAssetBundleOptions.ChunkBasedCompression, BuildTarget.StandaloneWindows64);
            if (manifest == null) throw new Exception("BuildAssetBundles returned null");

            File.WriteAllText(Path.Combine(OutRoot, "build-result.txt"),
                "Built image_" + Suffix + " with " + roles.Count + " roles (Unity " + Application.unityVersion + ")");
            Debug.Log("BATCH MOD BUILT: " + bundleDir + " roles=" + roles.Count);
        }
        catch (Exception ex)
        {
            Debug.LogError("BATCH BUILD FAILED " + ex);
            throw;
        }
    }

    static System.Collections.Generic.Dictionary<string, float> ReadParams(string p)
    {
        var d = new System.Collections.Generic.Dictionary<string, float>();
        try{
            foreach(var line in File.ReadAllLines(p)){
                var kv = line.Split(new[]{'='}, 2);
                if(kv.Length == 2){
                    float f;
                    if(float.TryParse(kv[1].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out f))
                        d[kv[0].Trim()] = f;
                }
            }
        }catch{}
        return d;
    }
    static float Pf(System.Collections.Generic.Dictionary<string, float> j, string k, float dflt)
        => (j != null && j.ContainsKey(k)) ? j[k] : dflt;

    static void ConfigureTexture(string path, bool srgb, bool alpha, bool readable, bool sprite = false, bool legacy = false)
    {
        var importer = AssetImporter.GetAtPath(path) as TextureImporter;
        if (importer == null) throw new Exception("no importer: " + path);
        importer.textureType = sprite ? TextureImporterType.Sprite : TextureImporterType.Default;
        if (sprite) importer.spriteImportMode = SpriteImportMode.Single;
        importer.sRGBTexture = srgb;
        importer.alphaIsTransparency = alpha;
        importer.mipmapEnabled = false;
        importer.isReadable = readable;
        importer.wrapMode = TextureWrapMode.Clamp;
        importer.filterMode = FilterMode.Bilinear;
        // legacy-namespace duplicates only feed the old-art UIs; DXT5 keeps them
        // from doubling the bundle while the main art stays lossless RGBA32
        importer.textureCompression = legacy ? TextureImporterCompression.Compressed : TextureImporterCompression.Uncompressed;
        importer.npotScale = TextureImporterNPOTScale.None;
        importer.maxTextureSize = 2048;
        importer.SaveAndReimport();
    }
}
