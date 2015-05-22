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


var CRYPTO  = require( "crypto" ),
	PROMISE = require( "bluebird" );



/**
 * Tries to extract salt from provided hash.
 *
 * @param {string|Buffer} hash
 * @param {?string=} format
 * @return {Promise} salt promise resolved with extracted salt (or generated salt if provided hash isn't containing salt)
 */
function getSalt( hash, format ) {
	return new PROMISE( function( resolve ) {
		// try normalizing provided hash
		if ( typeof hash === "string" ) {
			hash = new Buffer( hash, format || "base64" );
		} else if ( !Buffer.isBuffer( hash ) ) {
			if ( hash ) {
				throw new Error( "provided hash is neither string nor buffer" );
			} else {
				resolve( generateSalt() );
				return;
			}
		}

		// try extracting anything from hash that is succeeding it to be salt
		if ( hash.length > 64 ) {
			resolve( hash.slice( 64 ) );
		} else if ( hash.length < 64 ) {
			throw new Error( "invalid size of hash" );
		} else {
			resolve( generateSalt() );
		}
	} );
}

/**
 * Randomly generates 10 bytes to use as a salt.
 *
 * @returns {Buffer}
 */
function generateSalt() {
	return CRYPTO.randomBytes( 10 );
}

/**
 * Generates unsalted SHA512 hash of a given string.
 *
 * @param {string|Buffer} value string to be hashed
 * @param {?string=} format format of result, omit for default "base64" string, provide falsy value for getting hash as Buffer
 * @returns {Promise} promise resolved with hash in requested format as string or Buffer
 */
function sha512( value, format ) {
	return new PROMISE( function( resolve ) {
		var hash = CRYPTO.createHash( "sha512" );
		hash.update( value, "utf-8" );

		if ( arguments.length > 1 && !format ) {
			resolve( hash.digest() );
		} else {
			resolve( hash.digest( format || "base64" ) );
		}
	} );
}

/**
 * Generates salted SHA512 hash of a given string.
 *
 * @param {string|Buffer} value string to be hashed
 * @param {Buffer} salt Buffer containing salt to use
 * @param {?string=} format format of result, omit for default "base64" string, provide falsy value for getting hash as Buffer
 * @returns {Promise} promise resolved with hash in requested format as string or Buffer
 */
function ssha512( value, salt, format ) {
	return new PROMISE( function( resolve ) {
		if ( !Buffer.isBuffer( salt ) ) {
			if ( salt )
				throw new Error( "invalid type of salt" );

			salt = generateSalt();
		}

		var hash = CRYPTO.createHash( "sha512" );
		hash.update( value, "utf-8" );
		hash.update( salt );

		hash = Buffer.concat( [ hash.digest(), salt ] );

		if ( arguments.length > 2 && !format ) {
			resolve( hash );
		} else {
			resolve( hash.toString( format || "base64" ) );
		}
	} );
}

/**
 * Compares hash of provided value with given salted hash.
 *
 * @param {string|Buffer} value some string value to compare
 * @param {string|Buffer} saltedHash some salted hash to compare value with
 * @param {?string=} hashFormat
 * @returns {Promise} promise resolved with true if hash of value matches provided salted hash
 */
function compareWithHash( value, saltedHash, hashFormat ) {
	return getSalt( saltedHash, hashFormat )
		.then( function( salt ) {
			return ssha512( value, salt, hashFormat );
		} )
		.then( function( hash ) {
			if ( Buffer.isBuffer( hash ) ) {
				hash = hash.toString( hashFormat || "base64" );
			}

			if ( Buffer.isBuffer( saltedHash ) ) {
				saltedHash = saltedHash.toString( hashFormat || "base64" );
			}

			return hash === saltedHash;
		} );
}



module.exports = {
	getSalt: getSalt,
	sha512: sha512,
	ssha512: ssha512,
	compareWithHash: compareWithHash
};
