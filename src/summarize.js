const fs = require("fs");
const path = require("path");
const mkdirp = require("mkdirp");
const turf = require("@turf/turf");
const moment = require("moment");
const h3 = require("h3-js");
const md5 = require("md5");
const cache = require("./cache");
const report = require("./report");
const os = require("os");
const axios = require("axios");

const version = require(path.join(__dirname, "../package.json")).version;
const MILLIS_PER_SECOND = 1000;

var Z = 9;

const summarize = async function (
  startDay,
  endDay,
  reportDay,
  publicPath,
  cachePath,
  config
) {
  return new Promise(async (resolve, reject) => {
    // import all providers
    // const providers = Object.keys(config.providers).filter(provider => {
    //   return config.providers[provider].enabled;
    // });
    // providers.push("All");

    var cacheDayPath = path.join(cachePath, reportDay.format("YYYY-MM-DD"));
    if (!fs.existsSync(cacheDayPath)) {
      console.log("  caching...");
      await cache(startDay, endDay, reportDay, cachePath, config);
    }

    // console.log("  linear referencing...");
    // for (let provider of providers) {
    //   await new Promise(async (resolve, reject) => {
    //     var cacheProviderPath = path.join(cacheDayPath, provider);
    //     const { spawn } = require('child_process');
    //     const tripsProc = spawn('python3', ['/app/conflator/main.py', path.join(cacheProviderPath, "trips.json")]);
    //     // const statusProc = spawn('python3', ['/app/conflator/main.py', path.join(cacheProviderPath, "changes.json")]);
    //
    //     tripsProc.stdout.on('data', (data) => {
    //       console.log(`stdout: ${data}`);
    //     });
    //     tripsProc.stderr.on('data', (data) => {
    //       console.log(`stderr: ${data}`);
    //     });
    //
    //     tripsProc.on('close', (code) => {
    //       console.log(`child process exited with code ${code}`);
    //       // statusProc.on('close', (code) => {
    //       resolve();
    //       // });
    //     });
    //   });
    // }


    console.log("  summarizing...");
    mkdirp.sync(cacheDayPath);

    fs.appendFileSync(path.join(cacheDayPath, "trips.json"), "");
    fs.appendFileSync(path.join(cacheDayPath, "changes.json"), "");

    var trips = fs
      .readFileSync(path.join(cacheDayPath, "trips.json"))
      .toString()
      .split("\n")
      .filter(line => {
        return line.length;
      })
      .map(JSON.parse);
    var changes = fs
      .readFileSync(path.join(cacheDayPath, "changes.json"))
      .toString()
      .split("\n")
      .filter(line => {
        return line.length;
      })
      .map(JSON.parse);


    trips.reduce((min, curr) => {
      return curr.route.features[0].properties.timestamp < min ? curr.route.features[0].properties.timestamp : min;
    })

    var totalVehicles = new Set();
    var totalActiveVehicles = new Set();
    var stats = {
      version: version,
      totalVehicles: 0,
      totalActiveVehicles: 0,
      totalTrips: 0,
      totalDistance: 0,
      totalDuration: 0,
      geometry: {
        bin: {},
        street: {},
        zone: {},
        pairs: {},
        jurisdiction: {},
      },
      fleet: {
        available: {},
        reserved: {},
        unavailable: {}
      },
      tripVolumes: {
        bin: {
          day: {},
          hour: {},
          minute: {}
        },
        zone: {
          day: {},
          hour: {},
          minute: {}
        },
        jurisdiction: {
          day: {},
          hour: {},
          minute: {}
        },
        street: {
          day: {},
          hour: {},
          minute: {}
        }
      },
      pickups: {
        bin: {
          day: {},
          hour: {},
          minute: {}
        },
        zone: {
          day: {},
          hour: {},
          minute: {}
        },
        jurisdiction: {
          day: {},
          hour: {},
          minute: {}
        },
        street: {
          day: {},
          hour: {},
          minute: {}
        }
      },
      dropoffs: {
        bin: {
          day: {},
          hour: {},
          minute: {}
        },
        zone: {
          day: {},
          hour: {},
          minute: {}
        },
        jurisdiction: {
          day: {},
          hour: {},
          minute: {}
        },
        street: {
          day: {},
          hour: {},
          minute: {}
        }
      },
      flows: {
        pairs: {
          day: {},
          hour: {},
          minute: {}
        }
      },
      availability: {
        bin: {
          day: {},
          hour: {},
          minute: {}
        },
        zone: {
          day: {},
          hour: {},
          minute: {}
        },
        jurisdiction: {
          day: {},
          hour: {},
          minute: {}
        },
        street: {
          day: {},
          hour: {},
          minute: {}
        }
      },
      onstreet: {
        bin: {
          day: {},
          hour: {},
          minute: {}
        },
        zone: {
          day: {},
          hour: {},
          minute: {}
        },
        jurisdiction: {
          day: {},
          hour: {},
          minute: {}
        },
        street: {
          day: {},
          hour: {},
          minute: {}
        }
      }
    };

    // add zone to geometries
    trips.forEach(trip => {
      trip.matches.zone.forEach(zone => {
        var zoneGeometry = config.zone.features.find(z => {
          return z.properties.id + "" === zone + "";
        })
        if (zoneGeometry) {
          if (!stats.geometry.zone[zone]) {
            stats.geometry.zone[zone] = zoneGeometry;
          }
        }
      })
    })
    changes.forEach(change => {
      if (change.matches.zone) {
        const zone = change.matches.zone;
        var zoneGeometry = config.zone.features.find(z => {
          return z.properties.id + "" === zone + "";
        })
        if (zoneGeometry) {
          if (!stats.geometry.zone[zone]) {
            stats.geometry.zone[zone] = zoneGeometry;
          }
        }
      }
    })

    // add jurisdiction to geometries
    trips.forEach(trip => {
      trip.matches.jurisdiction.forEach(jurisdiction => {
        var jurisdictionGeometry = config.jurisdiction.features.find(j => {
          return j.properties.id + "" === jurisdiction + "";
        })
        if (jurisdictionGeometry) {
          if (!stats.geometry.jurisdiction[jurisdiction]) {
            stats.geometry.jurisdiction[jurisdiction] = jurisdictionGeometry;
          }
        }
      })
    })
    changes.forEach(change => {
      if (change.matches.jurisdiction) {
        const jurisdiction = change.matches.jurisdiction;
        var jurisdictionGeometry = config.jurisdiction.features.find(j => {
          return j.properties.id + "" === jurisdiction + "";
        })
        if (jurisdictionGeometry) {
          if (!stats.geometry.jurisdiction[jurisdiction]) {
            stats.geometry.jurisdiction[jurisdiction] = jurisdictionGeometry;
          }
        }
      }
    })

    // add street to geometries
    trips.forEach(trip => {
      trip.matches.street.segment
        .map((segment, s) => {
          return turf.lineString(trip.matches.street.matchedPath.geometry.coordinates[s], {
            ref: segment.geometryId
          });
        })
        .forEach(f => {
          if (!stats.geometry.street[f.properties.ref]) {
            stats.geometry.street[f.properties.ref] = f;
          }
        });
    })

    // add change street to geometries
    changes.forEach(change => {
      if (change.matches.street) {
        const feature = change.matches.streetGeometry.features[0];
        const line = turf.lineString(feature.geometry.coordinates, {
          ref: feature.id
        });
        if (!stats.geometry.street[line.properties.ref]) {
          stats.geometry.street[line.properties.ref] = line;
        }
      }
    });

    // trips.forEach(trip => {
    //   trip.matches.street.forEach(street => {
    //     var streetGeometry = config.street.features.find(s => {
    //       return s.properties.id + "" === street + "";
    //     })
    //     if (streetGeometry) {
    //       if (!stats.geometry.street[street]) {
    //         stats.geometry.street[street] = streetGeometry;
    //       }
    //     }
    //   })

    for (let trip of trips) {
      totalVehicles.add(trip.vehicle_id);
      totalActiveVehicles.add(trip.vehicle_id);

      // convert to miles
      trip.trip_distance = trip.trip_distance * 0.000621371;
      // convert to minutes
      trip.trip_duration = trip.trip_duration / 60;

      // summary stats
      stats.totalActiveVehicles = totalActiveVehicles.size;
      stats.totalTrips++;
      stats.totalDistance += trip.trip_distance;
      stats.totalDuration += trip.trip_duration;
      stats.averageVehicleDistance =
        stats.totalDistance / stats.totalActiveVehicles;
      stats.averageVehicleDuration =
        stats.totalDuration / stats.totalActiveVehicles;
      stats.averageTripDistance = stats.totalDistance / stats.totalTrips;
      stats.averageTripDuration = stats.totalDuration / stats.totalTrips;
      stats.averageTrips = stats.totalTrips / stats.totalActiveVehicles;
    }

    // build state histories for each vehicle
    var states = {};
    changes.forEach(change => {
      if (!states[change.vehicle_id]) {
        totalVehicles.add(change.vehicle_id);
        stats.totalVehicles = totalVehicles.size;
        states[change.vehicle_id] = [];
      }
      states[change.vehicle_id].push(change);
    });
    // sort by time
    Object.keys(states).forEach(id => {
      states[id] = states[id].sort((a, b) => a.event_time - b.event_time);
    });

    trips.map(trip => {
      var bins = new Set();
      trip.route.features.forEach(ping => {
        var bin = h3.geoToH3(
          ping.geometry.coordinates[1],
          ping.geometry.coordinates[0],
          Z
        );
        bins.add(bin);
      });
      trip.matches.bin = Array.from(bins);
      // store bin geometry
      bins.forEach(bin => {
        var geo = turf.polygon([h3.h3ToGeoBoundary(bin, true)], {
          bin: bin
        });
        stats.geometry.bin[bin] = geo;
      });
    })

    const privacyMinimum = config.privacyMinimum;

    // console.log("      fleet sizes...");
    // await fleet(startDay, endDay, reportDay, stats, states);

    console.log("      trip volumes...");
    await tripVolumes(
      startDay,
      endDay,
      reportDay,
      stats,
      trips,
      privacyMinimum,
      config
    );
    // console.log("      availability...");
    // await availability(startDay, endDay, reportDay, stats, changes, config);
    // console.log("      onstreet...");
    // await onstreet(startDay, endDay, reportDay, stats, states, config);
    console.log("      pickups...");
    await pickups(startDay, endDay, reportDay, stats, trips, config);
    console.log("      dropoffs...");
    await dropoffs(startDay, endDay, reportDay, stats, trips, config);
    console.log("      flows...");
    await flows(startDay, endDay, reportDay, stats, trips, privacyMinimum);

    // var summaryPath = path.join(
    //   publicPath,
    //   "data",
    //   reportDay.format("YYYY-MM-DD")
    // );
    // mkdirp.sync(summaryPath);
    // summaryFilePath = path.join(summaryPath, "all.json");
    //
    // fs.writeFileSync(summaryFilePath, JSON.stringify(stats));

    // await report(
    //   config,
    //   // providers,
    //   publicPath,
    //   startDay.format("YYYY-MM-DD"),
    //   endDay.format("YYYY-MM-DD"),
    //   reportDay.format("YYYY-MM-DD")
    // );

    resolve();
  });
};

