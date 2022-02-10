var config = require( './config' );

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

var q = require( './index' )( qConfig );

const handler = (msg) => {
  console.log( JSON.stringify(msg) );
  return Promise.resolve();
}

if ( process.argv[3] && process.argv[3] === '--length' ) {
  q.consumer_length( 'peebtest' ).then((len) => {
    console.log( len );
    exit();
  }).catch( exit );
}

else if ( process.argv[3] && process.argv[3] === '--delete' ) {
  q.consumer_deleteQueue( 'peebtest' ).then(() => exit()).catch( exit );
}

else {
  // The push model
  q.consumer.connect( 'peebtest', handler );

  // The pull model (get one)

  //q.consumer.dequeue( 'peebtest' ).then((msgs) => {
  //  console.log( JSON.stringify( msgs ) );
  //  exit();
  //}).catch( exit );
}
