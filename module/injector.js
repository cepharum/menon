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
 * @typedef {{name:string,location:string,folder:string,injector:string,manager:AbstractModule,dependencies:Array.<string>}} ModuleDescriptor
 * @typedef {string} ModuleName
 * @typedef {{enumerate: enumerateModules, start: startModules}} ModuleApi
 */

// ----------------------------------------------------------------------------

var PROMISE   = require( "bluebird" ),
	PATH      = require( "path" ),
	FS        = require( "fs" ),
	UTIL      = require( "util" ),
	MODULE    = require( "./abstract" ),
	VIEW      = require( "./view" ),
	resolve   = PROMISE.resolve,
	readdir   = PROMISE.promisify( FS.readdir ),
    statfile  = PROMISE.promisify( FS.stat ),
    join      = PATH.join,
    ptnPrefix = /^(\/?)\{([^}]+)}\/(.+)$/;

/**
 * Initializes application for loading and supporting modules.
 *
 * @note Initialization includes replacing existing view of application, thus
 *       you should ensure to initialize this _after_ having set custom
 *       rendering engine.
 *
 * @param {AppContext} context
 * @return {Promise<ModuleApi>}
 */
module.exports = function( context ) {
	VIEW( context );

	// promises aren't required currently, but API is prepared for future
	return resolve( {
		enumerate: enumerateModules,
		start: startModules
	} );
};

// ----------------------------------------------------------------------------

function modulesToLoad( context, explicitSelection ) {
	if ( Array.isArray( explicitSelection ) && explicitSelection.length ) {
		return PROMISE.resolve( explicitSelection );
	}

	// iterate over all non-hidden sub-folders in modules folder of context
	return readdir( context.modulesFolder );
}

function createDescriptor( context, registry, moduleName, pathname, injectorFilename, injectorFn ) {
	var descriptor = {
		name:         moduleName.toLowerCase(),
		folder:       pathname,
		injector:     injectorFilename,
		dependencies: [],
		registry: {
			unsorted: registry
		}
	};

	if ( injectorFn ) {
		var manager = descriptor.manager = injectorFn( context, descriptor ),
		    dependencies = manager.getDependencies();

		if ( Array.isArray( dependencies ) ) {
			descriptor.dependencies = dependencies;
		} else if ( !isNaN( dependencies ) ) {
			descriptor.dependencies = dependencies > 0 ? -dependencies : +dependencies;
		} else if ( !dependencies ) {
			descriptor.dependencies = [];
		} else {
			throw new TypeError( "invalid dependencies definition in module: " + descriptor.name );
		}
	}

	return resolve( descriptor );
}

/**
 * Ensures to have loaded selected module feeding provided registry.
 *
 * @param {AppContext} context
 * @param {string} name
 * @param {Object.<string,ModuleDescriptor>} registry
 * @returns {*}
 */
function getModule( context, name, registry ) {
	if ( name in registry ) {
		return resolve( registry[name] );
	}


	var pathname, injector, promise,
	    parts = /^([^\/:]+):(.+)$/.exec( name );

	if ( parts ) {
		// dependency selects some node module to provide AbstractModule instance
		// -> choose app's folder to be "this module's folder" (e.g. for using global views)
		pathname = context.appFolder;
		// -> normalize pathname of injector file actually resolving to node module
		injector = join( parts[1], parts[2] );

		promise  = resolve( injector );
	} else {
		// dependency selects module to be found in application's modules folder
		pathname = join( context.modulesFolder, name );
		injector = join( pathname, "injector.js" );

		promise  = statfile( injector ).then( function( stat ) {
			return stat.isFile() ? injector : null;
		} );
	}


	return promise
		.then( function( injectorFilename ) {
			if ( injectorFilename ) {
				return createDescriptor( context, registry, name, pathname, injectorFilename, require( injectorFilename ) );
			}
		} )
		.catch( function( error ) {
			if ( error.code != "ENOENT" ) {
				throw error;
			}

			return createDescriptor( context, registry, name, pathname, injector, null );
		} )
		.then( function( descriptor ) {
			registry[name] = descriptor;

			// ensure to have all modules given as dependencies here
			var deps = descriptor.dependencies;

			if ( !Array.isArray( deps ) || !deps.length )
				// module doesn't list any dependencies
				return descriptor;

			// resolve all listed dependencies
			return resolve( deps )
				.map( function( name ) {
					return getModule( context, name, registry );
				} )
				.all()
				.return( descriptor );
		} );
}

