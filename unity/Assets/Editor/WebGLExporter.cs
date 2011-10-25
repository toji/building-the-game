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

struct WebGLMesh
{
    public UInt16 indexOffset;
    public UInt16 indexCount;
}

struct WebGLModel
{
    public Material material;
    public string materialPath;
    public string defaultTexture;
    public List<WebGLMesh> meshes;
}

[Flags]
enum VertexFormat {
    Position = 0x0001,
    UV = 0x0002,
    UV2 = 0x0004,
    Normal = 0x0008,
    Tangent = 0x0010,
    Color = 0x0020,
}

public class WebGLExporter : ScriptableObject
{
    //User should probably be able to change this. It is currently left as an excercise for
    //the reader.
    private static string modelFolder = "WebGLExport/model";
    private static string textureFolder = "WebGLExport/texture";
    public static string templatePath = Application.dataPath + "/Editor/WebGL/WebGLExportTemplates/";
    private static UInt32 vertBinaryVersion = 1;
        
    private static void WriteMeshBinary(Mesh mesh, VertexFormat vertexFormat, Material[] materials, Stream outStream, out Dictionary<Material, WebGLModel> models) 
    {
        int i, j;
        
        Dictionary<string, MemoryStream> lumps = new Dictionary<string, MemoryStream>(); 
        
        Vector3[] verts = mesh.vertices;
        Vector2[] uv = mesh.uv;
        Vector2[] uv2 = mesh.uv2;
        Vector3[] normals = mesh.normals;
        Vector4[] tangents = mesh.tangents;
        Color[] colors = mesh.colors;
        
        // Build the vertex buffer
        UInt32 vertStride = 0;
        
        if((vertexFormat & VertexFormat.Position) == VertexFormat.Position) { vertStride += 12; }
        if((vertexFormat & VertexFormat.UV) == VertexFormat.UV) { vertStride += 8; }
        if((vertexFormat & VertexFormat.UV2) == VertexFormat.UV2) { vertStride += 8; }
        if((vertexFormat & VertexFormat.Normal) == VertexFormat.Normal) { vertStride += 12; }
        if((vertexFormat & VertexFormat.Tangent) == VertexFormat.Tangent) { vertStride += 16; }
        if((vertexFormat & VertexFormat.Color) == VertexFormat.Color) { vertStride += 4; }
        
        //UInt32 vertCount = (UInt32)verts.Length;
        
        MemoryStream vertStream = new MemoryStream();
        BinaryWriter vertBuf = new BinaryWriter( vertStream );
        
        vertBuf.Write( (UInt32)vertexFormat );
        vertBuf.Write( vertStride );
        
        for(i = 0; i < verts.Length; ++i) {
            if((vertexFormat & VertexFormat.Position) == VertexFormat.Position) {
                vertBuf.Write(verts[i].x);
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
                vertBuf.Write(normals[i].x);
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
    
    private static void WriteMeshJson(MeshFilter meshFilter, Stream outStream, Dictionary<Material, WebGLModel> materialModels) 
    {       
        Mesh mesh = meshFilter.sharedMesh;
        
        StringTemplateGroup templateGroup = new StringTemplateGroup ("MG", templatePath, typeof(DefaultTemplateLexer));
        StringTemplate modelTemplate = templateGroup.GetInstanceOf("WebGLModel");
        
        modelTemplate.SetAttribute("name", mesh.name);
        modelTemplate.SetAttribute("models", materialModels.Values);
        
        string content = modelTemplate.ToString();
        Byte[] bytes = new UTF8Encoding (true).GetBytes(CleanJSON(content));
        outStream.Write(bytes, 0, bytes.Length);
    }
    
    private static string CreateWebTexture(Texture2D texture) {
        if(texture == null) { return null; }
        
        string origPath = AssetDatabase.GetAssetPath(texture);
        TextureImporter textureImporter = (TextureImporter)AssetImporter.GetAtPath(origPath);
        string texturePath = origPath.Replace("Assets/Textures", "");
        
        // Replace the original extension with .png 
        int extPos = texturePath.LastIndexOf(".");
        texturePath = texturePath.Substring(0, extPos) + ".png";
        
        string publicPath = "root/texture" + texturePath;
        
        if (!textureImporter.isReadable) {
            Debug.LogWarning("Texture is not marked as readable: " + origPath);
            return publicPath;
        }
        
        System.IO.Directory.CreateDirectory(Path.GetDirectoryName(textureFolder + "/" + texturePath));
        
        // Force the texture into a usable format (ARGB32)
        Texture2D pngTexture = new Texture2D(texture.width, texture.height);
        pngTexture.SetPixels(texture.GetPixels());
        
        Byte[] bytes = pngTexture.EncodeToPNG();
        using (FileStream stream = new FileStream(textureFolder + "/" + texturePath, FileMode.Create)) 
        {
            stream.Write(bytes, 0, bytes.Length);
        }
        
        // Clean up the temp texture
        DestroyImmediate(pngTexture);
        
        return publicPath;
    }

    private static void MeshToFile(MeshFilter mf, string folder, string filename) 
    {    
        Dictionary<Material, WebGLModel> materialModels;
        using (FileStream stream = new FileStream(folder +"/" + filename + ".wglvert", FileMode.Create)) 
        {
            VertexFormat vertexFormat = VertexFormat.Position | 
                VertexFormat.UV | 
                VertexFormat.Normal |
                VertexFormat.Tangent;
            
            WriteMeshBinary(mf.sharedMesh, vertexFormat, mf.renderer.sharedMaterials, stream, out materialModels);
        }
        using (FileStream stream = new FileStream(folder +"/" + filename + ".wglmodel", FileMode.Create)) 
        {
            WriteMeshJson(mf, stream, materialModels);
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
        
        if (exportedObjects > 0) {
            Debug.Log("Exported " + exportedObjects + " meshes");
        } else {
            EditorUtility.DisplayDialog("Objects not exported", "Make sure at least some of your selected objects have mesh filters!", "");
        }
    }
}