"use strict"

class RMon {
  constructor( blen ) {
    this.buckets = [];
    this.currentValue = 0;
    this.tmr = null;
    this.BLEN = ( blen || 60 );
  }

  add( value ) {
    this.currentValue += value;
  }

  ave() {
    let total = 0;
    if ( ! this.buckets.length ) return 0;
    for( var i=0; i<this.buckets.length; i++ ) {
      total += this.buckets[i];
    }
    return ( total / this.buckets.length ).toFixed( 2 );
  }

  start() {
    if ( this.tmr ) this.stop();
    this.tmr = setInterval( () => {
      this.buckets.push( this.currentValue );
      this.currentValue = 0;
      if ( this.buckets.length > this.BLEN )
	this.buckets.shift();
    }, 1000 );
  }

  stop() {
    if ( this.tmr ) clearInterval( this.tmr );
    this.tmr = null;
  }

  clear() {
    this.stop();
    this.currentValue = 0;
    this.buckets = [];
    this.start();
  }
}

module.exports = RMon;
