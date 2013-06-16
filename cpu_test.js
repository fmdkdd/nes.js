(function(global) {

	"use strict";

	var utils = require('./utils');
	var toHex = utils.toHex;

	function testCpu(nesRom, logTrace) {
		var cpu = require('./cpu').makeCpu();

		cpu.memory = require('./memory').memory;
		cpu.memory.loadROM(nesRom);

		// Specific power-up state
		cpu.reset = function() {
			this.a = 0;
			this.x = 0;
			this.y = 0;
			this.p = 0x24;
			this.sp = 0xfd;

			this.pc = 0xc000;
		};

		cpu.reset();

		// At line 5003 begins extra 6502 opcodes
		var lines = 0;
		var sentinel = 5003;

		while (lines < sentinel) {
			logTrace.checkState(cpu);

			cpu.step();
			lines = logTrace.step();
		}

		console.info('All lines sucessfully emulated');

	}

	function parseLog(logText) {
		var logTrace = {};

		var lines = logText.split('\n');
		var linesIdx = 0;

		logTrace.checkState = function(cpu) {
			var line = lines[linesIdx];
			var state = parseLine(line);

			[
				[state.programCounter, cpu.pc, 'Program Counter'],
				[state.a, cpu.a, 'register A'],
				[state.x, cpu.x, 'register X'],
				[state.y, cpu.y, 'register Y'],
				[state.p, cpu.p, 'status P'],
				[state.sp, cpu.sp, 'Stack Pointer'],
			]
				.forEach(function(args) {
					try {
						assertEquals.apply(null, args);
					} catch (ex) {
						console.error(ex);
						console.error('after line:', lines[linesIdx-1]);
						throw "Test failed";
					}
				});
		};

		logTrace.step = function() {
			return ++linesIdx;
		};

		function parseLine(line) {
			var state = {};

			state.programCounter = parseInt(line.substring(0, 4), 16);
			state.a = parseInt(line.substring(50, 52), 16);
			state.x = parseInt(line.substring(55, 57), 16);
			state.y = parseInt(line.substring(60, 62), 16);
			state.p = parseInt(line.substring(65, 67), 16);
			state.sp = parseInt(line.substring(71, 73), 16);
			state.cyc = parseInt(line.substring(78, 81), 10);
			state.sl = parseInt(line.substring(85, 88), 10);

			return state;
		}

		return logTrace;
	}

	function assert(value, errorMessage) {
		if (!value)
			throw new Error(errorMessage);
	}

	function assertEquals(expected, actual, field) {
		return assert(expected === actual, 'Failed assertion on ' + field
						  + ': expected '
						  + expected + ' ($' + toHex(expected) + ')'
						  + ' got '
						  + actual + ' ($' + toHex(actual) + ')'
						 );
	}

	function fetchText(url, callback) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.onreadystatechange = function() {
			if (xhr.readyState == 4) {
				if (xhr.status <= 200) {
					console.log('Loaded ', url);
					callback(xhr.responseText);
				} else
					throw new Error("Could not load " + url);
			}
		};
		xhr.send(null);
	}

	global.testCpu = testCpu;
	global.parseLog = parseLog;

}(module.exports || this))
