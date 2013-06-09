(function(global) {

	var StatusSpriteOverflow = 0;
	var StatusSprite0Hit = 1;
	var StatusVblankStarted = 2;

	var ppu = {};

	ppu.init = function() {
		this.cycle = 0;
		this.scanline = 241;
		this.cycleCount = 0;
	}

	ppu.step = function() {
		if (this.cycle == 341) {
			this.cycle = 0;
			this.scanline++;
		}

		this.cycle++;
		this.cycleCount++;
	}

	ppu.registerRead = function(address) {
		switch (address & 0x7) {
		case 0x2: return this.readStatus();
		case 0x4: return this.readOamData();
		case 0x7: return this.readData();
		}

		return 0;
	}

	ppu.registerWrite = function(address, value) {
		switch (address & 0x7) {
		case 0x0: this.writeControl(value);
		case 0x1: this.writeMask(value);
		case 0x3: this.writeOamAddress(value);
		case 0x4: this.writeOamData(value);
		case 0x5: this.writeScroll(value);
		case 0x6: this.writeAddress(value);
		case 0x7: this.writeData(value);
		}

		if (address == 0x4014)
			this.writeDma(value);
	}

	ppu.readStatus = function() {
		this.writeLatch = true;

		if (this.cycle == 1 && this.scanline == 240) {
			memory.raw[0x2002] &= 0x7f;
			this.suppressNmi = true;
			this.suppressVbl = true;
		} else {
			this.suppressNmi = false;
			this.suppressVbl = false;
			this.clearStatus(StatusVblankStarted);
		}
	}

	ppu.clearStatus = function(s) {
		switch (s) {
		case StatusSpriteOverflow:
			memory.raw[0x2002] &= 0xdf;
		case StatusSprite0Hit:
			memory.raw[0x2002] &= 0xbf;
		case StatusVblankStarted:
			memory.raw[0x2002] &= 0x7f;
		}

	}

	global.ppu = ppu;

}(this))
