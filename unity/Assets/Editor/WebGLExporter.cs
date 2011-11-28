/*
Based on EditorObjExporter.cs, exports meshes from Unity to a WebGL-friendly format
*/

using UnityEngine;
using UnityEditor;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System;
using System.Text.RegularExpressions;

using Antlr.StringTemplate;
using Antlr.StringTemplate.Language;

struct WebGLPropInstance
{
	public Vector3 pos;
    public Quaternion rot;
	public float scale;
	public int lightmapId;
	public Vector2 lightmapScale;
	public Vector2 lightmapOffset;
}

struct WebGLProp
{
	public string modelPath;
	public List<WebGLPropInstance> instances;
}

struct WebGLLevel
{
	public string name;
	public string[] lightmaps;
	public List<WebGLProp> props;	
}

struct WebGLMesh
{
    public UInt16 indexOffset;
    public UInt16 indexCount;
    public int boneOffset;
    public int boneCount;
}

struct WebGLModel
{
    public Material material;
    public string materialPath;
    public string defaultTexture;
    public List<WebGLMesh> meshes;
}

struct WebGLBone
{
    public Transform originalBone;
    public int originalId;
    public int id;
    public int parent;
    public string name;
    public Vector3 pos;
    public Quaternion rot;
    public float[] bindPoseMat;
    public string skinned;
}

struct WebGLBoneKeyframe
{
    public Vector3 pos;
    public Quaternion rot;
}

struct WebGLAnimatedBone
{
    public string bone;
    public WebGLBoneKeyframe[] keyframes;
}

struct WebGLKeyframe
{
    public int id;
    public List<WebGLBoneKeyframe> bones;
}

class BoneComparer : IComparer<WebGLBone> {
    public int Compare (WebGLBone x, WebGLBone y)
    {
        int xParentCount = 0;
        int yParentCount = 0;
        
        Transform parent = x.originalBone;
        while(parent != null) {
            xParentCount++;
            parent = parent.parent;
        }
        
        parent = y.originalBone;
        while(parent != null) {
            yParentCount++;
            parent = parent.parent;
        }

        return xParentCount - yParentCount;
    }
}

[Flags]
enum VertexFormat {
    Position = 0x0001,
    UV = 0x0002,
    UV2 = 0x0004,
    Normal = 0x0008,
    Tangent = 0x0010,
    Color = 0x0020,
    BoneWeights = 0x0040,
}

public class WebGLExporter : ScriptableObject
{
    //User should probably be able to change this. It is currently left as an excercise for
    //the reader.
    private static string modelFolder = "WebGLExport/model";
    private static string textureFolder = "WebGLExport/texture";
	private static string levelFolder = "WebGLExport/level";
    public static string templatePath = Application.dataPath + "/Editor/WebGL/WebGLExportTemplates/";
    private static UInt32 vertBinaryVersion = 1;
	
	private static Dictionary<string, Texture> exportedTextures = new Dictionary<string, Texture>();

