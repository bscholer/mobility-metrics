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
  res.data.street.geometry = JSON.parse(res.data.street.geometry);
  const match = {
    segment: res.data.street.roadsegid,
    matchedPath: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiLineString",
        coordinates: res.data.street.roadsegid.map((id) => {
          return res.data.street.geometry.features.find((f) => `${f.id}` === `${id}`).geometry.coordinates;
        })
      }
    },
  }

  // reformat slightly
  if (res.data.zone.zoneid) {
    trip.matches.zone = res.data.zone.zoneid;
  }

  if (res.data.jurisdiction.jurisdictionid) {
    trip.matches.jurisdiction = res.data.jurisdiction.jurisdictionid;
  }

  // bin
  trip.matches.bin = trip.route.features.map(ping => h3.geoToH3(
    ping.geometry.coordinates[1],
    ping.geometry.coordinates[0],
    config.Z
  ));

  // console.log(res.data.street);
  // console.log(trip.matches.bin);
  const pickupMatch = {
    street: res.data.street.pickup,
    zone: res.data.zone.pickup,
    jurisdiction: res.data.jurisdiction.pickup,
    bin: trip.matches.bin[0],
  }

  const dropoffMatch = {
    street: res.data.street.dropoff,
    zone: res.data.zone.dropoff,
    jurisdiction: res.data.jurisdiction.dropoff,
    bin: trip.matches.bin[trip.matches.bin.length - 1],
  }

  const flowMatch = {
    street: `${res.data.street.pickup}>${res.data.street.dropoff}`,
    zone: `${res.data.zone.pickup}>${res.data.zone.dropoff}`,
    jurisdiction: `${res.data.jurisdiction.pickup}>${res.data.jurisdiction.dropoff}`,
    bin: `${pickupMatch.bin}>${dropoffMatch.bin}`
  }

  if (pickupMatch.street || pickupMatch.zone || pickupMatch.bin || pickupMatch.jurisdiction) {
    trip.matches.pickup = pickupMatch;
  }

  if (dropoffMatch.street || dropoffMatch.zone || dropoffMatch.bin || dropoffMatch.jurisdiction) {
    trip.matches.dropoff = dropoffMatch;
  }

  if (flowMatch.street || flowMatch.zone || flowMatch.bin || flowMatch.jurisdiction) {
    trip.matches.flow = flowMatch;
  }

  if (
    match &&
    match.segments &&
    match.matchedPath &&
    match.matchedPath.geometry &&
    match.matchedPath.geometry.coordinates &&
    match.matchedPath.geometry.coordinates.length === match.segments.length
  ) {
    trip.matches.street = match;
  }

  // trip.matches.bin = bin;

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
