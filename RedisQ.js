const Redis = require("ioredis");
const shortid = require("shortid");

module.exports = function (config) {
  let CloudQueue = require("./CloudQueue")(config);

  const qKey = (q) => {
    return `queue_${q}`;
  };

  const mKey = (q, m) => {
    return `queue_${q}_${m}`;
  };

  class RedisQ extends CloudQueue {
    constructor() {
      super();

      let defaults = {
        waitTimeSeconds: 5,
        maxNumberOfMessages: 5,
      };
      this.options = Object.assign({}, defaults, config.options);
    }

    async _connect() {
      this.q = new Redis(config.connection);
      return this.q;
    }

    async _producer_connect() {
      this.pq = await this._connect();
    }

    // There are two models for message consumption; the client pulls, or the client is
    // pushed to.  If the client wants to be pushed to, then they supply a queue name and a message
    // handler, which will be called when a message is available and is called with a single message
    // as an argument.

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

    async _enqueue(queue, message) {
      // a uuid for the message
      let uuid = shortid.generate();
      if (!this.pq) await this._producer_connect();
      // write the message
      await this.pq.set(mKey(queue, uuid), JSON.stringify(message));
      // conditionally apply a ttl to the message
      if (this.options.expire)
        await this.pq.expire(mKey(queue, uuid), this.options.expire);
      // put the uuid (message pointer) into a sorted list (the queue)
      await this.pq.lpush(qKey(queue), mKey(queue, uuid));
      // conditionally apply a ttl to the queue
      if (this.options.expire)
        await this.pq.expire(qKey(queue), this.options.expire);
    }

    async _dequeue(queue, max) {
      if (!this.cq) await this._consumer_connect();
      let uids = [];
      let messages = [];
      max = max || this.options.maxNumberOfMessages;
      for (let i = 0; i < max; i++) {
        let uid = await this.cq.rpop(qKey(queue));
        if (uid) uids.push(uid);
        else break;
      }
      if (!uids.length) {
        await this.delay(this.options.waitTimeSeconds * 1000);
        return [];
      }
      for (let i = 0; i < uids.length; i++) {
        let uid = uids[i];
        // get the message
        messages.push(await this.cq.get(uid));
        // and delete from the queue
        await this.cq.del(uid);
      }
      return messages.map((m) => {
        return { handle: null, msg: JSON.parse(m) };
      });
    }

    async _remove() {
      // there is no remove in redis
      return;
    }

    async _consumer_length(queue) {
      if (!this.cq) await this._consumer_connect();
      return this.cq.llen(qKey(queue));
    }
  }

  return new RedisQ();
};
