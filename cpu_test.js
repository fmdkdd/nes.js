(function(global) {

	function testCpu(nesRom, logTrace) {
		var cpu = global.cpu;
		var ppu = global.ppu;
		cpu.memory = global.memory;

		cpu.memory.loadROM(nesRom);

		cpu.reset();
		ppu.init();

		// Different power-up state
		cpu.pc = 0xc000;
		cpu.p = 0x24;

		while (true) {
			logTrace.checkState(cpu, ppu);

			var cycles = cpu.step();
			logTrace.step();

			// 3 PPU cycles for each CPU cycle
			for (var i = 0; i < 3 * cycles; ++i) {
				ppu.step();
			}
		}

	}

	function parseLog(logText) {
		var logTrace = {};

		var lines = logText.split('\n');
		var linesIdx = 0;

		logTrace.checkState = function(cpu, ppu) {
			var state = parseLine(lines[linesIdx]);

			assertEquals(state.programCounter, cpu.pc, 'Program Counter');
			assertEquals(state.a, cpu.a, 'register A');
			assertEquals(state.x, cpu.x, 'register X');
			assertEquals(state.y, cpu.y, 'register Y');
			assertEquals(state.p, cpu.p, 'status P');
			assertEquals(state.sp, cpu.sp, 'Stack Pointer');
			assertEquals(state.cyc, ppu.cycle, 'Cycles');
			assertEquals(state.sl, ppu.scanline, 'Scanline');
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
		assert(expected === actual, 'Failed assertion on ' + field
				 + ': '
				 + expected + ' ($' + expected.toString(16) + ')'
				 + ' === '
				 + actual + ' ($' + actual.toString(16) + ')'
				);
	}

	function loadLogTrace(callback) {
		var log = document.querySelector('log');
		fetch(log.getAttribute('src'), function(text) {
			callback(parseLog(text));
		})
	}

	function fetch(url, callback) {
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
	global.loadLogTrace = loadLogTrace;

}(this))
