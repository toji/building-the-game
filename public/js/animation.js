/*
 * Copyright (c) 2011 Brandon Jones
 *
 * This software is provided 'as-is', without any express or implied
 * warranty. In no event will the authors be held liable for any damages
 * arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 *
 *    1. The origin of this software must not be misrepresented; you must not
 *    claim that you wrote the original software. If you use this software
 *    in a product, an acknowledgment in the product documentation would be
 *    appreciated but is not required.
 *
 *    2. Altered source versions must be plainly marked as such, and must not
 *    be misrepresented as being the original software.
 *
 *    3. This notice may not be removed or altered from any source
 *    distribution.
 */

define([
    "util/gl-util",
    "js/util/gl-matrix.js",
], function (glUtil) {

    "use strict";

    var Animation = function () {
        this.name = null;
        this.frameRate = 0;
        this.duration = 0;
        this.frameCount = 0;
        this.bonesIds = {};
        this.keyframes = [];
        this.complete = false;
    };

    Animation.prototype.load = function (url, callback) {
        var self = this;

        // Load the binary portion of the model
        var animXhr = new XMLHttpRequest();
        animXhr.open('GET', url + ".wglanim", true);
        animXhr.onload = function() {
            // TODO: Error Catch!
            var anim = JSON.parse(this.responseText);
            self._parseAnim(anim);
            if (callback) { callback(self); }
        };
        animXhr.send(null);
    };

    Animation.prototype._parseAnim = function (anim) {
        var i, j, keyframe, bone;

        this.name = anim.name;
        this.frameRate = anim.frameRate;
        this.duration = anim.duration;
        this.frameCount = anim.frameCount;

        // Build a table to lookup bone id's
        for(i = 0; i < anim.bones.length; ++i) {
            this.bonesIds[anim.bones[i]] = i;
        }
        this.keyframes = anim.keyframes;

        // Force all bones to use efficient data structures
        for (i in this.keyframes) {
            keyframe = this.keyframes[i];

            for(j in keyframe) {
                bone = keyframe[j];
                bone.pos = vec3.create(bone.pos);
                bone.rot = quat4.create(bone.rot);
            }
        }
    };

    // Apply the tranforms of the given frame to the model
    Animation.prototype.evaluate = function (frameId, model) {
        var i, boneId, bones, bone, frame, frameBone, parent;
        
        bones = model.bones;
        if(!bones) { return; }

        frame = this.keyframes[frameId];

        // Go in the order that the model specifies, will always process parents first
        for(i = 0; i < bones.length; ++i) {
            bone = bones[i];
            boneId = this.bonesIds[bone.name];

            if(boneId !== undefined) {
                frameBone = frame[boneId];
                bone.pos = frameBone.pos;
                bone.rot = frameBone.rot;
            }

            // No parent? No transform needed
            if(bone.parent !== -1) {
                parent = bones[bone.parent];

                // Apply the parent transform to this bone
                quat4.multiplyVec3(parent.worldRot, bone.pos, bone.worldPos);
                vec3.add(bone.worldPos, parent.worldPos);
                quat4.multiply(parent.worldRot, bone.rot, bone.worldRot);
            }

            // We only need to compute the matrices for bones that actually have vertices assigned to them
            if(bone.skinned) {
                mat4.fromRotationTranslation(bone.worldRot, bone.worldPos, bone.boneMat);
                mat4.multiply(bone.boneMat, bone.bindPoseMat);
            }
        }

        model._dirtyBones = true; // Notify the model that it needs to update it's bone matrices
    };

    return {
        Animation: Animation
    };
});