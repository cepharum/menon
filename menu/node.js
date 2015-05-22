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

var PROMISE = require( "bluebird" ),
	TESTSET = require( "./testset" ),
	URL     = require( "../util/url" ),
	CONTEXT = require( "../context" ),
	resolve = PROMISE.resolve,
	isUrl   = URL.isUrl;

// ----------------------------------------------------------------------------

module.exports = MenuNode;

// ----------------------------------------------------------------------------

function $nop() { return {}; }

// ----------------------------------------------------------------------------

/**
 * Creates menu (item) with optionally provided label and related target's URL.
 *
 * @param {string|LocalizationRequest} label label of menu (item)
 * @param {UrlDescriptor} url target URL of menu node
 * @param {int} sorting positional number of item in set of sibling items
 * @constructor
 */

function MenuNode( label, url, sorting ) {
	var _items = [];
	var _label = label || "";   // label might be instance of L10N.LocalizationRequest
	var _url = url || null;
	var _condition = null;
	var _personalization = null;
	var _context = null;
	var _sorting = isNaN( sorting ) ? 0 : +sorting;


	Object.defineProperties( this, {
		/**
		 * Manages text to label menu (item).
		 *
		 * @property {string|LocalizationRequest} Menu#label
		 */
		label: {
			get: function() { return _label; },
			set: function( label ) { _label = label; }
		},

		/**
		 * Manages URL menu node is referencing.
		 *
		 * @property {UrlDescriptor} Menu#url
		 */
		url: {
			get: function() { return _url; },
			set: function( url ) {
				if ( !isUrl( url ) )
					throw new Error( "invalid URL" );

				_url = url;
			}
		},

		/**
		 * Refers application context current item belongs to.
		 *
		 * @note Context must not be assigned multiple times.
		 * @note Context is required for some item to adopt subordinated items.
		 *
		 * @property {AppContext} Menu#context
		 */
		context: {
			get: function() { return _context; },
			set: function( context ) {
				if ( _context )
					throw new Error( "item has been associated with application before" );

				_context = context;
			}
		},

		/**
		 * Manages chain of tests to perform for deciding if current item is to
		 * be included in output of a particular response.
		 *
		 * @property {MenuTestSet} Menu#condition
		 */
		condition: {
			get: function() {
				if ( !_condition ) {
					if ( !_context )
						throw new Error( "item requires context for assigning tests" );

					_condition = new TESTSET( _context );
				}

				return _condition;
			}
		},

		/**
		 *
		 */
		sorting: {
			get: function() { return _sorting; }
		},

		/**
		 * Stores callback to invoke for personalizing this entry whenver it is
		 * described using describeOnRequest.
		 *
		 * @property {function(this:MenuNode,IncomingMessage,ServerResponse):object} Menu#personalization
		 */
		personalization: {
			get: function() { return _personalization ? _personalization : $nop },
			set: function( callback ) {
				if ( typeof callback === "function" ) {
					_personalization = callback;
				} else if ( callback ) {
					throw new Error( "invalid callback to be personalization of menu item" );
				} else {
					_personalization = $nop;
				}
			}
		},

		/**
		 * Lists items subordinated to current menu (item).
		 *
		 * @property {Array.<MenuNode>} Menu#items
		 */
		items: {
			get: function() { return _items; }
		}
	} );
}

MenuNode.createOnPath = function( label, path, query, sorting ) {
	var url = URL.create( path, query );

	return new MenuNode( label, url, sorting );
};

MenuNode.createOnUrl = function( label, url, sorting ) {
	return new MenuNode( label, url, sorting );
};

MenuNode.prototype.equals = function( item ) {
	var thisUrl = this.url,
	    itemUrl = item.url;

	// TODO This test most probably fails on comparing module-relative URLs ... find better default test!
	return ( thisUrl && itemUrl && thisUrl.path == itemUrl.path );
};

/**
 * Converts some existing menu definition into simple description of that menu
 * in context of a given pair of request and response.
 *
 * @typedef {{level:int,label:string,url:string,selected:boolean=,descendant:int=,trail:int=,items:Array.<MenuNodeDescription>}} MenuNodeDescription
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {int=} level internally used on recursively generating menus for numbering levels
 * @returns {Promise<MenuNodeDescription>} description of menu in context of provided request/response
 */

