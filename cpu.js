(function(global) {

	"use strict";

	var cpu = {};

	// 6502 registers

	// PC: Program counter (16-bit)
	addUint16(cpu, 'pc', 'pch', 'pcl');

	// S: Stack pointer
	addUint8(cpu, 'sp');

	// P: Processor status
	addUint8(cpu, 'p');

	// A: Accumulator
	addUint8(cpu, 'a');

	// X: index register X
	addUint8(cpu, 'x');

	// Y: index register Y
	addUint8(cpu, 'y');

	// Keep track of how many cycles the current opcode eats,
	// for synchronizing with APU and PPU
	cpu.cycleCount = 0;

	// CPU Status flag P
	//
	// 7654 3210
	// ||   ||||
	// ||   |||+- C: 1 if last addition or shift resulted in a carry, or if
	// ||   |||   last subtraction resulted in no borrow
	// ||   ||+-- Z: 1 if last operation resulted in a 0 value
	// ||   |+--- I: Interrupt priority level
	// ||   |     (0: /IRQ and /NMI get through; 1: only /NMI gets through)
	// ||   +---- D: 1 to make ADC and SBC use binary-coded decimal arithmetic
	// ||         (ignored on second-source 6502 like that in the NES)
	// |+-------- V: 1 if last ADC or SBC resulted in signed overflow,
	// |          or D6 from last BIT
	// +--------- N: Set to bit 7 of the last operation

	addFlag(cpu, 'carry', 0);
	addFlag(cpu, 'zero', 1);
	addFlag(cpu, 'irqDisable', 2);
	addFlag(cpu, 'decimalMode', 3);
	addFlag(cpu, 'overflow', 6);
	addFlag(cpu, 'negative', 7);

	cpu.testAndSetNegative = function(val) {
		if (val & 0x80)
			this.negative.set();
		else
			this.negative.clear();
	};

	cpu.testAndSetZero = function(val) {
		if (val == 0x0)
			this.zero.set();
		else
			this.zero.clear();
	};

	cpu.testAndSetCarryAddition = function(result) {
		if (result > 0xff)
			this.carry.set();
		else
			this.carry.clear();
	};

	cpu.testAndSetCarrySubstraction = function(result) {
		if (result < 0x00)
			this.carry.clear();
		else
			this.carry.set();
	};

	cpu.step = function() {
		this.cycleCount = 0;
		var opcode = memory.read(this.pc);
		++this.pc;

		if (this.opcodes[opcode] == null) {
			throw new Error("Unknown opcode " + opcode.toString(16));
		}
		else {
			this.opcodes[opcode].call(this);
		}

		return this.cycleCount;
	};

	cpu.reset = function() {
		this.a = 0;
		this.x = 0;
		this.y = 0;
		this.p = 0x34;
		this.sp = 0xfd;

		this.pch = memory.read(0xfffd);
		this.pcl = memory.read(0xfffc);
	};

	cpu.jmp = function(location) {
		this.pc = location;
	};

	cpu.jsr = function(location) {
		var high = (this.pc - 1) >> 8;
		var low = (this.pc - 1) & 0xff;

		this.pushToStack(high);
		this.pushToStack(low);

		this.pc = location;
	};

	cpu.bpl = function() {
		if (!this.negative.get()) {
			var a = this.relativeAddress();
			this.setBranchCycleCount(a);
			this.pc = a;
		} else {
			++this.pc;
		}
	};

	cpu.pushToStack = function(value) {
		memory.write(0x100 + this.sp, value);
		this.sp--;
	}

	cpu.setBranchCycleCount = function(a) {
		if (((this.pc - 1) & 0xff00 >> 8) != ((a & 0xff00) >> 8))
			this.cycleCount = 4;
		else
			this.cycleCount = 3;
	};

	cpu.immediateAddress = function() {
		this.pc++;
		return this.pc - 1;
	}

	cpu.absoluteAddress = function() {
		var high = memory.read(this.pc + 1);
		var low = memory.read(this.pc);
		this.pc += 2;
		return (high << 8) | low;
	};

	cpu.zeroPageAddress = function() {
		this.pc++;
		return memory.read(this.pc - 1);
	}

	cpu.relativeAddress = function() {
		var a = memory.read(this.pc);
		if (a < 0x80)
			a = a + this.pc;
		else
			a = a + (this.pc - 0x100);

		++a;

		return a;
	};

	cpu.lda = function(location) {
		this.a = memory.read(location);
		this.testAndSetNegative(this.a);
		this.testAndSetZero(this.a);
	};

	cpu.ldx = function(location) {
		this.x = memory.read(location);
		this.testAndSetNegative(this.x);
		this.testAndSetZero(this.x);
	};

	cpu.stx = function(location) {
		memory.write(location, this.x);
	};

	cpu.opcodes = {
		// BPL
		0x10: function() {
			this.cycleCount = 2;
			this.bpl();
		},

		// JSR
		0x20: function() {
			this.cycleCount = 6;
			this.jsr(this.absoluteAddress());
		},

		// JMP
		0x4c: function() {
			this.cycleCount = 3;
			this.jmp(this.absoluteAddress());
		},

		// SEI
		0x78: function() {
			this.cycleCount = 2;
			this.p = this.p | 0x4;
		},

		// STX
		0x86: function() {
			this.cycleCount = 3;
			this.stx(this.zeroPageAddress());
		},

		0xa2: function() {
			this.cycleCount = 2;
			this.ldx(this.immediateAddress());
		},

		// LDA
		0xad: function() {
			this.cycleCount = 4;
			this.lda(this.absoluteAddress());
		},

		// CLD
		0xd8: function() {
			this.cycleCount = 2;
			this.p = this.p & 0xf7;
		},
	};

	function addIntType(obj, prop, intType) {
		var _prop = '_' + prop;

		obj[_prop] = new intType(1);

		Object.defineProperty(obj, prop, {
			get: function() {
				return this[_prop][0];
			},
			set: function(value) {
				this[_prop][0] = value;
				return this[_prop][0];
			}
		});
	}

	// Low-level utils

	function addUint8(obj, prop) {
		addIntType(obj, prop, Uint8Array);
	};

	function addUint16(obj, prop, proph, propl) {
		addIntType(obj, prop, Uint16Array);

		Object.defineProperty(obj, proph, {
			set: function(value) {
				this[prop] = this[prop] | (value << 8);
			},
			get: function() {
				return this[prop] >> 8;
			}
		});

		Object.defineProperty(obj, propl, {
			set: function(value) {
				this[prop] = this[prop] | (value & 0xff);
			},
			get: function() {
				return this[prop] & 0xff;
			}
		});
	};

	function addFlag(obj, name, bit) {
		var bit = 1 << bit;
		var notBit = 0xff ^ bit;

		obj[name] = {};

		obj[name].get = function() {
			return !!(this.p & bit);
		};

		obj[name].set = function() {
			obj.p = obj.p | bit;
		};

		obj[name].clear = function() {
			obj.p = obj.p & notBit;
		};
	};

	global.cpu = cpu;

}(this))
