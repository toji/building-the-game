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
    "model",
    "texture",
    "util/q",
    "js/util/gl-matrix.js"
], function (glUtil, model, texture, Q) {

    "use strict";
    
    var Level = function () {
        this.props = [];
        this.lightmaps = [];
        this.complete = false;
    };

    Level.prototype.load = function (gl, url, callback) {
        var self = this;

        // Load the json portion of the model
        var jsonXhr = new XMLHttpRequest();
        jsonXhr.open('GET', url + ".wgllevel", true);
        jsonXhr.onload = function() {
            // TODO: Error Catch!
            var level = JSON.parse(this.responseText);
            self._parseLevel(level);
            self._compileLevel(gl);
            
            self.complete = true;
            if (callback) { callback(self); }
        };
        jsonXhr.send(null);
    };

    Level.prototype._parseLevel = function (doc) {
        this.lightmapPaths = doc.lightmaps;
        this.props = doc.props;
    };

    Level.prototype._compileLevel = function (gl) {
        var i, j, prop, instance, url, lightmap;
        for(i in this.lightmapPaths) {
            lightmap = this.lightmapPaths[i];
            this._loadLightmap(gl, i, this.lightmapPaths[i]);
        }
        
        for (i in this.props) {
            prop = this.props[i];
            url = prop.model;
            prop.model = new model.Model();
            prop.model.load(gl, url);
            
            for(j in prop.instances) {
                instance = prop.instances[j];
                instance.modelInstance = prop.model.createInstance();
                instance.modelInstance.matrix = mat4.fromRotationTranslation(instance.rot, instance.pos);
                mat4.scale(instance.modelInstance.matrix, [instance.scale, instance.scale, instance.scale]);
                instance.modelInstance.lightmap = instance.lightmap;
                instance.modelInstance.lightmap.scale = new Float32Array(instance.lightmap.scale);
                instance.modelInstance.lightmap.offset = new Float32Array(instance.lightmap.offset);
            }
        }
    };
    
    Level.prototype._loadLightmap = function(gl, id, url) {
        var self = this;
        this.lightmaps[id] = null;
        Q.when(texture.TextureManager.getInstance(gl, url), function(tex) {
            self.lightmaps[id] = tex;
        });
    };

    Level.prototype.draw = function (gl, viewMat, projectionMat) {
        var i, prop;
        if (!this.complete) { return; }
        
        for (i in this.props) {
            prop = this.props[i];
            prop.model.drawLightmappedInstances(gl, viewMat, projectionMat, this.lightmaps);
        }
    };

    return {
        Level: Level
    };
});