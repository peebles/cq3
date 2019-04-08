# Use the running container to create topics.  auto-create is on, but the default partition count is 1.
# JMX_PORT= to avoid a port conflict exception when using the running container.
docker exec -it kafka env JMX_PORT= kafka-topics.sh --create --topic peebtest --replication-factor 1 --partitions 4 --zookeeper zookeeper:2181
