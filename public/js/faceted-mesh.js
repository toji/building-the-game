/*
 * faceted-mesh.js - Processes a simple indexec mesh into a mesh where each triangle renders as a flat face
 */

/*
 * Copyright (c) 2012 Brandon Jones
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
    "util/gl-matrix-min"
], function() {

    function FacetedMesh(gl, verts, colors, indices, smoothFactor, noSmoothing) {
        this.generateVertsWithNormals(verts, indices, noSmoothing);

        if(colors && indices) {
            this.colorBuffer = gl.createBuffer();
            this.generateColorBuffer(gl, colors, indices);
        }

        this.vertBuffer = gl.createBuffer();
        this.setNormalSmoothing(gl, smoothFactor);
    }

    FacetedMesh.prototype.generateVertsWithNormals = function(verts, indices, noSmoothing) {
        var i, j, l, idx;
        var indexCount = indices ? indices.length : verts.length / 3;
        var buffer = new Float32Array(indexCount * 6);
        var vertCount = verts.length / 3;
        var smoothedNormals = [];
        var vertNormals = new Array(indexCount);
        var faceNormals = new Array(indexCount);

        if(indices && !noSmoothing) {
            for(i = 0; i < vertCount; ++i) {
                smoothedNormals.push(vec3.create([0, 0, 0]));
            }
        }

        // Calculate normals/tangents
        var idx0, idx1, idx2;

        var a = vec3.create(),
            b = vec3.create(),
            pos0 = vec3.create(),
            pos1 = vec3.create(),
            pos2 = vec3.create();

        for(i = 0; i < indexCount; i+=3) {
            j = i * 6;

            if(indices) {
                idx0 = indices[i];
                idx1 = indices[i+1];
                idx2 = indices[i+2];
            } else {
                idx0 = i;
                idx1 = i+1;
                idx2 = i+2;
            }

            buffer[j + 0] = pos0[0] = verts[idx0*3 + 0];
            buffer[j + 1] = pos0[1] = verts[idx0*3 + 1];
            buffer[j + 2] = pos0[2] = verts[idx0*3 + 2];

            buffer[j + 6] = pos1[0] = verts[idx1*3 + 0];
            buffer[j + 7] = pos1[1] = verts[idx1*3 + 1];
            buffer[j + 8] = pos1[2] = verts[idx1*3 + 2];

            buffer[j + 12] = pos2[0] = verts[idx2*3 + 0];
            buffer[j + 13] = pos2[1] = verts[idx2*3 + 1];
            buffer[j + 14] = pos2[2] = verts[idx2*3 + 2];

            vec3.subtract(pos1, pos0, a);
            vec3.subtract(pos2, pos0, b);
            vec3.cross(a, b, a);
            vec3.normalize(a);

            if(indices && !noSmoothing) {
                vec3.add(smoothedNormals[idx0], a);
                vec3.add(smoothedNormals[idx1], a);
                vec3.add(smoothedNormals[idx2], a);
            }

            faceNormals[i] = vec3.create(a);
            faceNormals[i+1] = vec3.create(a);
            faceNormals[i+2] = vec3.create(a);
        }

        if(indices && !noSmoothing) {
            // Normalize the summed up vertex normals
            for(i = 0; i < indexCount; ++i) {
                idx0 = indices ? indices[i] : i;
                vertNormals[i] = vec3.normalize(smoothedNormals[idx0]);
            }
            this.vertNormals = vertNormals;
        }

        this.vertCount = indexCount;
        this.vertArray = buffer;
        this.faceNormals = faceNormals;
        return buffer;
    };

    FacetedMesh.prototype.setNormalSmoothing = function(gl, smoothFactor) {
        var i, j, l;

        if(!smoothFactor) { smoothFactor = 0.0; }

        var a = vec3.create();
        var faceNormals = this.faceNormals;
        var vertNormals = this.vertNormals;
        var vertArray = this.vertArray;

        // Mix the per-vertex normals and face normals for a bit more interest
        for(i = 0, l = this.vertCount; i < l; ++i) {
            j = i * 6;

            if(vertNormals && smoothFactor > 0) {
                vec3.lerp(faceNormals[i], vertNormals[i], smoothFactor, a);
            } else {
                a = faceNormals[i];
            }

            vec3.normalize(a);

            vertArray[j + 3] = a[0];
            vertArray[j + 4] = a[1];
            vertArray[j + 5] = a[2];
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.STATIC_DRAW);
    };

    FacetedMesh.prototype.generateColorBuffer = function(gl, colors, indices) {
        var indexCount = indices.length;
        var colorArray = new Uint32Array(indexCount);
        var i;

        // Unpack the colors into a non-indexed buffer
        for(i = 0; i < indexCount; ++i) {
            colorArray[i] = colors[indices[i]];
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, colorArray, gl.STATIC_DRAW);
    };

    FacetedMesh.prototype.draw = function(gl, shader) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
        gl.enableVertexAttribArray(shader.attribute.position);
        gl.enableVertexAttribArray(shader.attribute.normal);
        gl.vertexAttribPointer(shader.attribute.position, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(shader.attribute.normal, 3, gl.FLOAT, false, 24, 12);

        if(this.colorBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
            gl.enableVertexAttribArray(shader.attribute.color);
            gl.vertexAttribPointer(shader.attribute.color, 4, gl.UNSIGNED_BYTE, true, 4, 0);
        }

        gl.drawArrays(gl.TRIANGLES, 0, this.vertCount);
    };

    return FacetedMesh;
});