const schema = require("protocol-buffers-schema");
const fs = require("fs");
const path = require("path");
const Pbf = require("pbf");
const Compile = require("pbf/compile");
const globalMercator = require("global-mercator");
const ngeohash = require("ngeohash");

const proto = fs.readFileSync(path.join(__dirname, "vector_tile.proto"));
const proto_schema = schema.parse(proto);
const mvt = Compile(proto_schema);

const POINT = 1;
const POLYGON = 3;
const MOVETO = 1;
const LINETO = 2;
const CLOSEPATH = 7;

const tileSize = 4096;

class ElasticTile {

    /**
     * Represents a tile.
     *
     * @constructor
     * @param xyz - Tile x, y, and zoom as an array.
     * @param precision - Geohash precision.
     * @param margin - Margin around the tile in geohash grid cells.
     */
    constructor(xyz, precision, type = "point", margin = 0) {
        this.xyz = xyz;
        this.precision = precision;
        this.type = type;
        this.margin = margin;
        this.bbox = globalMercator.googleToBBox(xyz);
        this.calculateEnvelope(xyz);
    }

    /**
     * Calculates the envelope around a tile based on the bounding box, geohash precision,
     * and margin.
     */
    calculateEnvelope() {
        const [ minLon, minLat, maxLon, maxLat ] = this.bbox;
        const topLeft = ngeohash.encode(maxLat, minLon, this.precision);
        const bottomRight = ngeohash.encode(minLat, maxLon, this.precision);
        const topLeftMargin = ngeohash.neighbor(topLeft, [this.margin, -this.margin]);
        const bottomRightMargin = ngeohash.neighbor(bottomRight, [-this.margin, this.margin]);
        const [ , minLon2, maxLat2, ] = ngeohash.decode_bbox(topLeftMargin);
        const [ minLat2, , , maxLon2 ] = ngeohash.decode_bbox(bottomRightMargin);
        this.envelope = [ minLon2, minLat2, maxLon2, maxLat2 ];
    };

    /**
     * Converts longitude and latitude to pixel coordinates.
     *
     * @param lon - Longitude.
     * @param lat - Latitude.
     */
    coordsToPixels(lon, lat) {
        const fraction = globalMercator.pointToTileFraction([lon, lat], this.xyz[2], false);
        const x = Math.floor((fraction[0] - this.xyz[0]) * tileSize);
        const y = Math.floor((fraction[1] - this.xyz[1]) * tileSize);
        return [ x, y ];
    };

    /**
     * Generates a vector tile from Elasticsearch buckets.
     *
     * @param buckets - Elasticsearch geohash grid aggregation buckets.
     * @param layerName - Layer name.
     */
    makeTile(buckets, layerName = "grid") {
        let props = [];
        if (buckets.length > 0) {
            props = Object.keys(buckets[0]).filter(key => key !== "key");
        }
        let t = new VectorTile();
        let layer = new Layer(layerName);
        layer.keys = props;
        t.addLayer(layer);
        const self = this;
        buckets.forEach(function(bucket) {
            let feature;

            // geometry

            let hash = bucket.key;
            let [ minLat, minLon, maxLat, maxLon ] = ngeohash.decode_bbox(hash);

            if (self.type === "point") {
                let center = self.coordsToPixels((minLon + maxLon) / 2, (minLat + maxLat) / 2);
                feature = new PointFeature();
                feature.addPoints([ center ]);
            } else if (self.type === "polygon") {
                feature = new PolygonFeature();
                feature.addPolygon([
                    self.coordsToPixels(minLon, maxLat),
                    self.coordsToPixels(maxLon, maxLat),
                    self.coordsToPixels(maxLon, minLat),
                    self.coordsToPixels(minLon, minLat)
                ]);
            }

            // properties

            props.forEach((prop, index) => {
                if (prop in bucket) {
                    if (typeof bucket[prop] === "number") {
                        layer.values.push({ double_value: bucket[prop] });
                        feature.tags.push(index);
                        feature.tags.push(layer.values.length - 1);
                    } else if (typeof bucket[prop] === "string") {
                        layer.values.push({ string_value: bucket[prop] });
                        feature.tags.push(index);
                        feature.tags.push(layer.values.length - 1);
                    }
                }
            });

            layer.addFeature(feature);
        });

        return t.generateBuffer();
    }
}

class VectorTile {

    /**
     * Represents a generic vector tile.
     *
     * @constructor
     */
    constructor() {
        this.layers = [];
    }

    /**
     * Add a layer.
     *
     * @param layer - Layer object.
     */
    addLayer(layer) {
        this.layers.push(layer);
        return layer;
    }

    /**
     * Generate a tile buffer.
     */
    generateBuffer() {
        const pbf = new Pbf();
        mvt.Tile.write(this, pbf);
        return Buffer.from(pbf.finish());
    }
}

class Layer {

    /**
     * Represents a layer.
     *
     * @constructor
     * @param name - The layer name.
     */
    constructor(name) {
        this.name = name;
        this.version = 2;
        this.features = [];
        this.keys = [];
        this.values = [];
    }

    /**
     * Add a feature.
     *
     * @param feature - Feature object.
     */
    addFeature(feature) {
        this.features.push(feature);
    }
}

class PointFeature {

    /**
     * Represents a point feature.
     *
     * @constructor
     */
    constructor() {
        this.type = POINT;
        this.geometry = [];
        this.cursor = [0, 0];
        this.tags = [];
    }

    /**
     * Add points.
     *
     * @param coords - Coordinates as longitude latitude pairs.
     */
    addPoints(coords) {
        this.geometry = this.geometry.concat(commandInteger(MOVETO, coords.length));
        coords.forEach(xy => {
            let delta = [ xy[0] - this.cursor[0], xy[1] - this.cursor[1] ];
            this.cursor = xy;
            this.geometry = this.geometry.concat(encodePoint(delta));
        });
    }
}

class PolygonFeature {

    /**
     * Represents a polygon feature.
     *
     * @constructor
     */
    constructor() {
        this.type = POLYGON;
        this.geometry = [];
        this.cursor = [0, 0];
        this.tags = [];
    }

    /**
     * Add a polygon.
     *
     * @param coords - Vertex coordinates.
     */
    addPolygon(coords) {
        let delta = [ coords[0][0] - this.cursor[0], coords[0][1] - this.cursor[1] ];
        this.geometry = this.geometry.concat(commandInteger(MOVETO, 1));
        this.geometry = this.geometry.concat(encodePoint(delta));
        this.cursor = delta;
        coords.shift();
        this.geometry = this.geometry.concat(commandInteger(LINETO, coords.length));
        coords.forEach(xy => {
            delta = [ xy[0] - this.cursor[0], xy[1] - this.cursor[1] ];
            this.cursor = xy;
            this.geometry = this.geometry.concat(encodePoint(delta));
        });
        this.geometry = this.geometry.concat(commandInteger(CLOSEPATH, 1));
    }
}

/**
 * Encode a command integer.
 *
 * @param id - The command ID.
 * @param count - The number of times the command should be executed.
 */
function commandInteger(id, count) {
    return (id & 0x7) | (count << 3);
}

/**
 * Encode a parameter integer.
 *
 * @param value - The parameter ID.
 */
function parameterInteger(value) {
    return (value << 1) ^ (value >> 31);
}

/**
 * Encode point coordinates.
 *
 * @param xy - Longitude and latitude.
 */
function encodePoint(xy) {
    return [ parameterInteger(xy[0]), parameterInteger(xy[1]) ];
}

module.exports = {
    VectorTile,
    Layer,
    PointFeature,
    PolygonFeature,
    ElasticTile
};