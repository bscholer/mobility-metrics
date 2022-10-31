#!/usr/local/bin/node

const path = require("path");
const fs = require("fs");
const moment = require("moment");
const rimraf = require("rimraf");
const shst = require("sharedstreets");
const turf = require("@turf/turf");
const summarize = require("./summarize");
const cover = require("@mapbox/tile-cover");

var argv = require("minimist")(process.argv.slice(2));

if (argv.version || argv.v) {
  const version = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"))
  ).version;
  console.log("v" + version);
  process.exit(0);
}

let dateOption;

if (argv.help || argv.h || Object.keys(argv).length === 1) {
  var help = "";
  help += "\nmobility-metrics\n";
  help += "\n";
  help += "-h,--help     show help\n";
  help += "--config      path to config json file\n";
  help += "--public      path to public metric directory\n";
  help += "--cache       path to temporary data cache\n";
  help += "DATE OPTION 1 (generate report for single day):\n";
  help += "--endDay         day to generate report for (YYYY-MM-DD)\n";
  help += "DATE OPTION 2 (generate reports for multiple days):\n";
  help += "--startDay    start of date range to generate reports for (YYYY-MM-DD)\n";
  help += "--endDay      end of date range to generate reports for (YYYY-MM-DD)\n";
  help += "DATE OPTION 3 (generate report with specific start and end days):\n";
  help += "--startDay    start of query range (YYYY-MM-DD)\n";
  help += "--endDay      end of query range (YYYY-MM-DD)\n";
  help += "--reportDay   day of report listing (YYYY-MM-DD)\n";

  console.log(help);
  process.exit(0);
} else {
  if (!argv.config) throw new Error("specify config file");
  if (!argv.public) throw new Error("specify public metric directory");
  if (!argv.cache) throw new Error("specify temporary data cache");

  if (!argv.startDay && argv.endDay && !argv.reportDay) dateOption = 1;
  else if (argv.startDay && argv.endDay && !argv.reportDay) dateOption = 2;
  else if (argv.startDay && argv.endDay && argv.reportDay) dateOption = 3;
  if (!dateOption) throw new Error("Please use one of the options for dates from running 'mobility-metrics --help'");
}

const config = require(path.resolve(argv.config));
// add spatial indices to zones
if (!config.zones) {
  config.zones = turf.FeatureCollection([]);
}
const z = 19;
const zs = { min_zoom: z, max_zoom: z };
for (let zone of config.zones.features) {
  zone.properties.keys = {};
  const keys = cover.indexes(zone.geometry, zs);
  for (let key of keys) {
    zone.properties.keys[key] = 1;
  }
}
// build geographicFilter lookup
if (config.geographicFilter) {
  config.geographicFilterKeys = {};
  cover.indexes(config.geographicFilter.geometry, zs).forEach(qk => {
    config.geographicFilterKeys[qk] = 1;
  });
}

// check for valid vehicleFilter
if (
  config.vehicleFilter &&
  (config.vehicleFilter !== "car" &&
    config.vehicleFilter !== "bicycle" &&
    config.vehicleFilter !== "scooter")
) {
  throw new Error("detected invalid vehicle filter");
}

// defaults
if (!config.zoom) config.zoom = 12.5;
if (!config.lost) config.lost = 2;
if (!config.privacyMinimum || config.privacyMinimum < 3)
  config.privacyMinimum = 3;
if (!config.summary)
  config.summary = {
    "Unique Vehicles": true,
    "Active Vehicles": true,
    "Total Trips": true,
    "Total Trip Distance": true,
    "Distance Per Vehicle": true,
    "Vehicle Utilization": true,
    "Trips Per Active Vehicle": true,
    "Avg Trip Distance": true,
    "Avg Trip Duration": true
  };

const publicPath = path.resolve(argv.public);
const cachePath = path.resolve(argv.cache);


const backfill = async function (startDay, endDay, reportDay) {
  console.log("backfilling from", startDay.toISOString(), 'to', endDay.toISOString());
  return new Promise(async (resolve, reject) => {

    await summarize(
      startDay,
      endDay,
      reportDay,
      shst,
      graph,
      publicPath,
      cachePath,
      config
    );

    console.log("\ncompleted backfill");
    resolve();
  });
};

console.log("DATE OPTION: " + dateOption);
const dateArray = []; // [startDay, endDay, reportDay]
switch (dateOption) {
  case 1:
    console.log("Generating report for single day: " + argv.endDay);
    dateArray.push([moment(argv.endDay), moment(argv.endDay), moment(argv.endDay)]);
    break;
  case 2:
    console.log("Generating reports for multiple days: " + argv.startDay + " to " + argv.endDay);
    const start = moment(argv.startDay, "YYYY-MM-DD");
    const end = moment(argv.endDay, "YYYY-MM-DD");
    // loop through days
    for (let m = moment(start); m.isSameOrBefore(end); m.add(1, "days")) {
      dateArray.push([m.clone(), m.clone(), m.clone()]);
    }
    break;
  case 3:
    console.log("Generating report with specific start and end days: " + argv.startDay + " to " + argv.endDay + " with report day: " + argv.reportDay);
    dateArray.push([argv.startDay, argv.endDay, argv.reportDay].map(d => moment(d, "YYYY-MM-DD")));
    break;
}

const envelope = turf.bboxPolygon(config.boundary).geometry;

// get graph
const graphOpts = {
  source: "osm/planet-181224",
  tileHierarchy: 6
};
var graph = new shst.Graph(envelope, graphOpts);
graph.buildGraph()
  .then(async () => {
// run it
    dateArray.reduce((p, dates) => p.then(() => backfill(...dates)), Promise.resolve()).then(() => {
    });
    rimraf(cachePath, () => {
    });
  });

