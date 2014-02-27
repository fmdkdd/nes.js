(function(global) {

	"use strict";

	var StatusSpriteOverflow = 0;
	var StatusSprite0Hit = 1;
	var StatusVblankStarted = 2;

	var ppu = {};

	ppu.init = function() {
		this.memory = require('./memory').memory;

		this.cycle = 0;
		this.scanline = 241;
		this.cycleCount = 0;
		this.frameCount = 0;
	}

	ppu.step = function() {
		if (this.scanline == 240) {
			if (this.cycle == 1) {
				if (!this.suppressVbl) {
					this.setStatus(StatusVblankStarted);
					this.cycleCount = 0;
				}

				if (this.NmiOnVBlank == 0x1 && !this.suppressNmi) {
					cpu.requestInterrupt(InterruptNmi);
				}

				this.raster();
			}
		}

		else if (this.scanline == 260) {
			if (this.cycle == 1) {
				this.clearStatus(StatusVblankStarted);
				this.cycleCount = 0;
			} else if (this.cycle == 341) {
				this.scanline = -1;
				this.cycle = 1;
				this.frameCount++;
				return
			}
		}

		else if (this.scanline < 240 && this.scanline > -1) {
			if (this.cycle == 254) {
				if (this.showBackground)
					this.renderTileRow();

				if (this.showSprites) {
					this.evaluateScanlineSprites(this.scanline);
				}
			} else if (this.cycle == 256) {
				if (this.showBackground)
					this.updateEndScanlineRegisters();

			} else if (this.cycle == 260) {
				if (this.spritePatternAddress == 0x1 && this.backgroundPatternAddress == 0x0) {
					// Huho
					throw new Error('Not implemented');
				}
			}
		}

		else if (this.scanline == -1) {
			if (this.cycle == 1) {
				this.clearStatus(StatusSprite0Hit);
				this.clearStatus(StatusSpriteOverflow);

			} else if (this.cycle == 304) {
				if (this.showBackground || this.showSprites)
					this.vramAddress = this.vramLatch;
			}
		}

		this.cycle++;
		this.cycleCount++;

		if (this.cycle == 341) {
			this.cycle = 0;
			this.scanline++;
		}

		if (this.scanline == 261)
			this.scanline = -1;
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
		var s = this.memory.raw[0x2002];

		if (this.cycle == 1 && this.scanline == 240) {
			s &= 0x7f;
			this.suppressNmi = true;
			this.suppressVbl = true;
		} else {
			this.suppressNmi = false;
			this.suppressVbl = false;
			this.clearStatus(StatusVblankStarted);
		}

		return s;
	}

	ppu.clearStatus = function(s) {
		var current = this.memory.raw[0x2002];

		switch (s) {
		case StatusSpriteOverflow:
			current &= 0xdf;
		case StatusSprite0Hit:
			current &= 0xbf;
		case StatusVblankStarted:
			current &= 0x7f;
		}

		this.memory.raw[0x2002] = current;
	}

	global.ppu = ppu;

}(module.exports || this))
