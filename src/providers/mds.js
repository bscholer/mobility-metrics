const fs = require("fs");
const request = require("request");
const tripMatch = require("../matchers/trip");
const changeMatch = require("../matchers/change");
const crypto = require("crypto");

async function trips(
  provider,
  stream,
  start,
  stop,
  graph,
  config,
  cacheDayProviderLogPath,
  version
) {
  const endTimes = [];
  while (start < stop) {
    endTimes.push(new Date(start).toISOString().substring(0, 13))
    start += 60 * 60 * 1000;
  }
  console.log("Sending requests for", endTimes.length, "hours")

  const promises = endTimes.map((end) => {
    return new Promise(async (resolve, reject) => {
      var opts = {};

      opts = {
        url: `${provider.trips}?end_time=${end}`,
        headers: {
          "Content-Type": "application/json",
          Accept: `application/vnd.mds+json;version=${provider.version}`,
          Authorization: provider.token
        }
      };

      // recursive scan across
      async function scan(opts, done) {
        request.get(opts, async (err, res, body) => {
          if (err) {
            console.log(body);
            throw err;
          }

          const data = JSON.parse(body);

          if (!('data' in data && 'trips' in data.data)) {
            console.log(body);
            throw new Error("No trips returned");
          }

          // write any returned trips to stream
          for (const trip of data.data.trips) {
            const match = await tripMatch(trip, config, graph);
            if (match) {
              const signature = crypto
                .createHmac("sha256", version)
                .update(JSON.stringify(match))
                .digest("hex");
              fs.appendFileSync(cacheDayProviderLogPath, signature + "\n");
              stream.write(JSON.stringify(match) + "\n");
            }
          }

          // continue scan if another page is present
          if (data.links && data.links.next) {
            opts.url = data.links.next;
            scan(opts, done);
          } else {
            done();
          }
        });
      }

      await scan(opts, () => {
        resolve();
      });
    });
  });
  return Promise.all(promises);
}

async function changes(
  provider,
  stream,
  start,
  stop,
  graph,
  config,
  cacheDayProviderLogPath,
  version
) {
  const eventTimes = [];
  while (start < stop) {
    eventTimes.push(new Date(start).toISOString().substring(0, 13))
    start += 60 * 60 * 1000;
  }
  console.log("Sending requests for", eventTimes.length, "hours")

  const promises = eventTimes.map((event) => {
    return new Promise(async (resolve, reject) => {
      var opts = {};

      opts = {
        url: `${provider.status_changes}?event_time=${event}`,
        headers: {
          "Content-Type": "application/json",
          Accept: `application/vnd.mds+json;version=${provider.version}`,
          Authorization: provider.token
        }
      };

      // recursive scan across
      async function scan(opts, done) {
        request.get(opts, async (err, res, body) => {
          if (err) throw err;
          var data = JSON.parse(body);

          if (!('data' in data && 'status_changes' in data.data)) {
            console.log(body);
            throw new Error("No trips returned");
          }

          // write any returned changes to stream
          for (const change of data.data.status_changes) {
            const match = await changeMatch(change, config, graph);
            if (match) {
              const signature = crypto
                .createHmac("sha256", version)
                .update(JSON.stringify(match))
                .digest("hex");
              fs.appendFileSync(cacheDayProviderLogPath, signature + "\n");
              stream.write(JSON.stringify(match) + "\n");
            }
          }

          // continue scan if another page is present
          if (data.links && data.links.next) {
            opts.url = data.links.next;
            scan(opts, done);
          } else {
            done();
          }
        });
      }

      await scan(opts, () => {
        resolve();
      });
    });
  });
}

module.exports.trips = trips;
module.exports.changes = changes;
