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
	URL       = require( "../../util/url" ),
	DATA      = require( "./data" ),
	xRelative = PATH.posix.relative,
	xSep      = PATH.posix.sep,
	urlCreate = URL.create;

/**
 * Injects locals into current response for working with URLs.
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {function} next
 */
module.exports = function( req, res, next ) {
	"use strict";

	/**
	 * Original path of current script including any routed prefixes but
	 * excluding query parameters.
	 *
	 * @type {string}
	 */
	res.locals.currentPath = req.originalUrl.split( "?" ).shift();

	/**
	 * Compares described URI with currently requested one.
	 *
	 * @note This method is used on creating menus to detect whether some menu
	 *       item is selected currently or part of breadcrumb to current
	 *       resource or vice-versa.
	 *
	 * @param {?string} path pathname to be addressed in described URI (might be relative to resolve in context of currently routed middleware module), falsy for describing URI to current resource
	 * @param {{}} query set of query parameters to be used in described URI for addressing resource in more detail
	 * @param {(string|Array.<string>)=} parametersToKeep names of top-level query parameters in current URI to be included in described URI (defaults to all on describing another URI to current resource)
	 * @returns {int|NaN} 0 if URIs addressing same resource, <0 if current URI is more generic than given one, >0 if current URI is more specific than given one, NaN if URIs are addressing completely different sections/resources
	 */
	res.locals.compareWithCurrentUri = function( path, query, parametersToKeep ) {
		"use strict";

		var url         = urlCreate( path, query, parametersToKeep ).qualify( req, res ),
		    givenPath   = url.path,
		    currentPath = res.locals.currentPath;

		var relative = xRelative( givenPath || "", currentPath || "" );
		if ( relative.length ) {
			relative = relative.split( xSep );

			// mismatching pathes ... is either containing the other?
			if ( relative.indexOf( ".." ) < 0 ) {
				// given path selects parent folder of current path
				// -> given path is selecting some ascendant of current path
				return -relative.length;
			} else if ( relative.filter( function( i ) { return ( i == ".." ); } ).length == 0 ) {
				// given path selects subordinated folder of current path
				// -> given path is selecting some descendant of current path
				return +relative.length;
			} else {
				// pathes are selecting different sections address space
				// -> there is no remarkable relation between them
				return NaN;
			}
		}

		// matching pathnames -> check query for differences
		return DATA.deepCompare( url.query, req.query );
	};

	/**
	 * Provides convenient opportunity to format URL.
	 *
	 * On addressing current view (path is falsy) this method is trying to
	 * include current query parameters unless propertiesToKeep is false for
	 * dropping all current parameters or a list of top-level parameter names
	 * to keep explicitly while dropping all others.
	 *
	 * On addressing different view (path is truthy) this method is dropping all
	 * current query parameters unless propertiesToKeep is a list of top-level
	 * parameter names to keep explicitly while dropping all others.
	 *
	 * Provided set of query parameters in query is always replacing/extending
	 * any current set of query parameters to be kept. This supports multi-level
	 * query parameters such as ?name[major][minor]=value. By assigning null or
	 * undefined some matching current query parameter is dropped explicitly.
	 *
	 * @param {?string} path URL of different view to address, null for re-addressing current view
	 * @param {Object.<string,*>} query set of query parameters to set/adjust
	 * @param {(string|Array.<string>)=} parametersToKeep set of query parameters to keep, omit for default behaviour
	 * @returns {string}
	 */

	res.locals.formatUri = function( path, query, parametersToKeep ) {
		return urlCreate( path, query, parametersToKeep ).compile( req, res );
	};

	next();
};