function getTimeBins(reportDay, timestamp) {
  var time = moment(timestamp, "X");
  var minutes = +time.minutes();
  var formattedMinutes = "00";
  if (minutes >= 15) formattedMinutes = "15";
  if (minutes >= 30) formattedMinutes = "30";
  if (minutes >= 45) formattedMinutes = "45";

  var bin = {};
  bin.day = reportDay.format("YYYY-MM-DD");
  bin.hour = bin.day + "-" + time.format("HH");
  bin.minute = bin.hour + "-" + formattedMinutes;

  return bin;
}

async function tripVolumes(
  startDay,
  endDay,
  reportDay,
  stats,
  trips,
  privacyMinimum,
) {
  const timeFilteredTrips = trips
    .filter(trip => {
      return trip.start_time >= startDay.unix() * MILLIS_PER_SECOND && trip.start_time <= endDay.unix() * MILLIS_PER_SECOND
    })
    .filter(trip => !!trip.matches)
    .map(trip => {
      delete trip.route;
      if (trip.matches.street.segment) {
        trip.matches.street = trip.matches.street.segment
      }
      return trip;
    });

  const requestData = {
    trips: timeFilteredTrips,
    "privacy_minimum": privacyMinimum,
    "report_date": reportDay.format("YYYY-MM-DD")
  }
  fs.writeFileSync('/cache/trip_volume.json', JSON.stringify(requestData));

  await axios.post('http://conflator/trip_volume', requestData)
}

