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

    // Model Shader
    var modelVS = [ 
        "attribute vec3 position;",
        "attribute vec2 texture;",
        "attribute vec3 normal;",

        "uniform mat4 viewMat;",
        "uniform mat4 modelMat;",
        "uniform mat4 projectionMat;",

        "uniform vec3 lightPos;",

        "varying vec2 vTexture;",
        "varying vec3 vNormal;",
        "varying vec3 vLightDir;",
        "varying vec3 vEyeDir;",
        
        // A "manual" rotation matrix transpose to get the normal matrix
        "mat3 getNormalMat(mat4 mat) {",
        "   return mat3(mat[0][0], mat[1][0], mat[2][0], mat[0][1], mat[1][1], mat[2][1], mat[0][2], mat[1][2], mat[2][2]);",
        "}",

        "void main(void) {",
        " mat4 modelViewMat = viewMat * modelMat;",
        " mat3 normalMat = getNormalMat(modelViewMat);",

        " vec4 vPosition = modelViewMat * vec4(position, 1.0);",
        " gl_Position = projectionMat * vPosition;",

        " vTexture = texture;",
        " vNormal = normalize(normal * normalMat);",
        " vLightDir = normalize(lightPos-vPosition.xyz);",
        " vEyeDir = normalize(-vPosition.xyz);",
        "}"
    ].join("\n");

    var modelFS = [
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

    var modelShader = null;

    var identityMat = mat4.create();
    mat4.identity(identityMat);

    // Vertex Format Flags
    var ModelVertexFormat = {
        Position: 0x0001,
        UV: 0x0002,
        UV2: 0x0004,
        Normal: 0x0008,
        Tangent: 0x0010,
        Color: 0x0020,
        BoneWeights: 0x0040
    };

    function GetLumpId(id) {
        var str = "";
        str += String.fromCharCode(id & 0xff);
        str += String.fromCharCode((id >> 8) & 0xff);
        str += String.fromCharCode((id >> 16) & 0xff);
        str += String.fromCharCode((id >> 24) & 0xff);
        return str;
    };

    var Model = function () {
        this.vertexFormat = 0;
        this.vertexStride = 0;
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.meshes = null;
        this._instances = [];
        this._visibleFlag = -1;
        this.complete = false;
    };

    Model.prototype.load = function (gl, url, callback) {
        var self = this,
            vertComplete = false,
            modelComplete = false;

        // Load the binary portion of the model
        var vertXhr = new XMLHttpRequest();
        vertXhr.open('GET', url + ".wglvert", true);
        vertXhr.responseType = "arraybuffer";
        vertXhr.onload = function() {
            var arrays = self._parseBinary(this.response);
            self._compileBuffers(gl, arrays);
            vertComplete = true;
            
            if (modelComplete) {
                self.complete = true;
                if (callback) { callback(self); }
            }
        };
        vertXhr.send(null);

        // Load the json portion of the model
        var jsonXhr = new XMLHttpRequest();
        jsonXhr.open('GET', url + ".wglmodel", true);
        jsonXhr.onload = function() {
            // TODO: Error Catch!
            var model = JSON.parse(this.responseText);
            self._parseModel(model);
            self._compileMaterials(gl, self.meshes);
            modelComplete = true;

            if (vertComplete) {
                self.complete = true;
                if (callback) { callback(self); }
            }
        };
        jsonXhr.send(null);

        if (!modelShader) {
            modelShader = glUtil.createShaderProgram(gl, modelVS, modelFS, 
                ["position", "texture", "normal"],
                ["viewMat", "modelMat", "projectionMat", "diffuse",
                 "lightPos", ]
            );
        }
    };

    Model.prototype._parseBinary = function (buffer) {
        var output = {
            vertexArray: null,
            indexArray: null
        };

        var header = new Uint32Array(buffer, 0, 3);
        if(GetLumpId(header[0]) !== "wglv") {
            throw new Error("Binary file magic number does not match expected value.");
        }
        if(header[1] > 1) {
            throw new Error("Binary file version is not supported.");
        }
        var lumpCount = header[2];

        header = new Uint32Array(buffer, 12, lumpCount * 3);

        var i, lumpId, offset, length;
        for(i = 0; i < lumpCount; ++i) {
            lumpId = GetLumpId(header[i * 3]);
            offset = header[(i * 3) + 1];
            length = header[(i * 3) + 2];

            switch(lumpId) {
                case "vert":
                    output.vertexArray = this._parseVert(buffer, offset, length);
                    break;

                case "indx":
                    output.indexArray = this._parseIndex(buffer, offset, length);
                    break;
            }
        }

        return output;
    };

    Model.prototype._parseVert = function(buffer, offset, length) {
        var vertHeader = new Uint32Array(buffer, offset, 2);
        this.vertexFormat = vertHeader[0];
        this.vertexStride = vertHeader[1];

        return new Uint8Array(buffer, offset + 8, length - 8);
    };

    Model.prototype._parseIndex = function(buffer, offset, length) {
        return new Uint16Array(buffer, offset, length / 2);
    };

    Model.prototype._compileBuffers = function (gl, arrays) {
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, arrays.vertexArray, gl.STATIC_DRAW);

        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arrays.indexArray, gl.STATIC_DRAW);
    };

    Model.prototype._parseModel = function (doc) {
        this.meshes = doc.meshes;
    };

    Model.prototype._compileMaterials = function (gl, meshes) {
        var i, mesh;
        for (i in meshes) {
            mesh = meshes[i];
            mesh.diffuse = glUtil.loadTexture(gl, mesh.defaultTexture);
        }
    };
    
    Model.prototype.createInstance = function() {
        var instance = new ModelInstance(this);
        this._instances.push(instance);
        return instance;
    };
    
    Model.prototype.destroyInstance = function(instance) {
        var index = this._instances.indexOf(instance);
        if(index > -1) { this._instances.splice(index, 1); }
    };

    Model.prototype.draw = function (gl, viewMat, projectionMat, modelMat) {
        if (!this.complete) { return; }

        var shader = modelShader,
            i, j,
            mesh, submesh,
            indexOffset, indexCount;

        // Bind the appropriate buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        gl.useProgram(shader);

        gl.uniform3f(shader.uniform.lightPos, 16, -32, 32);

        gl.uniformMatrix4fv(shader.uniform.viewMat, false, viewMat);
        gl.uniformMatrix4fv(shader.uniform.modelMat, false, modelMat || identityMat);
        gl.uniformMatrix4fv(shader.uniform.projectionMat, false, projectionMat);

        gl.enableVertexAttribArray(shader.attribute.position);
        gl.enableVertexAttribArray(shader.attribute.texture);
        gl.enableVertexAttribArray(shader.attribute.normal);
        //gl.enableVertexAttribArray(shader.attribute.tangent);

        // Setup the vertex layout
        gl.vertexAttribPointer(shader.attribute.position, 3, gl.FLOAT, false, this.vertexStride, 0);
        gl.vertexAttribPointer(shader.attribute.texture, 2, gl.FLOAT, false, this.vertexStride, 12);
        gl.vertexAttribPointer(shader.attribute.normal, 3, gl.FLOAT, false, this.vertexStride, 20);
        //gl.vertexAttribPointer(shader.attribute.tangent, 4, gl.FLOAT, false, this.vertexStride, 32);

        for (i in this.meshes) {
            mesh = this.meshes[i];

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, mesh.diffuse);
            gl.uniform1i(shader.uniform.diffuse, 0);

            for (j in mesh.submeshes) {
                submesh = mesh.submeshes[j];
                gl.drawElements(gl.TRIANGLES, submesh.indexCount, gl.UNSIGNED_SHORT, submesh.indexOffset*2);
            }
        }
    };
    
    Model.prototype.drawInstances = function (gl, viewMat, projectionMat, visibileFlag) {
        if (!this.complete) { return; }
        if(this._visibleFlag > 0 && this._visibleFlag < visibilityFlag) { return; }

        var shader = modelShader,
            i, j, k,
            mesh, submesh, instance,
            indexOffset, indexCount;

        // Bind the appropriate buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        gl.useProgram(shader);

        gl.uniform3f(shader.uniform.lightPos, 16, -32, 32);

        gl.uniformMatrix4fv(shader.uniform.viewMat, false, viewMat);
        gl.uniformMatrix4fv(shader.uniform.projectionMat, false, projectionMat);

        gl.enableVertexAttribArray(shader.attribute.position);
        gl.enableVertexAttribArray(shader.attribute.texture);
        gl.enableVertexAttribArray(shader.attribute.normal);
        //gl.enableVertexAttribArray(shader.attribute.tangent);

        // Setup the vertex layout
        gl.vertexAttribPointer(shader.attribute.position, 3, gl.FLOAT, false, this.vertexStride, 0);
        gl.vertexAttribPointer(shader.attribute.texture, 2, gl.FLOAT, false, this.vertexStride, 12);
        gl.vertexAttribPointer(shader.attribute.normal, 3, gl.FLOAT, false, this.vertexStride, 20);
        //gl.vertexAttribPointer(shader.attribute.tangent, 4, gl.FLOAT, false, this.vertexStride, 32);

        for (i in this.meshes) {
            mesh = this.meshes[i];

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, mesh.diffuse);
            gl.uniform1i(shader.uniform.diffuse, 0);

            for (j in mesh.submeshes) {
                submesh = mesh.submeshes[j];
                
                for(k in this._instances) {
                    instance = this._instances[k];
                    
                    if(instance._visibleFlag < 0 || instance._visibleFlag >= visibilityFlag) {
                        gl.uniformMatrix4fv(shader.uniform.modelMat, false, instance.matrix);
                        gl.drawElements(gl.TRIANGLES, submesh.indexCount, gl.UNSIGNED_SHORT, submesh.indexOffset*2);
                    }
                }
            }
        }
    };
    
    var ModelInstance = function(model) {
        this.model = model;
        this.matrix = mat4.identity();
        this._visibleFlag = -1;
    };
    
    ModelInstance.prototype.destroy = function() {
        this.model.destroyInstance(this);
    };
    
    ModelInstance.prototype.draw = function(gl, viewMat, projectionMat) {
        this.model.draw(this, viewMat, projectionMat, this.matrix);
    };
    
    ModelInstance.prototype.updateVisibility = function(flag) {
        this.model._visibleFlag = flag;
        this._visibleFlag = flag;
    };

    return {
        Model: Model,
        ModelVertexFormat: ModelVertexFormat
    };
});