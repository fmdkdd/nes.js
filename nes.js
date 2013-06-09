(function(global) {

	"use strict";

	document.addEventListener('DOMContentLoaded', function() {
		// loadLogTrace(function(logTrace) {
		// 	loadNESFile(function(nesRom) {
		// 		testCpu(nesRom, logTrace);
		// 	});
		// });

		loadNESFile(function(nesRom) {
			startEmulation(nesRom);
		});
	});

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

	function loadNESFile(callback) {
		var rom = document.querySelector('rom');
		fetch(rom.getAttribute('src'), function(arrayBuffer) {
			callback(decodeNES(arrayBuffer));
		})
	}

	function fetch(url, callback) {
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

}(this))
