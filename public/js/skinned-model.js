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
    "model",
    "util/gl-util",
    "js/util/gl-matrix.js",
], function (model, glUtil) {

    "use strict";
    
    var MAX_BONES_PER_MESH = 50;

    // Skinned Model Shader
    var skinnedModelVS = [ 
        "attribute vec3 position;",
        "attribute vec2 texture;",
        "attribute vec3 normal;",
        "attribute vec3 weights;",
        "attribute vec3 bones;",

        "uniform mat4 viewMat;",
        "uniform mat4 modelMat;",
        "uniform mat4 projectionMat;",
        "uniform mat4 boneMat[" + MAX_BONES_PER_MESH + "];",
        
        "uniform vec3 lightPos;",
        
        "varying vec2 vTexture;",
        "varying vec3 vNormal;",
        "varying vec3 vLightDir;",
        "varying vec3 vEyeDir;",
        
        "mat4 accumulateSkinMat() {",
        "   mat4 result = weights.x * boneMat[int(bones.x)];",
        "   result = result + weights.y * boneMat[int(bones.y)];",
        "   result = result + weights.z * boneMat[int(bones.z)];",
        "   return result;",
        "}",
        
        // A "manual" rotation matrix transpose to get the normal matrix
        "mat3 getNormalMat(mat4 mat) {",
        "   return mat3(mat[0][0], mat[1][0], mat[2][0], mat[0][1], mat[1][1], mat[2][1], mat[0][2], mat[1][2], mat[2][2]);",
        "}",

        "void main(void) {",
        "   mat4 modelViewMat = viewMat * modelMat;",
        "   mat4 skinMat = modelViewMat * accumulateSkinMat();",
        "   mat3 normalMat = getNormalMat(skinMat);",
        
        "   vec4 vPosition = skinMat * vec4(position, 1.0);",
        "   gl_Position = projectionMat * vPosition;",

        "   vTexture = texture;",
        "   vNormal = normalize(normal * normalMat);",
        "   vLightDir = normalize(lightPos-vPosition.xyz);",
        "   vEyeDir = normalize(-vPosition.xyz);",
        "}"
    ].join("\n");

    var skinnedModelFS = [
        "uniform sampler2D diffuse;",

        "varying vec2 vTexture;",
        "varying vec3 vNormal;",
        "varying vec3 vLightDir;",
        "varying vec3 vEyeDir;",

        "void main(void) {",
        " float shininess = 8.0;",
        " vec3 specularColor = vec3(1.0, 1.0, 1.0);",
        " vec3 lightColor = vec3(1.0, 1.0, 1.0);",
        " vec3 ambientLight = vec3(0.15, 0.15, 0.15);",

        " vec4 color = texture2D(diffuse, vTexture);",
        " vec3 normal = normalize(vNormal);",
        " vec3 lightDir = normalize(vLightDir);",
        " vec3 eyeDir = normalize(vEyeDir);",
        " vec3 reflectDir = reflect(-lightDir, normal);",

        " float specularLevel = color.a;",
        " float specularFactor = pow(clamp(dot(reflectDir, eyeDir), 0.0, 1.0), shininess) * specularLevel;",
        " float lightFactor = max(dot(lightDir, normal), 0.0);",
        " vec3 lightValue = ambientLight + (lightColor * lightFactor) + (specularColor * specularFactor);",
        " gl_FragColor = vec4(color.rgb * lightValue, 1.0);",
        "}"
    ].join("\n");

    var skinnedModelShader = null;

    var identityMat = mat4.create();
    mat4.identity(identityMat);

    var SkinnedModel = function () {
        model.Model.call(this);
        this.bones = null;
        this.boneMatrices = null;
        this._dirtyBones = true; 
    };
    SkinnedModel.prototype = new model.Model();

    SkinnedModel.prototype.load = function (gl, url, callback) {
        model.Model.prototype.load.call(this, gl, url, callback);
        
        if (!skinnedModelShader) {
            skinnedModelShader = glUtil.createShaderProgram(gl, skinnedModelVS, skinnedModelFS, 
                ["position", "texture", "normal", "weights", "bones"],
                ["viewMat", "modelMat", "projectionMat", "diffuse",
                 "lightPos", "boneMat"]
            );
        }
    };

    SkinnedModel.prototype._parseBinary = function (buffer) {
        var arrays = model.Model.prototype._parseBinary.call(this, buffer);

        if(this.vertexFormat & model.ModelVertexFormat.BoneWeights) {
            this.boneMatrices = new Float32Array(16 * MAX_BONES_PER_MESH);
        }
        
        return arrays;
    };

    SkinnedModel.prototype._parseModel = function(doc) {
        var i, bone;

        model.Model.prototype._parseModel.call(this, doc);

        this.bones = doc.bones ? doc.bones : [];

        var tempMat = mat4.create();
        // Force all bones to use efficient data structures
        for (i in this.bones) {
            bone = this.bones[i];

            bone.pos = vec3.create(bone.pos);
            bone.rot = quat4.create(bone.rot);
            bone.bindPoseMat = mat4.create(bone.bindPoseMat);
            bone.boneMat = mat4.create();
            if (bone.parent == -1) {
                bone.worldPos = bone.pos;
                bone.worldRot = bone.rot;
            } else {
                bone.worldPos = vec3.create();
                bone.worldRot = quat4.create();
            }
        }
    };

    SkinnedModel.prototype.draw = function (gl, viewMat, projectionMat) {
        if (!this.complete) { return; }

        var shader = skinnedModelShader,
            i, j,
            mesh, submesh, boneSet,
            indexOffset, indexCount;

        // Bind the appropriate buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        gl.useProgram(shader);

        gl.uniform3f(shader.uniform.lightPos, 16, -32, 32);

        gl.uniformMatrix4fv(shader.uniform.viewMat, false, viewMat);
        gl.uniformMatrix4fv(shader.uniform.modelMat, false, identityMat);
        gl.uniformMatrix4fv(shader.uniform.projectionMat, false, projectionMat);

        gl.enableVertexAttribArray(shader.attribute.position);
        gl.enableVertexAttribArray(shader.attribute.texture);
        gl.enableVertexAttribArray(shader.attribute.normal);
        //gl.enableVertexAttribArray(shader.attribute.tangent);
        gl.enableVertexAttribArray(shader.attribute.weights);
        gl.enableVertexAttribArray(shader.attribute.bones);

        // Setup the vertex layout
        gl.vertexAttribPointer(shader.attribute.position, 3, gl.FLOAT, false, this.vertexStride, 0);
        gl.vertexAttribPointer(shader.attribute.texture, 2, gl.FLOAT, false, this.vertexStride, 12);
        gl.vertexAttribPointer(shader.attribute.normal, 3, gl.FLOAT, false, this.vertexStride, 20);
        //gl.vertexAttribPointer(shader.attribute.tangent, 4, gl.FLOAT, false, this.vertexStride, 32);
        gl.vertexAttribPointer(shader.attribute.weights, 3, gl.FLOAT, false, this.vertexStride, 48);
        gl.vertexAttribPointer(shader.attribute.bones, 3, gl.FLOAT, false, this.vertexStride, 60);

        if(this._dirtyBones) {
            for(i = 0; i < this.bones.length; ++i) {
                var bone = this.bones[i];
                this.boneMatrices.set(bone.boneMat, i * 16);
            }
        }

        for (i in this.meshes) {
            mesh = this.meshes[i];
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, mesh.diffuse);
            gl.uniform1i(shader.uniform.diffuse, 0);
            
            for (j in mesh.submeshes) {
                submesh = mesh.submeshes[j];
                
                boneSet = this.boneMatrices.subarray(submesh.boneOffset * 16, (submesh.boneOffset + submesh.boneCount) * 16);
                gl.uniformMatrix4fv(shader.uniform.boneMat, false, boneSet);
                
                gl.drawElements(gl.TRIANGLES, submesh.indexCount, gl.UNSIGNED_SHORT, submesh.indexOffset*2);
            }
        }
    };

    return {
        SkinnedModel: SkinnedModel
    };
});