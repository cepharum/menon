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

var PROMISE  = require( "bluebird" ),
	PATH     = require( "path" ),
	UTIL     = require( "util" ),
	L10N     = require( "../l10n" ),
	URL      = require( "../util/url" ),
	MENU     = require( "../menu/roots" ),
	resolve  = PROMISE.resolve,
	join     = PATH.join,
	xJoin    = PATH.posix.join,
	inherits = UTIL.inherits,
	ptnPrefix = /^(\/?)\{([^}]+)}\/(.+)$/;

// ----------------------------------------------------------------------------

module.exports = AbstractModule;

// ----------------------------------------------------------------------------

/**
 * Drops module-specific modifications of request/response in case of module
 * haven't eventually processed request.
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {function(Error=)} next
 */
function postNormal( req, res, next ) {
	res.render = res.genuineRender;

	// set mark on having restored genuine renderer
	res.genuineRender = false;

	res.locals.getUrlPrefix = getRootUrlPrefix;
	next();
}

function getRootUrlPrefix() {
	return "/";
}

// ----------------------------------------------------------------------------

/**
 * @param {AppContext} context
 * @param {ModuleDescriptor} descriptor collected information on module
 * @constructor
 */
function AbstractModule( context, descriptor ) {
	var l10n = L10N.getOnContext( context );

	/** @property {AppContext} AbstractModule#context */
	Object.defineProperty( this, "context", { get: function() { return context; } } );

	/** @property {ModuleName} AbstractModule#name */
	Object.defineProperty( this, "name", { get: function() { return descriptor.name; } } );

	/** @property {ModuleDescriptor} AbstractModule#meta */
	Object.defineProperty( this, "meta", { get: function() { return descriptor; } } );

	/** @property {LocalizationContext} AbstractModule#l10n */
	Object.defineProperty( this, "l10n", { get: function() { return l10n; } } );
}

/**
 * Lists names of modules this one relies on.
 *
 * @note All module's names are turned to lower case prior to processing
 *       dependencies.
 *
 * @return {Array.<string>} list of modules current one relies on
 */
AbstractModule.prototype.getDependencies = function() {};

/**
 * Delivers router for processing requests.
 *
 * Provided router is always embedded in another middleware binding requests to
 * proper prefix as well as adjusting it to properly find module's view files
 * for rendering.
 *
 * @return {Router|Promise<Router>}
 */
AbstractModule.prototype.getRouter = function() {};

/**
 * Retrieves prefix of module to use on injecting it into application as
 * middleware.
 *
 * @return {string|RegExp|Array.<string|RegExp>}
 */
AbstractModule.prototype.getRouterPrefix = function() {
	return "/" + this.name;
};

/**
 * Retrieves URL prefix to use on compiling module-relative URLs.
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @return {string}
 */
AbstractModule.prototype.getUrlPrefix = function( req, res ) {
	return req.baseUrl || "/";
};

/**
 * Starts module providing descriptors of all its declared dependencies as
 * arguments.
 *
 * All modules are started prior to injecting them into application. Every
 * module is started after having started its declared dependencies. Descriptors
 * of all declared dependencies are provided as arguments on starting.
 *
 * @param {Object.<string,AbstractModule>} dependencies set of all dependencies
 * @param {Object.<string,ModuleDescriptor>} unsortedRegistry registry of all managed modules
 * @param {Array.<ModuleDescriptor>} sortedRegistry set of all managed modules sorted in order of loading
 * @return ?Promise promise resolved by injecting middleware
 */
AbstractModule.prototype.start = function( dependencies, unsortedRegistry, sortedRegistry ) {};

/**
 * Injects middleware of current module into application.
 *
 * @param {Object.<string,ModuleDescriptor>} unsortedRegistry registry of all managed modules
 * @param {Array.<ModuleDescriptor>} sortedRegistry set of all managed modules sorted in order of loading
 * @return Promise.<AbstractModule> promise resolved by injecting middleware
 */
AbstractModule.prototype.inject = function( unsortedRegistry, sortedRegistry ) {
	var self = this;

	return resolve( this.getRouter() )
		.then( function( router ) {
			if ( router ) {
				var app = self.context.app,
				    // prepare/clean module's context unless leaving on error
				    // for global error handling keeping context of module
				    // triggering error
				    handler = [ self.prepareRequest.bind( self ),
				                self.prepareRequestOnError.bind( self ),
				                router,
				                postNormal ];

				var url = self.getRouterPrefix();
				if ( url )
					handler.unshift( url );

				app.use.apply( app, handler );
			}
		} )
		.return( this );
};

/**
 * Prepares request to be processed in context of current module.
 */
