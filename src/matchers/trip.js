const axios = require("axios");
const turf = require("@turf/turf");
const h3 = require("h3-js");
const cover = require("@mapbox/tile-cover");
const fs = require("fs");

const z = 19;
const zs = { min_zoom: z, max_zoom: z };

// this handles multiple trips
module.exports = async function (trips, config) {
  if (!trips.length) {
    console.warn("no trips");
  }
  const requests = trips.reduce((acc, trip) => {
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

    // const distance = turf.length(line, { units: "miles" });
    // if (distance > (config.maxTripLengthFilter || 10)) {
    //   return;
    // }


    if (config.geographicFilter) {
      const keys = cover.indexes(line.geometry, zs);
      var pass = false;
      for (let key of keys) {
        if (config.geographicFilterKeys[key]) {
          pass = true;
        }
      }
      if (!pass) return;
    }

    if (!trip.matches) trip.matches = {};

    // console.log(`number of points: ${trip.route.features.length}`);
    acc[trip.trip_id] = `LINESTRING(${line.geometry.coordinates.map(pt => pt.join(" ")).join(", ")})`;
    return acc;
  }, {})

  fs.writeFileSync("/data/requests.json", JSON.stringify(requests, null, 2));

  const res = await axios.post(
    `${config.conflatorUrl}/match_line`,
    { lines: requests },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 60 * 60 * 1000 // 60 minutes
    });

  // let res = await axios.post(`${config.conflatorUrl}/match_line`, { line: wkt },
  //   {
  //     headers: { "Content-Type": "application/json" },
  //     timeout: 60 * 60 * 1000 // 60 minutes
  //   }).catch(err => {
  //     console.log(err);
  // })

  if (!res.data) {
    console.log("no data from conflator");
    return;
  }
  Object.keys(res.data).forEach((trip_id) => {
    const trip = trips.find(t => t.trip_id === trip_id);
    const res_data = res.data[trip_id];

    res_data.street.geometry = JSON.parse(res_data.street.geometry);
    const match = {
      segment: res_data.street.roadsegid,
      matchedPath: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "MultiLineString",
          coordinates: res_data.street.roadsegid.map((id) => {
            return res_data.street.geometry.features.find((f) => `${f.id}` === `${id}`).geometry.coordinates;
          })
        }
      },
    }

    // reformat slightly
    if (res_data.zone.zoneid) {
      trip.matches.zone = res_data.zone.zoneid;
    }

    if (res_data.jurisdiction.jurisdictionid) {
      trip.matches.jurisdiction = res_data.jurisdiction.jurisdictionid;
    }

    // bin
    trip.matches.bin = trip.route.features.map(ping => h3.geoToH3(
      ping.geometry.coordinates[1],
      ping.geometry.coordinates[0],
      config.Z
    ));

    const pickupMatch = {
      street: res_data.street.pickup,
      zone: res_data.zone.pickup,
      jurisdiction: res_data.jurisdiction.pickup,
      bin: trip.matches.bin[0],
    }

    const dropoffMatch = {
      street: res_data.street.dropoff,
      zone: res_data.zone.dropoff,
      jurisdiction: res_data.jurisdiction.dropoff,
      bin: trip.matches.bin[trip.matches.bin.length - 1],
    }

    const flowMatch = {
      street: `${res_data.street.pickup}>${res_data.street.dropoff}`,
      zone: `${res_data.zone.pickup}>${res_data.zone.dropoff}`,
      jurisdiction: `${res_data.jurisdiction.pickup}>${res_data.jurisdiction.dropoff}`,
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
      match.segment &&
      match.matchedPath &&
      match.matchedPath.geometry &&
      match.matchedPath.geometry.coordinates &&
      match.matchedPath.geometry.coordinates.length === match.segment.length
    ) {
      trip.matches.street = match;
    }

  });

  return trips;
};