async function pickups(
  startDay,
  endDay,
  reportDay,
  stats,
  trips,
  config
) {
  const timeFilteredTrips = trips
    .filter(trip => {
      return trip.start_time >= startDay.unix() * MILLIS_PER_SECOND && trip.start_time <= endDay.unix() * MILLIS_PER_SECOND
    })
    .filter(trip => !!trip.matches)
    .map(trip => {
      delete trip.route;
      if (trip.matches.street.segment) {
        trip.matches.street = trip.matches.street.segment
      }
      return trip;
    });

  const requestData = {
    trips: timeFilteredTrips,
    "report_date": reportDay.format("YYYY-MM-DD")
  }
  fs.writeFileSync('/cache/pickup.json', JSON.stringify(requestData));

  await axios.post('http://conflator/pickup', requestData)
}

async function dropoffs(
  startDay,
  endDay,
  reportDay,
  stats,
  trips
) {
  const timeFilteredTrips = trips
    .filter(trip => {
      return trip.start_time >= startDay.unix() * MILLIS_PER_SECOND && trip.start_time <= endDay.unix() * MILLIS_PER_SECOND
    })
    .filter(trip => !!trip.matches)
    .map(trip => {
      delete trip.route;
      if (trip.matches.street.segment) {
        trip.matches.street = trip.matches.street.segment
      }
      return trip;
    });

  const requestData = {
    trips: timeFilteredTrips,
    "report_date": reportDay.format("YYYY-MM-DD")
  }
  fs.writeFileSync('/cache/dropoff.json', JSON.stringify(requestData));

  await axios.post('http://conflator/dropoff', requestData)
}

