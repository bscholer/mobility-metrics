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
        }

        const data = JSON.parse(body);

        if (!('data' in data && endpoint in data.data)) {
          console.log(body);
          throw new Error(`Malformed response, expected to find data.data.${endpoint}`);
        }

        if (DEBUG) {
          console.log(hour, ": Got", data.data[endpoint].length, endpoint === "trips" ? "trips" : "status changes");
          const timerLabel = `${hour} - ${endpoint} - match - ${data.data[endpoint].length}`;
          console.time(timerLabel);
        }

        for (const tripOrEvent of data.data[endpoint]) {
          const match = await matchFunc(tripOrEvent, config, graph);
          if (match) {
            const signature = crypto
              .createHmac("sha256", version)
              .update(JSON.stringify(match))
              .digest("hex");
            fs.appendFileSync(cacheDayProviderLogPath, signature + "\n");
            stream.write(JSON.stringify(match) + "\n");
          }
        }
        if (DEBUG) console.timeEnd(timerLabel);
        resolve();
      })
    });
  }));
}

module.exports.cacheFromMds = cacheFromMds;
