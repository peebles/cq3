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

    async _connect() {
      let conn = await ampq.connect( config.connection.url );
      if ( ! conn ) throw( new Error( 'conn is null!' ) );
      conn.on( 'error', (err) => {
        this.log.warn( 'RabbitMQ connection interrupted:', err );
      });
      return conn;
    }

    async _producer_connect() {
      this.pq = await this._connect();
      let ch;
      if ( this.options.producerConfirm ) ch = await this.pq.createConfirmChannel();
      else ch = await this.pq.createChannel();
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
    }

    async _producer_disconnect() {
      return this.pch.waitForConfirms();
    }

    async _consumer_connect( queue, messageHandler ) {
      this.cq = await this._connect();
      let ch = await this.cq.createChannel();
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

      if ( ! queue ) return this.cch; // this is the pull model
      // this is the push model...
      await this._assertQueue( this.cch, queue );
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
    }

    async _assertQueue( q, queue ) {
      if ( this.assertedQueues[ queue ] ) return;
      let opts = {
        durable: true
      };
      [ 'messageTtl', 'expires', 'autoDelete' ].forEach( (param) => {
        if ( config.options && ( config.options[ param ] != undefined ) )
          opts[ param ] = config.options[ param ];
      });
      await q.assertQueue( queue, opts );
      this.assertedQueues[ queue ] = true;
    }

    async _drain(ch) {
      this.log.debug( 'backpressure starts...' );
      return new Promise((resolve) => {
        ch.once( 'drain', () => {
          this.log.debug( '  backpressure resolved!' );
          resolve();
        });
      });
    }

    async _enqueue( queue, message ) {
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

    async _dequeue( queue ) {
      if ( ! this.cq ) await this._consumer_connect();
      await this._assertQueue( this.cch, queue );
      let msg = await this.cch.get( queue, { noAck: this.options.autoAck } );
      if ( msg === false ) {
        await this.delay( this.options.waitTimeSeconds * 1000 );
        return [];
      }
      return [{
        handle: msg,
        msg: JSON.parse( msg.content.toString( 'utf-8' ) )
      }];
    }

    async _remove( queue, handle ) {
      if ( this.options.autoAck ) return;
      return new Promise((resolve, reject) => {
        try {
          this.cch.ack( handle );
          resolve();
        } catch( err ) {
          reject( err );
        }
      });
    }

    async _consumer_length( queue ) {
      if ( ! this.cq ) await this._consumer_connect();
      let data = await this.cch.checkQueue(queue);
      if ( data && data.messageCount ) return data.messageCount;
      else return 0;
    }

    async _consumer_deleteQueue( queue ) {
      if ( ! this.cq ) await this._consumer_connect();
      let ok = await this.cch.checkQueue(queue);
      if (ok && ok.queue) await this.cch.deleteQueue( queue, {} );
      delete this.assertedQueues[ queue ];
    }

  }

  return new RabbitMQ();
}


