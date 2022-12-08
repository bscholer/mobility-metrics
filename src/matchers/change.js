const axios = require("axios");
const turf = require("@turf/turf");
const h3 = require("h3-js");
const cover = require("@mapbox/tile-cover");

const z = 19;
const zs = { min_zoom: z, max_zoom: z };

module.exports = async function (changes, config) {
  const requests = changes.reduce((acc, change) => {
    const uuid = generateUUID();
    change['change_id'] = uuid;
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
      acc[uuid] = wkt;
    }
    return acc;
  }, {});
  const res = await axios.post(
    `${config.conflatorUrl}/match_point`,
    { points: requests },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 60 * 60 * 1000 // 60 minutes
    });
  if (!res.data) {
    console.log("no data returned from conflator");
    return;
  }
  const matches = res.data;
  changes.forEach(change => {
    const match = matches[change.change_id];
    match.street.geometry = JSON.parse(match.street.geometry);

    change.matches.zone = match.zone.zoneid || -1;

    change.matches.jurisdiction = match.jurisdiction.jurisdictionid || -1;

    if (match.street.roadsegid) {
      change.matches.street = match.street.roadsegid;
      change.matches.streetGeometry = match.street.geometry;
    }

    change.matches.bin = h3.geoToH3(
      change.event_location.geometry.coordinates[1],
      change.event_location.geometry.coordinates[0],
      config.Z
    );
  });
  return changes;
};

const generateUUID = () => {
  let d = new Date().getTime();
  if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
    d += performance.now(); //use high-precision timer if available
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (d + Math.random()*16)%16 | 0;
    d = Math.floor(d/16);
    return (c=='x' ? r : (r&0x3|0x8)).toString(16);
  });
}
