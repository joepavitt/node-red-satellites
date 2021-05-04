// var positionAndVelocity = satellite.sgp4(satrec, time);
module.exports = function (RED) {
    "use strict";
    var express = require("express");
    var path = require("path");
    var io = require('socket.io');
    var http = require('http');

    var satellite = require('satellite.js').satellite;
    var socket;

    function parseTLEFile(fileURL) {
        return new Promise(function(resolve, reject) {
            http.get(fileURL, (res) => {
                let satdata = '';
                let sats = [];
                res.on('data', (chunk) => { satdata += chunk; });
                res.on('end', () => {
                    let lines = satdata.split('\r');
                    for (var i = 0; i < lines.length; i++) {
                        if (lines[i] !== undefined && lines[i+1] !== undefined && lines[i+2] !== undefined) {
                            let s = {};
                            s.name = lines[i].replace("\n", "").trim();
                            i++;
                            s.tle1 = lines[i].replace("\n", "").trim();
                            i++;
                            s.tle2 = lines[i].replace("\n", "").trim();
                            sats.push(s);
                        }
                    }
                    resolve(sats);
                });
            });
        });
    }

    function createSatObject(id, satrec, timestamp) {
        var date = new Date(timestamp);
        var posvel = satellite.propagate(satrec, date);
        var gmst = satellite.gstimeFromDate(date);
        var latlng = satellite.eciToGeodetic(posvel.position, gmst);

        return {
            name: id,
            timestamp: timestamp,
            position: {
                x: posvel.position.x * 1000,
                y: posvel.position.y * 1000,
                z: posvel.position.z * 1000,
                lat: satellite.degreesLat(latlng.latitude),
                lon: satellite.degreesLong(latlng.longitude),
                alt: latlng.height * 1000
            },
            velocity: {
                x: posvel.velocity.x * 1000,
                y: posvel.velocity.y * 1000,
                z: posvel.velocity.z * 1000
            }
        }
    }


    /*
		TLE Node
		User has input their own TLE data
	*/
    function TLENode(config) {
        RED.nodes.createNode(this, config);
        this.satid = config.satid || '';
        this.tle1 = config.tle1 || '';
        this.tle2 = config.tle2 || '';

        var node = this;

        this.on('input', function (msg) {
            var satellites = [];

            // override satid if node value not filled in and passed suitable value
            if  ( (node.satid == '') && ('satid' in msg) )  {
                if ( (typeof msg.satid === 'string') && (msg.satid.length < 1024) ) {
                    node.satid = msg.satid = msg.satid.trim();
                }
            }
            // override tle1 if node value not filled in and passed suitable value
            if  ( (node.tle1 == '') && ('tle1' in msg) )  {
                if ( (typeof msg.tle1 === 'string') && (msg.tle1.length < 1024) ) {
                    node.tle1 = msg.tle1 = msg.tle1.trim();
                }
            }
            // override tle2 if node value not filled in and passed suitable value
            if  ( (node.tle2 == '') && ('tle2' in msg) )  {
                if ( (typeof msg.tle2 === 'string') && (msg.tle2.length < 1024) ) {
                    node.tle2 = msg.tle2 = msg.tle2.trim();
                }
            }

            // Initialize a satellite record
            var satrec = satellite.twoline2satrec(node.tle1, node.tle2);

            if (msg.payload && typeof (msg.payload) === 'number') {
                // Single timestamp
                satellites = createSatObject(node.satid, satrec, msg.payload);
            }
            else if (msg.payload && Array.isArray(msg.payload) && msg.payload.length) {
                // Array of timestamps
                var ok = true;
                msg.payload.forEach(function (t, i) {
                    if (typeof t === "number") {
                        satellites.push(createSatObject(node.satid + '-' + i, satrec, t));
                    }
                    else { ok = false; }
                });
                if (!ok) { satellites = createSatObject(node.satid, satrec, Date.now()); }
            } else {
                // No payload - so now
                satellites = createSatObject(node.satid, satrec, Date.now());
            }

            msg.payload = satellites;
            node.send(msg);
        });
    }
    RED.nodes.registerType("tle", TLENode);

    /*
		Satellite Node
		User has selected from a pre-defined list of known satellites
	*/
    function SatelliteNode(config) {
        RED.nodes.createNode(this, config);
        this.sattype = config.sattype || '';
        this.satid = config.satid || '';

        var node = this;

        let noradData;

        function loadRemoteTLEData (type) {
            return new Promise(function(resolve, reject) {
                if (!noradData) {
                    parseTLEFile('http://www.celestrak.com/NORAD/elements/' + type + '.txt')
                        .then(function(data) {
                            var sat = {};
                            for (var i = 0; i < data.length; i++) {
                                // retrieve the requested satellite data
                                if (data[i].name === node.satid) {
                                    sat = data[i];
                                    break;
                                }
                            }
                            noradData = sat;
                            resolve(sat);
                        })
                } else {
                    resolve(noradData);
                }
            })
        }

        this.on('input', function (msg) {
            var satellites = [];

            // GET TLE Data for the Satellite
            let tle1 = '', tle2 = '';
            loadRemoteTLEData(node.sattype)
                .then(function(sat) {
                    var satrec;
                    try {
                        satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
                    }
                    catch(e) {
                        //Swallow the error
                        //node.warn("Cannot decode satellite TLE data.")
                    }
                    if (msg.payload && typeof (msg.payload) === 'number') {
                        // Single timestamp
                        satellites = createSatObject(node.satid, satrec, msg.payload);
                    } else if (msg.payload && typeof (msg.payload) === 'object' && msg.payload.length) {
                        // Array of timestamps
                        msg.payload.forEach(function (t, i) {
                            satellites.push(createSatObject(node.satid + '-' + i, satrec, t));
                        });
                    }
                    msg.payload = satellites;
                    node.send(msg);
                });

            // Initialize a satellite record
            // var satrec = satellite.twoline2satrec(node.tle1, node.tle2);
            //
            // if (msg.payload && typeof (msg.payload) === 'number') {
            // 	// Single timestamp
            // 	satellites = createSatObject(node.satid, satrec, msg.payload);
            // } else if (msg.payload && typeof (msg.payload) === 'object' && msg.payload.length) {
            // 	// Array of timestamps
            // 	msg.payload.forEach(function (t, i) {
            // 		satellites.push(createSatObject(node.satid + '-' + i, satrec, t));
            // 	});
            // }
            //
            // msg.payload = satellites;
            // node.send(msg);
        });
    }

    RED.nodes.registerType("satellite", SatelliteNode);

    function TimeArrayNode(config) {
        RED.nodes.createNode(this, config);

        this.minus = (config.minus < 0) ? 0 : config.minus;
        this.minus = this.minus * 60 * 1000; // convert values form minutes to milliseconds

        this.plus = (config.plus < 0) ? 0 : config.plus;
        this.plus = this.plus * 60 * 1000; // convert values form minutes to milliseconds

        this.samples = (config.samples < 1) ? 1 : config.samples;

        var node = this;

        node.on('input', function (msg) {
            var times = [];
            if (node.samples < 1) { node.samples = 1; }
            var t = parseInt(msg.payload),
                t0 = t - node.minus,
                t1 = t + node.plus,
                delta = (t1 - t0 + 1) / node.samples;

            for (var i = 0; i <= node.samples; i++) {
                var time = t0 + i * delta;
                times.push(parseInt(time));
            }

            msg.payload = times;
            node.send(msg);
        });
    }
    RED.nodes.registerType("timearray", TimeArrayNode);

    function EarthNode(config) {
        RED.nodes.createNode(this, config);
        if (!socket) {
            var fullPath = path.posix.join(RED.settings.httpNodeRoot, 'earth', 'socket.io');
            socket = io.listen(RED.server, {
                path: fullPath
            });
        }
        var node = this;

        RED.httpNode.use("/earth", express.static(__dirname + '/satellites'));

        var onConnection = function (client) {
            client.setMaxListeners(0);
            node.status({
                fill: "green",
                shape: "dot",
                text: "connected " + socket.engine.clientsCount
            });

            function emit(msg) {
                client.emit("earthdata", msg.payload);
            }

            node.on('input', emit);

            client.on('disconnect', function () {
                node.removeListener("input", emit);
                node.status({
                    fill: "green",
                    shape: "ring",
                    text: "connected " + socket.engine.clientsCount
                });
            });

            node.on('close', function () {
                node.status({});
                client.disconnect(true);
            });
        };
        node.status({});
        socket.on('connection', onConnection);
    }
    RED.nodes.registerType("earth", EarthNode);
};
