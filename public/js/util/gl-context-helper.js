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

/*
 * This file creates the renderer, starts the render loop, manages the FPS counter
 * and handles logic for the fullscreen button. It generally should not need to be
 * edited, and most rendering logic should go in renderer.js
 */

define([
    "util/gl-util",
    "js/util/game-shim.js",
], function(glUtil) {

    "use strict";

    var GLContextHelper = function(canvas, fullscreenElement) {
        var self = this, resizeTimeout;
        if(!fullscreenElement) { fullscreenElement = canvas; }

        //
        // Create gl context and start the render loop
        //
        this.canvas = canvas;
        this.fullscreenElement = null;
        this.fullscreenSupported = false;
        this.mobileDevice = false;
        this.forceMobile = false;
        this.lastWidth = 0;
        this.renderer = null;
        this.canvasScale = 1.0;

        this.gl = glUtil.getContext(canvas, {preserveDrawingBuffer: true});

        if(!this.gl) {
            glUtil.showGLFailed(canvas);
        } else {
            var resizeCallback = function() { self.windowResized(); };

            // On mobile devices, the canvas size can change when we rotate. Watch for that:
            document.addEventListener("orientationchange", resizeCallback, false);

            // Note: This really sucks, but it's apparently the best way to get this to work on Opera mobile
            window.addEventListener("resize", function() {
                if(resizeTimeout) { clearTimeout(resizeTimeout); }
                resizeTimeout = setTimeout(resizeCallback, 250);
            }, false);

            this.setFullscreenElement(fullscreenElement);
        }
    };

    GLContextHelper.prototype.start = function(renderer, stats) {
        if(!renderer.draw) {
            throw new Error("Object passed to startRenderLoop must have a draw function");
        }

        this.renderer = renderer;

        if(!stats) {
            stats = {
                begin: function() {},
                end: function() {}
            };
        }

        var startTime = Date.now(),
            lastTimeStamp = startTime,
            canvas = this.canvas,
            gl = this.gl;

        var timingData = {
            startTime: startTime,
            timeStamp: 0,
            elapsed: 0,
            frameTime: 0
        };

        this.windowResized(true);
    
        function nextFrame(){
            // Recommendation from Opera devs: calling the RAF shim at the beginning of your
            // render loop improves framerate on browsers that fall back to setTimeout
            window.requestAnimationFrame(nextFrame, canvas);

            var time = Date.now();
            timingData.timeStamp = time;
            timingData.elapsed = time - startTime;
            timingData.frameTime = time - lastTimeStamp;

            stats.begin();
            renderer.draw(gl, timingData);
            stats.end();

            lastTimeStamp = time;
        }

        window.requestAnimationFrame(nextFrame, canvas);
    };

    GLContextHelper.prototype.windowResized = function(force) {
        if(this.lastWidth === window.innerWidth && !force) { return; }

        var canvas = this.canvas;
        var scale = this.canvasScale;

        // We'll consider "mobile" and "screen deprived" to be the same thing :)
        this.lastWidth = window.innerWidth;
        this.mobileDevice = this.forceMobile || (screen.width <= 960);

        // If we don't set this here, the rendering will be skewed
        if(this.mobileDevice) {
            canvas.width = window.innerWidth * window.devicePixelRatio * scale;
            canvas.height = window.innerHeight * window.devicePixelRatio * scale;
            
        } else {
            canvas.width = canvas.offsetWidth * scale;
            canvas.height = canvas.offsetHeight * scale;
        }

        if(this.renderer && this.renderer.resize) {
            this.renderer.resize(this.gl, canvas);
        }
    };

    GLContextHelper.prototype.setFullscreenElement = function(fullscreenElement) {
        var canvas = this.canvas,
            canvasOriginalWidth = canvas.offsetWidth,
            canvasOriginalHeight = canvas.offsetHeight,
            self = this;

        this.fullscreenElement = fullscreenElement;
        this.fullscreenSupported = this.gl && GameShim.supports.fullscreen;

        document.addEventListener("fullscreenchange", function() {
            var scale = self.canvasScale;

            if(document.fullscreenEnabled) {
                canvas.width = screen.width * scale;
                canvas.height = screen.height * scale;
            } else {
                canvas.width = canvasOriginalWidth * scale;
                canvas.height = canvasOriginalHeight * scale;
            }

            if(this.renderer && this.renderer.resize) {
                this.renderer.resize(this.gl, canvas);
            }
        }, false);
    };

    GLContextHelper.prototype.toggleFullscreen = function() {
        if(!document.fullscreenEnabled) {
            this.fullscreenElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    };

    return GLContextHelper;
});

