var fs = require('fs');
var express = require('express');
var mongoose = require('mongoose');
var ejs = require('ejs');

var mongoPath = "mongodb://Put the path to your MongoDB instance here";
mongoose.connect(mongoPath);

var isosurfaceSchema = new mongoose.Schema({
    source: String,
    created: Date,
    thumbnail: String,
    blockSizeX: Number,
    blockSizeY: Number,
    blockSizeZ: Number,
    gridSize: Number,
    isolevel: Number
});
var Isosurface = mongoose.model('Isosurface', isosurfaceSchema);

var isosurfaceApp = express.createServer();
isosurfaceApp.set('view engine', 'ejs');
isosurfaceApp.set('view options', { layout: false });

var errSrc = [
    "// ERROR: The original source for this surface could not be found",
    "",
    "return {",
    "   isosurface: function(x, y, z) {",
    "       return z;",
    "   },",
    "",
    "   color: function(x, y, z) {",
    "       return 0xFF000088;",
    "   }",
    "}"
].join('\n');

var defaultSrc = [
    "function octave(x, y, z, oct) {",
    "   return (1.0/oct) * noise.noise3d (x*oct, y*oct, z*oct);",
    "}",
    "",
    "var scale = 1/64;",
    "",
    "return {",
    "   isosurface: function(x, y, z) {",
    "       x *= scale;",
    "       y *= scale;",
    "       z *= scale * 2;",
    "",
    "       var density = z * 3;",
    "",
    "       density += octave(x, y, z, 1.0);",
    "       density += octave(x, y, z, 8.0);",
    "",
    "       return density;",
    "   },",
    "",
    "   color: function(x, y, z) {",
    "       if(z > 0) {",
    "           return lerpColors(0xFF008800, 0xFFCCDDEE, z/32);",
    "       } else {",
    "           return lerpColors(0xFF004400, 0xFF008800, (z+32)/32);",
    "       }",
    "   }",
    "}"
].join('\n');

var defaultSurface = {
    source: defaultSrc,
    blockSizeX: 32,
    blockSizeY: 32,
    blockSizeZ: 64,
    gridSize: 3,
    isolevel: 0
};

// Get list of all isosurfaces definitions on the surface
isosurfaceApp.get('/$', function(req, res){
    res.render("index", defaultSurface);
});

// Get a single isosurface definition
isosurfaceApp.get('/:id', function(req, res) {
    if(req.params.id) {
        Isosurface.findById(req.params.id, function (err, doc){
            if(err) {
                res.render("index", defaultSurface);
            } else {
                if(!doc) {
                    doc = defaultSurface;
                    doc.source = errSrc;
                }
                else if(!doc.source) {
                    doc.source = errSrc;
                }
                res.render("index", doc);
            }
            
        });
    } else {
        res.render("index", defaultSurface);
    }
});

// Get a single isosurface definition
isosurfaceApp.get('/api/list$', function(req, res) {
    Isosurface.find().limit(25).sort('created', -1).exec(function(err, docs) {
        res.send(JSON.stringify(docs));
    });
});

// Save an isosurface definition
isosurfaceApp.post('/api$', function(req, res) {
    var isosurface = new Isosurface();

    isosurface.created = Date.now();
    isosurface.source = req.body.source;
    isosurface.thumbnail = req.body.thumbnail;
    isosurface.blockSizeX = req.body.blockSizeX;
    isosurface.blockSizeY = req.body.blockSizeY;
    isosurface.blockSizeZ = req.body.blockSizeZ;
    isosurface.gridSize = req.body.gridSize;
    isosurface.isolevel = req.body.isolevel;

    isosurface.save(function (err) {
        if (!err) {
            res.send(JSON.stringify({id: isosurface._id}));
        }
    });
});

// TODO: Remove before pushing live!
/*isosurfaceApp.get('/api/delete/:id', function(req, res) {
    Isosurface.findById(req.params.id, function (err, doc){
        if(doc) {
            doc.remove();
            res.send(JSON.stringify({success: true}));
        }
    });
});

isosurfaceApp.get('/api/clear', function(req, res) {
    Isosurface.find().exec(function (err, docs){
        var i;
        for(i in docs) {
            docs[i].remove();
        }
        res.send(JSON.stringify({success: true}));
    });
});*/

// Get a single isosurface definition
isosurfaceApp.get('/api/:id', function(req, res) {
    Isosurface.findById(req.params.id, function (err, doc){
        if(!doc.source) { doc.source = errSrc; }
        res.send(JSON.stringify(doc));
    });
});



exports.app = isosurfaceApp;