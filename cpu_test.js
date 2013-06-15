(function(global) {

	"use strict";

	function testCpu(nesRom, logTrace) {
		var cpu = require('./cpu').cpu;
		var ppu = require('./ppu').ppu;

		cpu.init();
		cpu.memory.loadROM(nesRom);

		cpu.reset();
		ppu.init();

		// Different power-up state
		cpu.pc = 0xc000;
		cpu.p = 0x24;

		try {
			while (true) {
				logTrace.checkState(cpu, ppu);

				var cycles = cpu.step();

				// 3 PPU cycles for each CPU cycle
				for (var i = 0; i < 3 * cycles; ++i) {
					ppu.step();
				}

				logTrace.step();
			}
		} catch (ex) {
			console.error(ex);
		}

		console.info(logTrace.passed + '/' + logTrace.total, 'lines sucessfully emulated');

	}

	function parseLog(logText) {
		var logTrace = {};

		var lines = logText.split('\n');
		var linesIdx = 0;

		logTrace.passed = 0;
		logTrace.total = 0;

		logTrace.checkState = function(cpu, ppu) {
			var line = lines[linesIdx];
			var state = parseLine(line);

			console.log(line);

			[
				[state.programCounter, cpu.pc, 'Program Counter'],
				[state.a, cpu.a, 'register A'],
				[state.x, cpu.x, 'register X'],
				[state.y, cpu.y, 'register Y'],
				[state.p, cpu.p, 'status P'],
				[state.sp, cpu.sp, 'Stack Pointer'],
				// [state.cyc, ppu.cycle, 'Cycles'],
				// [state.sl, ppu.scanline, 'Scanline'],
			]
				.forEach(function(args) {
					try {
						var result = assertEquals.apply(null, args);
						if (result)
							logTrace.passed++;
					} catch (ex) {
						console.error(ex);
					}
					logTrace.total++;
				});
		};

		logTrace.step = function() {
			linesIdx++;
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
		else
			return true;
	}

	function assertEquals(expected, actual, field) {
		return assert(expected === actual, 'Failed assertion on ' + field
						  + ': expected '
						  + expected + ' ($' + expected.toString(16) + ')'
						  + ' got '
						  + actual + ' ($' + actual.toString(16) + ')'
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
