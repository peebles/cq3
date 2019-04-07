const Promise = require( 'bluebird' );
let Kafka = require('no-kafka');
let Hashring = require( 'hashring' );

module.exports = function( config ) {

  let CloudQueue = require( './CloudQueue' )( config );

  class KafkaQ extends CloudQueue {
    constructor() {
      super();
      let defaults = {
      };

      this.options = Object.assign( {}, defaults, config.options );
    }

    _producer_connect() {
      // producer partitioner.  map message keys to partition numbers, based on the number of available partitions.
      const partitioner = ( topic, parts, message ) => {
	if ( ! this.hashring )
	  this.hashring = new Hashring( parts.map( function( p ) { return p.partitionId.toString(); } ) );
	return Number( this.hashring.get( message.key ) );
      }
      this.producer = new Kafka.Producer({
        ...this.options,
        partitioner
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
          return messageHandler({ handle: handle, msg: message }).then(() => {
            return this.consumer.commitOffset( handle );
          });
        });
      }

      let strategies = [{
	strategy: 'TestStrategy',
	subscriptions: [ queue ],
	handler: dataHandler
      }];

      this.consumer.init(strategies);
    }
    
  }

  return new SQS();
}
