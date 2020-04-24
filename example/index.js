const express = require("express");
const axios = require("axios");
const tile = require("../src");
const { Client } = require("@elastic/elasticsearch");
const client = new Client({ node: "http://localhost:9200" });

const port = 2000;

function random() {
    let r = 0;
    for (let i = 0; i < 10; i++) {
        r += Math.random();
    }
    return r / 10 - 0.5;
};

async function makeCluster(lon, lat, n) {
    for (let i = 1; i < n; i++) {
        await client.index({
            index: "points",
            body: {
                "location": {
                    "lat": lat + random() * 10.0,
                    "lon": lon + random() * 10.0
                }
            }
        });
    };
};

async function populate() {
    const res = await client.indices.exists( { index: "points" });
    if (!res.body) {
        await client.indices.create( { index: "points" });
    }
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
    await makeCluster(-1, 50, 100);
    await makeCluster(3, 52, 300);
    await makeCluster(5, 54, 50);
    console.log("Finished populating Elasticsearch");
};

populate();

const app = express();
app.use(express.static("public"));

app.get("/tile/:type/:precision/:z/:x/:y.mvt", async function(req, res) {
    const xyz = [ parseInt(req.params.x), parseInt(req.params.y), parseInt(req.params.z) ];
    const margin = 2;
    const t = new tile.ElasticTile(xyz, req.params.precision, req.params.type, margin);
    const [ minLon, minLat, maxLon, maxLat ] = t.envelope;
    const body = {
        "size": 0,
        "_source": "location",
        "aggregations": {
            "grid": {
                "geohash_grid" : {
                    "field": "location",
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
    };
    const result = await axios.post("http://localhost:9200/points/_search", body);
    const buckets = result.data.aggregations.grid.buckets;
    res.end(t.makeTile(buckets));
});

app.get("/", function(req, res) {
    res.sendFile(__dirname + "/index.html");
});

app.listen(port, () => console.log(`Demo app listening on port ${port}!`));