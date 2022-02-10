const Promise = require( 'bluebird' );
var config = require( './config' );

function exit( err ) {
  if ( err ) console.trace( err );
  process.exit( err ? 1 : 0 );
}

var qType = process.argv[2];
var count = process.argv[3] || 100;
var qConfig = config[ qType ];
if ( ! qConfig ) {
  console.log( 'Usage: $0 qType [count]: No config found for', qType );
  process.exit(1);
}

var q = require( './index' )( qConfig );

var deviceIds = [ '1111', '2222', '3333', '4444' ];
function deviceId() {
  return deviceIds[ Math.floor(Math.random() * deviceIds.length) ];
}

async function loop() {
  for( var i=0; i<count; i++ ) {
    let msg = {
      seq: i,
      deviceId: deviceId()
    };
    console.log( i, JSON.stringify(msg) );
    await q.enqueue( 'peebtest', msg );
  }
}
loop().then(() => {
  console.log( 'waiting 10 seconds to ensure that all messages are flushed to the queue' );
  setTimeout(() => {
    process.exit();
  }, 10 * 1000 );
}).catch(exit);

