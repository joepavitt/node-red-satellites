
var scene, camera, renderer, controls, earth;
var markers = {};
var lines = {};
var moveit = true;
var rideWith = "";

// ---- Connect to the Node-RED Events --------------------


var connect = function() {
    var ws = new SockJS(location.pathname + 'socket');

    ws.onopen = function () {
        console.log("CONNECTED");
        ws.send({ action: "connected" });
    };

    ws.onclose = function () {
        console.log("DISCONNECTED");
        setTimeout(function() { connect(); }, 2500);
    };

    /*
        Handle incoming satellite data from NodeRED
    */
    ws.onmessage = function (data) {
        data = JSON.parse(data.data);
        //console.log("DATA",data);
        if (data.name) {
            if (data.deleted) { earth.delMarker(data.name); return; }
            var pos;
            if (data.hasOwnProperty("position")) { pos = data.position; }
            else if (data.hasOwnProperty("lat") && data.hasOwnProperty("lon")) {
                pos = {lat:data.lat, lon:data.lon, alt:data.alt || 0 }
            }
            else {
                console.error("Bad Data:",data);
                return;
            }

            earth.setMarker(data.name, pos.lat, pos.lon, pos.alt, data.color);
            if (data.hasOwnProperty("velocity")) {
                var v = data.velocity;
                markers[data.name].velocity = Math.round(Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z));
            }
            if (pos.hasOwnProperty("alt")) {
                var a = pos.alt;
                markers[data.name].altitude = Math.round(a);
            }
            if (data.name === rideWith) {
                var m = markers[data.name].position;
                controls.autoRotate = false;
                camera.position.set(m.x,m.y,m.z);
            }
            render();
        }
        else {
            //maybe it's an array of points for a line
            if (data.deleted) { earth.delLine(data[0].name); return; }
            if (data.length > 2) {
                var name = data[0].name;
                earth.setLine(name,data);
            }
        }
        createTable();
    };
}
setTimeout(function() { connect() }, 250);

// ------ Marker object ------------------------------------------------

function Marker(color) {
    THREE.Object3D.call(this);
    var radius = 0.005;
    var sphereRadius = 0.02;
    var height = 0.05;
    this.material = new THREE.MeshPhongMaterial({ color:color||"white" });
    this.material.oldR = this.material.color.r;
    this.material.oldG = this.material.color.g;
    this.material.oldB = this.material.color.b;

    var cone = new THREE.Mesh(new THREE.ConeBufferGeometry(radius, height, 8, 1, true), this.material);
    cone.position.y = height * 0.5;
    cone.rotation.x = Math.PI;

    var sphere = new THREE.Mesh(new THREE.SphereBufferGeometry(sphereRadius, 16, 8), this.material);
    sphere.position.y = height * 0.95 + sphereRadius;

    this.add(cone, sphere);
}
Marker.prototype = Object.create(THREE.Object3D.prototype);

// ------ Earth object -------------------------------------------------

function Earth(radius, texture, relief, spec) {
    THREE.Object3D.call(this);
    this.userData.radius = radius;

    var earth1 = new THREE.Mesh(
        new THREE.SphereBufferGeometry(radius, 64.0, 48.0),
        new THREE.MeshPhongMaterial({
            map: texture,
            bumpMap: relief,
            bumpScale: 1,
            specular: new THREE.Color('rgb(64,64,64)'),
            specularMap: spec
        })
    );
    this.add(earth1);
}

Earth.prototype = Object.create(THREE.Object3D.prototype);

Earth.prototype.setMarker = function (name, lat, lon, alt, color) {
    var p = latLonAlt2pos(lat,lon,alt);
    if (!markers[name]) {
        markers[name] = new Marker(color);
        markers[name].name = name;
        this.add(markers[name]);
    }
    markers[name].position.set(p.px,p.py,p.pz);
    markers[name].rotation.set(p.rx,p.ry,p.rz);
};

Earth.prototype.delMarker = function (name) {
    this.remove(markers[name]);
    delete markers[name];
}

Earth.prototype.setLine = function (name, data, color) {
    var material = new THREE.LineBasicMaterial( { color:color || 0xffffff } );
    var geometry = new THREE.Geometry();
    for (var i=0; i < data.length; i++) {
        var p = latLonAlt2pos( data[i].position.lat, data[i].position.lon, data[i].position.alt );
        geometry.vertices.push(new THREE.Vector3(p.px,p.py,p.pz));
    }
    this.remove(lines[name]);
    lines[name] = new THREE.Line( geometry, material );
    lines[name].name = name;
    this.add(lines[name]);
}

