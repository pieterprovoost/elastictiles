const t = require("../src/tile");

/*
let tile = new t.VectorTile();
let layer = new t.Layer("stations");
let feature = new t.PointFeature();
tile.addLayer(layer);
layer.addFeature(feature);
feature.addPoints([[ 5, 7 ], [ 3, 2 ]]);
let buffer = tile.generateBuffer();
console.log(JSON.stringify(tile));
console.log(buffer);
*/

tile = new t.VectorTile();
layer = new t.Layer("stations");
feature = new t.PolygonFeature();
tile.addLayer(layer);
layer.addFeature(feature);
feature.addPolygon([[ 3, 6 ], [ 8, 12 ], [ 20, 34 ]]);
buffer = tile.generateBuffer();
console.log(JSON.stringify(tile));
console.log(buffer);
