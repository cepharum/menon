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

/**
 * @typedef {ApplicationContext} AppContext
 */

var PATH    = require( "path" ),
	PROMISE = require( "bluebird" ),
	ATOMS   = require( "./atoms" ),
	resolve = PROMISE.resolve,
	join    = PATH.join;

// ----------------------------------------------------------------------------

module.exports = ApplicationContext;

// ----------------------------------------------------------------------------

function extendApplication( application ) {
	application.enableShutdown = function( servers ) {
		servers = [].concat.apply( [], arguments );

		function dropServer( server ) {
			console.log( "service is down" );

			var index = servers.indexOf( server );
			if ( index >= 0 ) {
				servers.splice( index, 1, 0 );

				if ( servers.length === 0 ) {
					resolve( application.shutdownActions || [] )
						.each( function( handler ) {
							return resolve( handler( application ) );
						} )
						.then( function() {
							process.exit( 0 );
						} )
						.catch( function( cause ) {
							console.error( "error while shutting down: " + String( cause.message || cause || "unknown error" ) );
							process.exit( 1 );
						} );
				}
			}
		}

		servers.forEach( function( server ) {
			server.on( "close", function() {
				dropServer( server );
			} );
		} );

		function onShutdown() {
			console.log( "shutting down service" );

			servers.forEach( function( server ) {
				server.close();
			} );
		}

		process.on( "SIGINT", onShutdown );
		process.on( "SIGTERM", onShutdown );
	};
}

function normalizeApi( filename, context, callerArgs, dontFail ) {
	try {
		var api = require( filename );

		if ( typeof api === "function" ) {
			var args = [ context ];

			if ( callerArgs.length > 1 ) {
				args.concat( [].slice.call( callerArgs, 1 ) )
			}

			api = api.apply( api, args );
		}

		return api;
	} catch ( error ) {
		if ( dontFail ) {
			return {};
		}

		throw error;
	}
}

// ----------------------------------------------------------------------------

function ApplicationContext( application, rootFolder ) {
	var libFolder = join( rootFolder, "lib" ),
		configFolder = join( rootFolder, "config" ),
		dataFolder = join( rootFolder, "data" ),
		viewFolder = join( rootFolder, "views" ),
		modulesFolder = join( rootFolder, "modules" );

	Object.defineProperties( this, {
		app: { get: function() { return application; } },
		appFolder: { get: function() { return rootFolder; } },
		libFolder: { get: function() { return libFolder; } },
		configFolder: { get: function() { return configFolder; } },
		dataFolder: { get: function() { return dataFolder; } },
		viewFolder: { get: function() { return viewFolder; } },
		modulesFolder: { get: function() { return modulesFolder; } }
	} );
}

ApplicationContext.prototype.config = function( name ) {
	var self = this,
	    args = arguments;

	return new PROMISE( function( resolve ) {
		resolve( normalizeApi( join( self.configFolder, name ), self, args, true ) );
	} );
};

ApplicationContext.prototype.moduleLib = function( moduleName, libraryName ) {
	var self = this,
	    args = arguments;

	return normalizeApi( join( self.modulesFolder, moduleName, "lib", libraryName ), self, args );
};

ApplicationContext.prototype.onShutdown = function( callback ) {
	var app = this.app;

	if ( !Array.isArray( app.shutdownActions ) ) {
		app.shutdownActions = [];
	}

	if ( app.shutdownActions.indexOf( callback ) < 0 ) {
		app.shutdownActions.push( callback );
	}

	return this;
};

/**
 * Creates context descriptor for provided application instance.
 *
 * @param {*} application ExpressJS application instance to describe in context
 * @param {string} rootFolder pathname of application's root folder
 * @return {AppContext}
 */
ApplicationContext.createOnApplication = function( application, rootFolder ) {
	var context = new ApplicationContext( application, rootFolder );

	/** @deprecated */
	context.atoms = ATOMS( context );

	extendApplication( application, context );

	return context;
};

ApplicationContext.isApplicationContext = function( value ) {
	return value instanceof ApplicationContext;
};