    private static void WriteMeshBinary(Mesh mesh, VertexFormat vertexFormat, Material[] materials, int[] boneIdLookup, Stream outStream, out Dictionary<Material, WebGLModel> models) 
    {
        int i, j;
        
        Dictionary<string, MemoryStream> lumps = new Dictionary<string, MemoryStream>(); 
        
        Vector3[] verts = mesh.vertices;
        Vector2[] uv = mesh.uv;
        Vector2[] uv2 = mesh.uv2;
        Vector3[] normals = mesh.normals;
        Vector4[] tangents = mesh.tangents;
        Color[] colors = mesh.colors;
        BoneWeight[] boneWeights = mesh.boneWeights;
        
		// Check for some attributes that may not be present. Remove them from the mask if they have no data
		if(uv2.Length == 0 && (vertexFormat & VertexFormat.UV2)  == VertexFormat.UV2) { 
			vertexFormat &= ~VertexFormat.UV2; 
		}
		if(colors.Length == 0 && (vertexFormat & VertexFormat.Color) == VertexFormat.Color) { 
			vertexFormat &= ~VertexFormat.Color; 
		}
		if(boneWeights.Length == 0 && (vertexFormat & VertexFormat.BoneWeights) == VertexFormat.BoneWeights) { 
			vertexFormat &= ~VertexFormat.BoneWeights; 
		}
		
        // Build the vertex buffer
        UInt32 vertStride = 0;
        
        if((vertexFormat & VertexFormat.Position) == VertexFormat.Position) { vertStride += 12; }
        if((vertexFormat & VertexFormat.UV) == VertexFormat.UV) { vertStride += 8; }
        if((vertexFormat & VertexFormat.UV2) == VertexFormat.UV2) { vertStride += 8; }
        if((vertexFormat & VertexFormat.Normal) == VertexFormat.Normal) { vertStride += 12; }
        if((vertexFormat & VertexFormat.Tangent) == VertexFormat.Tangent) { vertStride += 16; }
        if((vertexFormat & VertexFormat.Color) == VertexFormat.Color) { vertStride += 4; }
        if((vertexFormat & VertexFormat.BoneWeights) == VertexFormat.BoneWeights) { vertStride += 24; }
        
        MemoryStream vertStream = new MemoryStream();
        BinaryWriter vertBuf = new BinaryWriter( vertStream );
        
        vertBuf.Write( (UInt32)vertexFormat );
        vertBuf.Write( vertStride );
        
        for(i = 0; i < verts.Length; ++i) {
            if((vertexFormat & VertexFormat.Position) == VertexFormat.Position) {
                vertBuf.Write(verts[i].x); // Apparently Unity does it's X axis "backwards" from most other apps
                vertBuf.Write(verts[i].y);
                vertBuf.Write(verts[i].z);
            }
            
            if((vertexFormat & VertexFormat.UV) == VertexFormat.UV) {
                vertBuf.Write(uv[i].x);
                vertBuf.Write(uv[i].y);
            }
            
            if((vertexFormat & VertexFormat.UV2) == VertexFormat.UV2) {
                vertBuf.Write(uv2[i].x);
                vertBuf.Write(uv2[i].y);
            }
            
            if((vertexFormat & VertexFormat.Normal) == VertexFormat.Normal) {
                vertBuf.Write(-normals[i].x);
                vertBuf.Write(normals[i].y);
                vertBuf.Write(normals[i].z);
            }
            
            if((vertexFormat & VertexFormat.Tangent) == VertexFormat.Tangent) {
                vertBuf.Write(tangents[i].x);
                vertBuf.Write(tangents[i].y);
                vertBuf.Write(tangents[i].z);
                vertBuf.Write(tangents[i].w);
            }
            
            if((vertexFormat & VertexFormat.Color) == VertexFormat.Color) {
                vertBuf.Write((Byte)(colors[i].r * 255.0));
                vertBuf.Write((Byte)(colors[i].g * 255.0));
                vertBuf.Write((Byte)(colors[i].b * 255.0));
                vertBuf.Write((Byte)(colors[i].a * 255.0));
            }
            
            if((vertexFormat & VertexFormat.BoneWeights) == VertexFormat.BoneWeights) {
                // We're only going to be tracking 3 bones per vertex, so we need to find 
                // the lowest weight and average the other weights out across it
                int lowestWeightId = 0;
                float lowestWeight = boneWeights[i].weight0;
                
                if(boneWeights[i].weight1 < lowestWeight) { lowestWeightId = 1; lowestWeight = boneWeights[i].weight1; }
                if(boneWeights[i].weight2 < lowestWeight) { lowestWeightId = 2; lowestWeight = boneWeights[i].weight2; }
                if(boneWeights[i].weight3 < lowestWeight) { lowestWeightId = 3; lowestWeight = boneWeights[i].weight3; }
                
                float weightAdjustment = 1.0f + lowestWeight;
                
                if(lowestWeightId != 0) { vertBuf.Write(boneWeights[i].weight0 * weightAdjustment); }
                if(lowestWeightId != 1) { vertBuf.Write(boneWeights[i].weight1 * weightAdjustment); }
                if(lowestWeightId != 2) { vertBuf.Write(boneWeights[i].weight2 * weightAdjustment); }
                if(lowestWeightId != 3) { vertBuf.Write(boneWeights[i].weight3 * weightAdjustment); }
                
                if(lowestWeightId != 0) { vertBuf.Write((float)boneIdLookup[boneWeights[i].boneIndex0]); }
                if(lowestWeightId != 1) { vertBuf.Write((float)boneIdLookup[boneWeights[i].boneIndex1]); }
                if(lowestWeightId != 2) { vertBuf.Write((float)boneIdLookup[boneWeights[i].boneIndex2]); }
                if(lowestWeightId != 3) { vertBuf.Write((float)boneIdLookup[boneWeights[i].boneIndex3]); }
            }
        }
        lumps.Add("vert", vertStream);
        
        // Build the index buffer
        UInt32 indexCount = 0;
        models = new Dictionary<Material, WebGLModel>();
        
        MemoryStream indexStream = new MemoryStream();
        BinaryWriter indexBuf = new BinaryWriter( indexStream );
        for (i = 0; i < mesh.subMeshCount; ++i) {
            int[] triangles = mesh.GetTriangles(i);
            Material material = materials[i];
            
            WebGLModel model;
            if(!models.TryGetValue(material, out model)) {
                model = new WebGLModel();
                model.meshes = new List<WebGLMesh>();
                model.material = material;
                if (material.mainTexture) {
                    
                    model.defaultTexture = CreateWebTexture(material.mainTexture as Texture2D);
                }
                models[material] = model;
            }
            
            WebGLMesh webGLMesh = new WebGLMesh();
            webGLMesh.indexOffset = (UInt16)indexCount;
            webGLMesh.indexCount = (UInt16)triangles.Length;
            indexCount += webGLMesh.indexCount;
            
            model.meshes.Add(webGLMesh);
            
            for(j = 0; j < triangles.Length; ++j) {
                indexBuf.Write((UInt16) triangles[j]);
            }
        }
        lumps.Add("indx", indexStream);
        
        WriteLumpFile(vertBinaryVersion, "wglv", lumps, outStream);
    }
    
