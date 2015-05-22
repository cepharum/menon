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

var PATH    = require( "path" ),
	FS      = require( "fs" ),
	join    = PATH.join,
	exists  = FS.existsSync;

// ----------------------------------------------------------------------------

/**
 * @typedef {string} L10nLookup
 * @typedef {Array.<string>|string|false} L10nTranslations
 * @typedef {Object.<L10nLookup,L10nTranslations>} L10nMap
 * @typedef {Array.<L10nMap>} L10nMapChain
 */

/**
 */

module.exports = LocalizationContext;

// ----------------------------------------------------------------------------

var _contextCache = [],
    _managerCache = {},
    _mapCache = {};

/**
 * Normalizes set of languages mentioned in request to be accepted by client.
 *
 * @param {IncomiongMessage} req request to inspect
 * @return {Array.<string>} properly sorted set of locale tags accepted by client
 */

function processAcceptedLanguagesOfRequest( req ) {
	return ( req.headers["accept-language"] || "" )
		.split( /(\s*,)+\s*/ )
		.map( function( token, index ) {
			token = /^([A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*)\s*(;\s*q=([01](?:\.\d+)))?$/.exec( token );
			return token ? [ token[2] ? parseFloat( token[3] ) : 1, index, token[1] ] : null;
		} )
		.filter( function( item ) { return !!item; } )
		.sort( function( l, r ) {
			var diff = +r[0] - l[0];
			return diff ? diff : l[1] - r[1];
		} )
		.map( function( record ) { return record[2]; } );
}

/**
 * Implements dummy lookup helper returning provided singular regularly used for
 * looking up matching translation.
 *
 * @param {string|LocalizationRequest} singular
 * @returns {string} provided singular as string
 */

function $dummy( singular ) { return String( singular ); }

/**
 * Implements default manager for mapping some provided number of items to
 * describe in a translation to index of matching message contained in a found
 * translation.
 *
 * This implementation is suitable for handling english language as well as
 * several other western languages such as German. Every translation file may
 * export method getIndexOfNumber() matching signature of this function to
 * replace it.
 *
 * @param {number} number number of items to be described by translation
 * @returns {integer} index to string to use in a set of strings matching requested translation lookup key
 */

function $number( number ) {
	return number != 1 ? 1 : 0;
}

/**
 * Tries to get map matching provided pathname, domain and tag.
 *
 * This method is managing some runtime cache for reducing number of requests
 * for accessing filesystem synchronously.
 *
 * @param {string} path absolute path name of locales folder to use
 * @param {string} tag locale tag to retrieve, e.g. "de-de" or just "de"
 * @param {string} domain domain to retrieve (actually: filename of map to load)
 * @returns {L10nMap|false} found map, false if missing
 */

function getMap( path, tag, domain ) {
	var hash = domain + "@" + tag + "::" + path;

	if ( hash in _mapCache )
		return _mapCache[hash];

	var filename = join( path, tag, domain + ".js" );
	try {
		// TODO testing synchronously is bad practice here, but due to lazily loading maps in synchronous request for translation (e.g. in view templates) there is probably no better approach to this
		if ( !exists( filename ) )
			return false;

		var localMap = require( filename ) || {};

		// ensure to have method selecting index of entry matching a
		// provided number of items to be described by translation
		if ( typeof localMap.getIndexOfNumber !== "function" )
			localMap.getIndexOfNumber = $number;

		_mapCache[hash] = localMap;

		return localMap;
	} catch ( e ) {
		return false;
	}
}

// ----------------------------------------------------------------------------

/**
 * Injects localization manager into locals of current response.
 *
 * This manager is available as `res.locals.l10n` in code and as `l10n` in view
 * templates. It is bound to support locales accepted by some current client
 * unless forcing to support single locale explicitly.
 *
 * @param {AppContext} context
 * @param {string=} forceLocale locale to support explicitly, omit for supporting locales accepted by client
 */

function LocalizationContext( context, forceLocale ) {
	/*
	 * inject middleware setting up localization manager providing locales
	 * accepted in any current request's response
	 */

	context.app.use( function( req, res, next ) {
		// extract locales to use from request unless having done before or on
		// forcing use of particular locale
		if ( !forceLocale && !res.languages ) {
			res.languages = processAcceptedLanguagesOfRequest( req );
		}

		// get localization manager matching selected set of supported locales
		try {
			var l10n = Localization.getOnLocales( context, forceLocale ? [ forceLocale ] : res.languages );

			// inject manager and commonly used lookup method as locals of response
			// (so they are available in view engines automatically)
			res.locals.l10n = l10n;
			res.locals._    = l10n.$.bind( l10n );
		} catch ( error ) {
			// failed to create and inject localization manager
			// -> render warning
			console.error( "l10n missing: " + String( error.message || error || "unknown error" ) );

			// -> provide dummies not translating any string
			res.locals.l10n = { $: $dummy };
			res.locals._    = $dummy;
		}

		next()
	} );
}

/**
 * Retrieves localization context to use in context of described application.
 *
 * @param {AppContext} context
 * @param {string=} forceLocale tag of locale to use on every request
 * @returns {LocalizationContext}
 */

LocalizationContext.getOnContext = function( context, forceLocale ) {
	var cache = _contextCache,
	    i, l, l10n;

	for ( i = 0, l = cache.length; i < l; i++ ) {
		if ( cache[i][0] === context ) {
			return cache[i][1];
		}
	}

	l10n = new LocalizationContext( context, forceLocale );

	cache.push( [ context, l10n ] );

	return l10n;
};

/**
 * Exports convenient shortcut for generating LocalizationRequest instances for
 * generically internationalizing string.
 *
 * @param {string} singular text used to select entry in a found translation map, return if missing and requesting description of single item or missing to provide plural version
 * @param {string=} plural text to provide if translation is missing and translation has to describe multiple items
 * @param {number=} number number of items to be described by translation, default is 1 on omitting
 * @param {string} domain domain to check explicitly (default is "messages")
 * @returns {LocalizationRequest}
 */

LocalizationContext._ = function( singular, plural, number, domain ) {
	return new LocalizationRequest( singular, plural, number, domain );
};

LocalizationContext.prototype._ = LocalizationContext._;

// ----------------------------------------------------------------------------

/**
 * Creates internationalized text to be localized on demand in context of some
 * request.
 *
 * @param {string} singular text used to select entry in a found translation map, return if missing and requesting description of single item or missing to provide plural version
 * @param {string=} plural text to provide if translation is missing and translation has to describe multiple items
 * @param {number=} number number of items to be described by translation, default is 1 on omitting
 * @param {string} domain domain to check explicitly (default is "messages")
 * @param {string} preferredLocaleFolder pathname of folder to look first for containing matching translation
 * @constructor
 */

function LocalizationRequest( singular, plural, number, domain, preferredLocaleFolder ) {
	this.singular      = singular;
	this.plural        = plural;
	this.number        = number;
	this.domain        = domain;
	this.preferredPath = preferredLocaleFolder;
}

/**
 * Retrieves provided singular on type-casting this request to string.
 *
 * @returns {string}
 */

LocalizationRequest.prototype.toString = function() {
	return this.singular;
};

// ----------------------------------------------------------------------------

/**
 * Creates localization manager for selected sorted set of locales.
 *
 * @param {AppContext} context context of application localization is used in
 * @param {Array.<string>} locales set of locales to support in given order
 * @constructor
 */

function Localization( context, locales ) {
	this._maps    = {};
	this._locales = locales || [];

	var localeFolder = join( context.appFolder, "locale" );

	Object.defineProperty( this, "context", {
		get: function() { return context; }
	} );

	Object.defineProperty( this, "localeFolder", {
		get: function() { return localeFolder; }
	} );

}

/**
 * Fetches instances for managing selected list of locales in context of
 * described application.
 *
 * @param {Array.<string>} locales sorted set of locales to be supported
 * @returns {Localization}
 */

Localization.getOnLocales = function( context, locales ) {
	var hash, manager;

	if ( Array.isArray( locales ) ) {
		hash = locales.join( "|" );
	} else if ( locales ) {
		hash    = String( locales );
		locales = [hash];
	} else {
		throw new Error( "missing set of locales to manage" );
	}

	manager = _managerCache[hash];
	if ( !manager ) {
		manager = _managerCache[hash] = new Localization( context, locales );
	}

	return manager;
};

/**
 * Fetches list of translation maps matching selected set of domains.
 *
 * @param {string} domainName name of domain of map to retrieve
 * @param {string=} preferredPath path name of folder to preferably look for maps
 * @returns {L10nMapChain}
 * @protected
 */
Localization.prototype._getMapChain = function( domainName, preferredPath ) {
	var paths   = [this.localeFolder],
	    domains = [domainName],
	    maps    = this._maps;

	if ( domainName !== "messages" )
		domains.push( "messages" );

	if ( preferredPath )
		paths.unshift( preferredPath );

	var hash = domains.join( "|" ) + "|" + ( preferredPath ? preferredPath : "" );
	if ( hash in maps )
		return maps[hash];

	var mapChain = [];

	this._locales.some( function( locale ) {
		var i = locale.indexOf( "-" ),
		    tags = i >= 0 ? [ locale, locale.substr( 0, i ) ] : [ locale ];

		// always try loading every requested domain
		domains.forEach( function( domain ) {
			// try best path per domain, only
			paths.some( function( path ) {
				// try best locale per domain and path, only
				tags.some( function( tag ) {
					var localMap = getMap( path, tag, domain );
					if ( !localMap )
						return false;

					mapChain.push( localMap );

					return true;
				} );
			} );
		} );
	} );


	maps[domainName] = mapChain;

	return mapChain;
};

/**
 * Looks up localization setup for providing some translation for given text in
 * singular actually describing some given number of items.
 *
 * @param {string} singular text used to select entry in a found translation map, return if missing and requesting description of single item or missing to provide plural version
 * @param {string=} plural text to provide if translation is missing and translation has to describe multiple items
 * @param {number=} number number of items to be described by translation, default is 1 on omitting
 * @param {string} domain domain to check explicitly (default is "messages")
 * @param {string} preferredLocaleFolder pathname of folder to look first for containing matching translation
 * @return {string} found translation matching to describe number of items, given singular or plural on missing translation
 */
Localization.prototype.$ = function( singular, plural, number, domain, preferredLocaleFolder ) {
	if ( singular instanceof LocalizationRequest ) {
		// resolve prepared request for localizing some string
		return this.$( singular.singular, singular.plural, singular.number, singular.domain, singular.preferredPath );
	}

	if ( singular || !isNaN( parseFloat( singular ) ) ) {
		// got some lookup value -> normalize
		singular = String( singular );
	} else {
		// singular is "", undefined, null or false
		return "";
	}


	var i, l, map, mapChain = this._getMapChain( domain || "messages", preferredLocaleFolder );

	for ( i = 0, l = mapChain.length; i < l; i++ ) {
		map = mapChain[i];

		if ( singular in map ) {
			// found translation in current map
			var entry = map[singular],
			    index = map.getIndexOfNumber( number || 1 );

			if ( Array.isArray( entry ) ) {
				if ( index >= 0 && index < entry.length ) {
					return String( entry[index] );
				}

				throw new Error( "missing translation for number " + number + " on: " + singular );
			}

			if ( entry ) {
				return String( entry );
			}

			// providing falsy translation is supported to use overloading map
			// for disabling some existing translation in a fallback map
			break;
		}
	}

	// didn't find any translation in either map of chain
	// -> provide given singular (or plural if provided and number!=1)
	return number == 1 ? singular : ( plural || singular );
};
