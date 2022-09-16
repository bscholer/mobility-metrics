target: build stop run exec

target-dev: build-dev stop run exec

build:
	docker build . --file Dockerfile -t mobility-metrics-img

build-dev:
	docker build . --progress=plain --file Dockerfile -t mobility-metrics-img

stop:
	- docker stop mobility-metrics
	- docker rm mobility-metrics

run:
	docker run -it -d --name mobility-metrics mobility-metrics-img

exec:
	docker exec -it mobility-metrics /bin/bash
