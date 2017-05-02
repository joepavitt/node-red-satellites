// var positionAndVelocity = satellite.sgp4(satrec, time);
module.exports = function (RED) {
	"use strict";
	var express = require("express");
	var path = require("path");
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
					posvel, gmst, latlng;

				if (msg.payload && typeof (msg.payload) === 'number') {
					var date = new Date(msg.payload);
					posvel = satellite.propagate(satrec, date);
					gmst = satellite.gstimeFromDate(date);
					latlng = satellite.eciToGeodetic(posvel.position, gmst);
					satellites = {
						name: node.satid,
						timestamp: msg.payload,
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
					};
				} else if (msg.payload && typeof (msg.payload) === 'object' && msg.payload.length) {
					msg.payload.forEach(function (t, i) {
						var date = new Date(t);
						posvel = satellite.propagate(satrec, date);
						gmst = satellite.gstimeFromDate(date);
						latlng = satellite.eciToGeodetic(posvel.position, gmst);
						satellites.push({
							name: node.satid + '-' + i,
							timestamp: t,
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
						});
					});
				}

				msg.payload = satellites;
				node.send(msg);
			});
		}
		RED.nodes.registerType("satellite", SatelliteNode);
	});

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
			var fullPath = path.join(RED.settings.httpNodeRoot, 'earth', 'socket.io');
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
