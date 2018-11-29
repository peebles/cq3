
module.exports = function( config ) {
  try {
    return require( './' + config['class'] )( config );
  }
  catch( err ) {
    throw( err );
  }
}
