const elastictiles = require("../src/index");
const expect = require("chai").expect;

describe("tile", () => {

    describe("make an empty tile", () => {
        it("should return a tile with 1 layer and 0 features", () => {
            let tile = new elastictiles.VectorTile();
            let layer = new elastictiles.Layer("test");
            tile.addLayer(layer);
            expect(tile.layers.length).to.equal(1);
            expect(layer.features.length).to.equal(0);
        });
    });

    describe("make a tile with a single point", () => {
        it("should return a tile with the expected encoded geometry", () => {
            let tile = new elastictiles.VectorTile();
            let layer = new elastictiles.Layer("stations");
            let feature = new elastictiles.PointFeature();
            tile.addLayer(layer);
            layer.addFeature(feature);
            feature.addPoints([[ 25, 17 ]]);
            expect(JSON.stringify(tile.layers[0].features[0].geometry)).to.equal("[9,50,34]");
        });
    });

    describe("make a tile with two points", () => {
        it("should return a tile with the expected encoded geometry", () => {
            let tile = new elastictiles.VectorTile();
            let layer = new elastictiles.Layer("stations");
            let feature = new elastictiles.PointFeature();
            tile.addLayer(layer);
            layer.addFeature(feature);
            feature.addPoints([[ 5, 7 ], [ 3, 2 ]]);
            expect(JSON.stringify(tile.layers[0].features[0].geometry)).to.equal("[17,10,14,3,9]");
        });
    });

    describe("make a tile with one polygon", () => {
        it("should return a tile with the expected encoded geometry", () => {
            let tile = new elastictiles.VectorTile();
            let layer = new elastictiles.Layer("stations");
            let feature = new elastictiles.PolygonFeature();
            tile.addLayer(layer);
            layer.addFeature(feature);
            feature.addPolygon([[ 3, 6 ], [ 8, 12 ], [ 20, 34 ]]);
            expect(JSON.stringify(tile.layers[0].features[0].geometry)).to.equal("[9,6,12,18,10,12,24,44,15]");
        });
    });

});