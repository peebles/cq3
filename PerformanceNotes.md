## Redis

* enqueue: 500 m/s, latency 0.68 ms
* dequeue: 500 m/s, latency 0.61 ms

## Rabbit

* enqueue: 710 m/s, latency 0.13
* dequeue: 23 m/s, latency 23
* dequeue (autoAck=true): 472 m/s, latency 0.79
* dequeue (consumer, autoAck=false): 6,100 m/s
* dequeue (consumer, autoAck=true): 9,800 m/s

## Kafka

Must run consumer and kill it before running producer.  This will register a consumer with zookeeper (I guess)
so when you run the producer, messages will be queued for the consumer.  Otherwise they'll be dropped.

* enqueue: 72.08 m/s, latency 12.57 (requiredAcks makes no diff) (running two doubles rate)
* dequeue: 374 m/s (one consumer) (handlerConcurrency 10 => 100 didn't have affect) (scales by running more consumers)


