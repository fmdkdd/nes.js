(function(global) {

	"use strict";

	var memory = {
		raw: new Uint8Array(0x10000),

		read: function(addr) {
			// 2KB RAM and mirrors
			if (addr < 0x2000) {
				addr = addr % 0x800;
				return this.raw[addr];
			}

			// NES PPU registers and mirrors
			else if (addr < 0x4000) {
				addr = addr % 0x8;
				return ppu.registerRead(0x2000 + addr);
			}

			// NES APU and I/O Registers
			else if (addr < 0x4020) {
				return this.raw[addr];
			}

			// Cartridge mapping
			else if (addr < 0xffff) {
				return this.raw[addr];
			}

			else {
				throw new Error("Out of bounds read at " + addr);
			}
		},

		write: function(addr, val) {
			// 2KB RAM and mirrors
			if (addr < 0x2000) {
				addr = addr % 0x800;
				return this.raw[addr] = val;
			}

			// NES PPU registers and mirrors
			else if (addr < 0x4000) {
				addr = addr % 0x8;
				return ppu.registerWrite(0x2000 + addr, val);
			}

			// NES APU and I/O Registers
			else if (addr < 0x4020) {
				return this.raw[addr] = val;
			}

			// Cartridge mapping
			else if (addr < 0xffff) {
				return this.raw[addr] = val;
			}

			else {
				throw new Error("Out of bounds write at " + addr.toString(16));
			}
		},

		loadROM: function(nesRom) {
			this.raw.set(nesRom.prg, 0x8000);
			this.raw.set(nesRom.prg, 0xc000);
		}
	};

	global.memory = memory;

}(this))
