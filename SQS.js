const AWS = require("aws-sdk");

module.exports = function (config) {
  let CloudQueue = require("./CloudQueue")(config);

  class SQS extends CloudQueue {
    constructor() {
      super();

      let defaults = {
        visibilityTimeout: 30,
        waitTimeSeconds: 5,
        maxNumberOfMessages: 1,
        attributes: ["All"],
        asyncRemove: false, // set this to true if you want to fire-n-forget message removals.  Big performance boost.
      };

      this.options = Object.assign({}, defaults, config.options);
      this.urlCache = {}; // used to cache assertQueue
    }

    async _connect() {
      AWS.config.update(config.connection);
      let q = new AWS.SQS();
      return q;
    }

    async _producer_connect() {
      this.pq = await this._connect();
    }

    async _consumer_connect(queue, messageHandler) {
      let q = await this._connect();
      this.cq = q;
      if (!queue) return q; // this is the pull model
      // push model
      for(;;) {
        let messages = await this._dequeue(queue);
        for(let i=0; i<messages.length; i++) {
          let message = messages[i];
          let handle = message.handle;
          let msg = message.msg;
          await messageHandler(msg).then(async() => {
            await this._remove(queue, handle);
          }).catch(err => {
            this.log.error(err);
          });
        }
      }
    }

    async _assertQueue(client, queue) {
      if (this.urlCache[queue]) return this.urlCache[queue];
      try {
        let data = await client.getQueueUrl({QueueName: queue}).promise();
        this.urlCache[queue] = data.QueueUrl;
        return data.QueueUrl;
      } catch(err) {
        let data = await client.createQueue({QueueName: queue}).promise();
        this.urlCache[queue] = data.QueueUrl;
        return data.QueueUrl;
      }
    }

    async _enqueue(queue, message) {
      if (!this.pq) await this._producer_connect();
      let url = await this._assertQueue(this.pq, queue);
      return this.pq.sendMessage({
        QueueUrl: url,
        MessageBody: JSON.stringify(message),
        DelaySeconds: 0,
      }).promise();
    }

    async _dequeue(queue, max) {
      if (!this.cq) await this._consumer_connect();
      let url = await this._assertQueue(this.cq, queue);
      let opts = {
        QueueUrl: url,
        AttributeNames: this.options.attributes,
        MaxNumberOfMessages: max || this.options.maxNumberOfMessages,
        VisibilityTimeout: this.options.visibilityTimeout,
        WaitTimeSeconds: this.options.waitTimeSeconds,
      };
      let data = await this.cq.receiveMessage(opts).promise();
      if (!(data && data.Messages && data.Messages.length)) return [];
      return data.Messages.map((m) => {
        return {
          handle: m.ReceiptHandle,
          msg: JSON.parse(m.Body),
        };
      });
    }

    async _remove(queue, handle) {
      let url = await this._assertQueue(this.cq, queue);
      if (this.options.asyncRemove) {
        this.cq
          .deleteMessage({ QueueUrl: url, ReceiptHandle: handle })
          .promise()
          .then(() => {});
      } else {
        await this.cq
          .deleteMessage({ QueueUrl: url, ReceiptHandle: handle })
          .promise();
      }
    }

    async _consumer_length(queue) {
      if (!this.cq) await this._consumer_connect();
      let url = await this._assertQueue(this.cq, queue);
      let data = await this.cq.getQueueAttributes({
        QueueUrl: url,
        AttributeNames: ["ApproximateNumberOfMessages"],
      }).promise();
      if (
        data &&
        data.Attributes &&
        data.Attributes.ApproximateNumberOfMessages
      )
        return data.Attributes.ApproximateNumberOfMessages;
      else return 0;
    }

    async _consumer_deleteQueue(queue) {
      if (!this.cq) await this._consumer_connect();
      let url = await this._assertQueue(this.cq, queue);
      return this.cq.deleteQueue({ QueueUrl: url }).promise();
    }
  }

  return new SQS();
};
