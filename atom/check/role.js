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

var noAuthentication = require( "../result/non-authenticated" ),
	noAuthorization  = require( "../result/non-elevated" );

// ----------------------------------------------------------------------------

function anyTest( user, wantedRoles ) {
	if ( !user )
		// reject due to missing authentication
		throw false;

	for ( var actual = ( user.Roles || [] ), i = 0, l = actual.length; i < l; i++ )
		if ( wantedRoles.indexOf( actual[i].name ) >= 0 )
			// matching role -> test passed
			return;

	// not matching any role -> reject due to missing authorization
	throw true;
}

function allTest( user, wantedRoles ) {
	if ( !user )
		// reject due to missing authentication
		throw false;

	var actual = ( user.Roles || [] ).map( function( role ) { return role.name; } ), i, l;

	for ( i = 0, l = wantedRoles.length; i < l; i++ )
		if ( actual.indexOf( wantedRoles[i] ) < 0 )
			// not matching one wanted role -> test failed due to lacking authorization
			throw true;

	// matching all roles -> test passed
}

// ----------------------------------------------------------------------------

/**
 * Checks if current user is associated with any given role.
 *
 * @note This method support provision of role names in separate arguments or
 *       set of role names as array in first argument.
 *
 * @param {string|Array.<string>} roleName first name of role to test or set of names to test
 * @returns {middleware}
 */
module.exports.any = function( roleName ) {
	var requiredRoles;

	if ( Array.isArray( roleName ) )
		requiredRoles = roleName;
	else
		requiredRoles = [].slice.call( arguments );

	return function( req, res, next ) {
		try {
			anyTest( res.locals.currentUser, requiredRoles );
			next();
		} catch ( e ) {
			if ( e === true ) {
				// not matching one role -> render error rejecting request due to missing all privileges
				noAuthorization( next )();
			} else if ( e === false ) {
				// not matching one role -> render error rejecting request due to missing all privileges
				noAuthentication( next )();
			} else {
				error.status = 500;
				next( error );
			}
		}
	};
};

module.exports.anyTest = anyTest;

/**
 * Checks if current user is associated with all given roles.
 *
 * @note This method support provision of role names in separate arguments or
 *       set of role names as array in first argument.
 *
 * @param {string|Array.<string>} roleName first name of role to test or set of names to test
 * @returns {middleware}
 */
module.exports.all = function( roleName ) {
	var requiredRoles;

	if ( Array.isArray( roleName ) )
		requiredRoles = roleName;
	else
		requiredRoles = [].slice.call( arguments );

	return function( req, res, next ) {
		try {
			allTest( res.locals.currentUser, requiredRoles );
			next();
		} catch ( e ) {
			if ( e === true ) {
				// not matching one role -> render error rejecting request due to missing all privileges
				noAuthorization( next )();
			} else if ( e === false ) {
				// not matching one role -> render error rejecting request due to missing all privileges
				noAuthentication( next )();
			} else {
				error.status = 500;
				next( error );
			}
		}
	};
};

module.exports.allTest = allTest;
