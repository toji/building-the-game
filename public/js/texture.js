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
    "util/q"
], function (Q) {

    "use strict";

    var TextureManager = function () {
        this.textures = {};
    };

    TextureManager.prototype.getInstance = function (gl, url) {
        var self = this,
            defer;
        
        if(this.textures[url]) {
            return this.textures[url];
        }
        
        defer = Q.defer();
        
        this.textures[url] = defer.promise;

        var texture = gl.createTexture();
        var image = new Image();
        image.addEventListener("load", function() {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
            gl.generateMipmap(gl.TEXTURE_2D);
        
            defer.resolve(texture);
        });
        image.addEventListener("error", function(err) {
            defer.reject(texture);
        });
        image.src = url;
        
        return defer.promise;
    };

    return {
        TextureManager: new TextureManager()
    };
});