    private static void WriteLumpFile(UInt32 version, string magic, Dictionary<string, MemoryStream> lumps, Stream outStream) {
        
        ASCIIEncoding ascii = new ASCIIEncoding();
        
        // Build the header
        MemoryStream headerStream = new MemoryStream();
        BinaryWriter headerBuf = new BinaryWriter( headerStream );
        
        MemoryStream lumpStream = new MemoryStream();
        
        UInt32 lumpOffset = 8; // Accounts for version and lump count
        
        if(magic != null) {
            headerBuf.Write( ascii.GetBytes(magic.Substring(0, 4)) );
            lumpOffset += 4;
        }
        headerBuf.Write( version );
        headerBuf.Write( (UInt32)lumps.Count );
        
        lumpOffset += (UInt32)(12 * lumps.Count); // Each lump header has a 4 byte identifier, long offset, and long size 
        
        foreach(string lumpId in lumps.Keys) {
            MemoryStream lump = lumps[lumpId];
            headerBuf.Write( ascii.GetBytes(lumpId.Substring(0, 4)) );
            headerBuf.Write( lumpOffset );
            headerBuf.Write( (UInt32)lump.Length );
            lumpOffset += (UInt32)lump.Length;
            
            lump.WriteTo(lumpStream);
        }
        
        // Write the final binary data to the output stream
        headerStream.WriteTo(outStream);
        lumpStream.WriteTo(outStream);
    }
    
    private static void WriteMeshJson(Mesh mesh, Stream outStream, Dictionary<Material, WebGLModel> materialModels) 
    {       
        StringTemplateGroup templateGroup = new StringTemplateGroup ("MG", templatePath, typeof(DefaultTemplateLexer));
        StringTemplate modelTemplate = templateGroup.GetInstanceOf("WebGLModel");
        
        modelTemplate.SetAttribute("name", mesh.name);
        modelTemplate.SetAttribute("models", materialModels.Values);
        
        string content = modelTemplate.ToString();
        Byte[] bytes = new UTF8Encoding (true).GetBytes(CleanJSON(content));
        outStream.Write(bytes, 0, bytes.Length);
    }
    
