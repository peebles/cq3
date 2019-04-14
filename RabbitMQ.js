const Promise = require( 'bluebird' );
const ampq = require( 'amqplib' );

module.exports = function( config ) {

  let CloudQueue = require( './CloudQueue' )( config );

  class RabbitMQ extends CloudQueue {

    constructor() {
      super();

      let defaults = {
        producerConfirm: true,
        autoAck: false,
      };
      this.options = Object.assign( {}, defaults, config.options );
      this.assertedQueues = {};
    }

    _connect() {
      return Promise.resolve().then(() => {
        return ampq.connect( config.connection.url );
      }).then((conn) => {
        if ( ! conn ) throw( new Error( 'conn is null!' ) );
        conn.on( 'error', (err) => {
          this.log.warn( 'RabbitMQ connection interrupted:', err );
        });
        return conn;
      });
    }

    _producer_connect() {
      return Promise.resolve().then(() => {
        return this._connect().then( q => this.pq = q );
      }).then(() => {
        if ( this.options.producerConfirm ) return this.pq.createConfirmChannel();
        else return this.pq.createChannel();
      }).then((ch) => {
        this.pch = ch;
        ch.on( 'error', ( err ) => {
          this.log.error( 'RabbitMQ channel error:', err.message );
          this.pch = null;
        });
        ch.on( 'close', () => {
          this.log.warn( 'RabbitMQ channel closed, exiting.' );
          process.exit(1);
        });
        ch.on( 'blocked', ( reason ) => {
          this.log.warn( 'RabbitMQ channel blocked because:', reason );
        });
        ch.on( 'unblocked', () => {
          this.log.warn( 'RabbitMQ channel unblocked.' );
        });
        return ch;
      });
    }

    _producer_disconnect() {
      return this.pch.waitForConfirms();
    }

    _consumer_connect( queue, messageHandler ) {
      return Promise.resolve().then(() => {
        return this._connect().then( q => this.cq = q );
      }).then(() => {
        return this.cq.createChannel();
      }).then((ch) => {
        this.cch = ch;
        ch.on( 'error', ( err ) => {
          this.log.error( 'RabbitMQ channel error:', err.message );
          this.cch = null;
        });
        ch.on( 'close', () => {
          this.log.warn( 'RabbitMQ channel closed, exiting.' );
          process.exit(1);
        });
        ch.on( 'blocked', ( reason ) => {
          this.log.warn( 'RabbitMQ channel blocked because:', reason );
        });
        ch.on( 'unblocked', () => {
          this.log.warn( 'RabbitMQ channel unblocked.' );
        });
        // set prefetch ( QoS ) http://www.squaremobius.net/amqp.node/channel_api.html#channel_prefetch
        if ( config.options && config.options.qos )
          this.cch.prefetch( config.options.qos.count, config.options.qos.global );
        return ch;
      }).then(() => {
        if ( ! queue ) return this.cch; // this is the pull model
        // this is the push model...
        this._assertQueue( this.cch, queue ).then(() => {
          this.cch.consume( queue, (message) => {
            let msg = JSON.parse( message.content.toString( 'utf-8' ) );
            messageHandler(msg).then(() => {
              this._remove( queue, message ).catch((err) => {
                this.log.error( err );
              });
            }).catch((err) => {
              this.log.error( err );
            });
          }, {noAck: this.options.autoAck});
        }).catch((err) => {
          throw( err );
        });
      });
    }

    _assertQueue( q, queue ) {
      if ( this.assertedQueues[ queue ] ) return Promise.resolve();
      let opts = {
        durable: true
      };
      [ 'messageTtl', 'expires', 'autoDelete' ].forEach( (param) => {
        if ( config.options && ( config.options[ param ] != undefined ) )
          opts[ param ] = config.options[ param ];
      });
      return Promise.resolve().then(() => {
        return q.assertQueue( queue, opts );
      }).then(() => {
        this.assertedQueues[ queue ] = true;
      });
    }

    _drain(ch) {
      this.log.debug( 'backpressure starts...' );
      return new Promise((resolve) => {
        ch.once( 'drain', () => {
          this.log.debug( '  backpressure resolved!' );
          resolve();
        });
      });
    }

    _enqueue( queue, message ) {
      return Promise.resolve().then(() => {
        if ( ! this.pch ) return this._producer_connect();
      }).then(() => {
        return this._assertQueue( this.pch, queue );
      }).then(() => {
        let opts = {
          persistent: true,
        };
        if ( this.options.producerConfirm )
          return this.pch.sendToQueue( queue, new Buffer( JSON.stringify( message ) ), opts );
        else {
          let sent = this.pch.sendToQueue( queue, new Buffer( JSON.stringify( message ) ), opts );
          if ( sent === true ) return;
          // honor backpressure
          return this._drain(this.pch);
        }
      });
    }

    _dequeue( queue ) {
      return Promise.resolve().then(() => {
        if ( ! this.cq ) return this._consumer_connect();
      }).then(() => {
        return this._assertQueue( this.cch, queue );
      }).then(() => {
        return this.cch.get( queue, { noAck: this.options.autoAck } );
      }).then((msg) => {
        if ( msg === false ) return Promise.delay( this.options.waitTimeSeconds * 1000 ).then(() => {
          return null;
        });
        return msg;
      }).then((msg) => {
        if ( ! msg ) return [];
        return [{
          handle: msg,
          msg: JSON.parse( msg.content.toString( 'utf-8' ) )
        }];
      });
    }

    _remove( queue, handle ) {
      if ( this.options.autoAck ) return Promise.resolve();
      return new Promise((resolve, reject) => {
        try {
          this.cch.ack( handle );
          resolve();
        } catch( err ) {
          reject( err );
        }
      });
    }

    _consumer_length( queue ) {
      return Promise.resolve().then(() => {
        if ( ! this.cq ) return this._consumer_connect();
      }).then(() => {
        return this.cch.checkQueue(queue);
      }).then((data) => {
        if ( data && data.messageCount ) return data.messageCount;
        else return 0;
      });
    }

    _consumer_deleteQueue( queue ) {
      return Promise.resolve().then(() => {
        if ( ! this.cq ) return this._consumer_connect();
      }).then(() => {
        return this.cch.checkQueue(queue);
      }).then((ok) => {
        if ( ! (ok && ok.queue ) ) return false;
        return this.cch.deleteQueue( queue, {} );
      }).then((ok) => {
        delete this.assertedQueues[ queue ];
      });
    }

  }

  return new RabbitMQ();
}

    
