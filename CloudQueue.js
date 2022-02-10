module.exports = function (config) {

  function loghelper(severity) {
    return function() {
      console.log.apply(undefined, [`[${severity}]`, ...arguments]);
    }
  }

  class CloudQueue {
    constructor() {
      if (config.logger) {
        this.log = config.logger;
      } else {
        this.log = {
          debug: loghelper('debug'),
          info: loghelper('info'),
          warn: loghelper('warn'),
          error: loghelper('error')
        }
      }

      this.producer = {
        connect: this.producer_connect.bind(this),
        send: this.producer_send.bind(this),
        disconnect: this.producer_disconnect.bind(this),
      };

      this.consumer = {
        connect: this.consumer_connect.bind(this),
        length: this.consumer_length.bind(this),
        deleteQueue: this.consumer_deleteQueue.bind(this),
        dequeue: this.consumer_dequeue.bind(this),
        remove: this.consumer_remove.bind(this),
      };
    }

    enqueue(queue, message) {
      return this.producer_send(queue, message);
    }

    dequeue(queue, max) {
      return this.consumer_dequeue(queue, max);
    }

    remove(queue, handle) {
      return this.consumer_remove(queue, handle);
    }

    producer_connect() {
      return this._producer_connect();
    }

    producer_send(queue, message) {
      return this._enqueue(queue, message);
    }

    producer_disconnect() {
      return this._producer_disconnect();
    }

    consumer_connect(queue, handler) {
      return this._consumer_connect(queue, handler);
    }

    consumer_length(queue) {
      return this._consumer_length(queue);
    }

    consumer_deleteQueue(queue) {
      return this._consumer_deleteQueue(queue);
    }

    consumer_dequeue(queue, max) {
      return this._dequeue(queue, max);
    }

    consumer_remove(queue, handle) {
      return this._remove(queue, handle);
    }

    _consumer_length(queue) {
      // implementation can override if its possible to return the number
      // of messages pending in a queue
      return Promise.resolve(0);
    }

    _consumer_deleteQueue(queue) {
      // implementation can override if its possible to delete a queue
      return Promise.resolve();
    }

    _producer_connect() {
      throw "subclasses must override";
    }

    _producer_disconnect() {
      return Promise.resolve();
    }

    _consumer_connect(queue) {
      throw "subclasses must override";
    }

    _dequeue(queue, max) {
      throw "this consumer does not implement dequeue";
    }

    _remove(queue, handle) {
      throw "this consumer does not implement remove";
    }

    _enqueue(queue, message) {
      throw "subclasses must override";
    }
  }

  return CloudQueue;
};
