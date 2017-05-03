node-red-contrib-satellites (v0.1.1)
=============================

A set of <a href="http://nodered.org" target="_new">Node-RED</a> nodes to help working with Two-Line-Element (TLE) sets. Utilising the <a href="https://github.com/shashwatak/satellite-js">satellites.js</a> library to convert the TLE sets into <i>xyz</i> and <i>latlng</i> coordinates.

### Known Issues

- The position when showing a satellite in the 3d world is slightly offset in terms of the landmass it is above, depending on the latitude and longitude of the current position, the extent of the offset does vary.
- The 'Earth' node is quite computationally heavy, we're looking into the exact recommendations for the hardware to effectively run this node, in addition to how we can lighten the load on the machine.
- Windows: We are aware of some issues when running these nodes on Windows, and they are being investigated.

### Examples 
In the `./examples` folder you can find sample flows that demonstrate some use cases for this set of nodes. 

Please note that TLE Data for a given satellite does change, and so the TLE data set used here may be out of date when you come to use it. For an up to date dataset for the ISS, please go [here](https://www.celestrak.com/NORAD/elements/stations.txt): 

#### `./examples/ISS.json`

![ISS 3d Example](./examples/screens/iss.png "ISS - 3d Example")

This flow will calculate the current *xyz* position of the ISS, using the relevant TLE data in the `satellite` node. The data is then fed into the `earth` node for visualisation.

#### `./examples/ISS-worldmap.json`

![ISS World Map Example](./examples/screens/iss-worldmap.png "ISS - World Map Example")

***note***: *This example has a dependancy on the `node-red-contrib-web-worldmap` node.* 

This flow will calculate the current position of the ISS, using it's TLE data in the `satellite` node, and convert it into the relevant formats for use with the `worldmap` node.

The `time array` node is used to calculate the timestamps for +/- 20 minutes from the current time, as to create the recent and upcoming path of the ISS. The use of the `switch` node and two `function` nodes converts the data into the right format for the `worldmap` node to render the route as a line and a single point, the latter of which shows the current position.
