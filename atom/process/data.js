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

module.exports = {
	deepClone: deepClone,
	deepCompare: deepCompare,
	deepMerge: deepMerge
};

// ----------------------------------------------------------------------------

/**
 * Compares two object instances.
 *
 * This comparing of object basically tries to check whether either object is
 * containing some own properties missing in opposite object. Due to enumerating
 * properties of left object first, the term `left>right` is true as soon as one
 * property of left object is missing in right one. Term `left<right` is true as
 * soon as left object is containing inherited property that is available as own
 * property in right object. Same applies if enumerating own properties of right
 * object is detecting property missing in left one.
 *
 * If a particular property is owned by either object its value is checked. If
 * either value of property is object while property of opposite object is not,
 * then object with property of type object is considered larger than the other.
 * If neither value is object, they are compared evaluating `left.p>right.p`. If
 * both values are objects the method descends into comparing those two objects.
 *
 * @note Provided parameters aren't tested to by objects, actually. Thus this
 *       method fails on providing non-objects.
 *
 * @param {{}} left left side of binary term comparing two objects
 * @param {{}} right right side of binary term comparing two objects
 * @returns {int} -1 if `left<right`, 1 if `left>right`, 0 if neither applies
 */
function deepCompare( left, right ) {
	var props = Object.keys( left ), i, l, prop, state, subl, subr;

	for ( i = 0, l = props.length; i < l; i++ ) {
		prop = props[i];

		state  = left.hasOwnProperty( prop ) ? 1 : 0;
		state += right.hasOwnProperty( prop ) ? 2 : 0;

		switch ( state ) {
			case 0 :
				// this property isn't owned by either one (but some inherited
				// property on the left and maybe missing on the right)
				break;
			case 1 :
				// property exists in left, only
				// -> left is considered larger than right
				return 1;
			case 2 :
				// property exists in right, only (it is inherited on the left)
				// -> left is considered smaller than right
				return -1;
			case 3 :
				// property exists on either side
				// -> compare according to their types of values
				subl = left[prop];
				subr = right[prop];

				state  = typeof subl === "object" ? 1 : 0;
				state += typeof subr === "object" ? 2 : 0;

				switch ( state ) {
					case 0 :
						// neither property can be compared more deeply
						if ( subl != subr ) {
							return subl > subr ? 1 : -1;
						}
						break;
					case 1 :
						// object to the left of comparison, but non-object to its right
						// -> left is considered larger than right
						return 1;
					case 2 :
						// non-object to the left of comparison, but object to its right
						// -> left is considered smaller than right
						return -1;
					case 3 :
						// objects on either side
						// -> compare them in detail
						state = deepCompare( subl, subr );
						if ( state != 0 ) {
							return state;
						}
						break;
				}
		}
	}

	props = Object.keys( right );

	for ( i = 0, l = props.length; i < l; i++ ) {
		prop = props[i];

		if ( right.hasOwnProperty( prop ) && !left.hasOwnProperty( prop ) ) {
			return -1;
		}
	}

	return 0;
}

/**
 * Deeply clones some provided object.
 *
 * @note This method does not check for circular references, thus don't try
 *       clone data like DOM nodes or similar this way.
 *
 * By providing single name of top-level property or a set of such names as
 * array in parameter propertiesToKeep cloning is reduced to actually process
 * those properties of provided source object, only.
 *
 * @note This selection of properties to be cloned is limited to top-level
 *       properties.
 *
 * @param {{}} source object to clone
 * @param {(string|Array.<string>)=} propertiesToKeep names of top-level properties to clone (while excluding all others)
 * @returns {{}} clone of provided object
 */
function deepClone( source, propertiesToKeep ) {
	"use strict";

	var copy = {},
	    keepIt = function() { return true; };

	if ( propertiesToKeep && !Array.isArray( propertiesToKeep ) ) {
		propertiesToKeep = [ propertiesToKeep ];
	}

	if ( Array.isArray( propertiesToKeep ) ) {
		keepIt = function( n ) {
			"use strict";

			return ( propertiesToKeep.indexOf( n ) >= 0 );
		};
	}

	Object.keys( source ).forEach( function( name ) {
		"use strict";

		if ( keepIt( name ) ) {
			var value = source[name];

			if ( typeof value === "object" && value ) {
				copy[name] = deepClone( value );
			} else {
				copy[name] = value;
			}
		}
	} );

	return copy;
}

/**
 * Deeply merges provided source object with properties given in overlay object.
 *
 * @param {{}} source object to be adjusted (due to passing by reference modifications affect provided source, indeed)
 * @param {{}} overlay object providing properties describing modifications to source
 * @returns {{}} adjusted object (is referencing any provided object)
 */
function deepMerge( source, overlay ) {
	"use strict";

	if ( !source || typeof source !== "object" ) {
		source = {};
	}

	Object.keys( overlay ).forEach( function( name ) {
		"use strict";

		var value = overlay[name];

		switch ( typeof value ) {
			case "undefined" :
				// value is undefined -> delete described property
				delete source[name];
				break;

			case "object" :
				if ( value ) {
					source[name] = deepMerge( source[name], value );
				} else {
					// value is null -> delete described property
					delete source[name];
				}
				break;

			default :
				source[name] = value;
		}
	} );

	return source;
}

/**
 * Merges clones of shallow properties of objects given as 2nd and any further
 * argument to this
 *
 * @param {object} target object actually extended
 * @returns {object} object provided in target
 */
function merge( target ) {
	[].slice.call( arguments, 1 ).forEach( function( overlay ) {
		if ( typeof overlay === "object" )
			Object.keys( overlay ).forEach( function( name ) {
				target[name] = deepClone( overlay[name] );
			} );
	} );

	return target;
}
