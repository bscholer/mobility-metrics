# start with a base image, based on Alpine Linux (very lightweight distro)
FROM node:11.15.0-alpine

# install python and make
RUN apk add g++ make python bash

# change working directory
WORKDIR /app

# copy both 'package.json' and 'package-lock.json'
COPY package.json ./
COPY package-lock.json ./

# install dependencies. npm ci uses package-lock.json for better speed and reliability
RUN npm ci

# copy source code
COPY ./ ./

# create a symlink so that we can actually run mobility-metrics
RUN ln -s /app/src/cli.js /usr/bin/mobility-metrics

# send it!
ENTRYPOINT ["mobility-metrics", "--config", "/data/config.json", "--public", "/data/public", "--cache", "/cache", "--day", "2022-09-20"]
