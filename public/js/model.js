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
    "texture",
    "util/gl-util",
    "util/q",
    "js/util/gl-matrix.js",
], function (texture, glUtil, Q) {

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

    // Model Shader
    var lightmapVS = [
        "attribute vec3 position;",
        "attribute vec2 texture;",
        "attribute vec2 texture2;",

        "uniform mat4 viewMat;",
        "uniform mat4 modelMat;",
        "uniform mat4 projectionMat;",

        "uniform vec2 lightmapScale;",
        "uniform vec2 lightmapOffset;",

        "varying vec2 vTexCoord;",
        "varying vec2 vLightCoord;",

        "void main(void) {",
        " mat4 modelViewMat = viewMat * modelMat;",

        " vec4 vPosition = modelViewMat * vec4(position, 1.0);",
        " gl_Position = projectionMat * vPosition;",

        " vTexCoord = texture;",
        " vLightCoord = texture2 * lightmapScale + lightmapOffset;",
        "}"
    ].join("\n");

    var lightmapFS = [
        "uniform sampler2D diffuse;",
        "uniform sampler2D lightmap;",

        "varying vec2 vTexCoord;",
        "varying vec2 vLightCoord;",

        "void main(void) {",
        " vec4 color = texture2D(diffuse, vTexCoord);",
        " vec4 lightValue = texture2D(lightmap, vLightCoord);",
        " float brightness = 9.0;",
        " gl_FragColor = vec4(color.rgb * lightValue.rgb * (lightValue.a * brightness), 1.0);",
        "}"
    ].join("\n");

    var modelShader = null;
    var lightmapShader = null;

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
            modelShader = glUtil.createShaderProgram(gl, modelVS, modelFS);
        }

        if (!lightmapShader) {
            lightmapShader = glUtil.createShaderProgram(gl, lightmapVS, lightmapFS);
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
            texture.TextureManager.getInstance(gl, mesh.defaultTexture).then(function(tex) {
                mesh.diffuse = tex;
            });
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

    Model.prototype.bindBuffer = function(gl, shader) {
        var offset = 0,
            format = this.vertexFormat,
            stride = this.vertexStride;

        // Bind the appropriate buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        // Position is always assumed to be present (otherwise what are you rendering?)
        gl.enableVertexAttribArray(shader.attribute.position);
        gl.vertexAttribPointer(shader.attribute.position, 3, gl.FLOAT, false, stride, 0);
        offset = 12;

        if(format & ModelVertexFormat.UV) {
            if(shader.attribute.texture != undefined) {
                gl.enableVertexAttribArray(shader.attribute.texture);
                gl.vertexAttribPointer(shader.attribute.texture, 2, gl.FLOAT, false, stride, offset);
            }
            offset += 8;
        }
        if(format & ModelVertexFormat.UV2) {
            if(shader.attribute.texture2 != undefined) {
                gl.enableVertexAttribArray(shader.attribute.texture2);
                gl.vertexAttribPointer(shader.attribute.texture2, 2, gl.FLOAT, false, stride, offset);
            }
            offset += 8;
        }
        if(format & ModelVertexFormat.Normal) {
            if(shader.attribute.normal != undefined) {
                gl.enableVertexAttribArray(shader.attribute.normal);
                gl.vertexAttribPointer(shader.attribute.normal, 3, gl.FLOAT, false, stride, offset);
            }
            offset += 12;
        }
        if(format & ModelVertexFormat.Tangent) {
            if(shader.attribute.tangent != undefined) {
                gl.enableVertexAttribArray(shader.attribute.tangent);
                gl.vertexAttribPointer(shader.attribute.tangent, 3, gl.FLOAT, false, stride, offset);
            }
            offset += 12;
        }
        if(format & ModelVertexFormat.Color) {
            if(shader.attribute.color != undefined) {
                gl.enableVertexAttribArray(shader.attribute.color);
                gl.vertexAttribPointer(shader.attribute.color, 4, gl.UNSIGNED_BYTE, false, stride, offset);
            }
            offset += 4;
        }
        if(format & ModelVertexFormat.BoneWeights) {
            if(shader.attribute.weights != undefined && shader.attribute.bones != undefined) {
                gl.enableVertexAttribArray(shader.attribute.weights);
                gl.enableVertexAttribArray(shader.attribute.bones);
                gl.vertexAttribPointer(shader.attribute.weights, 3, gl.FLOAT, false, stride, offset);
                gl.vertexAttribPointer(shader.attribute.bones, 3, gl.FLOAT, false, stride, offset+12);
            }
        }
    };

    Model.prototype.draw = function (gl, viewMat, projectionMat, modelMat) {
        if (!this.complete) { return; }

        var shader = modelShader,
            i, j,
            mesh, submesh,
            indexOffset, indexCount;

        gl.useProgram(shader);
        this.bindBuffer(gl, shader);

        gl.uniform3f(shader.uniform.lightPos, 16, -32, 32);

        gl.uniformMatrix4fv(shader.uniform.viewMat, false, viewMat);
        gl.uniformMatrix4fv(shader.uniform.modelMat, false, modelMat || identityMat);
        gl.uniformMatrix4fv(shader.uniform.projectionMat, false, projectionMat);

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

        gl.useProgram(shader);
        this.bindBuffer(gl, shader);

        gl.uniform3f(shader.uniform.lightPos, 16, -32, 32);

        gl.uniformMatrix4fv(shader.uniform.viewMat, false, viewMat);
        gl.uniformMatrix4fv(shader.uniform.projectionMat, false, projectionMat);

        gl.uniform1i(shader.uniform.diffuse, 0);

        for (i in this.meshes) {
            mesh = this.meshes[i];

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, mesh.diffuse);

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

    Model.prototype.drawLightmappedInstances = function (gl, viewMat, projectionMat, lightmaps, visibileFlag) {
        if (!this.complete) { return; }
        if(this._visibleFlag > 0 && this._visibleFlag < visibilityFlag) { return; }

        var shader = lightmapShader,
            i, j, k,
            mesh, submesh, instance,
            indexOffset, indexCount;

        gl.useProgram(shader);
        this.bindBuffer(gl, shader);

        gl.uniformMatrix4fv(shader.uniform.viewMat, false, viewMat);
        gl.uniformMatrix4fv(shader.uniform.projectionMat, false, projectionMat);

        gl.uniform1i(shader.uniform.diffuse, 0);
        gl.uniform1i(shader.uniform.lightmap, 1);

        for (i in this.meshes) {
            mesh = this.meshes[i];

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, mesh.diffuse);

            for (j in mesh.submeshes) {
                submesh = mesh.submeshes[j];

                for(k in this._instances) {
                    instance = this._instances[k];

                    if(instance._visibleFlag < 0 || instance._visibleFlag >= visibilityFlag) {
                        gl.activeTexture(gl.TEXTURE1);
                        gl.bindTexture(gl.TEXTURE_2D, lightmaps[instance.lightmap.id]);

                        gl.uniform2fv(shader.uniform.lightmapScale, instance.lightmap.scale);
                        gl.uniform2fv(shader.uniform.lightmapOffset, instance.lightmap.offset);
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