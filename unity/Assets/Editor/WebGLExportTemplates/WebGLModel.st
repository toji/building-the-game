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
                    "indexCount": $it.indexCount$,
                    "boneOffset": $it.boneOffset$,
                    "boneCount": $it.boneCount$
                },
            }$]
        },
     }$],
     
     "bones": [$bones: { 
        {
            "name": "$it.name$",
            "parent": $it.parent$,
            "pos": [$it.pos.x$, $it.pos.y$, $it.pos.z$],
            "rot": [$it.rot.x$, $it.rot.y$, $it.rot.z$, $it.rot.w$],
            "skinned": $it.skinned$,
            "bindPoseMat": [$it.bindPoseMat; separator=","$]
        },
     }$]
}