/**
 * Enumerates given folder for containing modules to load returning registry
 * information on all found modules.
 *
 * @param {AppContext} context application context
 * @param {Array.<string>=} explicitSelection set of modules to load (rather than loading all modules in modules folder)
 * @return {Promise<[Object.<ModuleName,ModuleDescriptor>, Array.<ModuleDescriptor>]>} registry of found modules as unsorted map and as sorted list
 */
function enumerateModules( context, explicitSelection ) {
	var registry = context.modulesRegistry = {};

	// find all modules to load explicitly
	return modulesToLoad( context, [].concat.apply( [], [].slice.call( arguments, 1 ) ) )
		// get every module to be loaded explicitly (resolving dependencies implicitly)
		.map( function( moduleName ) {
			if ( moduleName[0] == "." )
				return null;

			return getModule( context, moduleName, registry );
		}, { concurrency: 1 } )
		.all()
		// having loaded all modules here
		// -> sort module descriptors depending on each one's given dependencies
		.then( function() {
			var weight = {}, sorted;

			function countOnRecord( record ) {
				if ( !record )
					throw new Error( "invalid record in modules registry" );

				if ( Array.isArray( record.dependencies ) ) {
					record.dependencies
						.forEach( function( depName ) {
							depName = depName.toLowerCase();

							weight[depName].value++;

							countOnRecord( registry[depName] );
						} );
				} else {
					// module's want explicit (low) priority
					// -> ensure it isn't raised by others depending on it
					weight[record.name].value = record.dependencies;
				}
			}

			// get weights on modules required by others
			Object.keys( registry )
				.map( function( name ) {
					weight[name] = { name: name, value: 0 };
					return name;
				} )
				.forEach( function( name ) {
					countOnRecord( registry[name] );
				} );


			// get registry records sorted modules' usages from most often to least often
			sorted = Object.keys( weight )
				.map( function( name ) {
					return weight[name];
				} )
				.sort( function( left, right ) {
					return right.value - left.value;
				} )
				.map( function( info ) {
					return registry[info.name];
				} );

			sorted.forEach( function( record ) {
				record.registry.sorted = sorted;
			} );

			return [ registry, sorted ];
		} );
}

/**
 * Starts modules described by given registry in proper order obeying modules'
 * dependencies on each other.
 *
 * @param {Object.<string,ModuleDescriptor>} registry
 * @param {Array.<ModuleDescriptor>} sortedRegistry
 * @returns {Promise<Array.<ModuleDescriptor>>} registry of modules sorted in starting order
 */
function startModules( registry, sortedRegistry ) {

	if ( !sortedRegistry && Array.isArray( registry ) && registry.length == 2 ) {
		// enumeration and starting wasn't chained used Promise.spread()
		// -> fix it locally
		sortedRegistry = registry.pop();
		registry       = registry.pop();
	}

	// sequentially start all registered modules in determined order
	return resolve( sortedRegistry )
		.each( function( descriptor ) {
			console.log( "starting module: " + descriptor.name );

			if ( descriptor.manager ) {
				if ( !MODULE.isModule( descriptor.manager ) )
					throw new Error( "module '" + descriptor.name + "' isn't deriving from AbstractModule" );

				// create subregistry listing all instances of modules current one
				// depends on
				var dependencies = descriptor.dependencies,
				    subRegistry  = {};

				if ( Array.isArray( dependencies ) ) {
					dependencies.forEach( function( name ) {
						subRegistry[name] = registry[name].manager;
					} );
				}

				// invoke start() of module
				return descriptor.manager.start.call( descriptor.manager, subRegistry, registry, sortedRegistry );
			}
		} )
		// having started all modules now
		// -> start injecting them in same order
		.each( function( descriptor ) {
			if ( descriptor.manager ) {
				return descriptor.manager.inject.call( descriptor.manager, registry, sortedRegistry );
			}
		} );
}
