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
    "js/util/gl-matrix.js"
], function () {

    "use strict";

    var ModelCamera, FlyingCamera;

    /**
     * A ModelDemoCamera is one that always points at a central point and orbits around at a fixed radius
     * This type of camera is good for displaying individual models
     */
    ModelCamera = function (canvas) {
        var self = this, moving = false,
            lastX, lastY;

        this.orbitX = 0;
        this.orbitY = 0;
        this._distance = 32;
        this._center = vec3.create();
        this._viewMat = mat4.create();
        this._dirty = true;

        // Set up the appropriate event hooks
        canvas.addEventListener('mousedown', function (event) {
            if (event.which === 1) {
                moving = true;
            }
            lastX = event.pageX;
            lastY = event.pageY;
        }, false);

        canvas.addEventListener('mousemove', function (event) {
            if (moving) {
                var xDelta = event.pageX  - lastX,
                    yDelta = event.pageY  - lastY;

                lastX = event.pageX;
                lastY = event.pageY;

                self.orbitY += xDelta * 0.025;
                while (self.orbitY < 0) {
                    self.orbitY += Math.PI * 2;
                }
                while (self.orbitY >= Math.PI * 2) {
                    self.orbitY -= Math.PI * 2;
                }

                self.orbitX += yDelta * 0.025;
                while (self.orbitX < 0) {
                    self.orbitX += Math.PI * 2;
                }
                while (self.orbitX >= Math.PI * 2) {
                    self.orbitX -= Math.PI * 2;
                }

                self._dirty = true;
            }
        }, false);

        canvas.addEventListener('mouseup', function () {
            moving = false;
        }, false);

        return this;
    };

    ModelCamera.prototype.getCenter = function () {
        return this._center;
    };

    ModelCamera.prototype.setCenter = function (value) {
        this._center = value;
        this._dirty = true;
    };

    ModelCamera.prototype.getDistance = function () {
        return this._distance;
    };

    ModelCamera.prototype.setDistance = function (value) {
        this._distance = value;
        this._dirty = true;
    };

    ModelCamera.prototype.getViewMat = function () {
        if (this._dirty) {
            var mv = this._viewMat;
            mat4.identity(mv);
            mat4.translate(mv, [0, 0, -this.distance]);
            mat4.rotateX(mv, this.orbitX + (Math.PI / 2));
            mat4.translate(mv, this._center);
            mat4.rotateX(mv, -Math.PI / 2);
            mat4.rotateY(mv, this.orbitY);

            this._dirty = false;
        }

        return this._viewMat;
    };

    ModelCamera.prototype.update = function () {
        // Not actually needed here. Just makes switching between camera types easier
    };

    /**
     * A FlyingDemoCamera allows free motion around the scene using FPS style controls (WASD + mouselook)
     * This type of camera is good for displaying large scenes
     */
    FlyingCamera = function (canvas) {
        var self = this, moving = false,
            lastX, lastY;

        this._angles = vec3.create();
        this._position = vec3.create();
        this.speed = 100;
        this._pressedKeys = new Array(128);
        this._viewMat = mat4.create();
        this._cameraMat = mat4.create();
        this._dirty = true;
        
        // Set up the appropriate event hooks
        window.addEventListener("keydown", function (event) {
            self._pressedKeys[event.keyCode] = true;
        }, false);

        window.addEventListener("keyup", function (event) {
            self._pressedKeys[event.keyCode] = false;
        }, false);

        canvas.addEventListener('mousedown', function (event) {
            if (event.which === 1) {
                moving = true;
            }
            lastX = event.pageX;
            lastY = event.pageY;
        }, false);

        canvas.addEventListener('mousemove', function (event) {
            if (moving) {
                var xDelta = event.pageX  - lastX,
                    yDelta = event.pageY  - lastY;

                lastX = event.pageX;
                lastY = event.pageY;

                self._angles[1] += xDelta * 0.025;
                while (self._angles[1] < 0) {
                    self._angles[1] += Math.PI * 2.0;
                }
                while (self._angles[1] >= Math.PI * 2.0) {
                    self._angles[1] -= Math.PI * 2.0;
                }

                self._angles[0] += yDelta * 0.025;
                while (self._angles[0] < -Math.PI * 0.5) {
                    self._angles[0] = -Math.PI * 0.5;
                }
                while (self._angles[0] > Math.PI * 0.5) {
                    self._angles[0] = Math.PI * 0.5;
                }

                self._dirty = true;
            }
        }, false);

        canvas.addEventListener('mouseup', function () {
            moving = false;
        }, false);

        return this;
    };

    FlyingCamera.prototype.getAngles = function () {
        return this._angles;
    };

    FlyingCamera.prototype.setAngles = function (value) {
        this._angles = value;
        this._dirty = true;
    };

    FlyingCamera.prototype.getPosition = function () {
        return this._position;
    };

    FlyingCamera.prototype.setPosition = function (value) {
        this._position = value;
        this._dirty = true;
    };

    FlyingCamera.prototype.getViewMat = function () {
        if (this._dirty) {
            var mv = this._viewMat;
            mat4.identity(mv);
            mat4.rotateX(mv, this._angles[0] - Math.PI / 2.0);
            mat4.rotateZ(mv, this._angles[1]);
            mat4.rotateY(mv, this._angles[2]);
            mat4.translate(mv, [-this._position[0], -this._position[1], -this._position[2]]);
            this._dirty = false;
        }

        return this._viewMat;
    };

    FlyingCamera.prototype.update  = function (frameTime) {
        var dir = vec3.create(),
            speed = (this.speed / 1000) * frameTime,
            cam;

        // This is our first person movement code. It's not really pretty, but it works
        if (this._pressedKeys['W'.charCodeAt(0)]) {
            dir[1] += speed;
        }
        if (this._pressedKeys['S'.charCodeAt(0)]) {
            dir[1] -= speed;
        }
        if (this._pressedKeys['A'.charCodeAt(0)]) {
            dir[0] -= speed;
        }
        if (this._pressedKeys['D'.charCodeAt(0)]) {
            dir[0] += speed;
        }
        if (this._pressedKeys[32]) { // Space, moves up
            dir[2] += speed;
        }
        if (this._pressedKeys[17]) { // Ctrl, moves down
            dir[2] -= speed;
        }

        if (dir[0] !== 0 || dir[1] !== 0 || dir[2] !== 0) {
            cam = this._cameraMat;
            mat4.identity(cam);
            mat4.rotateX(cam, this._angles[0]);
            mat4.rotateZ(cam, this._angles[1]);
            mat4.inverse(cam);

            mat4.multiplyVec3(cam, dir);

            // Move the camera in the direction we are facing
            vec3.add(this._position, dir);

            this._dirty = true;
        }
    };

    return {
        ModelCamera: ModelCamera,
        FlyingCamera: FlyingCamera
    };
});