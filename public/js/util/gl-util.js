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

define(function() {

    "use strict";

    // Polyfill to ensure we can always call requestAnimaionFrame
    if(!window.requestAnimationFrame) {
        window.requestAnimationFrame = (function(){
            return  window.webkitRequestAnimationFrame || 
                    window.mozRequestAnimationFrame    || 
                    window.oRequestAnimationFrame      || 
                    window.msRequestAnimationFrame     || 
                    function(callback, element){
                      window.setTimeout(function() {
                          callback(new Date().getTime());
                      }, 1000 / 60);
                    };
        })();
    }

    return {
        getContext: function(canvas) {
            var context;
        
            if (canvas.getContext) {
                try {
                    context = canvas.getContext('webgl');
                    if(context) { return context; }
                } catch(ex) {}
            
                try {
                    context = canvas.getContext('experimental-webgl');
                    if(context) { return context; }
                } catch(ex) {}
            }
        
            return null;
        },
    
        showGLFailed: function(element) {
            var errorElement = document.createElement("div");
            var errorHTML = "<h3>Sorry, but a WebGL context could not be created</h3>";
            errorHTML += "Either your browser does not support WebGL, or it may be disabled.<br/>";
            errorHTML += "Please visit <a href=\"http://get.webgl.org\">http://get.webgl.org</a> for ";
            errorHTML += "details on how to get a WebGL enabled browser.";
            errorElement.innerHTML = errorHTML;
            errorElement.id = "gl-error";
            element.parentNode.replaceChild(errorElement, element);
        },
    
        createShaderProgram: function(gl, vertexShader, fragmentShader, attribs, uniforms) {
            var shaderProgram = gl.createProgram();

            var vs = this._compileShader(gl, vertexShader, gl.VERTEX_SHADER);
            var fs = this._compileShader(gl, fragmentShader, gl.FRAGMENT_SHADER);

            gl.attachShader(shaderProgram, vs);
            gl.attachShader(shaderProgram, fs);
            gl.linkProgram(shaderProgram);

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
                gl.deleteProgram(shaderProgram);
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                return null;
            }
        
            // Query any shader attributes and uniforms that we specified needing
            if(attribs) {
                shaderProgram.attribute = {};
                for(var i in attribs) {
                    var attrib = attribs[i];
                    shaderProgram.attribute[attrib] = gl.getAttribLocation(shaderProgram, attrib);
                }
            }

            if(uniforms) {
                shaderProgram.uniform = {};
                for(var i in uniforms) {
                    var uniform = uniforms[i];
                    shaderProgram.uniform[uniform] = gl.getUniformLocation(shaderProgram, uniform);
                }
            }

            return shaderProgram;
        },
    
        _compileShader: function(gl, source, type) {
            var shaderHeader = "#ifdef GL_ES\n";
            shaderHeader += "precision highp float;\n";
            shaderHeader += "#endif\n";

            var shader = gl.createShader(type);

            gl.shaderSource(shader, shaderHeader + source);
            gl.compileShader(shader);

            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.debug(gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }

            return shader;
        },
    
        createSolidTexture: function(gl, color) {
            var data = new Uint8Array(color);
            var texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, data);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            return texture;
        },
    
        loadTexture: function(gl, src, callback) {
            var texture = gl.createTexture();
            var image = new Image();
            image.addEventListener("load", function() {
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
                gl.generateMipmap(gl.TEXTURE_2D);
            
                if(callback) { callback(texture); }
            });
            image.src = src;
            return texture;
        },
    
        startRenderLoop: function(gl, canvas, callback) {
            var startTime = window.webkitAnimationStartTime || 
                window.mozAnimationStartTime ||
                new Date().getTime();

            var lastTimeStamp = startTime;
            var lastFpsTimeStamp = startTime;
            var framesPerSecond = 0;
            var frameCount = 0;
        
            function nextFrame(time){
                // Recommendation from Opera devs: calling the RAF shim at the beginning of your
                // render loop improves framerate on browsers that fall back to setTimeout
                window.requestAnimationFrame(nextFrame, canvas);
                
                // Update FPS if a second or more has passed since last FPS update
                if(time - lastFpsTimeStamp >= 1000) {
                    framesPerSecond = frameCount;
                    frameCount = 0;
                    lastFpsTimeStamp = time;
                } 

                callback(gl, {
                    startTime: startTime,
                    timeStamp: time,
                    elapsed: time - startTime,
                    frameTime: time - lastTimeStamp,
                    framesPerSecond: framesPerSecond,
                });
            
                ++frameCount;
                lastTimeStamp = time;
            };

            window.requestAnimationFrame(nextFrame, canvas);
        },
    };
});