/**
 * (c) 2015 cepharum GmbH, Berlin, http://cepharum.de
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 cepharum GmbH
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * @author: cepharum
 */

var UTIL      = require( "util" ),
	EVENTS    = require( "events" ),
	SEQUELIZE = null,
	PROMISE   = require( "bluebird" );

try {
	SEQUELIZE = require( "sequelize" );
} catch ( e ) {}



function SequelSessionStore( link ) {
	this._link  = link;
	this._model = null;
}

UTIL.inherits( SequelSessionStore, EVENTS.EventEmitter );

SequelSessionStore.prototype._startDb = function() {
	if ( this._model ) {
		return PROMISE.resolve( this._model );
	}

	var model = this._model = this._link.define( "Session", {
		sid: {
			type: SEQUELIZE.STRING,
			primaryKey: true
		},
		data: {
			type: SEQUELIZE.TEXT,
			allowNull: false
		}
	} );

	return this._link.sync( model )
		.return( model );
};

SequelSessionStore.prototype.get = function( sid, fn ) {
	this._startDb()
		.then( function( model ) {
			return model.findOne( { where: { sid: sid } } );
		} )
		.then( function( record ) {
			fn( null, JSON.parse( record.data ) );
		} )
		.catch( function( cause ) {
			fn( cause );
		} );
};

SequelSessionStore.prototype.set = function( sid, session, fn ) {
	this._startDb()
		.then( function( model ) {
			return model.upsert( {
				sid: sid,
				data: JSON.stringify( session )
			} );
		} )
		.then( function() {
			fn();
		} )
		.catch( function( cause ) {
			fn( cause );
		} );
};

SequelSessionStore.prototype.destroy = function( sid, fn ) {
	this._startDb()
		.then( function( model ) {
			return model.destroy( { where: { sid: sid } } );
		} )
		.then( function() {
			fn();
		} )
		.catch( function( cause ) {
			fn( cause );
		} );
};


module.exports = function( context ) {
	return context.config( "session" )
		.then( function( db ) {
			return new SequelSessionStore( db.link );
		} );
};
