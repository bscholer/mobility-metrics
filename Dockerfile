# start with a base image, based on Alpine Linux (very lightweight distro)
FROM node:18-alpine

# install python and make
RUN apk add g++ make bash libc6-compat dos2unix
RUN ln -s /lib/libc.musl-x86_64.so.1 /lib/ld-linux-x86-64.so.2

# change working directory
WORKDIR /app

# copy both 'package.json' and 'package-lock.json'
COPY package.json ./
COPY package-lock.json ./

# install dependencies. npm ci uses package-lock.json for better speed and reliability
RUN npm install

# copy source code
COPY ./ ./

# ensure unix line endings
RUN find src/ -type f -print0 | xargs -0 dos2unix

# create a symlink so that we can actually run mobility-metrics
RUN ln -s /app/src/cli.js /usr/bin/mobility-metrics

# send it!
CMD ["mobility-metrics", "--config", "/data/config.json", "--public", "/data/public", "--cache", "/cache", "--endDay", "2022-09-20"]
