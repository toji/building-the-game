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
    "faceted-mesh",
    "util/camera",
    "util/gl-util",
    "util/gl-matrix-min",
    "js/isosurface-worker.js",
    "js/codemirror/codemirror.js"
], function(FacetedMesh, Camera, GLUtil) {

    "use strict";

    // Shader
    var meshVS = [
        "attribute vec3 position;",
        "attribute vec3 normal;",
        "attribute vec4 color;",
        
        "uniform mat4 viewMat;",
        "uniform mat4 projectionMat;",

        "varying vec4 vColor;",
        "varying vec3 vNormal;",
        "varying vec3 vEyeDir;",

        "void main(void) {",
        "   vec4 vPosition = viewMat * vec4(position, 1.0);",
        "   gl_Position = projectionMat * vPosition;",
        "   vEyeDir = normalize(-vPosition.xyz);",
        "   vNormal = normal;",
        "   vColor = color;",
        "}"
    ].join("\n");

    var meshFS = [
        "precision highp float;",

        "varying vec4 vColor;",
        "varying vec3 vNormal;",
        "varying vec3 vEyeDir;",
        
        "void main(void) {",
        "   float shininess = 2.0;",
        "   float specularLevel = 0.4;",
        "   vec3 specularColor = vec3(1.0, 1.0, 1.0);",

        "   vec3 lightDir = normalize(vec3(1.0, -1.0, 1.0));",
        "   vec3 lightColor = vec3(1.0, 1.0, 1.0);",
        "   vec3 ambientLight = vec3(0.15, 0.15, 0.15);",

        "   vec4 color = vColor;",
        "   vec3 normal = normalize(vNormal);",
        "   vec3 eyeDir = normalize(vEyeDir);",
        "   vec3 reflectDir = reflect(-lightDir, normal);",
        
        "   float specularFactor = pow(clamp(dot(reflectDir, eyeDir), 0.0, 1.0), shininess) * specularLevel;",
        "   float lightFactor = max(dot(lightDir, normal), 0.0);",
        "   vec3 lightValue = ambientLight + (lightColor * lightFactor) + (specularColor * specularFactor);",

        "   gl_FragColor = vec4(color.rgb * lightValue, color.a);",
        "}"
    ].join("\n");

    // Worker-based isosurface generation
    var isosurface = (function() {
        var nextCallbackId = 0;
        var workerCallbacks = {};

        var workerCount = 4;
        var isosurfaceWorkerPool = [];

        function onWorkerMessage(msg) {
            var type = msg.data.type;
            var callback = workerCallbacks[msg.data.id];
            workerCallbacks[msg.data.id] =  null;

            if(type == "build") {
                callback(msg.data);
            } else if(type == "algorithm") {
                if(callback) {
                    callback(msg.data.err);
                }
            }
        }

        var i, worker;
        for(i = 0; i < workerCount; ++i) {
            worker = new Worker("js/isosurface-worker.js");
            worker.onmessage = onWorkerMessage;
            //worker.postMessage({type: "algorithim", src: "return function(pt) { return pt[1] * pt[2]; }"});
            isosurfaceWorkerPool.push(worker);
        }

        function generate(xmin, ymin, zmin, xmax, ymax, zmax, isolevel, callback) {
            var id = nextCallbackId++;
            workerCallbacks[id] = callback;

            var workerId = id%workerCount;
            isosurfaceWorkerPool[workerId].postMessage({id: id, type: "build", xmin: xmin, ymin: ymin, zmin: zmin, xmax: xmax, ymax: ymax, zmax: zmax, isolevel: isolevel});
        }

        function setAlgorithm(src, callback) {
            var id = nextCallbackId++;
            workerCallbacks[id] = callback;

            for(i = 0; i < workerCount; ++i) {
                isosurfaceWorkerPool[i].postMessage({id: id, type: "algorithim", src: src});
            }
        }

        return {
            generate: generate,
            setAlgorithm: setAlgorithm
        };
    })();
    
    // Non-worker isosurface generation
    /*function generateIsosurface(center, radius, callback) {
        console.time("Generating Landscape");
        var out = buildLandscape(center, radius);
        console.timeEnd("Generating Landscape");
        callback(out);
    }*/

    var Renderer = function (gl, canvas) {
        this.camera = new Camera.FlyingCamera(canvas);
        this.camera.setPosition([0, -64, 32]);
        this.camera.rotateView(0, 0.6);
        this.camera.speed = 10;

        this.appScope =  null;

        this.blockSizeX = 32;
        this.blockSizeY = 32;
        this.blockSizeZ = 64;
        this.gridSize = 3;
        this.isolevel = 0;

        this.algorithimErr = null;
        
        this.projectionMat = mat4.create();
        
        gl.clearColor(0.0, 0.0, 0.7, 1.0);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        
        this.meshShader = GLUtil.createProgram(gl, meshVS, meshFS);
        this.meshes = [];
        this.canvas = canvas;
        this.gl = gl;
        this.changeTimeout = null;

        this.thumbnailCanvas = document.createElement("canvas");
        this.thumbnailCanvas.width = 213;
        this.thumbnailCanvas.height = 120;
        this.thumbnailCtx = this.thumbnailCanvas.getContext("2d");

        var self = this;

        var editor;
        var lastSrcHash = null;

        function genCodeHash(src) {
            // Strip out comments
            var minSrc = src.replace(/\/\*.+?\*\/|\/\/.*(?=[\n\r])/g, '');
            // remove whitespace
            minSrc = minSrc.replace(/\s+/g, '');
            return minSrc;
        }

        function updateAlgorithm() {
            var src = self.editor.getValue();
            var hash = genCodeHash(src);
            if(hash != lastSrcHash) {
                lastSrcHash = hash;
                isosurface.setAlgorithm(src, function(err) {
                    if(!err) {
                        self.rebuildSurfaces();
                    }

                    self.appScope.$apply(function(){
                        self.algorithimErr = err;
                    });
                });
            }
        }

        this.editor = CodeMirror.fromTextArea(document.getElementById("code-editor"), {
            mode:  "javascript",
            lineNumbers: true,
            onChange: function() {
                updateAlgorithm();
            }
        });

        updateAlgorithm();
    };

    Renderer.prototype.getSource = function() {
        return this.editor.getValue();
    };

    Renderer.prototype.getThumbnail = function() {
        var scale = this.canvas.height / this.thumbnailCanvas.height;
        var srcWidth = Math.min(this.canvas.width, this.thumbnailCanvas.width * scale);
        var left = (this.canvas.width - srcWidth) * 0.5;

        this.thumbnailCtx.drawImage(this.canvas, left, 0, srcWidth, this.canvas.height, 0, 0, this.thumbnailCanvas.width, this.thumbnailCanvas.height);
        return this.thumbnailCanvas.toDataURL();
    };

    Renderer.prototype.rebuildSurfaces = function () {
        var self = this;

        // Prevent the user from spamming rebuilds
        if(this.changeTimeout) { clearTimeout(this.changeTimeout); }
        this.changeTimeout = setTimeout(function() {
            var gridSize = self.gridSize;
            if(self.meshes.length != gridSize*gridSize) {
                self.meshes = [];
            }
            var width = self.blockSizeX;
            var depth = self.blockSizeY;
            var height = self.blockSizeZ;

            var xmax = width * gridSize * 0.5;
            var ymax = depth * gridSize * 0.5;
            var zmax = height * 0.5;
            
            var xmin, ymin, idx = 0;
            for(xmin = -xmax; xmin < xmax; xmin += width) {
                for(ymin = -ymax; ymin < ymax; ymin += depth) {
                    self.generateBlock(idx++, xmin, ymin, -zmax, xmin + width, ymin + depth, zmax);
                }
            }
        }, 250);
    };

    Renderer.prototype.generateBlock = function (idx, xmin, ymin, zmin, xmax, ymax, zmax) {
        var self = this;
        isosurface.generate(xmin, ymin, zmin, xmax, ymax, zmax, this.isolevel, function(surface) {
            self.meshes[idx] = new FacetedMesh(self.gl, surface.positions, surface.colors, surface.indices, 0.5);
        });
    };

    Renderer.prototype.resize = function (gl, canvas) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        mat4.perspective(45, canvas.width/canvas.height, 0.1, 1024.0, this.projectionMat);
    };

    Renderer.prototype.draw = function (gl, timing) {
        this.camera.update(timing.frameTime);

        var viewMat = this.camera.getViewMat();
        var projectionMat = this.projectionMat;
        
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        var shader = this.meshShader;
        gl.useProgram(shader.program);
        
        gl.uniformMatrix4fv(shader.uniform.viewMat, false, viewMat);
        gl.uniformMatrix4fv(shader.uniform.projectionMat, false, projectionMat);

        var i, l;
        for(i = 0, l = this.meshes.length; i < l; ++i) {
            this.meshes[i].draw(gl, shader);
        }
    };

    return Renderer;
});