    private static void WriteSkinnedMeshJson(SkinnedMeshRenderer skinnedRenderer, WebGLBone[] bones, Stream outStream, Dictionary<Material, WebGLModel> materialModels) 
    {       
        Mesh mesh = skinnedRenderer.sharedMesh;
        int i;
        
        // Map the bones used by each sub-mesh
        foreach(WebGLModel model in materialModels.Values) {
            for(i = 0; i < model.meshes.Count; ++i) {
                WebGLMesh subMesh = model.meshes[i];
                
                // Eventually this will have to change, but for now let's just keep things simple:
                subMesh.boneOffset = 0;
                subMesh.boneCount = bones.Length;
                
                model.meshes[i] = subMesh;
            }
        }
        
        StringTemplateGroup templateGroup = new StringTemplateGroup ("MG", templatePath, typeof(DefaultTemplateLexer));
        StringTemplate modelTemplate = templateGroup.GetInstanceOf("WebGLModel");
        
        modelTemplate.SetAttribute("name", mesh.name);
        modelTemplate.SetAttribute("models", materialModels.Values);
        modelTemplate.SetAttribute("bones", bones);
        
        string content = modelTemplate.ToString();
        Byte[] bytes = new UTF8Encoding(true).GetBytes(CleanJSON(content));
        outStream.Write(bytes, 0, bytes.Length);
    }
    
    private static WebGLBone[] ProcessBones(SkinnedMeshRenderer skinnedRenderer) 
    {
        Mesh mesh = skinnedRenderer.sharedMesh;
        List<WebGLBone> bones = new List<WebGLBone>();
        Dictionary<Transform, WebGLBone> boneTable = new Dictionary<Transform, WebGLBone>();
        
        WebGLBone webGLBone, parentGLBone;
        Transform bone;
        int i,j;
		
		Matrix4x4 xScale = Matrix4x4.Scale(new Vector3(-1.0f, 1.0f, 1.0f));
		Matrix4x4 flippedBindPose;
        
        // First pass to setup the bones
        for (i = 0; i < skinnedRenderer.bones.Length; ++i) {
            bone = skinnedRenderer.bones[i];
            webGLBone = new WebGLBone();
            
            // Only the bones that are actually used for skinning need a bind-pose matrix
            webGLBone.bindPoseMat = new float[16];
			flippedBindPose = mesh.bindposes[i]; // * xScale;
            for(j = 0; j < 16; ++j) {
                webGLBone.bindPoseMat[j] = flippedBindPose[j];
            }
            webGLBone.originalBone = bone;
            webGLBone.originalId = i;
            webGLBone.skinned = "true";
            webGLBone.name = bone.name;
            webGLBone.pos = bone.localPosition;
			//webGLBone.pos.x *= -1.0f;
            webGLBone.rot = bone.localRotation;
            
            boneTable[bone] = webGLBone; // Ensure that previously existing bones get replaced
            
            while(bone.parent != bone.root && !boneTable.ContainsKey(bone.parent)) {
                bone = bone.parent;
                webGLBone = new WebGLBone();
                webGLBone.skinned = "false";
                webGLBone.originalBone = bone;
                webGLBone.originalId = -1;
                webGLBone.name = bone.name;
                webGLBone.pos = bone.localPosition;
				//webGLBone.pos.x *= -1.0f;
                webGLBone.rot = bone.localRotation;
				//webGLBone.rot.x *= -1.0f;
                
                boneTable.Add(bone, webGLBone);
            }
        }
        
        foreach(WebGLBone wglBone in boneTable.Values) {
            bones.Add(wglBone);
        }
        
        // Sort the bones by parent (children should always have higher id's than their parent bones)
        bones.Sort(new BoneComparer());
        
        for (i = 0; i < bones.Count; ++i) {
            webGLBone = bones[i];
            webGLBone.id = i;
            
            bone = webGLBone.originalBone;
            if(boneTable.TryGetValue(bone.parent, out parentGLBone)) {
                webGLBone.parent = parentGLBone.id;
            } else {
                webGLBone.parent = -1;
                
                while(/*bone.parent &&*/bone.parent != bone.root) {
                    bone = bone.parent;
                    
                    webGLBone.pos = bone.localRotation * webGLBone.pos;
                    if(bone.parent) { webGLBone.pos += bone.localPosition; }
                    webGLBone.rot = bone.localRotation * webGLBone.rot;
                }
            }
            boneTable[webGLBone.originalBone] = webGLBone;
            bones[i] = webGLBone;
        }
        
        return bones.ToArray();
    }
    
