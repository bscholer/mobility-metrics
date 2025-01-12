const fs = require("fs");
const path = require("path");
const mkdirp = require("mkdirp");
const queue = require("d3-queue").queue;
const through2 = require("through2");
const moment = require("moment");
const local = require("./providers/local");
const mds = require("./providers/mds");

const cache = async function (
  startDay,
  endDay,
  reportDay,
  cachePath,
  config
) {
  var version = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json")).toString()
  ).version;

  const providers = Object.keys(config.providers).filter(provider => {
    return config.providers[provider].enabled;
  });

  const start = Math.round(+startDay.subtract(config.lost, "days").format("x"));
  const stop = Math.round(+endDay.endOf('day').format("x"));

  const cacheDayPath = path.join(cachePath, reportDay.format("YYYY-MM-DD"));
  // const cacheDayAllPath = path.join(cacheDayPath, "./All");
  // const cacheDayAllTripsPath = path.join(cacheDayAllPath, "trips.json");
  // const cacheDayAllChangesPath = path.join(cacheDayAllPath, "changes.json");
  // mkdirp.sync(cacheDayAllPath);

  for (let name of providers) {
    const provider = config.providers[name];
    console.log("    " + name + "...");

    var cacheDayProviderPath = path.join(cacheDayPath, name);
    mkdirp.sync(cacheDayProviderPath);

    const cacheDayProviderLogPath = path.join(cacheDayProviderPath, "log.txt");
    const cacheDayTripsPath = path.join(cacheDayPath, "trips.json");
    const cacheDayChangesPath = path.join(cacheDayPath, "changes.json");

    // I don't think this is necessary. I had added it to make sure that the files existed, but it was only causing
    // problems when the cache directory was not empty.
    // The cache directory should always be empty when the script is run, so this is a non-issue.

    // // Create empty files ahead of time in case nothing gets written
    // let fh = await fs.open(cacheDayProviderTripsPath, 'w', (err) => {
    //   console.error(err);
    // });
    // await fh.close();
    //
    // fh = await fs.open(cacheDayProviderChangesPath, 'w', (err) => {
    //   console.error(err);
    // });
    // await fh.close();

    var cacheDayTripsStream = fs.createWriteStream(
      cacheDayTripsPath
    );
    var cacheDayChangesStream = fs.createWriteStream(
      cacheDayChangesPath
    );

    if (provider.type === "mds") {
      await mds.cacheFromMds(
        provider,
        cacheDayTripsStream,
        start,
        stop,
        config,
        cacheDayProviderLogPath,
        version,
        "trips"
      ).catch((err) => {
        console.error(err);
      });
      await mds.cacheFromMds(
        provider,
        cacheDayChangesStream,
        start,
        stop,
        config,
        cacheDayProviderLogPath,
        version,
        "status_changes"
      ).catch(err => {
        console.error(err);
      });
    } else if (provider.type === "local") {
      await local.trips(
        provider,
        cacheDayTripsStream,
        start,
        stop,
        config,
        cacheDayProviderLogPath,
        version
      );
      await local.changes(
        provider,
        cacheDayChangesStream,
        start,
        stop,
        config,
        cacheDayProviderLogPath,
        version
      );
    }

    // const tripsData = fs.readFileSync(cacheDayTripsPath).toString();
    // const changesData = fs.readFileSync(cacheDayChangesPath).toString();

    // fs.appendFileSync(cacheDayAllTripsPath, tripsData);
    // fs.appendFileSync(cacheDayAllChangesPath, changesData);
  }
};

module.exports = cache;
