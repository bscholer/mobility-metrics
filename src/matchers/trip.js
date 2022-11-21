const axios = require("axios");
const turf = require("@turf/turf");
const h3 = require("h3-js");
const cover = require("@mapbox/tile-cover");

const z = 19;
const zs = { min_zoom: z, max_zoom: z };

module.exports = async function (trip, config) {
  if (config.vehicleFilter && config.vehicleFilter !== trip.vehicle_type) {
    return;
  }

  const line = turf.lineString(
    trip.route.features.map(pt => {
      return pt.geometry.coordinates;
    })
  );

  if (line.geometry.coordinates > (config.maxTripCoordinates || 100)) {
    return;
  }

  const distance = turf.length(line, { units: "miles" });
  if (distance > (config.maxTripLengthFilter || 10)) {
    return;
  }

  const keys = cover.indexes(line.geometry, zs);

  if (config.geographicFilter) {
    var pass = false;
    for (let key of keys) {
      if (config.geographicFilterKeys[key]) {
        pass = true;
      }
    }
    if (!pass) return;
  }

  // STREETS

  if (!trip.matches) trip.matches = {};

  // console.log(`number of points: ${trip.route.features.length}`);
  // make wkt from line
  const wkt = `LINESTRING(${line.geometry.coordinates.map(pt => pt.join(" ")).join(", ")})`;

  let res = await axios.post(`http://conflator/match_line`, { line: wkt },
    {
      headers: { "Content-Type": "application/json" }
    })
  // console.log(res.data);
  res.data.streets.geometry = JSON.parse(res.data.streets.geometry);
  const match = {
    segments: res.data.streets.roadsegid,
    matchedPath: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiLineString",
        coordinates: res.data.streets.roadsegid.map((id) => {
          return res.data.streets.geometry.features.find((f) => `${f.id}` === `${id}`).geometry.coordinates;
        })
      }
    },
  }

  if (res.data.zone.zoneid) {
    trip.matches.zones = res.data.zone.zoneid;
  }

  console.log(res.data.streets);
  const pickupMatch = {
    street: res.data.streets.pickup,
    zone: res.data.zone.pickup,
    bin: h3.geoToH3(
      trip.route.features[0].geometry.coordinates[1],
      trip.route.features[0].geometry.coordinates[0],
      config.Z
    )
  }

  const dropoffMatch = {
    street: res.data.streets.dropoff,
    zone: res.data.zone.dropoff,
    bin: h3.geoToH3(
      trip.route.features[trip.route.features.length - 1].geometry.coordinates[1],
      trip.route.features[trip.route.features.length - 1].geometry.coordinates[0],
      config.Z
    )
  }

  if (pickupMatch.street || pickupMatch.zone || pickupMatch.bin) {
    trip.matches.pickup = pickupMatch;
  }

  if (dropoffMatch.street || dropoffMatch.zone || dropoffMatch.bin) {
    trip.matches.dropoff = dropoffMatch;
  }

  if (
    match &&
    match.segments &&
    match.matchedPath &&
    match.matchedPath.geometry &&
    match.matchedPath.geometry.coordinates &&
    match.matchedPath.geometry.coordinates.length === match.segments.length
  ) {
    trip.matches.streets = match;
  }

  // HEXES

  var bins = [];
  trip.route.features.forEach(ping => {
    var bin = h3.geoToH3(
      ping.geometry.coordinates[1],
      ping.geometry.coordinates[0],
      config.Z
    );
    bins.push(bin);
    // bins[bin] = 1;
  });

  trip.matches.bins = bins;

  // ZONES

  // if (config.zones) {

  // trace
  // var zoneMatches = [];

  // for (let zone of config.zones.features) {
  // trip.route.features.forEach(ping => {
  //   if (turf.booleanPointInPolygon(ping, zone)) {
  //     zoneMatches.push(zone.properties.id);
  //   }
  // })
  // let found = false;
  // for (let key of keys) {
  //   if (zone.properties.keys[key]) found = true;
  //   continue;
  // }

  // if (found) {
  //   zoneMatches.push(zone.properties.id);
  // }
  // }

  // remove dupes
  // trip.matches.zones = zoneMatches.filter((v, i, a) => a.indexOf(v) === i);

  // if (zoneMatches.length) {
  //   trip.matches.zones = zoneMatches;
  // }

  // pickup
  // var pickupZoneMatches = [];
  // const pickupKeys = cover.indexes(line.geometry, zs);
  // for (let zone of config.zones.features) {
  //   let found = false;
  //   for (let key of pickupKeys) {
  //     if (zone.properties.keys[key]) found = true;
  //     continue;
  //   }
  //
  //   if (found) {
  //     pickupZoneMatches.push(zone.properties.id);
  //   }
  // }
  //
  // if (pickupZoneMatches.length) {
  //   trip.matches.pickupZones = pickupZoneMatches;
  // }
  //
  // // dropoff
  // var dropoffZoneMatches = [];
  // const dropoffKeys = cover.indexes(line.geometry, zs);
  // for (let zone of config.zones.features) {
  //   let found = false;
  //   for (let key of dropoffKeys) {
  //     if (zone.properties.keys[key]) found = true;
  //     continue;
  //   }
  //
  //   if (found) {
  //     dropoffZoneMatches.push(zone.properties.id);
  //   }
  // }
  //
  // if (zoneMatches.length) {
  //   trip.matches.dropoffZones = dropoffZoneMatches;
  // }
  // }

  return trip;
};
