// Test the performance of enqueue
const Promise = require( 'bluebird' );
const script = require( 'node-simple-script' );
const config = require( './config.json' );

const args = script.parseargs(process.argv);

const Class = args.class;
const MessageCount = args.count;

if ( ! (Class && MessageCount) ) script.exit('Usage: --class Class --count Count');

const MonitorRates = 5; // display rate every (n) seconds
const JobDelay = 1;     // how long a job takes in ms
const queueName = "peebtest";

const jobQueue = require( './index' )( config[Class] );

var RMon = require( './lib/rmon' ); // for monitoring rates
var rates = {
  output: new RMon(),
};
rates.output.start();
setInterval( function() {
  if ( ! ( rates.output.ave()==0 ) )
    console.log( 'rates: output:', rates.output.ave() );
}, MonitorRates * 1000 );

let start = new Date().getTime();
let total = 0;

async function handler(msg) {
  total += 1;
  rates.output.add(1);
  if ( total === MessageCount ) {
    let delta = new Date().getTime() - start;
    console.log( 'overall messages/s:', (total /(delta/1000)).toFixed(2));
    script.exit();
  }
  await Promise.delay(JobDelay);
}

jobQueue.consumer.connect(queueName, handler).catch((err) => {
  console.log(err);
});
