target: build stop run exec

target-dev: build-dev stop run exec

build:
	docker build . --file Dockerfile -t mobility-metrics-image

build-dev:
	docker build . --progress=plain --file Dockerfile -t mobility-metrics-image

stop:
	- docker stop mobility-metrics
	- docker rm mobility-metrics

run:
	docker run -it -d --name mobility-metrics mobility-metrics-image

exec:
	docker exec -it mobility-metrics /bin/bash
