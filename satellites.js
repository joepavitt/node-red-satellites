// var positionAndVelocity = satellite.sgp4(satrec, time);
module.exports = function (RED) {
	"use strict";
	var express = require("express");
	var io = require('socket.io');
	var socket;

	if (typeof define !== 'function') {
		var define = require('amdefine')(module);
	}

	define(['./node_modules/satellite.js/dist/satellite'], function (js) {
		function SatelliteNode(config) {
			RED.nodes.createNode(this, config);
			this.satid = config.satid || '';
			this.tle1 = config.tle1 || '';
			this.tle2 = config.tle2 || '';

			var node = this;

			this.on('input', function (msg) {
				var satellite = js.satellite,
					satellites = [];

				// Initialize a satellite record
				var satrec = satellite.twoline2satrec(node.tle1, node.tle2),
					posvel;

				if (msg.payload && typeof (msg.payload) === 'number') {
					posvel = satellite.propagate(satrec, new Date(msg.payload));
					satellites = {
						name: node.satid,
						timestamp: msg.payload,
						position: posvel.position,
						velocity: posvel.velocity
					};
				} else if (msg.payload && typeof (msg.payload) === 'object' && msg.payload.length) {
					msg.payload.forEach(function (t, i) {
						posvel = satellite.propagate(satrec, new Date(t));
						satellites.push({
							name: node.satid + '-' + i,
							timestamp: t,
							position: posvel.position,
							velocity: posvel.velocity
						});
					});
				}

				msg.payload = satellites;
				node.send(msg);
			});
		}
		RED.nodes.registerType("satellite", SatelliteNode);


		function LatLngNode(config) {
			RED.nodes.createNode(this, config);

			var node = this;

			this.on('input', function (msg) {
				var satellite = js.satellite;
				var satellites = [];

				var gmst;
				var latlng;

				if (msg.payload && typeof (msg.payload) === 'object' && !msg.payload.length) {
					// Initialize a satellite record
					gmst = satellite.gstimeFromDate(new Date(msg.payload.timestamp));
					latlng = satellite.eciToGeodetic(msg.payload.position, gmst);
					satellites = {
						name: msg.payload.name,
						timestamp: msg.payload.timestamp,
						lat: satellite.degreesLat(latlng.latitude),
						lon: satellite.degreesLong(latlng.longitude)
					};
				} else if (msg.payload && typeof (msg.payload) === 'object' && msg.payload.length) {
					// Initialize a satellite record
					msg.payload.forEach(function (s) {
						gmst = satellite.gstimeFromDate(new Date(s.timestamp));
						latlng = satellite.eciToGeodetic(s.position, gmst);
						satellites.push({
							name: s.name,
							timestamp: s.timestamp,
							lat: satellite.degreesLat(latlng.latitude),
							lon: satellite.degreesLong(latlng.longitude)
						});
					});
				}
				msg.payload = satellites;
				node.send(msg);
			});
		}
		RED.nodes.registerType("latlng", LatLngNode);
	});

	function TimeArrayNode(config) {
		RED.nodes.createNode(this, config);
		if (!socket) {
			socket = io.listen(RED.server);
		}

		this.minus = (config.minus < 0) ? 0 : config.minus;
		this.minus = this.minus * 60 * 1000; // convert values form minutes to milliseconds

		this.plus = (config.plus < 0) ? 0 : config.plus;
		this.plus = this.plus * 60 * 1000; // convert values form minutes to milliseconds

		this.samples = (config.samples < 1) ? 1 : config.samples;

		var node = this;

		node.on('input', function (msg) {
			var times = [];
			if (node.samples < 1) {
				node.samples = 1;
			}
			var t = parseInt(msg.payload),
				t0 = t - node.minus,
				t1 = t + node.plus,
				delta = (t1 - t0) / node.samples;

			for (var i = 0; i < node.samples; i++) {
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
			socket = io.listen(RED.server);
		}
		var node = this;

		RED.httpNode.use("/earth", express.static(__dirname + '/satellites'));

		var onConnection = function (client) {
			client.setMaxListeners(0);

			node.on('input', function (msg) {
				client.emit("earthdata", msg.payload);
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
