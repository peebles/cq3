// Test the performance of enqueue
const Promise = require( 'bluebird' );
const script = require( 'node-simple-script' );
const config = require( './config.json' );

const args = script.parseargs(process.argv);

const Class = args.class;
const MessageCount = args.count;

if ( ! (Class && MessageCount) ) script.exit('Usage: --class Class --count Count');

const MonitorRates = 5; // display rate every (n) seconds
const EnqueueDelay = 1; // how long to pause between enqueue in ms

var msg = {
  payload: 'This is a Test',
};

var deviceIds = [ '1111', '2222', '3333', '4444' ];
function deviceId() {
  return deviceIds[ Math.floor(Math.random() * deviceIds.length) ];
}

const q = require( './index' )( config[Class] );

var RMon = require( './lib/rmon' ); // for monitoring rates
var rates = {
  input: new RMon(),
  lat: new RMon(),
};
rates.input.start();
rates.lat.start();
setInterval( function() {
  if ( ! ( rates.input.ave()==0 ) )
    console.log( 'rates: input:', rates.input.ave(), 'latency:', (rates.lat.ave() / rates.input.ave()).toFixed(2) );
}, MonitorRates * 1000 );

let lats = [];

q.producer.connect().then( async function() {
  let start = new Date().getTime();
  for( let i=0; i<MessageCount; i++) {
    msg.seq = i;
    msg.deviceId = deviceId();
    let s = new Date().getTime();
    await q.enqueue( 'peebtest', msg );
    rates.lat.add( new Date().getTime() - s );
    lats.push( new Date().getTime() - s );
    rates.input.add(1);
    await Promise.delay(EnqueueDelay);
  }
  let delta = new Date().getTime() - start;
  console.log( 'overall messages/s:', (MessageCount / (delta/1000)).toFixed(2) );
  let t = 0;
  lats.forEach((l) => { t += l; });
  console.log( 'ave enqueue latency:', (t/lats.length).toFixed(2));
  script.exit();
}).catch((err) => {
  script.exit(err);
});
