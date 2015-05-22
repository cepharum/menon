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

var persistent = require( "./persistent" );

/**
 * Commonly extracts query descriptor for use with Sequelize.Model.findAll().
 *
 * @param req
 * @returns {{where:Object.<string,string>=, order:string=, offset:int=, limit:int=}}
 */

module.exports = function( req, sessionSource ) {

	function get( name, defaultValue ) {
		return persistent( name, req, sessionSource, defaultValue );
	}

	var query = {},
		filter = undefined,
		sorting = get( "s" ) || get( "sort" ) || get( "sorting" );

	if ( typeof sorting === "string" && sorting.trim() ) {
		sorting = [ sorting.trim(), "ASC" ];
	} else {
		sorting = [];
	}

	[ "q", "query", "s", "sort", "sorting"].forEach( function( name ) {
		var source = get( name );
		if ( typeof source === "object" ) {
			var cb;

			switch ( name ) {
				case "q" :
				case "query" :
					// request for filtering
					cb = function( propName ) {
						var propValue = source[propName];
						if ( propValue.trim().length > 0 ) {
							if ( !filter ) { filter = {}; }
							filter[propName] = { $like: "%" + source[propName] + "%" };
						}
					};
					break;

				case "s" :
				case "sort" :
				case "sorting" :
					// request for sorting
					cb = function( propName ) {
						sorting.push( [
							propName,
							( /^desc$/i.test( String( source[propName] ) ) ? "DESC" : "ASC" )
						] );
					};
					break;
			}

			Object.keys( source ).forEach( cb );
		}
	} );

	if ( filter ) {
		if ( /^or$/i.test( get( "type" ) ) ) {
			filter = { $or: filter };
		}

		query.where = filter;
	}

	if ( sorting.length ) {
		query.order = sorting;
	}

	var offset = get( "offset" );
	if ( offset > 0 ) {
		query.offset = +offset;
	}

	var limit = get( "limit", 20 );
	if ( limit > 0 ) {
		query.limit = +limit;
	}

	return query;
};
