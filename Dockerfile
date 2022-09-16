FROM node:11.15.0-stretch

RUN apt-get update
RUN apt-get upgrade -y
RUN apt-get install vim -y

RUN chown "$USER" -R /usr/lib
RUN chmod -R 777 /usr/lib

#RUN git clone https://github.com/bscholer/mobility-metrics.git
WORKDIR /app

#RUN npm i -g yalc

COPY ./package.json ./
COPY ./package-lock.json ./

RUN npm install

COPY ./ ./

#RUN npm install -g mobility-metrics
# create a symlink
RUN ln -s /app/src/cli.js /usr/bin/mobility-metrics

