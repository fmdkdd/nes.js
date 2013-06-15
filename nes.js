(function(global) {

	"use strict";

	function startEmulation(nesRom) {
		var cpu = global.cpu;
		cpu.memory = global.memory;

		cpu.memory.loadROM(nesRom);

		var running = true;
		var totalCycleCount = 0;
		var cycleLimit = 100;

		cpu.reset();

		while (running) {
			var cycles = cpu.step();
			totalCycleCount += cycles;

			if (totalCycleCount > cycleLimit) {
				throw new Error("Cycle limit exceeded");
			}
		}
	}

	function fetchBinary(url, callback) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = "arraybuffer";
		xhr.onreadystatechange = function() {
			if (xhr.readyState == 4) {
				if (xhr.status <= 200) {
					console.log('Loaded ', url);
					callback(xhr.response);
				} else
					throw new Error("Could not load " + url);
			}
		};
		xhr.send(null);
	}

	global.startEmulation = startEmulation;
	global.fetchBinary = fetchBinary;

}(module.exports || this))
