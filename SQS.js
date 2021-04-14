const Promise = require( 'bluebird' );
const AWS = require( 'aws-sdk' );

module.exports = function( config ) {

  let CloudQueue = require( './CloudQueue' )( config );

  class SQS extends CloudQueue {

    constructor() {
      super();

      let defaults = {
        visibilityTimeout: 30,
        waitTimeSeconds: 5,
        maxNumberOfMessages: 1,
        attributes: [ 'All' ],
        asyncRemove: false,  // set this to true if you want to fire-n-forget message removals.  Big performance boost.
      };

      this.options = Object.assign( {}, defaults, config.options );
      this.urlCache = {}; // used to cache assertQueue
    }

    _connect() {
      AWS.config.update( config.connection );
      let q = new AWS.SQS();
      return Promise.resolve( q );
    }

    _producer_connect() {
      return this._connect().then( q => this.pq = q );
    }

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

    _assertQueue( client, queue ) {
      if ( this.urlCache[queue] ) return Promise.resolve(this.urlCache[queue]);
      return client.getQueueURL({ QueueName: queue }).promise().then((data) => {
        if ( data && data.QueueUrl ) {
          this.urlCache[queue] = data.QueueUrl;
          return data.QueueUrl;
        }
        else {
          return client.createQueue({ QueueName: queue }).promise().then((data) => {
            this.urlCache[queue] = data.QueueUrl;
            return data.QueueUrl;
          });
        }
      });
    }

    _enqueue( queue, message ) {
      return Promise.resolve().then(() => {
        if ( ! this.pq ) return this._producer_connect();
      }).then(() => {
        return this._assertQueue( this.pq, queue );
      }).then((url) => {
        return this.pq.sendMessage({ QueueUrl: url, MessageBody: JSON.stringify( message ), DelaySeconds: 0 }).promise();
      });
    }

    _dequeue( queue ) {
      let ctx = {};
      return Promise.resolve().then(() => {
        if ( ! this.cq ) return this._consumer_connect();
      }).then(() => {
        return this._assertQueue( this.cq, queue );
      }).then((url) => {
        let opts = {
          QueueUrl: url,
          AttributeNames: this.options.attributes,
          MaxNumberOfMessages: this.options.maxNumberOfMessages,
          VisibilityTimeout: this.options.visibilityTimeout,
          WaitTimeSeconds: this.options.waitTimeSeconds
        };
        return this.cq.receiveMessage(opts).promise();
      }).then((data) => {
        if ( ! ( data && data.Messages && data.Messages.length ) ) return [];
        return data.Messages.map((m) => {
          return {
            handle: m.ReceiptHandle,
            msg: JSON.parse( m.Body )
          }
        });
      });
    }

    _remove( queue, handle ) {
      return Promise.resolve().then(() => {
        return this._assertQueue( this.cq, queue );
      }).then((url) => {
        if ( this.options.asyncRemove ) {
          this.cq.deleteMessage({ QueueUrl: url, ReceiptHandle: handle}).promise().then(() => {}).catch((err) => {throw(err)});
          return;
        }
        else {
          return this.cq.deleteMessage({ QueueUrl: url, ReceiptHandle: handle}).promise();
        }
      });
    }

    _consumer_length( queue ) {
      return Promise.resolve().then(() => {
        if ( ! this.cq ) return this._consumer_connect();
      }).then(() => {
        return this._assertQueue( this.cq, queue );
      }).then((url) => {
        return this.cq.getQueueAttributes({ QueueUrl: url, AttributeNames: [ 'ApproximateNumberOfMessages' ] }).promise();
      }).then((data) => {
        if ( data && data.Attributes && data.Attributes.ApproximateNumberOfMessages )
          return data.Attributes.ApproximateNumberOfMessages;
        else return 0;
      });
    }

    _consumer_deleteQueue( queue ) {
      return Promise.resolve().then(() => {
        if ( ! this.cq ) return this._consumer_connect();
      }).then(() => {
        return this._assertQueue( this.cq, queue );
      }).then((url) => {
        return this.cq.deleteQueue({ QueueUrl: url }).promise();
      });
    }

  }

  return new SQS();
}
