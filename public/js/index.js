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

require([
    "renderer",
    "util/gl-context-helper",
    "util/gl-util",
    "js/util/game-shim.js",
    "js/util/Stats.js",
    "js/angular/angular-1.0.0.min.js"
], function(Renderer, GLContextHelper, GLUtil) {

    "use strict";

    // Setup the canvas and GL context, initialize the scene
    var canvas = document.getElementById("webgl-canvas");
    var contextHelper = new GLContextHelper(canvas, document.getElementById("content-frame"));
    var renderer = new Renderer(contextHelper.gl, canvas);

    var fullscreenBtn = document.getElementById("fullscreen");
    if(contextHelper.fullscreenSupported) {
        fullscreenBtn.addEventListener("click", function() {
            contextHelper.toggleFullscreen();
        });
    } else {
        fullscreenBtn.parentElement.removeChild(fullscreenBtn);
    }

    var stats = new Stats();
    document.getElementById("controls-container").appendChild(stats.domElement);
    
    // Get the render loop going
    contextHelper.start(renderer, stats);

    // Angular App
    window.IsosurfaceState = function($scope, $http) {
        $scope.renderer = renderer;
        renderer.appScope = $scope;

        $http.get('api/list').success(function(data) {
            $scope.recentSurfaces = data;
        });

        // When changes are made that affect the rendered surface force a refresh
        $scope.$watch( '[renderer.blockSizeX, renderer.blockSizeY, renderer.blockSizeZ, renderer.gridSize, renderer.isolevel]', function( newVal, oldVal ) {
            renderer.rebuildSurfaces();
        }, true );

        $scope.savedUrl = null;
        $scope.viewingRecent = false;

        $scope.save = function() {
            if(renderer.algorithimErr) {
                return; // Don't save erronious code
            }
            var request = new XMLHttpRequest();
            request.addEventListener("load", function() {
                var res = JSON.parse(this.responseText);
                $scope.$apply(function(){
                    $scope.savedUrl = "/" + res.id;
                });
            });
            request.open('POST', "/api", true);
            request.overrideMimeType('application/json');
            request.setRequestHeader('Content-Type', 'application/json');
            request.send(JSON.stringify({
                source: renderer.getSource(),
                thumbnail: renderer.getThumbnail(),
                blockSizeX: renderer.blockSizeX,
                blockSizeY: renderer.blockSizeY,
                blockSizeZ: renderer.blockSizeZ,
                gridSize: renderer.gridSize,
                isolevel: renderer.isolevel
            }));
        };

        $scope.showRecent = function() {
            $scope.viewingRecent = true;
        };

        $scope.showSurface = function() {
            $scope.viewingRecent = false;
        };
    };

    angular.bootstrap(document.body, []);
});
