(function(global) {

	"use strict";

	global.bit = function(n) {
		return 1 << n;
	};

	global.toHex = function(value) {
		return value.toString(16);
	};

	global.toByte = function(value) {
		return value & 0xff;
	};

	global.toWord = function(value) {
		return value & 0xffff;
	};

	global.lowPart = function(word) {
		return word & 0x00ff;
	};

	global.highPart = function(word) {
		return word & 0xff00;
	};

	global.toLow = function(byte) {
		return byte >> 8;
	};

	global.toHigh = function(byte) {
		return byte << 8;
	};

}(module.exports || this))
