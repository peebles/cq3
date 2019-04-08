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
  input: new RMon(),
  output: new RMon(),
};
rates.input.start();
rates.output.start();
setInterval( function() {
  if ( ! ( rates.input.ave()==0 && rates.output.ave()==0 ) )
    console.log( 'rates: input:', rates.input.ave(), 'output:', rates.output.ave() );
}, MonitorRates * 1000 );

let total = 0;
let count = 0;
let start = new Date().getTime();
let lats = [];
let normal = [];

let begin = new Date().getTime();

jobQueue.consumer.connect().then( async function() {
  for( let i=0; i<MessageCount; i++ ) {
    let start = new Date().getTime();
    let jobs = await jobQueue.dequeue( queueName );
    if ( ! jobs.length ) {
      await Promise.delay(1000);
      return;
    }
    rates.input.add(jobs.length);
    total += jobs.length;
    let delta = new Date().getTime() - start;
    lats.push(delta);
    let n = delta/jobs.length;
    for( let j=0; j<jobs.length; j++ ) normal.push(n);

    for( let k=0; k<jobs.length; k++ ) {
      await Promise.delay(JobDelay);
      rates.output.add(1);
      await jobQueue.remove( queueName, jobs[k].handle );
    }
  }
  let delta = new Date().getTime() - begin;
  console.log( 'overall messages/s:', (total /(delta/1000)).toFixed(2));
  let t = 0;
  lats.forEach((l) => { t += l; });
  console.log( 'ave dequeue latency:', (t/lats.length).toFixed(2));
  t = 0;
  normal.forEach((l) => { t += l; });
  console.log( 'ave message latency:', (t/normal.length).toFixed(2));
});
