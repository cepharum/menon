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
	NODE    = require( "./node" );

// ----------------------------------------------------------------------------

module.exports = MenuRoots;

// ----------------------------------------------------------------------------

function MenuRoots( context ) {
	var menus = {};

	Object.defineProperty( this, "context", {
		get: function() { return context; }
	} );

	Object.defineProperty( this, "menus", {
		get: function() { return menus; }
	} );
}

/**
 * Fetches root node of menu selected by its name.
 *
 * @param {string} name name of menu to fetch root note of
 * @param {...string} alias alias to use
 * @returns {MenuNode}
 */
MenuRoots.prototype.get = function( name, alias ) {
	var roots = this.menus,
	    root  = roots[name],
	    i, l;

	// create new root node unless having created on demand before
	if ( !root ) {
		root = new NODE();
		root.context = this.context;

		roots[name] = root;
	}

	// make same root node available using given aliases unless having root
	// nodes there as well
	for ( i = 1, l = arguments.length; i < l; i++ ) {
		alias = arguments[i];

		if ( !roots[alias] ) {
			roots[alias] = root;
		}
	}

	return root;
};

MenuRoots.prototype.injectAllRendered = function( req, res ) {
	var roots  = this.menus,
		locals = res.locals,
		menus  = locals.menus;

	if ( menus )
		// don't inject multiple times
		return;

	locals.menus = menus = {};

	return PROMISE.resolve( Object.keys( roots ) )
		.each( function( name ) {
			return PROMISE.resolve( roots[name].describeOnRequest( req, res ) )
				.then( function( rendered ) {
					menus[name] = rendered;
				} );
		} );
};

var _cache = [];

/**
 * Delivers set of menu root nodes in context of described application.
 *
 * @param {AppContext} context description context of application
 * @returns {MenuRoots}
 */
MenuRoots.getOnContext = function( context ) {
	var cache = _cache,
	    i, l, nodeSet;

	for ( i = 0, l = cache.length; i < l; i++ ) {
		if ( cache[i][0] === context ) {
			return cache[i][1];
		}
	}

	nodeSet = new MenuRoots( context );

	cache.push( [ context, nodeSet ] );

	return nodeSet;
};
