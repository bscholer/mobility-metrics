const fs = require("fs");
const request = require("request");
const tripMatch = require("../matchers/trip");
const changeMatch = require("../matchers/change");
const crypto = require("crypto");
const cliProgress = require('cli-progress');

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
  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progressBar.start(endTimes.length, 0);

  const promises = endTimes.map((end) => {
    return new Promise(async (resolve, reject) => {
      var opts = {};

      opts = {
	url: `${provider.trips}?end_time=${end}`,
	headers: {
	  "Content-Type": "application/json",
	  Accept: "application/vnd.mds+json;version=1.0",
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

	  var data = JSON.parse(body);

	  // write any returned trips to stream
	  data.data.trips.forEach(async (trip, idx) => {
	    trip = await tripMatch(trip, config, graph);
	    // console.log(`matched ${idx}/${data.data.trips.length}`);
	    if (trip) {
	      const signature = crypto
		.createHmac("sha256", version)
		.update(JSON.stringify(trip))
		.digest("hex");
	      fs.appendFileSync(cacheDayProviderLogPath, signature + "\n");
	      stream.write(JSON.stringify(trip) + "\n");
	    }
	  });

	  // continue scan if another page is present
	  if (data.links && data.links.next) {
	    opts.url = data.links.next;
	    scan(opts, done);
	  } else {
	    progressBar.increment();
	    done();
	  }
	});
      }

      await scan(opts, () => {
	resolve();
      });
    });
  });
  progressBar.stop();
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
  return new Promise(async (resolve, reject) => {
    var opts = {};

    if (provider.version === "1.0") {
      opts = {
        url:
          provider.status_changes +
          "?start_time=" +
          start.toString() +
          "&end_time=" +
          stop.toString(),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/vnd.mds.provider+json;version=1.0",
          Authorization: provider.token
        }
      };
    } else {
      opts = {
        url:
          provider.status_changes +
          "?start_time=" +
          start.toString() +
          "&end_time=" +
          stop.toString(),
        headers: {
          "Content-Type": "application/json",
          Authorization: provider.token
        }
      };
    }

    // recursive scan across
    async function scan(opts, done) {
      request.get(opts, async (err, res, body) => {
        if (err) throw err;
        var data = JSON.parse(body);

        // write any returned changes to stream
        for (let change of data.data.status_changes) {
          change = await changeMatch(change, config, graph);
          if (change) {
            const signature = crypto
              .createHmac("sha256", version)
              .update(JSON.stringify(change))
              .digest("hex");
            fs.appendFileSync(cacheDayProviderLogPath, signature + "\n");
            stream.write(JSON.stringify(change) + "\n");
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
}

module.exports.trips = trips;
module.exports.changes = changes;
