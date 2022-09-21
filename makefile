PACKAGE_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g')

target: build stop run exec

target-dev: build-dev stop run exec

build:
	docker build . --file Dockerfile -t bscholer/mobility-metrics

build-dev:
	docker build . --progress=plain --file Dockerfile -t mobility-metrics

stop:
	- docker stop mobility-metrics
	- docker rm mobility-metrics

run:
	docker run -it -d -v data:/data -v shst-cache:/root/.shst --name mobility-metrics mobility-metrics -m 4g --cpus 2

exec:
	docker exec -it mobility-metrics /bin/bash

publish:
	echo "$(PACKAGE_VERSION)"
