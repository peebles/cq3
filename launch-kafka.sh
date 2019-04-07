# the default place for zoozeeper data is /tmp/zookeeper, soecified in
# /opt/zookeeper/conf/zoo.cfg.  should probably create a Dockerfile that strats with
# this image, and over rides the zoo.cfg file.  And then use a data container.
docker run -d --name zookeeper -p 2181:2181 jplock/zookeeper:3.4.6

# this funny way of running a data container is needed by kafka to avoid permission denied issues on /data
docker run -d --name kafka-data --volume /data --entrypoint /bin/true ches/kafka

MACHINE_IP=$(basename $DOCKER_HOST|awk -F: '{print $1}')
docker run -d --name kafka --volumes-from kafka-data --link zookeeper:zookeeper --env KAFKA_ADVERTISED_HOST_NAME=$MACHINE_IP  --publish 9092:9092 ches/kafka

echo "waiting 5 seconds for brokers to come up ..."
sleep 5

# Use the running container to create topics.  auto-create is on, but the default partition count is 1.
# JMX_PORT= to avoid a port conflict exception when using the running container.
docker exec -it kafka env JMX_PORT= kafka-topics.sh --create --topic peebtest --replication-factor 1 --partitions 4 --zookeeper zookeeper:2181
