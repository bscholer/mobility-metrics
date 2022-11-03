const turf = require("@turf/turf");
const h3 = require("h3-js");
const cover = require("@mapbox/tile-cover");

const z = 19;
const zs = { min_zoom: z, max_zoom: z };

module.exports = async function(change, config, graph) {
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

    // STREETS
    if (!change.matches) change.matches = {};
    const wkt = `POINT(${change.event_location.geometry.coordinates.join(" ")})`;
    const res = await axios.post(
      `http://conflator/match_point`,
      { point: wkt },
      {
        headers: { "Content-Type": "application/json" }
      });
    res.data.geometry = JSON.parse(res.data.geometry);
    const match = {
      segments: res.data.roadsegid.map(id => ({ geometryId: id, referenceId: id })),
      matchedPath: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: res.data.geometry.coordinates
        }
      }
    }
    // const matches = await graph.matchPoint(change.event_location, null, 1);

    if (matches.length) {
      change.matches.streets = matches;
    }

    // BINS

    const bin = h3.geoToH3(
      change.event_location.geometry.coordinates[1],
      change.event_location.geometry.coordinates[0],
      config.Z
    );

    change.matches.bins = bin;

    // ZONES

    if (config.zones) {
      var zoneMatches = [];

      for (let zone of config.zones.features) {
        let found = false;
        for (let key of keys) {
          if (zone.properties.keys[key]) found = true;
          continue;
        }

        if (found) {
          zoneMatches.push(zone.properties.id);
        }
      }

      if (zoneMatches.length) {
        change.matches.zones = zoneMatches;
      }
    }

    return change;
  }
};