    private static string CreateWebTexture(Texture2D texture) {
		if(texture == null) { return null; }
		
		string origPath = AssetDatabase.GetAssetPath(texture);
		string texturePath = origPath.Replace("Assets/Textures/", "");
        
        // Replace the original extension with .png 
        int extPos = texturePath.LastIndexOf(".");
        texturePath = texturePath.Substring(0, extPos) + ".png";
        
        string publicPath = "root/texture/" + texturePath;
		
		//return publicPath;
		
		if(exportedTextures.ContainsKey(publicPath)) {
			return publicPath;
		}
		
		exportedTextures.Add(publicPath, texture);
		
		System.IO.Directory.CreateDirectory(Path.GetDirectoryName(textureFolder + "/" + texturePath));
		
		TextureImporter textureImporter = (TextureImporter)AssetImporter.GetAtPath(origPath);	
		textureImporter.isReadable = true;
		AssetDatabase.ImportAsset(origPath, ImportAssetOptions.ForceUpdate);
		
		if (!textureImporter.isReadable) {
            Debug.LogWarning("Texture is not marked as readable: " + origPath);
            return publicPath;
        }
		
		// Reload the texture after the readable settings have been changed
		Texture2D exportTexture = AssetDatabase.LoadAssetAtPath(origPath, typeof(Texture2D)) as Texture2D;
        
        // Force the texture into a usable format (ARGB32)
        Texture2D pngTexture = new Texture2D(exportTexture.width, exportTexture.height);
        pngTexture.SetPixels(exportTexture.GetPixels());
        
        Byte[] bytes = pngTexture.EncodeToPNG();
        using (FileStream stream = new FileStream(textureFolder + "/" + texturePath, FileMode.Create)) 
        {
            stream.Write(bytes, 0, bytes.Length);
			stream.Close();
        }
        
        // Clean up the temp texture
        DestroyImmediate(pngTexture);
		
        return publicPath;
    }
    
    private static void WriteAnimationJson(AnimationClip clip, Stream outStream) 
    {       
        AnimationClipCurveData[] curves = AnimationUtility.GetAllCurves(clip);
        
        int frameCount = (int)(clip.frameRate * clip.length);
        
        Dictionary<string, WebGLAnimatedBone> boneTable = new Dictionary<string, WebGLAnimatedBone>();
        
        int i;
        
        // Gather the transform information for all
        foreach(AnimationClipCurveData curveData in curves) {
            AnimationCurve curve = curveData.curve;
            string boneName = curveData.path;
            
            int pathSeparator = boneName.LastIndexOf('/');
            if(pathSeparator != -1) {
                boneName = boneName.Substring(pathSeparator+1); 
            }
            
            WebGLAnimatedBone animatedBone;
            
            if(!boneTable.TryGetValue(boneName, out animatedBone)) {
                animatedBone = new WebGLAnimatedBone();
                animatedBone.bone = boneName;
                animatedBone.keyframes = new WebGLBoneKeyframe[frameCount];
                
                boneTable.Add(boneName, animatedBone);
            }
            
            for(i = 0; i < frameCount; ++i) {
                float frameTime = (float)i * (1.0f / (float)clip.frameRate); 
                float frameVal = curve.Evaluate(frameTime);
                switch(curveData.propertyName) {
                    case "m_LocalRotation.x": animatedBone.keyframes[i].rot.x = frameVal; break;
                    case "m_LocalRotation.y": animatedBone.keyframes[i].rot.y = frameVal; break;
                    case "m_LocalRotation.z": animatedBone.keyframes[i].rot.z = frameVal; break;
                    case "m_LocalRotation.w": animatedBone.keyframes[i].rot.w = frameVal; break;
                    
                    case "m_LocalPosition.x": animatedBone.keyframes[i].pos.x = frameVal; break;
                    case "m_LocalPosition.y": animatedBone.keyframes[i].pos.y = frameVal; break;
                    case "m_LocalPosition.z": animatedBone.keyframes[i].pos.z = frameVal; break;
                }
            }
        }
        
        List<WebGLKeyframe> keyframes = new List<WebGLKeyframe>();
        for(i = 0; i < frameCount; ++i) {
            WebGLKeyframe keyFrame = new WebGLKeyframe();
            keyFrame.id = i;
            keyFrame.bones = new List<WebGLBoneKeyframe>();
            
            foreach(WebGLAnimatedBone animatedBone in boneTable.Values) {
                keyFrame.bones.Add(animatedBone.keyframes[i]);  
            }
            
            keyframes.Add(keyFrame);
        }
        
        StringTemplateGroup templateGroup = new StringTemplateGroup ("MG", templatePath, typeof(DefaultTemplateLexer));
        StringTemplate animTemplate = templateGroup.GetInstanceOf("WebGLAnim");
        
        animTemplate.SetAttribute("clip", clip);
        animTemplate.SetAttribute("clipLength", (int)(clip.length * 1000.0)); // Why does this die if I try to pull it from clip directly in the template?
        animTemplate.SetAttribute("frameCount", frameCount);
        animTemplate.SetAttribute("bones", boneTable.Values);
        animTemplate.SetAttribute("keyframes", keyframes);
        //animTemplate.SetAttribute("curves", curves);
        
        string content = animTemplate.ToString();
        Byte[] bytes = new UTF8Encoding (true).GetBytes(CleanJSON(content));
        outStream.Write(bytes, 0, bytes.Length);
    }