AbstractModule.prototype.prepareRequest = function( req, res, next ) {
	var self = this;


	function _moduleRenderer() {
		var args = [].slice.call( arguments );

		// support render() called with template and callback, only
		if ( typeof arguments[1] === "function" )
			args.splice( 1, 0, {} );

		if ( !args[1] )
			args[1] = {};

		// extend options to provide current module's meta information in
		// options.Module (for custom View code) and in options._locals.Module
		// (for use in templates)
		var meta = args[1].Module = self.meta;

		if ( args[1]._locals ) {
			args[1]._locals.Module = meta;
		} else {
			args[1]._locals = { Module: meta };
		}

		if ( !args[1].basedir ) {
			// -> make absolute pathnames in templates resolve to application's
			//    templates (assuming jade is using basedir for resolving
			//    absolute pathnames)
			args[1].basedir = self.context.viewFolder;
		}

		if ( !ptnPrefix.test( args[0] ) ) {
			// qualify selected view name to be related to current module for
			// properly supporting selection of module-related View engine and
			// for supporting proper view caching in genuine code of express.js
			if ( args[0][0] === "/" )
				args[0] = "/{" + meta.name + "}" + args[0];
			else
				args[0] = "{" + meta.name + "}/" + args[0];
		}

		// prepare rendering view
		var rendererSelf = this;

		resolve( meta.registry.sorted || [] )
			.each( function( module ) {
				var manager = module.manager;
				return manager ? manager.prepareRendering( req, res ) : null;
			} )
			.then( function() {
				// invoke genuine renderer
				res.genuineRender.apply( rendererSelf, args );
			} );
	}


	if ( !res.genuineRender ) {
		// unless still using some previous module's render():
		// replace genuine renderer to properly provide access to current
		// module's view files
		res.genuineRender = res.render;
		res.render = _moduleRenderer;
	}

	res.locals.getUrlPrefix = function() {
		return self.getUrlPrefix( req, res );
	};

	next();
};

AbstractModule.prototype.prepareRequestOnError = function( err, req, res, next ) {
	this.prepareRequest( req, res, function( error ) {
		next( error || err );
	} );
};

/**
 * Removes module-specific context from provided context on leaving routes of
 * module without error.
 *
 * @note Request isn't concluded this way on passing error for processing error
 *       might need access on module error was encountered in.
 *
 * @type {function(IncomingMessage,ServerResponse,function(Error=))}
 */
AbstractModule.prototype.concludeRequest = postNormal;

/**
 * Prepares current module for actually rendering.
 *
 * This method isn't intended to keep response from being sent.
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @return {*|Promise}
 */
AbstractModule.prototype.prepareRendering = function( req, res ) {
	return MENU.getOnContext( this.context ).injectAllRendered( req, res );
};

/**
 * Looks up localization setup for providing some translation trying to prefer
 * translations of current module over any translations on application level.
 *
 * @param {string} singular text used to select entry in a found translation map, return if missing and requesting description of single item or missing to provide plural version
 * @param {string=} plural text to provide if translation is missing and translation has to describe multiple items
 * @param {number=} number number of items to be described by translation, default is 1 on omitting
 * @param {string} domain domain to check explicitly (default is "messages")
 * @return {string} found translation matching to describe number of items, given singular or plural on missing translation
 */
AbstractModule.prototype._ = function( singular, plural, number, domain ) {
	return this.l10n._( singular, plural, number, domain, join( this.meta.folder, "locale" ) );
};

/**
 * Prepares URL to be qualified in context of actual response generation.
 *
 * @param {string} path pathname, relative ones are in relation to current module
 * @param {Object.<string,*>} query
 * @param {Array.<string>} parametersToKeep names of query parameters in current request to keep
 * @returns {UrlDescriptor}
 */
AbstractModule.prototype.url = function( path, query, parametersToKeep ) {
	var self = this;

	return URL.create( path, query, parametersToKeep )
		.setPathQualifier( function( req, res ) {
			return xJoin( self.getUrlPrefix( req, res ) || "/", path );
		} );
};

/**
 * Creates module implementation derived from Abstract Module for using provided constructor.
 *
 * @param {string} name name of class to create
 * @param {function(AppContext,ModuleDescriptor)=} constructor
 * @returns {Function} implementation skeleton ready for adding prototype methods
 */
AbstractModule.define = function( name, constructor ) {
	if ( typeof name !== "string" || !/^[a-z][a-z0-9]+$/i.test( name ) )
		throw new TypeError( "invalid name of module implementation to create" );

	if ( name in global )
		throw new TypeError( "implementation name exists already: " + name );


	// create skeleton "class" using optionally provided constructor and always
	// including call for derived constructor (always called first)
	var impl;

	if ( typeof constructor === "function" ) {
		impl = function() {
			AbstractModule.apply( this, arguments );
			constructor.apply( this, arguments );
		};
	} else {
		impl = function() {
			AbstractModule.apply( this, arguments );
		};
	}

	// make skeleton derive from AbstractModule
	inherits( impl, AbstractModule );

	// publish created skeleton
	global[name] = impl;

	return impl;
};

/**
 * Tests if provided value is instance of AbstractModule.
 *
 * @param {*} value
 * @returns {boolean} true if value is instance of AbstractModule
 */
AbstractModule.isModule = function( value ) {
	return value instanceof AbstractModule;
};