Earth.prototype.delLine = function (name) {
    this.remove(lines[name]);
    delete lines[name];
}


// ------ Three.js code ------------------------------------------------

function init() {
    camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 100);
    camera.position.set(3.0, 1.5, 0.0);

    renderer = new THREE.WebGLRenderer();

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.2;
    controls.enablePan = false;
    controls.minDistance = 1.23;

    scene = new THREE.Scene();

    // High res for demo
    //var texture = new THREE.TextureLoader().load("images/earth_color.jpg");
    //var bump = new THREE.TextureLoader().load("images/earth_bump.jpg");
    //var specular = new THREE.TextureLoader().load("images/earth_spec.png");
    // Low res for faster render/dev mode
    //var texture = new THREE.TextureLoader().load("images/earth_color_latlng.jpg");
    var texture = new THREE.TextureLoader().load("images/earthmap1k.jpg");
    var bump = new THREE.TextureLoader().load("images/earthbump1k.jpg");
    var specular = new THREE.TextureLoader().load("images/earthspec1k.jpg");
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    earth = new Earth(1.0, texture, bump, specular);
    // addSomePlaces();
    scene.add(earth);

    var ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);

    /* Sun */
    var directional = new THREE.DirectionalLight(0xffffff, 0.65);
    var sun = sunPos();
    //directional.position.set(5.0, 2.0, 5.0).normalize();
    directional.position.set(sun[0] * 90, sun[1] * 23.5, sun[2] * 90).normalize();
    scene.add(directional);

    /* Skybox */
    function genRandomStarField(numberOfStars, width, height) {
        var canvas = document.createElement('CANVAS');

        canvas.width = width;
        canvas.height = height;

        var ctx = canvas.getContext('2d');

        ctx.fillStyle="black";
        ctx.fillRect(0, 0, width, height);

        for (var i = 0; i < numberOfStars; ++i) {
            var radius = Math.random() * 2;
            var x = Math.floor(Math.random() * width);
            var y = Math.floor(Math.random() * height);

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = 'white';
            ctx.fill();
        }

        var texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    };
    var skyBox = new THREE.BoxGeometry(120, 120, 120);
    var skyBoxMaterial = new THREE.MeshBasicMaterial({
        map: genRandomStarField(600, 2048, 2048),
        side: THREE.BackSide
    });
    var sky = new THREE.Mesh(skyBox, skyBoxMaterial);
    scene.add(sky);

    /* User Clicking/Interaction */
    renderer.domElement.addEventListener("click", onObjectClick, true);
    var raycaster = new THREE.Raycaster();
    var mouse = new THREE.Vector2();
    function onObjectClick(event) {
        event.preventDefault();
        rideWith = ""
        let status = controls.autoRotate ? 'auto-rotate: on' : 'auto-rotate: paused'
        document.getElementById("info").textContent = status
        mouse.x = ( event.clientX / renderer.domElement.clientWidth ) * 2 - 1;
        mouse.y = - ( event.clientY / renderer.domElement.clientHeight ) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        var intersects = raycaster.intersectObjects(scene.children,true);
        for (var i=0; i < intersects.length; i++) {
            // User has clicked on an orbiting satellite
            if (intersects[i].object.parent.name !== "") {
                rideWith = intersects[i].object.parent.name;
                var m = markers[intersects[i].object.parent.name].position;
                controls.autoRotate = false;
                camera.position.set(m.x, m.y, m.z);
                document.getElementById("info").textContent="Riding along with the " + intersects[i].object.parent.name;
            }
        }
    }

    window.addEventListener('resize', onResize, false);

    document.body.appendChild(renderer.domElement);

    onResize();

    // Update the position of the sun every 5 mins.
    setInterval( function() {
        var sun = sunPos();
        directional.position.set(sun[0] * 90, sun[1] * 23.5, sun[2] * 90).normalize();
    }, 300000);

    // ---- Add key controls - space for start/stop rotation ----

    document.addEventListener("keydown", function(event) {
        if (event.which === 32) {
            moveit = !moveit;
            rideWith = "";
            if (moveit === false) {
                controls.autoRotate = false;
                document.getElementById("info").textContent="auto-rotate: paused";
            }
            else {
                controls.autoRotate = true;
                document.getElementById("info").textContent="auto-rotate: on";
            }
        }
    });

    // var buttons = document.getElementsByTagName("button");
    // for (var i = 0; i < buttons.length; i++) {
    //     buttons[i].addEventListener("click", onButtonClick, false);
    // }
    //
    // function onButtonClick(event) {
    //     console.log("CLICK",event.target.id);
    // }
}