    private static void MeshToFile(MeshFilter mf, string folder, string filename) 
    {    
        Dictionary<Material, WebGLModel> materialModels;
        using (FileStream stream = new FileStream(folder +"/" + filename + ".wglvert", FileMode.Create)) 
        {
            VertexFormat vertexFormat = VertexFormat.Position | 
                VertexFormat.UV |
				VertexFormat.UV2 | 
                VertexFormat.Normal |
                VertexFormat.Tangent |
				VertexFormat.Color;
            
            WriteMeshBinary(mf.sharedMesh, vertexFormat, mf.renderer.sharedMaterials, null, stream, out materialModels);
			stream.Close();
        }
        using (FileStream stream = new FileStream(folder +"/" + filename + ".wglmodel", FileMode.Create)) 
        {
            WriteMeshJson(mf.sharedMesh, stream, materialModels);
			stream.Close();
        }
    }

    private static void SkinnedMeshToFile(SkinnedMeshRenderer skinnedRenderer, string folder, string filename) 
    {    
        WebGLBone[] bones = ProcessBones(skinnedRenderer);
        
        // Create the bone lookup table
        WebGLBone webGLBone;
        int[] boneIdLookup = new int[skinnedRenderer.bones.Length];
        for(int i = 0; i < bones.Length; ++i) {
            webGLBone = bones[i];
            if(webGLBone.originalId >= 0) {
                boneIdLookup[webGLBone.originalId] = webGLBone.id;
            }
        }
        
        Dictionary<Material, WebGLModel> materialModels;
        using (FileStream stream = new FileStream(folder +"/" + filename + ".wglvert", FileMode.Create)) 
        {
            VertexFormat vertexFormat = VertexFormat.Position | 
                VertexFormat.UV | 
                VertexFormat.Normal |
                VertexFormat.Tangent |
                VertexFormat.BoneWeights;
            WriteMeshBinary(skinnedRenderer.sharedMesh, vertexFormat, skinnedRenderer.sharedMaterials, boneIdLookup, stream, out materialModels);
        	stream.Close();
		}
        using (FileStream stream = new FileStream(folder +"/" + filename + ".wglmodel", FileMode.Create)) 
        {
            WriteSkinnedMeshJson(skinnedRenderer, bones, stream, materialModels);
        	stream.Close();
		}
    }

    private static void AnimationToFile(AnimationClip anim, string folder, string filename) 
    {
        using (FileStream stream = new FileStream(folder +"/" + filename + ".wglanim", FileMode.Create)) 
        {
            WriteAnimationJson(anim, stream);
			stream.Close();
        }
    }

    public static string CleanJSON(string content)
    {
        return Regex.Replace(content, @",(\s*)([\},\]])", @"$1$2", RegexOptions.Multiline);
    }
    
    private static bool CreateTargetFolder()
    {
        try
        {
            System.IO.Directory.CreateDirectory(modelFolder);
            System.IO.Directory.CreateDirectory(textureFolder);
			System.IO.Directory.CreateDirectory(levelFolder);
        }
        catch
        {
            EditorUtility.DisplayDialog("Error!", "Failed to create target folders!", "");
            return false;
        }
        
        return true;
    }

