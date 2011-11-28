{
    "levelVersion": 1,
    "name": "$level.name$",
    "lightmaps": [$level.lightmaps: {"$it$",}$],
    "props": [$level.props: { 
        {
            "model": "$it.modelPath$",
            "instances": [$it.instances: {
                { 
                    "pos": [$it.pos.x$, $it.pos.y$, $it.pos.z$],
            		"rot": [$it.rot.x$, $it.rot.y$, $it.rot.z$, $it.rot.w$],
            		"scale": $it.scale$,
            		"lightmap": {
            			"id": $it.lightmapId$,
            			"scale": [$it.lightmapScale.x$, $it.lightmapScale.y$],
            			"offset": [$it.lightmapOffset.x$, $it.lightmapOffset.y$],
            		}
                },
            }$]
        },
     }$]
}