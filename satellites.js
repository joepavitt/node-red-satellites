// var positionAndVelocity = satellite.sgp4(satrec, time);
module.exports = function (RED) {
	"use strict";
	var express = require("express");
	var io = require('socket.io');
	var socket;

	if (typeof define !== 'function') {
		var define = require('amdefine')(module);
	}

	var deg2rad = 57.2958;

	define(['./node_modules/satellite.js/dist/satellite'], function (js) {
		function SatelliteNode(config) {
			RED.nodes.createNode(this, config);
			this.satid = config.satid || '';
			this.tle1 = config.tle1 || '';
			this.tle2 = config.tle2 || '';			
			
			var node = this;

			this.on('input', function (msg) {
				var satellite = js.satellite;
				// Sample TLE
				/*var tleLine1 = '1 25544U 98067A   17117.89041289 -.00158687  00000-0 -24621-2 0  9992',
					tleLine2 = '2 25544  51.6432 289.0003 0006055 101.4704 344.3366 15.53834686 53936';*/

				// Initialize a satellite record
				var satrec = satellite.twoline2satrec(node.tle1, node.tle2);

				var datetime; // = msg.payload ? msg.payload : new Date()

				var posvel;
				if (msg.payload && typeof(msg.payload) === 'number') {
					datetime = msg.payload;
				} else {
					var now = new Date();
					datetime = now.getTime();
				}
				posvel = satellite.propagate(satrec, new Date(datetime));

				msg.payload = {
					name : node.satid,
					timestamp : datetime,
					position : posvel.position,
					velocity : posvel.velocity
				}
				node.send(msg);
			});
		}
		RED.nodes.registerType("satellite", SatelliteNode);


		function LatLngNode(config) {
			RED.nodes.createNode(this, config);

			var node = this;

			this.on('input', function (msg) {
				var satellite = js.satellite;

				// Initialize a satellite record
				var gmst = satellite.gstimeFromDate(new Date(msg.payload.timestamp));
				var latlng = satellite.eciToGeodetic(msg.payload.position, gmst);
				msg.payload = {
					name : msg.payload.name,
					timestamp : msg.payload.timestamp,
					lat : satellite.degreesLat(latlng.latitude),
					lon : satellite.degreesLong(latlng.longitude)
				};
				node.send(msg);
			});
		}
		RED.nodes.registerType("latlng", LatLngNode);
	});

	function EarthNode(config) {
		RED.nodes.createNode(this, config);
		if (!socket) {
			socket = io.listen(RED.server);
		}
		var node = this;

		RED.httpNode.use("/earth", express.static(__dirname + '/satellites'));

		var onConnection = function (client) {
			node.on('input', function (msg) {
				client.emit("earthdata", msg.payload);
			});
			
			node.on('close', function() {
				node.status({});
				client.disconnect(true);
			})
		};
		node.status({});
		socket.on('connection', onConnection);
	}
	RED.nodes.registerType("earth", EarthNode);
};
