PACKAGE_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g')

target: build stop run logs

target-dev: build-dev stop run logs

build:
	docker build . --file Dockerfile -t bscholer/mobility-metrics

build-dev:
	docker build . --progress=plain --file Dockerfile -t bscholer/mobility-metrics

stop:
	- docker stop mobility-metrics
	- docker rm mobility-metrics

run:
	docker run -it -d --memory=4g --cpus=6 -v /data/mobility-metrics/data:/data -v /data/mobility-metrics/shst-cache:/root/.shst --name mobility-metrics bscholer/mobility-metrics 

exec:
	docker exec -it mobility-metrics /bin/bash

logs:
	docker logs --follow mobility-metrics

publish:
	echo "$(PACKAGE_VERSION)"
