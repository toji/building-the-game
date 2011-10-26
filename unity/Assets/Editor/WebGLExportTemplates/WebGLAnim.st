{
    "animVersion": 1,
    "name": "$clip.name$",
    "frameRate": $clip.frameRate$,
    "duration": $clipLength$,
    "frameCount": $frameCount$,
    
    "bones": [$bones: {"$it.bone$", }$],
    
    "keyframes": [$keyframes: {
    	[$it.bones: {
    		{ "pos": [ $it.pos.x$, $it.pos.y$, $it.pos.z$ ], "rot": [ $it.rot.x$, $it.rot.y$, $it.rot.z$, $it.rot.w$ ] }, }$
    	],
    }$]
}