async function flows(startDay, endDay, reportDay, stats, trips, privacyMinimum) {
  const timeFilteredTrips = trips
    .filter(trip => {
      return trip.start_time >= startDay.unix() * MILLIS_PER_SECOND && trip.start_time <= endDay.unix() * MILLIS_PER_SECOND
    })
    .filter(trip => !!trip.matches)
    .map(trip => {
      delete trip.route;
      if (trip.matches.street.segment) {
        trip.matches.street = trip.matches.street.segment
      }
      return trip;
    });

  const requestData = {
    trips: timeFilteredTrips,
    "privacy_minimum": privacyMinimum,
    "report_date": reportDay.format("YYYY-MM-DD")
  }
  fs.writeFileSync('/cache/flows.json', JSON.stringify(requestData));

  await axios.post('http://conflator/flow', requestData)
}

async function fleet(startDay, endDay, reportDay, stats, states) {
  // playback times
  // foreach 1 hour:
  // foreach vehicle state:
  // find last state before current
  // if available, increment fleet stat

  var start = startDay.format("x");
  var stop = endDay
    .clone()
    .add(1, "day")
    .format("x");
  var current = startDay.clone();
  var baseDay = reportDay.format("YYYY-MM-DD");

  while (current.format("YYYY-MM-DD") <= endDay.format("YYYY-MM-DD")) {
    stats.fleet.available[current.format(baseDay + "-HH")] = 0;
    stats.fleet.reserved[current.format(baseDay + "-HH")] = 0;
    stats.fleet.unavailable[current.format(baseDay + "-HH")] = 0;

    var vehicle_ids = Object.keys(states);
    for (let vehicle_id of vehicle_ids) {
      var last;
      for (let state of states[vehicle_id]) {
        var timestamp = moment(state.event_time, "x");

        if (timestamp.diff(current) <= 0) {
          last = state.vehicle_state;
        }
      }

      if (last) {
        if (last === "available") {
          stats.fleet.available[current.format(baseDay + "-HH")]++;
        } else if (last === "reserved") {
          stats.fleet.reserved[current.format(baseDay + "-HH")]++;
        } else if (last === "unavailable") {
          stats.fleet.unavailable[current.format(baseDay + "-HH")]++;
        }
      }
    }

    current = current.add(1, "hour");
  }
}