    [MenuItem ("WebGL/Export Selected Meshes")]
    static void ExportSelecedMeshes()
    {
        if (!CreateTargetFolder())
            return;
        
        UnityEngine.Object[] selection;
        int exportedObjects = 0;
        
        selection = Selection.GetFiltered(typeof(MeshFilter), SelectionMode.Unfiltered);
        for (int i = 0; i < selection.Length; i++)
        {
            exportedObjects++;
            MeshToFile((MeshFilter)selection[i], modelFolder, selection[i].name);
        }
        
        selection = Selection.GetFiltered(typeof(SkinnedMeshRenderer), SelectionMode.Unfiltered);
        for (int i = 0; i < selection.Length; i++)
        {
            exportedObjects++;
            SkinnedMeshToFile((SkinnedMeshRenderer)selection[i], modelFolder, selection[i].name);
        }
        
        if (exportedObjects > 0) {
            Debug.Log("Exported " + exportedObjects + " meshes");
        } else {
            EditorUtility.DisplayDialog("Objects not exported", "Make sure at least some of your selected objects have mesh filters!", "");
        }
    }
    
    [MenuItem ("WebGL/Export Selected Animations")]
    static void ExportSelecedAnimations()
    {
        if (!CreateTargetFolder())
            return;
         
        int exportedObjects = 0;
        
        UnityEngine.Object[] selection = Selection.GetFiltered(typeof(AnimationClip), SelectionMode.Unfiltered);
        
        for (int i = 0; i < selection.Length; i++)
        {
            exportedObjects++;
            AnimationToFile((AnimationClip)selection[i], modelFolder, selection[i].name);
        }
        
        if (exportedObjects > 0) {
            Debug.Log("Exported " + exportedObjects + " animations");
        } else {
            EditorUtility.DisplayDialog("Animations not exported", "Make sure at least some of your selected are animations!", "");
        }
    }
	
	[MenuItem ("WebGL/Export Level")]
    static void ExportLevel()
    {
        if (!CreateTargetFolder())
            return;
		
		string filename = "level1";
        
		try {
			// Export Lightmaps
			string[] lightmapPaths = ExportLightmaps();
			
			// Find all prefabs
			Dictionary<Mesh, List<MeshFilter>> staticPrefabs;
			int instanceCount = FindInstances(out staticPrefabs);
			
			WebGLLevel level = BuildLevel(staticPrefabs, instanceCount, lightmapPaths);
			
			// Write out level file
			using (FileStream stream = new FileStream(levelFolder +"/" + filename + ".wgllevel", FileMode.Create)) 
	        {
	            WriteLevel(level, stream);
				stream.Close();
	        }
			
			// Export prefabs
			ExportPrefabs(staticPrefabs);
			
			// TODO: Write out instances
			// TODO: Write out static geometry
		} catch(Exception ex) {
			Debug.LogError(ex.Message);
		}
		
		EditorUtility.ClearProgressBar();
        
        Debug.Log("Level export complete.");
    }
	
	static string[] ExportLightmaps() {
		List<string> lightmapPaths = new List<string>();
		int lightmapCount = LightmapSettings.lightmaps.Length;
		for (int i = 0; i < lightmapCount; i++)
        {
			if(EditorUtility.DisplayCancelableProgressBar("Exporting " + lightmapCount + " Lightmaps", "Lightmap " + i, (float)i/(float)lightmapCount)) {
				throw new Exception("User canceled export");
			}
			
			string path = CreateWebTexture(LightmapSettings.lightmaps[i].lightmapFar);
			lightmapPaths.Add(path);
		}
		
		return lightmapPaths.ToArray();
	}
	
