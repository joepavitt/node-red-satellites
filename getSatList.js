// Clunky bit of code to fetch the names of all the satellites from the list we want
// to make updating the .html file easier as and when

var list = ["stations","weather","dmc","gps-ops","glo-ops","galileo","sarsat","science","planet"];

const fs = require('fs');
const https = require("https");
const url = "https://www.celestrak.com/NORAD/elements/";

var result = {};
var getList = function(u) {
    var ur = url+u+".txt"
    https.get(ur, res => {
        res.setEncoding("utf8");
        let body = "";
        res.on("data", data => {
            body += data;
        });
        res.on("end", () => {
            var l = body.split("\n");
            var line = [];
            for (var i=0; i<l.length; i++) {
                if (l[i].indexOf("1")===0) {}
                else if (l[i].indexOf("2")===0) {}
                else if (l[i].trim().length===0) {}
                else { line.push(l[i].trim()); }
            }
            result[u] = line;
        });
    })
}

for (var s=0; s<list.length; s++) {
    getList(list[s]);
}
setTimeout(function() {
    fs.writeFileSync('satlist.txt', JSON.stringify(result));
    console.log("List Object written to satlist.txt")
}, 5000)