async function availability(startDay, endDay, reportDay, stats, changes) {
  // playback times
  // foreach 15 min:
  // foreach vehicle state:
  // find last state before current
  // if available, increment availability stat

  const timeFilteredChanges = changes
    .filter(change => {
      return change.event_time >= startDay.unix() * MILLIS_PER_SECOND && change.event_time <= endDay.unix() * MILLIS_PER_SECOND
    })
    .filter(change => !!change.matches)
    .map(change => {
      delete change["event_location"]
      delete change.matches.streetGeometry;
      return change;
    });

  const requestData = {
    'status_changes': timeFilteredChanges,
    "report_date": reportDay.format("YYYY-MM-DD")
  }
  fs.writeFileSync('/cache/availability.json', JSON.stringify(requestData));

  await axios.post('http://conflator/availability', requestData)
}

async function onstreet(startDay, endDay, reportDay, stats, states) {
  // playback times
  // foreach 15 min:
  // foreach vehicle state:
  // find last state before current
  // if available, increment onstreet stat

  var start = startDay.format("x");
  var stop = endDay
    .clone()
    .add(1, "day")
    .format("x");
  var current = startDay.clone();
  var baseDay = reportDay.format("YYYY-MM-DD");

  while (current.format("YYYY-MM-DD") <= endDay.format("YYYY-MM-DD")) {
    var vehicle_ids = Object.keys(states);
    for (let vehicle_id of vehicle_ids) {
      var lastAvailable;
      states[vehicle_id].forEach(state => {
        if (
          state.vehicle_state === "available" ||
          state.vehicle_state === "unavailable"
        ) {
          var timestamp = moment(state.event_time, "x");

          if (timestamp.diff(current) <= 0) {
            lastAvailable = state;
          }
        }
      });

      if (lastAvailable) {
        // onstreet hex bin
        var bin = h3.geoToH3(
          lastAvailable.event_location.geometry.coordinates[1],
          lastAvailable.event_location.geometry.coordinates[0],
          Z
        );

        // store geo
        var geo = turf.polygon([h3.h3ToGeoBoundary(bin, true)], {
          bin: bin
        });
        stats.geometry.bin[bin] = geo;

        // bootstrap bin
        if (!stats.onstreet.bin.minute[current.format(baseDay + "-HH-mm")]) {
          stats.onstreet.bin.minute[current.format(baseDay + "-HH-mm")] = {};
        }
        if (
          !stats.onstreet.bin.minute[current.format(baseDay + "-HH-mm")][bin]
        ) {
          stats.onstreet.bin.minute[current.format(baseDay + "-HH-mm")][
            bin
            ] = 1;
        } else {
          stats.onstreet.bin.minute[current.format(baseDay + "-HH-mm")][bin]++;
        }

        // onstreet zone
        if (lastAvailable.matches.zone) {
          if (
            !stats.onstreet.zone.minute[current.format(baseDay + "-HH-mm")]
          ) {
            stats.onstreet.zone.minute[
              current.format(baseDay + "-HH-mm")
              ] = {};
          }
          if (
            !stats.onstreet.zone.minute[current.format(baseDay + "-HH-mm")][lastAvailable.matches.zone]
          ) {
            stats.onstreet.zone.minute[current.format(baseDay + "-HH-mm")][lastAvailable.matches.zone] = 1;
          } else {
            stats.onstreet.zone.minute[current.format(baseDay + "-HH-mm")][lastAvailable.matches.zone]++;
          }
        }

        // onstreet street refs
        // var matches = lastAvailable.matches.street;
        // if (matches && matches.length) {
        //   var ref = matches[0].geometryId;
        //   // cache geometry from ref
        //   var geo = JSON.parse(
        //     JSON.stringify(graph.tileIndex.featureIndex.get(ref))
        //   );
        //   geo.properties = {
        //     ref: ref
        //   };
        //   stats.geometry.street[ref] = geo;
        //
        //   // bootstrap ref
        //   if (
        //     !stats.onstreet.street.minute[current.format(baseDay + "-HH-mm")]
        //   ) {
        //     stats.onstreet.street.minute[
        //       current.format(baseDay + "-HH-mm")
        //       ] = {};
        //   }
        //   if (
        //     !stats.onstreet.street.minute[current.format(baseDay + "-HH-mm")][
        //       ref
        //       ]
        //   ) {
        //     stats.onstreet.street.minute[current.format(baseDay + "-HH-mm")][
        //       ref
        //       ] = 1;
        //   } else {
        //     stats.onstreet.street.minute[current.format(baseDay + "-HH-mm")][
        //       ref
        //       ]++;
        //   }
        // }
      }
    }

    current = current.add(15, "minutes");
  }

  // find max onstreet per hour
  // hex
  Object.keys(stats.onstreet.bin.minute).forEach(minute => {
    var hour = minute.slice(0, minute.length - 3);
    if (!stats.onstreet.bin.hour[hour]) {
      stats.onstreet.bin.hour[hour] = {};
    }

    Object.keys(stats.onstreet.bin.minute[minute]).forEach(bin => {
      var val = stats.onstreet.bin.minute[minute][bin];

      if (
        !stats.onstreet.bin.hour[hour][bin] ||
        stats.onstreet.bin.hour[hour][bin] < val
      ) {
        stats.onstreet.bin.hour[hour][bin] = val;
      }
    });
  });
  // zone
  Object.keys(stats.onstreet.zone.minute).forEach(minute => {
    var hour = minute.slice(0, minute.length - 3);
    if (!stats.onstreet.zone.hour[hour]) {
      stats.onstreet.zone.hour[hour] = {};
    }

    Object.keys(stats.onstreet.zone.minute[minute]).forEach(zone => {
      var val = stats.onstreet.zone.minute[minute][zone];

      if (
        !stats.onstreet.zone.hour[hour][zone] ||
        stats.onstreet.zone.hour[hour][zone] < val
      ) {
        stats.onstreet.zone.hour[hour][zone] = val;
      }
    });
  });
  // street
  Object.keys(stats.onstreet.street.minute).forEach(minute => {
    var hour = minute.slice(0, minute.length - 3);
    if (!stats.onstreet.street.hour[hour]) {
      stats.onstreet.street.hour[hour] = {};
    }

    Object.keys(stats.onstreet.street.minute[minute]).forEach(ref => {
      var val = stats.onstreet.street.minute[minute][ref];

      if (
        !stats.onstreet.street.hour[hour][ref] ||
        stats.onstreet.street.hour[hour][ref] < val
      ) {
        stats.onstreet.street.hour[hour][ref] = val;
      }
    });
  });

  // find max onstreet per day
  // hex
  Object.keys(stats.onstreet.bin.hour).forEach(hour => {
    var day = hour.slice(0, hour.length - 3);
    if (!stats.onstreet.bin.day[day]) {
      stats.onstreet.bin.day[day] = {};
    }

    Object.keys(stats.onstreet.bin.hour[hour]).forEach(bin => {
      var val = stats.onstreet.bin.hour[hour][bin];

      if (
        !stats.onstreet.bin.day[day][bin] ||
        stats.onstreet.bin.day[day][bin] < val
      ) {
        stats.onstreet.bin.day[day][bin] = val;
      }
    });
  });
  // zone
  Object.keys(stats.onstreet.zone.hour).forEach(hour => {
    var day = hour.slice(0, hour.length - 3);
    if (!stats.onstreet.zone.day[day]) {
      stats.onstreet.zone.day[day] = {};
    }

    Object.keys(stats.onstreet.zone.hour[hour]).forEach(zone => {
      var val = stats.onstreet.zone.hour[hour][zone];

      if (
        !stats.onstreet.zone.day[day][zone] ||
        stats.onstreet.zone.day[day][zone] < val
      ) {
        stats.onstreet.zone.day[day][zone] = val;
      }
    });
  });
  // street
  Object.keys(stats.onstreet.street.hour).forEach(hour => {
    var day = hour.slice(0, hour.length - 3);
    if (!stats.onstreet.street.day[day]) {
      stats.onstreet.street.day[day] = {};
    }

    Object.keys(stats.onstreet.street.hour[hour]).forEach(ref => {
      var val = stats.onstreet.street.hour[hour][ref];

      if (
        !stats.onstreet.street.day[day][ref] ||
        stats.onstreet.street.day[day][ref] < val
      ) {
        stats.onstreet.street.day[day][ref] = val;
      }
    });
  });
}

module.exports = summarize;
