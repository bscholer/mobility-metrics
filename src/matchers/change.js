const axios = require("axios");
const turf = require("@turf/turf");
const h3 = require("h3-js");
const cover = require("@mapbox/tile-cover");

const z = 19;
const zs = { min_zoom: z, max_zoom: z };

module.exports = async function (change, config, graph) {
  if (!config.vehicleFilter || config.vehicleFilter === change.vehicle_type) {
    const keys = cover.indexes(
      turf.point(change.event_location.geometry.coordinates).geometry,
      zs
    );

    if (config.geographicFilter) {
      var pass = false;
      for (let key of keys) {
        if (config.geographicFilterKeys[key]) {
          pass = true;
        }
      }
      if (!pass) return;
    }

    // STREETS AND ZONES
    if (!change.matches) change.matches = {};
    const wkt = `POINT(${change.event_location.geometry.coordinates.join(" ")})`;
    const res = await axios.post(
      `http://conflator/match_point`,
      { point: wkt },
      {
        headers: { "Content-Type": "application/json" }
      });
    res.data.street.geometry = JSON.parse(res.data.street.geometry);
    // const match = res.data.street.roadsegid;
    // const zoneMatch = {
    //   geometryId: res.data.zones.zoneid,
    //   referenceId: res.data.zones.zoneid,
    // }
    // if (zoneMatch) {

    change.matches.zone = res.data.zone.zoneid || -1;

    change.matches.jurisdiction = res.data.jurisdiction.jurisdictionid || -1;

    if (res.data.street.roadsegid) {
      change.matches.street = res.data.street.roadsegid;
      change.matches.streetGeometry = res.data.street.geometry;
    }

    change.matches.bin = h3.geoToH3(
      change.event_location.geometry.coordinates[1],
      change.event_location.geometry.coordinates[0],
      config.Z
    );
    // }
    // const matches = await graph.matchPoint(change.event_location, null, 1);

    // if (match.length) {
    //   change.matches.street = match;
    // }

    // BINS


    // ZONES

    // if (config.zones) {
    // var zoneMatches = [];
    //
    // for (let zone of config.zones.features) {
    //   let found = false;
    //   for (let key of keys) {
    //     if (zone.properties.keys[key]) found = true;
    //     continue;
    //   }
    //
    //   if (found) {
    //     zoneMatches.push(zone.properties.id);
    //   }
    // }
    //
    // if (zoneMatches.length) {
    //   change.matches.zones = zoneMatches;
    // }
    // }

    console.log(change.matches)
    return change;
  }
};
