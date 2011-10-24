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
    "camera",
    "util/gl-util",
    "js/util/gl-matrix.js",
], function(camera, glUtil) {

    "use strict";
    
    // Shader
    var cubeVS = [ 
        "attribute vec3 position;",
        "attribute vec2 texture;",
    
        "uniform mat4 viewMat;",
        "uniform mat4 projectionMat;",
        "varying vec2 texCoord;",
    
        "void main(void) {",
        " vec4 vPosition = viewMat * vec4(position, 1.0);",
        " texCoord = texture;",
        " gl_Position = projectionMat * vPosition;",
        "}"
    ].join("\n");

    var cubeFS = [
        "uniform sampler2D diffuse;",
        "varying vec2 texCoord;",
        "void main(void) {",
        " gl_FragColor = texture2D(diffuse, texCoord);",
        "}"
    ].join("\n");
    
    var GameRenderer = function (gl, canvas) {
        // To get a camera that gives you a flying first-person perspective, use camera.FlyingCamera
        // To get a camera that rotates around a fixed point, use camera.ModelCamera
        this.camera = new camera.ModelCamera(canvas);
        this.camera.distance = 42;

        this.fov = 45;
        this.projectionMat = mat4.create();
        mat4.perspective(this.fov, canvas.width/canvas.height, 1.0, 4096.0, this.projectionMat);

        gl.clearColor(0.0, 0.0, 0.2, 1.0);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        this._buildCube(gl);
        this.cubeTexture = glUtil.loadTexture(gl, "root/texture/crate.png");
        this.cubeShader = glUtil.createShaderProgram(gl, cubeVS, cubeFS, 
            ["position", "texture"],
            ["viewMat", "projectionMat", "diffuse"]
        );
    };

    GameRenderer.prototype.resize = function (gl, canvas) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        mat4.perspective(this.fov, canvas.width/canvas.height, 1.0, 4096.0, this.projectionMat);
    };

    GameRenderer.prototype.drawFrame = function (gl, timing) {
        this.camera.update(timing.frameTime);
        
        var viewMat = this.camera.getViewMat();
        var projectionMat = this.projectionMat;
        
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        var shader = this.cubeShader;
        gl.useProgram(shader);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVertBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeIndexBuffer);

        gl.uniformMatrix4fv(shader.uniform.viewMat, false, viewMat);
        gl.uniformMatrix4fv(shader.uniform.projectionMat, false, projectionMat);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.cubeTexture);
        gl.uniform1i(shader.uniform.diffuse, 0);

        gl.enableVertexAttribArray(shader.attribute.position);
        gl.enableVertexAttribArray(shader.attribute.texture);
        gl.vertexAttribPointer(shader.attribute.position, 3, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(shader.attribute.texture, 2, gl.FLOAT, false, 20, 12);
        
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    };

    GameRenderer.prototype._buildCube = function(gl) {
        // Set up the verticies and indices
        var cubeVerts = [
        //x    y    z  u  v
        // Front
        -10,  10,  10, 0, 1,
        10,  10,  10, 1, 1,
        -10, -10,  10, 0, 0,
        10, -10,  10, 1, 0,

        // Back          
        10,  10, -10, 1, 1,
        -10,  10, -10, 0, 1,
        10, -10, -10, 1, 0,
        -10, -10, -10, 0, 0,

        // Left          
        -10,  10, -10, 1, 0,
        -10,  10,  10, 1, 1,
        -10, -10, -10, 0, 0,
        -10, -10,  10, 0, 1,

        // Right         
        10,  10,  10, 1, 1,
        10,  10, -10, 1, 0,
        10, -10,  10, 0, 1,
        10, -10, -10, 0, 0,

        // Top           
        -10,  10,  10, 0, 1,
        10,  10,  10, 1, 1,
        -10,  10, -10, 0, 0,
        10,  10, -10, 1, 0,

        // Bottom        
        10,  -10,  10, 1, 1,
        -10,  -10,  10, 0, 1,
        10,  -10, -10, 1, 0,
        -10,  -10, -10, 0, 0,
        ];

        var cubeIndices = [
        0, 1, 2,
        2, 1, 3,

        4, 5, 6,
        6, 5, 7,

        8, 9, 10,
        10, 9, 11,

        12, 13, 14,
        14, 13, 15,

        16, 17, 18,
        18, 17, 19,

        20, 21, 22,
        22, 21, 23,
        ];

        this.cubeVertBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVertBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeVerts), gl.STATIC_DRAW);

        this.cubeIndexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIndices), gl.STATIC_DRAW);
    };

    return {
        GameRenderer: GameRenderer
    };
});