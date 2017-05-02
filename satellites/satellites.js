/*
Connect to the Node-RED Events
*/

var ws = io({
	path: location.pathname + 'socket.io'
});

ws.on('connect', function () {
	console.log("CONNECTED");
	/*if (!inIframe) {
		document.getElementById("foot").innerHTML = "<font color='#494'>" + ibmfoot + "</font>";
	}
	ws.emit("worldmap", {
		action: "connected"
	});*/
});

ws.on('disconnect', function () {
	console.log("DISCONNECTED");
	/*if (!inIframe) {
		document.getElementById("foot").innerHTML = "<font color='#900'>" + ibmfoot + "</font>";
	}*/
	setTimeout(function () {
		ws.connect();
	}, 2500);
});

ws.on('error', function () {
	console.log("ERROR");
	/*if (!inIframe) {
		document.getElementById("foot").innerHTML = "<font color='#C00'>" + ibmfoot + "</font>";
	}*/
	setTimeout(function () {
		ws.connect();
	}, 2500);
});

ws.on('earthdata', function (data) {
	console.log(data);
	updateSatellite(data);
});

/* 
Initialise the ThreeJS World 
*/
var scene, camera, renderer;
var controls;
var geometry, material, sphere;

function init() {

	/* 
	Camera & Contrls
	*/

	camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 100);
	camera.up.set( 0, 0, 1 );
	camera.rotation.x = - Math.PI / 2;
	camera.position.x = 10;

	controls = new THREE.TrackballControls(camera);
	controls.rotateSpeed = 1.0;
	controls.zoomSpeed = 1.2;
	controls.noZoom = false;
	controls.noPan = true;
	controls.staticMoving = true;
	controls.dynamicDampingFactor = 0.3;
	controls.up0.set( 0, 0, 1 ); // set a new up vector

	controls.minDistance = 8;
	controls.maxDistance = 20;

	controls.keys = [65, 83, 68];

	controls.addEventListener('change', render);

	/*
	World
	*/

	scene = new THREE.Scene();

	// CREATE EARTH
	geometry = new THREE.SphereGeometry(6.371, 128, 128);

	var texture = new THREE.TextureLoader().load("images/earth_color.jpg");
	var bump = new THREE.TextureLoader().load("images/earth_bump.jpg");
	var specular = new THREE.TextureLoader().load("images/earth_spec.png");

	material = new THREE.MeshPhongMaterial({
		map: texture,
		bumpMap: bump,
		bumpScale: 0.1,
		specular: '#555',
		specularMap: specular
	});

	sphere = new THREE.Mesh(geometry, material);
	sphere.rotation.x = 90 / (180 / Math.PI);
	sphere.rotation.y = 10.5 / (180 / Math.PI);
	scene.add(sphere);


	geometry = new THREE.SphereGeometry(6.372, 180, 360);

	/*// CREATE STARFIELD
	var skybox = new THREE.SphereGeometry(90, 32, 32);
	// create the material, using a texture of startfield
	var starfield = new THREE.MeshBasicMaterial();
	starfield.map = new THREE.TextureLoader().load('images/galaxy_starfield.png');
	starfield.side = THREE.BackSide;
	// create the mesh based on geometry and material
	var mesh = new THREE.Mesh(skybox, starfield);
	scene.add(mesh);*/

	// CREATE LIGHTING
	var light = new THREE.DirectionalLight(0xcccccc, 0.5);
	light.position.set(5, 5, 5);
	scene.add(light);
	light.castShadow = true;
	light.shadow.camera.near = 0.01;
	light.shadow.camera.far = 15;
	light.shadow.camera.fov = 45;
	light.shadow.camera.left = -1;
	light.shadow.camera.right = 1;
	light.shadow.camera.top = 1;
	light.shadow.camera.bottom = -1;
	// light.shadowCameraVisi;ble	= true
	light.shadow.bias = 0.001;
	light.shadow.darkness = 0.2;
	light.shadow.mapSize.width = 1024;
	light.shadow.mapSize.height = 1024;

	var ambientLight = new THREE.AmbientLight('0x888888'); // soft white light
	scene.add(ambientLight);

	renderer = new THREE.WebGLRenderer();
	renderer.setSize(window.innerWidth, window.innerHeight);

	window.addEventListener('resize', onWindowResize, false);

	document.body.appendChild(renderer.domElement);

	render();

}

var satellites = {};

function updateSatellite(data) {
	console.log('update', data);
	var pos = data.position;
	// render();
	if (satellites[data.name]) {
		satellites[data.name].position.set(pos.y / 1000000, -pos.x / 1000000, pos.z / 1000000);
	} else {
		var satGeometry = new THREE.SphereGeometry(0.1, 32, 32);
		console.log(data);
		var satMaterial = new THREE.MeshPhongMaterial({
			color: data.color || '#bbb',
			specular: '#eee'
		});
		satellites[data.name] = new THREE.Mesh(satGeometry, satMaterial);
		satellites[data.name].position.set(pos.y / 1000000, -pos.x / 1000000, pos.z / 1000000);
		scene.add(satellites[data.name]);
	}
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
	controls.handleResize();
	render();
}


function animate() {
	requestAnimationFrame(animate);
	controls.update();

	// sphere.rotation.x += 0.001;
	// sphere.rotation.y += 0.001;

	render();
}

function render() {
	renderer.render(scene, camera);
}
