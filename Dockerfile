FROM node:11.15.0-stretch

# dev only, remove me later
RUN apt-get update
RUN apt-get upgrade -y
RUN apt-get install vim -y

# this seems to be necessary for mobility-metrics
RUN chown "$USER" -R /usr/lib
RUN chmod -R 777 /usr/lib

WORKDIR /app

COPY ./package.json ./
COPY ./package-lock.json ./

# install dependencies
RUN npm ci

# copy source code
COPY ./ ./

# create a symlink so that we can actually run mobility-metrics
RUN ln -s /app/src/cli.js /usr/bin/mobility-metrics
