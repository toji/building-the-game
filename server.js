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

// For now this is a simple static file server, but eventually this will turn
// into the game server

var path = require("path");
var express = require("express");
var isosurface = require('./isosurface');

var PORT = 80;
var STATIC_PATH = path.join(__dirname, "public");

var app = express.createServer();
app.use(express.bodyParser());

app.use("/", isosurface.app);

app.use(express.static(STATIC_PATH));
//app.use(express.directory(STATIC_PATH));

app.listen(PORT);

//console.log("Server is now listening on port " + PORT);





