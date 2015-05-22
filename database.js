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

var PATH      = require( "path" ),
	PROMISE   = require( "bluebird" ),
	normalize = PATH.normalize,
	qualify   = PATH.resolve,
	dirname   = PATH.dirname,
	resolve   = PROMISE.resolve;

// ----------------------------------------------------------------------------

module.exports = DatabaseManager;

// ----------------------------------------------------------------------------

function stack() {
	var orig = Error.prepareStackTrace;
	Error.prepareStackTrace = function(_, stack) { return stack; };
	var err = new Error();
	Error.captureStackTrace(err, this);
	var errStack = err.stack;
	Error.prepareStackTrace = orig;
	return errStack;
}

// ----------------------------------------------------------------------------

/**
 * @param {AppContext} context
 * @constructor
 */
function DatabaseManager( context ) {
	var _cache = {};

	Object.defineProperty( this, "context", { get: function() { return context; } } );
	Object.defineProperty( this, "cache", { get: function() { return _cache; } } );
}

var _managerCache = [];

/**
 * Delivers database manager for provided context.
 *
 * @param {AppContext} context description context of application
 * @returns {DatabaseManager}
 */
DatabaseManager.getOnContext = function( context ) {
	var cache = _managerCache,
	    i, l, dbManager;

	for ( i = 0, l = cache.length; i < l; i++ ) {
		if ( cache[i][0] === context ) {
			return cache[i][1];
		}
	}

	dbManager = new DatabaseManager( context );

	cache.push( [ context, dbManager ] );

	context.app.set( "database", dbManager );

	return dbManager;
};

/**
 * Retrieves connection with database selected by name.
 *
 * @note The name is actually used by site configuration to choose one of
 *       several supported setups. The name is "default" if omitted here.
 *
 * @param {string=} name name of database to connect
 * @returns {Promise<DatabaseConnection>}
 */

DatabaseManager.prototype.getByName = function( name ) {
	var cache = this.cache,
	    ctx = this.context;

	name = String( name || "default" );

	if ( name in cache )
		return resolve( cache[name] );

	return ctx.config( "db", name )
		.then( function( db ) {
			cache[name] = new DatabaseConnection( ctx, db.link, db.api );

			return cache[name];
		} );
};

/**
 * Retrieves default connection with database.
 *
 * @returns {Promise<DatabaseConnection>}
 */

DatabaseManager.prototype.getDefault = function() {
	return this.getByName( "default" );
};

function DatabaseConnection( context, link, api ) {
	Object.defineProperty( this, "context", { get: function() { return context; } } );
	Object.defineProperty( this, "link", { get: function() { return link; } } );
	Object.defineProperty( this, "api", { get: function() { return api; } } );
}

/**
 * Imports model definition.
 *
 * @param {string} pathname path name of model definition file to import
 * @returns {Model}
 */
DatabaseConnection.prototype.importModel = function( pathname ) {
	if ( normalize( pathname ) !== qualify( pathname ) ) {
		pathname = qualify( dirname( stack()[2].getFileName() ), pathname );
	}

	return require( pathname )( this.link, this.api, this.context );
};
