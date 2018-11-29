const Promise = require( 'bluebird' );
const redis = require( 'redis' );
Promise.promisifyAll( redis );
const shortid = require( 'shortid' );

module.exports = function( config ) {

  let CloudQueue = require( './CloudQueue' )( config );

  const qKey = (q) => {
    return `queue_${q}`;
  }

  const mKey = (q,m) => {
    return `queue_${q}_${m}`;
  }

  class RedisQ extends CloudQueue {

    constructor() {
      super();

      let defaults = {
        waitTimeSeconds: 5,
      };
      this.options = Object.assign( {}, defaults, config.options );
    }

    _connect() {
      let promise = new Promise((resolve) => {
        this.q = redis.createClient( config.connection );
        this.q.on( 'ready', () => { resolve( this.q ); } );

        this.q.on( 'error', (err) => {
          // this prevents the process from exiting and redis will retry to connect
          this.log.warn( err.message );
        });

        this.q.on( 'reconnecting', (o) => {
          this.log.debug( `redis reconnecting: attempt: ${o.attempt}, delay: ${o.delay}` );
        });
      });
      return promise;
    }

    _producer_connect() {
      return this._connect().then( q => this.pq = q );
    }

    // There are two models for message consumption; the client pulls, or the client is
    // pushed to.  If the client wants to be pushed to, then they supply a queue name and a message
    // handler, which will be called when a message is available and is called with a single message
    // as an argument.
    
    _consumer_connect( queue, messageHandler ) {
      return this._connect().then((q) => {
        this.cq = q;
        if ( ! queue ) return q; // this is the pull model
        // else this is the push model
        const forever = () => {
          Promise.resolve().then(() => {
            return this._dequeue( queue );
          }).mapSeries((message) => {
            let handle = message.handle;
            let msg = message.msg;
            messageHandler(msg).then(() => {
              this._remove( queue, handle ).catch((err) => {
                this.log.error( err );
              });
            }).catch((err) => {
              this.log.error( err );
            });
          }).then(() => {
            forever();
          }).catch((err) => {
            this.log.error( err );
          });
        }
        forever();
      });
    }

    _enqueue( queue, message ) {
      // a uuid for the message
      let uuid = shortid.generate();

      return Promise.resolve().then(() => {
        if ( ! this.pq ) return this._producer_connect();
      }).then(() => {
        // write the message
        return this.pq.setAsync(mKey(queue,uuid), JSON.stringify(message));
      }).then(() => {
        // conditionally apply a ttl to the message
        if ( this.options.expire ) return this.pq.expireAsync(mKey(queue,uuid), this.options.expire);
      }).then(() => {
        // put the uuid (message pointer) into a sorted list (the queue)
        return this.pq.lpushAsync(qKey(queue), mKey(queue,uuid));
      }).then(() => {
        // conditionally apply a ttl to the queue
        if ( this.options.expire ) return this.pq.expireAsync(qKey(queue), this.options.expire);
      });
    }

    _dequeue( queue ) {
      let ctx = {};
      return Promise.resolve().then(() => {
        if ( ! this.cq ) return this._consumer_connect();
      }).then(() => {
        // get the top of the queue (a pointer to a messsage
        return this.cq.rpopAsync(qKey(queue));
      }).then((uuid) => {
        // if there is nothing, then wait a little time
        ctx.uuid = uuid;
        if ( ! ctx.uuid ) return Promise.delay( this.options.waitTimeSeconds * 1000 ).then(() => {
          return null;
        });
        else return this.cq.getAsync(ctx.uuid);
      }).then((msg) => {
        // if there was a message, delete it from redis
        ctx.msg = msg;
        if ( ctx.uuid ) return this.cq.delAsync(ctx.uuid);
      }).then(() => {
        // and return the result.  the client expects an array.
        if ( ! ctx.msg ) return [];
        else return [{
          handle: null,
          msg: JSON.parse(ctx.msg)
        }];
      });
    }

    _remove() {
      // there is no remove in redis
      return Promise.resolve();
    }

    _consumer_length( queue ) {
      return Promise.resolve().then(() => {
        if ( ! this.cq ) return this._consumer_connect();
      }).then(() => {
        return this.cq.llenAsync( qKey(queue) );
      });
    }

  }

  return new RedisQ();
}

        
