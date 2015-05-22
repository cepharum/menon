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
	PATH      = require( "path" ),
	PROMISE   = require( "bluebird" ),
	inherits  = UTIL.inherits,
	join      = PATH.join,
	relative  = PATH.relative,
	dirname   = PATH.dirname,
	resolve   = PROMISE.resolve,
	ptnPrefix = /^(\/?)\{([^}]+)}\/(.+)$/;


/**
 * Integrates special view processor supporting modules into application in
 * provided context.
 *
 * @param {AppContext} context
 * @returns {Promise<ModuleView>} promise resolved with ModuleView() for instantiating
 */
module.exports = function( context ) {

	function _resolveModuleSelector( pathname ) {
		// check pathname for containing module selector
		var match = pathname.match( ptnPrefix );
		if ( match ) {
			// look for known module matching name in found module selector
			var module = context.modulesRegistry[match[2]];
			if ( module ) {
				return {
					// got module matching module selector
					// -> compile pathname of view folder in selected module
					prefix: match[1] ? context.viewFolder : join( module.folder, "views" ),

					// also extract local pathname of view file in context of module
					pathname: match[3],

					// store found module
					module: module
				};
			}
		}
	}


	// get genuine View implementation
	var originalView = context.app.get( "view" );

	// implement own View
	function ModuleView( template, options ) {
		var info = _resolveModuleSelector( template );
		if ( info ) {
			// found some module selected in pathname having qualified the latter

			// -> ensure to use views in module, only
			//    (root is used by express' View resolving path of initial view)
			options.root = [ info.prefix ];

			// on creating instance of ModuleView (View) check for some caching
			// has been passed already ... thus drop qualification prefix
			// prepended in overloaded render() of response
			template = info.pathname;

			// store module of view's initial template
			this.module = info.module;
		}

		// continue with constructing View as usual
		originalView.call( this, template, options );
	}

	inherits( ModuleView, originalView );

	// install our custom View implementation
	context.app.set( "view", ModuleView );



	try {
		// try loading Parser of view engine Jade for replacing path resolver
		// for supporting modules as well
		var JadeParser = require.main.require( "jade" ).Parser,
			originalResolver = JadeParser.prototype.resolvePath;

		JadeParser.prototype.resolvePath = function( path ) {
			var info = _resolveModuleSelector( path );
			if ( info ) {
				arguments[0] = relative( dirname( this.filename ), join( info.prefix, info.pathname ) );
			}

			return originalResolver.apply( this, arguments );
		};
	} catch ( err ) {
		if ( err.code !== "MODULE_NOT_FOUND" ) {
			throw err;
		}
	}
};
