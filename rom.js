(function(global) {

	"use strict";

	function decodeHeader(byteArray) {
		var header = {};

		header.magic = bytesAsString(byteArray.subarray(0, 4)); // 0-3: Constant $4E $45 $53 $1A ("NES" followed by MS-DOS end-of-file)
		header.prgSizeIn16KB = byteArray[4]; // 4: Size of PRG ROM in 16 KB units
		header.chrSizeIn8KB = byteArray[5];	// 5: Size of CHR ROM in 8 KB units (Value 0 means the board uses CHR RAM)
		var flags6 = byteArray[6];				// 6: Flags 6
		var flags7 = byteArray[7];				// 7: Flags 7
		header.prgSizeIn8KB = byteArray[8];	// 8: Size of PRG RAM in 8 KB units (Value 0 infers 8 KB for compatibility; see PRG RAM circuit)
		var flags9 = byteArray[9];				// 9: Flags 9
		var flags10 = byteArray[10];			// 10: Flags 10 (unofficial)
		// 11-15: Zero filled

		header.flags = {};

		// Flags 6
		//
		// 76543210
		// ||||||||
		// ||||+||+- 0xx0: vertical arrangement/horizontal mirroring (CIRAM A10 = PPU A11)
		// |||| ||   0xx1: horizontal arrangement/vertical mirroring (CIRAM A10 = PPU A10)
		// |||| ||   1xxx: four-screen VRAM
		// |||| |+-- 1: SRAM in CPU $6000-$7FFF, if present, is battery backed
		// |||| +--- 1: 512-byte trainer at $7000-$71FF (stored before PRG data)
		// ++++----- Lower nybble of mapper number

		header.flags.verticalArrangement = !!(flags6[3] & 0x0 && flags6[0] & 0x0);
		header.flags.horizontalArrangement = !!(flags6[3] & 0x0 && flags6[0] & 0x1);
		header.flags.fourScreenVRAM = !!(flags6[3] & 0x1);
		header.flags.batteryBackedSRAM = !!flags6[1];
		header.flags.trainer512 = !!flags6[2];

		// Flags 7
		//
		// 76543210
		// ||||||||
		// |||||||+- VS Unisystem
		// ||||||+-- PlayChoice-10 (8KB of Hint Screen data stored after CHR data)
		// ||||++--- If equal to 2, flags 8-15 are in NES 2.0 format
		// ++++----- Upper nybble of mapper number

		header.flags.vsUnisystem = !!flags7[0];
		header.flags.playChoice10 = !!flags7[1];
		header.flags.nes20Flags = flags7[3] & 0x1 && flags7[2] & 0x0;

		header.mapperNumber = flags7 | flags6 >> 4;

		// Flags 9
		//
		// 76543210
		// ||||||||
		// |||||||+- TV system (0: NTSC; 1: PAL)
		// +++++++-- Reserved, set to zero

		header.flags.PAL = !!flags9[0];

		// Flags 10
		//
		// 76543210
		//   ||  ||
		//   ||  ++- TV system (0: NTSC; 2: PAL; 1/3: dual compatible)
		//   |+----- SRAM in CPU $6000-$7FFF is 0: present; 1: not present
		//   +------ 0: Board has no bus conflicts; 1: Board has bus conflicts

		// skipping ...

		return header;
	}

	function decodeNES(arrayBuffer) {
		var byteArray = new Uint8Array(arrayBuffer);
		var idx = 0;

		function read(nBytes) {
			var next = idx + nBytes;
			var val = byteArray.subarray(idx, next);
			idx = next;
			return val;
		}

		// Following http://wiki.nesdev.com/w/index.php/INES

		// Header (16 bytes)
		// Trainer, if present (0 or 512 bytes)
		// PRG ROM data (16384 * x bytes)
		// CHR ROM data, if present (8192 * y bytes)
		// PlayChoice INST-ROM, if present (0 or 8192 bytes)
		// PlayChoice PROM, if present (16 bytes Data, 16 bytes CounterOut)
		// (this is often missing, see PC10 ROM-Images for details)
		// Some ROM-Images additionally contain a 128-byte (or sometimes
		// 127-byte) title at the end of the file.

		var rom = {};

		rom.header = decodeHeader(read(16));

		if (rom.header.flags.trainer512)
			rom.trainer = read(512);

		rom.prg = read(rom.header.prgSizeIn16KB * 16384);
		rom.chr = read(rom.header.chrSizeIn8KB * 8192);

		if (rom.header.flags.playChoice10)
			rom.playChoiceInstRom = read(8192);

		rom.playChoicePROM = read(32);

		rom.title = bytesAsString(read(128));

		return rom;
	}

	function bytesAsString(bytes) {
		return String.fromCharCode.apply(null, bytes);
	}

	global.decodeNES = decodeNES;

}(module.exports || this))
