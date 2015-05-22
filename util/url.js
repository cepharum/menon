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

var PATH       = require( "path" ),
	URL        = require( "url" ),
	QS         = require( "qs" ),
	DATA       = require( "../atom/process/data" ),
	RESOLVER   = require( "../atom/process/resolver" ),
	Posix      = PATH.posix,
	isAbsolute = Posix.isAbsolute,
	join       = Posix.join,
	urlFormat  = URL.format,
	deepMerge  = DATA.deepMerge,
	deepClone  = DATA.deepClone;

// ----------------------------------------------------------------------------

module.exports = UrlDescriptor;

// ----------------------------------------------------------------------------

/**
 * @typedef {Object.<string,UrlQueryValue>|string|int|Array.<UrlQueryValue>} UrlQueryValue
 * @typedef {Object.<string,UrlQueryValue>} UrlQuery
 */

/**
 * Provides convenient opportunity to describe URL.
 *
 * On addressing current view (path is falsy) this instance is trying to
 * include current query parameters unless parametersToKeep is false for
 * dropping all current parameters or a list of top-level parameter names
 * to keep explicitly while dropping all others.
 *
 * On addressing different view (path is truthy) this method is dropping all
 * current query parameters unless parametersToKeep is a list of top-level
 * parameter names to keep explicitly while dropping all others.
 *
 * Provided set of query parameters in query is always replacing/extending
 * any current set of query parameters to be kept. This supports multi-level
 * query parameters such as ?name[major][minor]=value. By assigning null or
 * undefined some matching current query parameter is dropped explicitly.
 *
 * @param {?string} path URL of different view to address, null for re-addressing current view
 * @param {UrlQuery} query set of query parameters to set/adjust
 * @param {(string|Array.<string>)=} parametersToKeep set of query parameters to keep, omit for default behaviour
 * @constructor
 */

function UrlDescriptor( path, query, parametersToKeep ) {
	var _pathQualifier = null;

	Object.defineProperty( this, "path", { get: function() { return path; } } );
	Object.defineProperty( this, "query", { get: function() { return query || {}; } } );
	Object.defineProperty( this, "parametersToKeep", { get: function() { return parametersToKeep; } } );

	Object.defineProperty( this, "pathQualifier", {
		get: function() { return _pathQualifier; },
		set: function( fn ) {
			if ( fn && typeof fn !== "function" )
				throw new Error( "invalid path qualifier callback" );

			_pathQualifier = fn || null;
		}
	} );
}

/**
 * Qualifies URL in context of provided pair of request and response providing
 * resulting pathname and set of query parameters.
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {Object.<string,string>=} variables set of named values to replace markers in path
 * @returns {{path: string, query: UrlQuery}}
 */
UrlDescriptor.prototype.qualify = function( req, res, variables ) {
	var path    = this.path,
		query   = this.query,
		dropAll = false;

	if ( path ) {
		// caller is not trying to address current target
		// -> don't keep any parameter of current request, but drop all unless
		//    caller has listed some parameters to keep explicitly
		dropAll = [];

		// replace special markers in path by values explicitly provided or
		// available as locals of response
		var values = ( variables && typeof  variables === "object" ) ? variables : res.locals;
		path = path.replace( /\{([^}]+)\}/g, function( full, name ) {
			return RESOLVER.resolve( name, values, "" );
		} );

		// qualify relative path names
		if ( !/^[a-z]+:/.test( path ) ) {
			if ( !isAbsolute( path ) ) {
				var pathQualifier = this.pathQualifier;

				if ( pathQualifier ) {
					path = pathQualifier( req, res, path );
				} else {
					var locals = res.locals || {},
						method = locals.getUrlPrefix,
						prefix = ( typeof method === "function" ) ? method() : String( locals.urlPrefix || "" );

					path = join( prefix || "/", path );
				}
			}
		}
	} else {
		// keep current request's pathname (building URL on same processor)
		path = req.pathname;
	}

	return {
		path: path,
		query: deepMerge( deepClone( req.query, this.parametersToKeep || dropAll ), query )
	};
};

/**
 * Assigns callback to invoke for qualifying path of URL using custom code.
 *
 * URLs w/o this callback are qualified depending on current module, if
 * available.
 *
 * @param {function(IncomingMessage,ServerResponse):string} fn
 * @returns {UrlDescriptor}
 */
UrlDescriptor.prototype.setPathQualifier = function( fn ) {
	this.pathQualifier = fn;

	return this;
};

/**
 * Qualifies and compiles URL in context of provided pair of request and response.
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @returns {string} absolute URL including pathname and optional query parameters
 */
UrlDescriptor.prototype.compile = function( req, res ) {
	return UrlDescriptor.format( this.qualify( req, res ) );
};

/**
 * Compiles URL in context of dummy request und response.
 *
 * @note This method is provided to always render some URL, though it might be
 *       referring to wrong target.
 *
 * @returns {{path: string, query: UrlQuery}}
 */
UrlDescriptor.prototype.toString = function() {
	return this.qualify( { pathname: "/", query: {} }, {} );
};

/**
 * Creates instance describing some URL to be qualified and/or compiled on
 * demand.
 *
 * @param {?string} path URL of different view to address, null for re-addressing current view
 * @param {UrlQuery} query set of query parameters to set/adjust
 * @param {(string|Array.<string>)=} parametersToKeep set of query parameters to keep, omit for default behaviour
 * @returns {UrlDescriptor}
 */
UrlDescriptor.create = function( path, query, parametersToKeep ) {
	return new UrlDescriptor( path, query, parametersToKeep );
};

/**
 * Tests if provided value is instance of URL descriptor.
 *
 * @param {*} value
 * @returns {boolean} true if value is instance of UrlDescriptor
 */
UrlDescriptor.isUrl = function( value ) {
	return value instanceof UrlDescriptor;
};

/**
 * Formats URL according to provided meta information.
 *
 * @param {{path:string,query:UrlQuery}} qualifiedUrl
 * @returns {string}
 */
UrlDescriptor.format = function( qualifiedUrl ) {
	return urlFormat( {
		pathname: qualifiedUrl.path,
		search: QS.stringify( qualifiedUrl.query )
	} );
};