MenuNode.prototype.describeOnRequest = function( req, res, level ) {
	var self = this;

	return resolve( this.personalization.call( this, req, res ) || {} )
		.then( function( personalized ) {
			var locals = res.locals,
			    l10n   = locals.l10n,
			    meta,
			    out = {
				    level: level || 1
			    };

			if ( l10n )
				out.label = l10n.$( personalized.label || self.label );
			else
				out.label = String( personalized.label || self.label );

			if ( isUrl( personalized.url ) ) {
				meta = personalized.url.qualify( req, res );
			} else if ( isUrl( self.url ) ) {
				meta = self.url.qualify( req, res );
			} else {
				meta = false;
			}

			if ( meta ) {
				out.url = URL.format( meta );

				// check state of item in context of current request
				if ( locals.compareWithCurrentUri ) {
					var relation = locals.compareWithCurrentUri( meta.path, meta.query );

					if ( relation === 0 )
						out.selected = true;
					else if ( relation > 0 )
						out.descendant = relation;
					else if ( relation < 0 )
						out.trail = -relation;
				}
			}

			// include processing all subordinated items
			return resolve( personalized.items || self.items )
				.map( function( item ) {
					return resolve( item.condition.run( req, res ) )
						.then( function( include ) {
							return include ? item.describeOnRequest( req, res, out.level + 1 ) : false;
						} );
				} )
				.filter( function( item ) {
					return !!item;
				} )
				.then( function( items ) {
					out.items = items;

					return out;
				} );
		} );
};

function $simpleCheck( existingItem, newItem ) {
	return existingItem.equals( newItem );
}

/**
 * Adds item to current menu.
 *
 * @param {function} fn callback used for testing if item exists already
 * @param {MenuNode} item item to be added to current menu
 * @param {...TestDefinition} condition test conditions to set on added item
 * @returns {MenuNode} current menu
 */

MenuNode.prototype.addItem = function( fn, item, condition ) {
	var args  = [].slice.call( arguments ),
	    start = 2, i, l,
		items = this.items;

	if ( fn instanceof MenuNode ) {
		item = fn;
		fn = $simpleCheck;
		start = 1;
	}

	if ( !( item instanceof MenuNode ) )
		throw new Error( "invalid menu item" );

	// check if item exists, already
	for ( i = 0, l = items.length; i < l; i++ ) {
		if ( fn( items[i], item ) ) {
			// item exists -> don't add again
			return this;
		}
	}

	// make subordinated item adopting current one's application context
	var context = this.context;
	if ( !context )
		throw new Error( "current item misses application context for adopting contained items" );

	item.context = context;

	if ( args.length > start ) {
		item.setCondition.apply( item, args.slice( start ) );
	}

	// subordinate item and resort contained items afterwards
	items.push( item );
	items.sort( function( l, r ) {
		return l.sorting - r.sorting;
	} );

	return this;
};

/**
 * Adds conditions to item for deciding whether to include it on displaying
 * containing menu as part of a particular response to some request.
 *
 * Every argument to this method is giving another condition to test. Every
 * argument is either
 *
 * * name of an instance method of MenuTestSet,
 * * function matching signature MenuTestFunction for custom test or
 * * an array starting with either of the two and some additional arguments to
 *   pass into test function
 *
 * @examples
 *
 *     item.setCondition( "isAdministrator", function( req, res ) { ... } );
 *
 * This is adding two tests: one testing user to be administrator, second function implementing custom test.
 *
 *     item.setCondition( [ "requireRole", "administrator", "manager", "editor" ] );
 *
 * This case is adding single test invoking MenuTestSet#requireRole() with three
 * additional arguments.
 *
 *     item.setCondition( [ function( req, res, flag, data ) { ... }, true, { test: "me" } ] );
 *
 * This case is adding custom test taking two additional arguments as provided.
 *
 * @typedef {string|MenuTestFunction|[string,...*]|[MenuTestFunction,...*]} TestDefinition
 * @param {context=} context application context to assign prior to assigning conditions
 * @param {...TestDefinition} test
 * @returns {MenuNode} current menu item
 */

MenuNode.prototype.setCondition = function( context, test ) {
	var condition,
	    i = 0,
	    l = arguments.length, c, f;


	if ( CONTEXT.isApplicationContext( context ) ) {
		this.context = context;
		i++;
	}


	condition = this.condition;

	for ( ; i < l; i++ ) {
		c = arguments[i];

		switch ( typeof c ) {
			case "string" :
			case "function" :
				c = [ c ];
				break;
		}

		if ( Array.isArray( c ) ) {
			switch ( typeof c[0] ) {
				case "string" :
					f = condition[c.shift()];
					if ( typeof f === "function" ) {
						f.apply( condition, c );
					} else {
						// don't skip but throw exception below
						c = null;
					}
					break;

				case "function" :
					condition.addTest.apply( condition, c );
					break;

				default :
					// don't skip but throw exception below
					c = null;
			}

			if ( c )
				continue;
		}

		throw new Error( "invalid condition" );
	}

	return this;
};

/**
 * Assigns callback to invoke per item on describing menu to personalize every
 * item according to current request.
 *
 * The callback is invoked on request for describing menu in context of some
 * request/response. On invocation request and response are passed as arguments.
 * The callback's `this` is pointing at current menu item on invocation. The
 * method is considered to return object with properties overlaying properties
 * of item to use on describing it.
 *
 * @param {function(this:MenuNode,IncomingMessage,ServerResponse):object} callback
 * @returns {MenuNode} current menu
 */

MenuNode.prototype.setPersonalization = function( callback ) {
	this.personalization = callback;

	return this;
};
