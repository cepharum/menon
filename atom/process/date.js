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
 * @param {string|Date} string input to parse, Date instance to pass
 * @param {boolean=} ignoreMissing true for not throwing exception if missing any input
 * @returns {Date} parsed date and Date instance
 */
exports.parseDate = function( string, ignoreMissing, onError ) {
	if ( string instanceof Date )
		return string;

	if ( !string ) {
		if ( ignoreMissing )
			return null;

		if ( typeof onError === "function" ) {
			onError( "invalid date input" );
		} else {
			throw new Error( "invalid date input" );
		}
	}

	try {
		return parseDate( String( string ) );
	} catch ( e ) {
		if ( typeof onError === "function" ) {
			onError( e.message );
		} else {
			throw e;
		}
	}
};

/**
 * @param {Date} date
 * @param {Localization} l10n
 * @returns {string}
 */
exports.formatDate = function( date, l10n ) {
	if ( !date )
		return "";

	if ( typeof date === "string" )
		return date;

	if ( !( date instanceof Date ) )
		throw new Error( "invalid date information to format" );

	return l10n.$("{fullyear}-{zeromonth}-{zeroday}")
		.replace( /\{([^}]+)}/g, function( match, token ) {
			switch ( token.toLowerCase() ) {
				case "day" :
					return date.getDate();
				case "0-day" :
				case "0day" :
				case "zeroday" :
					return ( "00" + date.getDate() ).substr( -2 );
				case "month" :
					return date.getMonth() + 1;
				case "0-month" :
				case "0month" :
				case "zeromonth" :
					return ( "00" + ( date.getMonth() + 1 ) ).substr( -2 );
				case "year" :
					return date.getYear();
				case "0-year" :
				case "0year" :
				case "zeroyear" :
					return ( "00" + date.getYear() ).substr( -2 );
				case "fullyear" :
					return date.getFullYear();
			}
		} );
};



// --- private stuff ---

var dateFormats = {
	"!Y.MD": [
		/^(\d{2}|\d{4})([-\/])(\d{1,2})\2(\d{1,2})$/
	],
	"!DMY": [
		/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/
	]
};

function extract( format, patternMatches ) {
	if ( format.charAt( 0 ) === "!" )
		format = format.substr( 1 );

	var now = new Date(),
	    record = {
		    day: now.getDate(),
		    month: now.getMonth(),
		    year: now.getFullYear()
	    };

	try {
		format.split( "" ).forEach( function( marker, index ) {
			switch ( marker ) {
				case "D" :
					record.day = parseInt( patternMatches[index] );
					if ( record.day < 1 || record.day > 31 )
						throw new Error( "day of month out of range" );
					break;

				case "M" :
					record.month = parseInt( patternMatches[index] );
					if ( record.month < 1 || record.month > 12 )
						throw new Error( "month out of range" );
					break;

				case "Y" :
					record.year = parseInt( patternMatches[index] );
					if ( record.year < 1 )
						throw new Error( "year out of range" );
					if ( record.year < 100 )
						record.year += 2000;
					if ( record.year > 2200 )
						throw new Error( "year out of range" );
					break;
			}
		} );

		return new Date( record.year, record.month - 1, record.day, 0, 0, 0, 0 );
	} catch ( e ) {
		return null;
	}
}

function parseDate( string ) {
	var match = null;

	Object.keys( dateFormats ).some( function( format ) {
		var patterns = dateFormats[format];
		if ( !Array.isArray( patterns ) )
			patterns = [ patterns ];

		var normalized = string;
		if ( format.charAt( 0 ) === "!" )
			normalized = normalized.replace( /\s+/g, '' );

		return patterns.some( function( pattern ) {
			match = pattern.exec( normalized );
			if ( match ) {
				match = extract( format, [].slice.call( match, 1 ) );
				if ( match )
					return true;
			}
		} );
	} );

	if ( match )
		return match;

	if ( string )
		throw new Error( "malformed date information" );

	return null;
}