	static int FindInstances(out Dictionary<Mesh, List<MeshFilter>> staticPrefabs) {
		int instanceCount = 0;
		
		staticPrefabs = new Dictionary<Mesh, List<MeshFilter>>();
		MeshFilter[] objects = GameObject.FindSceneObjectsOfType(typeof(MeshFilter)) as MeshFilter[];
		
		float sortedObjects = 0.0f;
		float totalObjects = objects.Length;
		foreach (MeshFilter obj in objects)
		{
			if(EditorUtility.DisplayCancelableProgressBar("Sorting " + totalObjects + " Meshes", obj.name, sortedObjects/totalObjects)) {
				throw new Exception("User canceled export");
			}
			
			sortedObjects += 1.0f;
			
			// For now only export static objects
			if(obj.gameObject.isStatic && obj.renderer.enabled) {
				instanceCount++;
				
				Mesh sharedMesh = obj.sharedMesh;
				List<MeshFilter> instances;
				
				if(!staticPrefabs.TryGetValue(sharedMesh, out instances)) {
					instances = new List<MeshFilter>();
					staticPrefabs.Add(sharedMesh, instances);
				}
				instances.Add(obj);
			}
		}
		
		return instanceCount;
	}
	
	static WebGLLevel BuildLevel(Dictionary<Mesh, List<MeshFilter>> staticPrefabs, int instanceCount, string[] lightmaps) {
		WebGLLevel level = new WebGLLevel();
		level.name = "WebGL Level";
		level.lightmaps = lightmaps;
		level.props = new List<WebGLProp>();
		
		float exportedInstances = 0.0f;
		foreach (Mesh mesh in staticPrefabs.Keys)
		{
			MeshFilter meshFilter = staticPrefabs[mesh][0];
			WebGLProp prop = new WebGLProp();
			prop.instances = new List<WebGLPropInstance>();
			prop.modelPath = "root/model/" + meshFilter.name;
			
			foreach(MeshFilter instance in staticPrefabs[mesh])
			{
				WebGLPropInstance propInstance = new WebGLPropInstance();
				propInstance.pos = instance.transform.position;
				//propInstance.pos.x *= -1.0f;
				propInstance.rot = instance.transform.rotation;
				// We're only storing a single scalar value for scale, take the max scale component
				propInstance.scale = Math.Max(Math.Max(instance.transform.lossyScale.x, instance.transform.lossyScale.y), instance.transform.lossyScale.z);
				
				propInstance.lightmapId = instance.renderer.lightmapIndex;
				propInstance.lightmapScale = new Vector2(instance.renderer.lightmapTilingOffset.x, instance.renderer.lightmapTilingOffset.y);
				propInstance.lightmapOffset = new Vector2(instance.renderer.lightmapTilingOffset.z, instance.renderer.lightmapTilingOffset.w);
				
				if(EditorUtility.DisplayCancelableProgressBar("Exporting Level", "Processing Props", exportedInstances/instanceCount)) {
					throw new Exception("User canceled export");
				}
				exportedInstances += 1.0f;
				
				prop.instances.Add(propInstance);
			}
			
			level.props.Add(prop);
		}
		
		return level;
	}
	
	static void WriteLevel(WebGLLevel level, Stream outStream) {		
		if(EditorUtility.DisplayCancelableProgressBar("Exporting Level", "Writing JSON", 1.0f)) {
			throw new Exception("User canceled export");
		}
		
		// Write out JSON
		StringTemplateGroup templateGroup = new StringTemplateGroup ("MG", templatePath, typeof(DefaultTemplateLexer));
        StringTemplate animTemplate = templateGroup.GetInstanceOf("WebGLLevel");
        
        animTemplate.SetAttribute("level", level);
        
        string content = animTemplate.ToString();
        Byte[] bytes = new UTF8Encoding (true).GetBytes(CleanJSON(content));
        outStream.Write(bytes, 0, bytes.Length);
	}
	
	static void ExportPrefabs(Dictionary<Mesh, List<MeshFilter>> staticPrefabs) {
		
		float exportedPrefabs = 0.0f;
		float totalPrefabs = staticPrefabs.Keys.Count;
		foreach (Mesh mesh in staticPrefabs.Keys)
		{
			MeshFilter meshFilter = staticPrefabs[mesh][0];
			if(EditorUtility.DisplayCancelableProgressBar("Exporting " + totalPrefabs + " Prefabs", meshFilter.name, exportedPrefabs/totalPrefabs)) {
				throw new Exception("User canceled export");
			}
			
			MeshToFile(meshFilter, modelFolder, meshFilter.name);
			
			exportedPrefabs += 1.0f;
		}
	}
}