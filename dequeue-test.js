var config = require( './config' );
var log = require( 'winston' );
var Promise = require( 'bluebird' );

function exit( err ) {
  if ( err ) console.trace( err );
  process.exit( err ? 1 : 0 );
}

var qType = process.argv[2];
var qConfig = config[ qType ];
if ( ! qConfig ) {
  console.log( 'Usage: $0 qType [count]: No config found for', qType );
  process.exit(1);
}

qConfig.logger = log;
var q = require( './index' )( qConfig );

const forever = () => {
  Promise.resolve().then(() => {
    return q.dequeue( 'peebtest' );
  }).mapSeries((msg) => {
    console.log( '=> ', JSON.stringify(msg) );
    return q.remove( 'peebtest', msg.handle );
  }).then(() => {
    return forever();
  }).catch( exit );
}

forever();

