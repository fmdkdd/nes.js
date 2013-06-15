var fs = require('fs');

var rom = require('./rom');

function emulate(nesRomPath) {
	var nes = require('./nes');
	nes.startEmulation(rom.decodeNES(fs.readFileSync(nesRomPath)));
}

function testCpuAsync() {
	var cpu_test = require('./cpu_test');
	var testRom = rom.decodeNES(fs.readFileSync('roms/nestest.nes'));
	var logTrace = cpu_test.parseLog(fs.readFileSync('roms/nestest.log', 'utf8'));
	cpu_test.testCpu(testRom, logTrace);
}

testCpuAsync();
