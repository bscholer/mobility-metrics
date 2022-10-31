const fs = require("fs");
const request = require("request");
const tripMatch = require("../matchers/trip");
const changeMatch = require("../matchers/change");
const crypto = require("crypto");

const DEBUG = false;

async function cacheFromMds(
  provider,
  stream,
  start,
  stop,
  graph,
  config,
  cacheDayProviderLogPath,
  version,
  endpoint, // "status_changes" or "trips"
) {
  const matchFunc = endpoint === "trips" ? tripMatch : changeMatch;
  const hours = [];
  const ONE_HOUR = 60 * 60 * 1000;
  while (start < stop) {
    hours.push(new Date(start).toISOString().substring(0, 13))
    start += ONE_HOUR;
  }
  console.log("Sending requests for", hours.length, "hours")

  let mdsCsv = 'id,geom\n'
  await Promise.all(hours.map((hour) => {
    return new Promise(async (resolve, reject) => {

      const opts = {
        url: `${provider[endpoint]}?${endpoint === "trips" ? "end_time" : "event_time"}=${hour}`,
        headers: {
          "Content-Type": "application/json",
          "Accept": `application/vnd.mds+json;version=${provider.version}`,
          "Authorization": provider.token,
        }
      };
      await request.get(opts, async (err, res, body) => {
        if (err) {
          console.error(err);
          throw err;
          return;
        }

        let data;
        try {
          data = JSON.parse(body);
        } catch (e) {
          console.error(e);
          console.log(body);
          await fs.appendFileSync('/data/log.txt', `${new Date().toISOString()} ${provider.name} ${endpoint} ${hour} ${e}`);
          reject(e);
        }

        if (!('data' in data && endpoint in data.data)) {
          console.log(body);
          throw new Error(`Malformed response, expected to find data.data.${endpoint}`);
        }

        if (endpoint === "trips") {
          data.data.trips.forEach((trip) => {
            trip.route.features.forEach((feature, idx) => {
              const id = `${trip.trip_id}-${idx.toString().padStart(4, '0')}`;
              // console.log(id);
              mdsCsv += `${id},POINT(${feature.geometry.coordinates.join(" ")})\n`
            })
          });
        }

        if (DEBUG) {
          console.log(hour, ": Got", data.data[endpoint].length, endpoint === "trips" ? "trips" : "status changes");
          const timerLabel = `${hour} - ${endpoint} - match - ${data.data[endpoint].length}`;
          console.time(timerLabel);
        }

        // for (const tripOrEvent of data.data[endpoint]) {
        //
        //   const match = await matchFunc(tripOrEvent, config, graph);
        //   if (match) {
        //     const signature = crypto
        //       .createHmac("sha256", version)
        //       .update(JSON.stringify(match))
        //       .digest("hex");
        //     fs.appendFileSync(cacheDayProviderLogPath, signature + "\n");
        //     stream.write(JSON.stringify(match) + "\n");
        //   }
        // }
        if (DEBUG) console.timeEnd(timerLabel);
        resolve();
      })
    });
  })).then(() => {
    console.log(`writing ${mdsCsv.split("\n").length} rows to ${endpoint}.csv`);
    fs.writeFileSync(`/data/mds-${endpoint}.csv`, mdsCsv);
  });
}

module.exports.cacheFromMds = cacheFromMds;
