const Promise = require( 'bluebird' );
const Kafka = require('no-kafka');
const Hashring = require( 'hashring' );
const util = require( 'util' );

module.exports = function( config ) {

  let CloudQueue = require( './CloudQueue' )( config );

  // producer partitioner.  map message keys to partition numbers, based on the number of available partitions.
  let DefaultPartitioner = Kafka.DefaultPartitioner;
  function MyPartitioner() {
    DefaultPartitioner.apply(this, arguments);
  }
  util.inherits(MyPartitioner, DefaultPartitioner);
  MyPartitioner.prototype.partition = function(topic, parts, message) {
    if ( ! this.hashring ) {
      this.hashring = new Hashring( parts.map( function( p ) { return p.partitionId.toString(); } ) );
    }
    let p = this.hashring.get( message.key );
    return Number( p );
  }

  class KafkaQ extends CloudQueue {
    constructor() {
      super();
      let defaults = {
      };

      this.options = Object.assign( {}, defaults, config.connection, config.options );
    }

    _producer_connect() {
      this.producer = new Kafka.Producer({
        ...this.options,
        partitioner: new MyPartitioner()
      });
      return this.producer.init();
    }

    _enqueue(queue, message) {
      let m = {
	key: message[ this.options.keyField ],
	value: JSON.stringify( message )
      };
      return this.producer.send({ topic: queue, message: m });
    }

    _consumer_connect( queue, groupId, messageHandler ) {
      // groupId is optional.  If not specified, comes from config.  If specified
      // overrides config
      if ( ! messageHandler ) {
	messageHandler = groupId; // was passed as second argument
      }
      else {
	this.options.groupId = groupId;
      }
      this.consumer = new Kafka.GroupConsumer( this.options );

      const dataHandler = ( messages, topic, partition ) => {
	return Promise.each( messages, ( m ) => {
	  let handle = {topic: topic, partition: partition, offset: m.offset, metadata: 'optional'};
	  let message = JSON.parse( m.message.value.toString('utf8') );
          return messageHandler(message).then(() => {
            return this.consumer.commitOffset( handle );
          }).catch((err) => {
            this.log.error( err );
          });
        });
      }

      let strategies = {
	strategy: new Kafka.WeightedRoundRobinAssignmentStrategy(),
	subscriptions: [ queue ],
        metadata: {
          weight: 4
        },
	handler: dataHandler
      };

      this.consumer.init(strategies);
      return Promise.resolve();
    }
    
  }

  return new KafkaQ();
}
