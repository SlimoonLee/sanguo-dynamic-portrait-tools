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

                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(art)));
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(data)));
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(half)));
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(icon)));

                File.Copy(Path.Combine(dir, "portrait_1000x1400.png"), Path.GetFullPath(art), true);
                File.Copy(Path.Combine(dir, "windmask_400x560.png"), Path.GetFullPath(mask), true);
                File.Copy(Path.Combine(dir, "data_patched.json"), Path.GetFullPath(data), true);
                File.Copy(Path.Combine(dir, "half_1024x1024.png"), Path.GetFullPath(half), true);
                File.Copy(Path.Combine(dir, "icon_260x340.png"), Path.GetFullPath(icon), true);
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

                ConfigureTexture(art,  true,  true, false);
                ConfigureTexture(mask, false, true, false);
                ConfigureTexture(half, true,  true, false, true);
                ConfigureTexture(icon, true,  true, false, true);

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

                names.AddRange(new[] { art, mask, wmat, data, half, icon });
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

    static void ConfigureTexture(string path, bool srgb, bool alpha, bool readable, bool sprite = false)
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
        importer.textureCompression = TextureImporterCompression.Uncompressed;
        importer.npotScale = TextureImporterNPOTScale.None;
        importer.maxTextureSize = 2048;
        importer.SaveAndReimport();
    }
}
