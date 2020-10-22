const express = require("express");
const { Client } = require("@elastic/elasticsearch");
const cors = require("cors");
const tile = require("../src");

const PORT = 2000;
const N_POINTS = 100000;
const ES_ENDPOINT = "http://localhost:9200";
const POPULATE = true;

const client = new Client({ node: ES_ENDPOINT });

async function populate() {
    const res = await client.indices.exists( { index: "points" });
    if (!res.body) {
        await client.indices.create( { index: "points" });
    }
    await client.cluster.putSettings({
        body: {
            "transient": {
                "search.max_buckets": N_POINTS * 10
            }
        }
    });
    await client.deleteByQuery({
        index: "points",
        body: {
            query: {
                "match_all": {}
            }
        }
    });
    await client.indices.putMapping({
        index: "points",
        body: {
            "properties": {
                "location": {
                    "type": "geo_point"
                }
            }
        }
    });
    for (let i = 0; i < N_POINTS; i++) {
        await client.index({
            index: "points",
            body: {
                "location": {
                    "lat": -90 + Math.random() * 180,
                    "lon": -180 + Math.random() * 360
                }
            }
        });
    }
    console.log("Finished populating Elasticsearch");
};

if (POPULATE) populate();
const app = express();
app.use(cors());

app.get("/tile/:type/:precision/:z/:x/:y.mvt", async function(req, res) {
    const xyz = [ parseInt(req.params.x), parseInt(req.params.y), parseInt(req.params.z) ];
    const margin = 0;
    const t = new tile.ElasticTile(xyz, req.params.precision, req.params.type, margin);
    const [ minLon, minLat, maxLon, maxLat ] = t.envelope;

    const { body } = await client.search({
        index: "points",
        body: {
            "size": 0,
            "_source": "location",
            "aggregations": {
                "grid": {
                    "geohash_grid" : {
                        "field": "location",
                        "size": N_POINTS * 10,
                        "precision": req.params.precision
                    }
                }
            },
            "query": {
                "bool": {
                    "must" : {
                        "match_all" : {}
                    },
                    "filter": {
                        "geo_bounding_box": {
                            "location": {
                                "top_left": [ minLon, maxLat ],
                                "bottom_right": [ maxLon, minLat ]
                            }
                        }
                    }
                }
            }
        }
    });

    res.end(t.makeTile(body.aggregations.grid.buckets));
});

app.get("/:filename", function(req, res) {
    res.sendFile(__dirname + "/" + req.params.filename);
});

app.listen(PORT, () => console.log(`Demo app listening on port ${PORT}!`));