function rowclick(e) {
    rideWith = e;
    var m = markers[e].position;
    controls.autoRotate = false;
    camera.position.set(m.x,m.y,m.z);
    document.getElementById("info").textContent="Tracking along with the "+e;
}

function rowover(e) {
    markers[e].material.color.setHex(0xff0000);
    if (lines.hasOwnProperty(e+"-0")) {
        lines[e+"-0"].material.color.setHex(0xff0000);
    }
}

function rowout(e) {
    markers[e].material.color.setRGB(markers[e].material.oldR,markers[e].material.oldG,markers[e].material.oldB);
    if (lines.hasOwnProperty(e+"-0")) {
        lines[e+"-0"].material.color.setRGB(markers[e].material.oldR,markers[e].material.oldG,markers[e].material.oldB);
    }
}

function createTable(){
    var tbl  = document.getElementById("objects");
    var intab = ""
    for (var key in markers) {
        if (markers.hasOwnProperty(key)) {
            //console.log(markers[key])
            intab += '<tr onmouseover=\'rowover(\"'+key+'\")\' onmouseout=\'rowout(\"'+key+'\")\' onclick=\'rowclick(\"'+key+'\")\'><td class="list">' + key + '</td><td>' + Math.round((10*markers[key].altitude)/1000)/10 + 'km</td><td>' + Math.round(10*markers[key].velocity/1000)/10 + 'km/s</td></tr>';
        }
    }
    document.getElementById("objects").innerHTML = intab;
}

function latLonAlt2pos(lat,lon,alt) {
    // TODO: should do some type checking of parameters....
    var latRad = lat * (Math.PI / 180);
    var lonRad = -lon * (Math.PI / 180);
    var r = ((alt || 0) + 6372000)/6372000;
    var p = {};
    p.px = Math.cos(latRad) * Math.cos(lonRad) * r;
    p.py = Math.sin(latRad) * r;
    p.pz = Math.cos(latRad) * Math.sin(lonRad) * r;
    p.rx = 0;
    p.ry = -lonRad;
    p.rz = latRad - Math.PI * 0.5;
    return p;
}

function sunPos() {
    // some bad approximations for position of the sun, but gefgw
    var d = new Date();
    var h = d.getUTCHours();
    var m = d.getUTCMinutes();
    var o = d.getUTCMonth();
    var a = d.getUTCDate();
    var lx = -Math.cos((h + (m/60)) * -15 * Math.PI / 180);
    var lz =  Math.sin((h + (m/60)) * -15 * Math.PI / 180);
    var ly = -Math.cos((o + (a/30)) * 30 * Math.PI / 180);
    //earth.setMarker("SUN", 23.5 * ly, (h + (m/60)) * -15 - 180, 0, "yellow");
    return [lx,ly,lz];
}

function addSomePlaces() {
    earth.setMarker("Paris", 48.856700, 2.350800);
    earth.setMarker("London", 51.507222, -0.1275);
    earth.setMarker("Los Angeles", 34.050000, -118.250000);
    earth.setMarker("Chicago", 41.836944, -87.684722);
    earth.setMarker("Tokyo", 35.683333, 139.683333);
    earth.setMarker("Baghdad", 33.333333, 44.383333);
    earth.setMarker("New York", 40.712700, -74.005900);
    earth.setMarker("Moscow", 55.750000, 37.616667);
    earth.setMarker("Cape Town", -33.925278, 18.423889);
    earth.setMarker("Amsterdam", 52.366667, 4.900000);
    earth.setMarker("Berlin", 52.507222, 13.145833);
    earth.setMarker("San Francisco", 37.783333, -122.416667);
}

// ---- Handle new objects ------------------------------

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    render();
}

function render() {
    renderer.render(scene, camera);
}
