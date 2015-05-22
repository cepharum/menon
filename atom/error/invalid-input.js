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

module.exports = InvalidInputError;

// --- private implementation ---

function InvalidInputError() {
	var tmp = Error.apply( this, arguments );
	tmp.name = this.name = "InvalidInputError";

	this.message = tmp.message;
	Error.captureStackTrace && Error.captureStackTrace( this, this.constructor );

	if ( !this.message || !this.message.length ) {
		this.message = require( "../../l10n" )._("provided input is invalid");
	}

	/**
	 * @type {Instance}
	 */
	this.item = null;

	/**
	 * @type {Object.<string,*>}
	 */
	this.input = null;

	/**
	 * @type {Array.<ValidationErrorItem>}
	 */
	this.validationErrors = [];

	/**
	 * @type {ServerResponse}
	 */
	this.response = null;
}

require( "util" ).inherits( InvalidInputError, Error );


InvalidInputError.prototype.assignItem = function( item ) {
	this.item = item;

	return this;
};

InvalidInputError.prototype.assignInput = function( input ) {
	this.input = input;

	return this;
};

InvalidInputError.prototype.assignValidationError = function( error ) {
	this.validationErrors = error.validationErrors || error.errors || [];

	return this;
};

InvalidInputError.prototype.assignResponse = function( response ) {
	this.response = response;

	return this;
};

InvalidInputError.prototype.getErrorByName = function( name ) {
	var items = this.validationErrors, i, l;

	for ( i = 0, l = items.length; i < l; i++ )
		if ( items[i].path == name )
			return items[i].message || "unspecified error";

	return false;
};

InvalidInputError.prototype.toString = function() {
	return this.response ? this.response.locals.l10n.$( this.message ) : String( this.message );
};

InvalidInputError.prototype.errors = function() {
	return this.validationErrors || [];
};

InvalidInputError.onProperty = function( name, message, value, type ) {
	var error = new InvalidInputError();

	error.validationErrors = [ {
		message: message || "Provided input is invalid.",
		type: type || {},
		path: name || "",
		value: value
	} ];

	return error;
};
