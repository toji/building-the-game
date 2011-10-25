{
    "modelVersion": 1,
    "name": "$name$",
    "meshes": [$models: { 
        {
            "material": "$it.materialPath$",
            "defaultTexture": "$it.defaultTexture$",
            "submeshes": [$it.meshes: {
                { 
                    "indexOffset": $it.indexOffset$,
                    "indexCount": $it.indexCount$
                },
            }$]
        },
     }$]
}