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

var PROMISE = require( "bluebird" ),
	resolve = PROMISE.resolve;

function $true() { return true; }
function $false() { return false; }

// ----------------------------------------------------------------------------

module.exports = MenuTestSet;

// ----------------------------------------------------------------------------

function userHasRoleAdministrator( req, res ) {
	if ( res.locals.currentUser ) {
		var roles = res.locals.currentUser.Roles || [], i, l;

		for ( i = 0, l = roles.length; i < l; i++ )
			if ( roles[i].name === "administrator" )
				return true;
	}

	return false;
}

// ----------------------------------------------------------------------------

/**
 * @typedef {function(this:AppContext,IncomingMessage,ServerResponse):boolean} MenuTestFunction
 */

/**
 * @param {AppContext} context
 * @constructor
 */
function MenuTestSet( context ) {
	this._context = context;
	this._queue   = [];
}

/**
 * Runs all previously declared tests in context of provided request and
 * response.
 *
 * @param {IncomingMessage} req request to process
 * @param {ServerResponse} res response to send
 * @returns {Promise<boolean>} promise resolving true on succeeding all tests, false otherwise
 */
MenuTestSet.prototype.run = function( req, res ) {
	var context = this._context;

	return resolve( this._queue )
		.each( function( tester ) {
			return tester[0].apply( context, [ req, res ].concat( tester[1] ) );
		} )
		.then( $true, $false );
};

/**
 * Adds another test to this set of tests.
 *
 * @note Any enqueued test callback is considered to throw exception on failure
 *       and return without on success.
 *
 * @param {MenuTestFunction} fn
 * @param {...*} additionalArg first of several arguments to provide to tester additionally
 * @returns {MenuTestSet} current instance for chaining calls
 */
MenuTestSet.prototype.addTest = function( fn, additionalArg ) {
	if ( typeof fn !== "function" )
		throw new Error( "invalid tester callback" );

	this._queue.push( [ fn, [].splice.call( arguments, 1 ) ] );

	return this;
};

/**
 * Enqueues test for requiring current user to have some of the provided roles.
 *
 * @param {Array.<string>|...string} roles set of role names to test
 * @returns {MenuTestSet} current instance
 */
MenuTestSet.prototype.requireRole = function( roles ) {
	var self = this;

	if ( !Array.isArray( roles ) )
		roles = [].slice.call( arguments );

	return this.addTest( function( req, res, roles ) {
		return this.moduleLib( "user", "role" )
			.then( function( role ) {
				if ( !role.anyTest( res.locals.currentUser, roles ) )
					throw new Error( "user missing required role" );
			} );
	}, roles );
};

/**
 * Enqueues test for requiring current user not to be authenticated at all.
 *
 * @returns {MenuTestSet} current instance
 */
MenuTestSet.prototype.isNotAuthenticated = function() {
	return this.addTest( function( req, res ) {
		if ( res.locals.currentUser )
			throw new Error( "user is authenticated" );
	} );
};

/**
 * Enqueues test for requiring current user to be authenticated at all.
 *
 * @returns {MenuTestSet} current instance
 */
MenuTestSet.prototype.isAuthenticated = function() {
	return this.addTest( function( req, res ) {
		if ( !res.locals.currentUser )
			throw new Error( "user is not authenticated" );
	} );
};

/**
 * Enqueues test for requiring current user to be administrator.
 *
 * @returns {MenuTestSet} current instance
 */
MenuTestSet.prototype.isAdministrator = function() {
	return this.addTest( function( req, res ) {
		if ( !userHasRoleAdministrator( req, res ) )
			throw new Error( "user is not administrator" );
	} );
};

/**
 * Enqueues test for requiring current user to be authenticated at all, but not
 * to be administrator.
 *
 * @returns {MenuTestSet} current instance
 */
MenuTestSet.prototype.isNotAdministrator = function( req, res ) {
	return this.addTest( function( req, res ) {
		if ( !res.locals.currentUser || userHasRoleAdministrator( req, res ) )
			throw new Error( "user is administrator" );
	} );
};
