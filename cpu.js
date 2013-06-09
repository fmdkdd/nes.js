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

	cpu.testAndSetOverflow = function(result) {
		if (result & 0x40)
			this.overflow.set();
		else
			this.overflow.clear();
	};

	cpu.testAndSetOverflowAddition = function(a, b, r) {
		if ((((a ^ b) & 0x80) == 0x0) // a and b have the same signs
			 && (((a ^ r) & 0x80) == 0x80)) // but a and r have different signs
			this.overflow.set();
		else
			this.overflow.clear();
	};

	cpu.testAndSetOverflowSubstraction = function(a, b, r) {
		if ((((a ^ b) & 0x80) != 0x0) // a and b have different signs
			 && (((a ^ r) & 0x80) != 0x0)) // and a and r have different signs
			this.overflow.set();
		else
			this.overflow.clear();
	};

	cpu.testAndSetCarryAddition = function(result) {
		if (result > 0xff)
			this.carry.set();
		else
			this.carry.clear();
	};

	cpu.testAndSetCarrySubstraction = function(result) {
		if (result >= 0)
			this.carry.set();
		else
			this.carry.clear();
	};

	cpu.step = function() {
		this.cycleCount = 0;
		var opcode = memory.read(this.pc);
		++this.pc;

		if (this.opcodes[opcode] == null) {
			throw new Error("Unknown opcode " + opcode.toString(16));
		}
		else {
			console.log(opcode.toString(16));
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

	cpu.and = function(location) {
		var value = memory.read(location);
		this.a &= value;
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
	};

	cpu.or = function(location) {
		var value = memory.read(location);
		this.a |= value;
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
	};

	cpu.eor = function(location) {
		var value = memory.read(location);
		this.a ^= value;
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
	};

	cpu.cmp = function(location, register) {
		var value = memory.read(location);
		var result = this[register] - value;
		this.testAndSetZero(result);
		this.testAndSetCarrySubstraction(result);
		this.testAndSetNegative(result);
	};

	cpu.transfer = function(from, to) {
		this[to] = this[from];

		if (to != 'sp') {
			this.testAndSetZero(this[to]);
			this.testAndSetNegative(this[to]);
		}
	};

	cpu.inc = function(register) {
		this[register]++;
		this.testAndSetZero(this[register]);
		this.testAndSetNegative(this[register]);
	}

	cpu.dec = function(register) {
		this[register]--;
		this.testAndSetZero(this[register]);
		this.testAndSetNegative(this[register]);
	}

	cpu.add = function(location) {
		var value = memory.read(location);
		var previous = this.a;
		var result = this.a + value + this.carry.get();
		this.a = result;
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
		this.testAndSetOverflowAddition(previous, value, this.a);
		this.testAndSetCarryAddition(result);
	};

	cpu.sub = function(location) {
		var value = memory.read(location);
		var previous = this.a;
		var result = this.a - value - (1 - this.carry.get());
		this.a = result;
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
		this.testAndSetOverflowSubstraction(previous, value, this.a);
		this.testAndSetCarrySubstraction(result);
	};

	cpu.jmp = function(location) {
		this.pc = location;
	};

	cpu.jsr = function(location) {
		var high = (this.pc - 1) >> 8;
		var low = this.pc - 1;

		this.pushToStack(high);
		this.pushToStack(low);

		this.pc = location;
	};

	cpu.plp = function() {
		// Not sure why we must set bit 4 but not 5
		this.p = (this.pullFromStack() | 0x30) - 0x10;
	};

	cpu.rti = function() {
		this.plp();
		this.pcl = this.pullFromStack();
		this.pch = this.pullFromStack();
	};

	cpu.rts = function() {
		this.pcl = this.pullFromStack();
		this.pch = this.pullFromStack();
		this.pc++;
	};

	cpu.pla = function() {
		var value = this.pullFromStack();
		this.a = value;
		this.testAndSetZero(value);
		this.testAndSetNegative(value);
	};

	cpu.branch = function(predicate) {
		if (predicate) {
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
	};

	cpu.pullFromStack = function() {
		this.sp++;
		return memory.read(0x100 + this.sp);
	}

	cpu.setBranchCycleCount = function(a) {
		// One more cycle if the branch goes to a new page
		if ((((this.pc - 1) & 0xff00) >> 8) != ((a & 0xff00) >> 8))
			this.cycleCount = 4;
		else
			this.cycleCount = 3;
	};

	cpu.immediateAddress = function() {
		this.pc++;
		return this.pc - 1;
	};

	cpu.absoluteAddress = function() {
		var high = memory.read(this.pc + 1);
		var low = memory.read(this.pc);
		this.pc += 2;
		return (high << 8) | low;
	};

	cpu.zeroPageAddress = function() {
		this.pc++;
		return memory.read(this.pc - 1);
	};

	cpu.relativeAddress = function() {
		var a = memory.read(this.pc);
		if (a < 0x80)
			a = a + this.pc;
		else
			a = a + (this.pc - 0x100);

		++a;

		return a;
	};

	cpu.bit = function(location) {
		var value = memory.read(location);
		var result = this.a & value;
		this.testAndSetZero(result);
		this.testAndSetNegative(value);
		this.testAndSetOverflow(value);
	}

	cpu.load = function(location, register) {
		this[register] = memory.read(location);
		this.testAndSetNegative(this[register]);
		this.testAndSetZero(this[register]);
	};

	cpu.store = function(location, register) {
		memory.write(location, this[register]);
	};

	cpu.opcodes = {
		// ~~~~~~~~~~
		// Stack

		// PHA
		0x48: function() {
			this.cycleCount = 3;
			this.pushToStack(this.a);
		},

		// PHP
		0x08: function() {
			this.cycleCount = 3;
			// PHP sets bits 4 and 5 along P
			// See http://wiki.nesdev.com/w/index.php/CPU_status_flag_behavior
			this.pushToStack(this.p | 0x30);
		},

		// PLA
		0x68: function() {
			this.cycleCount = 4;
			this.pla();
		},

		// PLP
		0x28: function() {
			this.cycleCount = 4;
			this.plp();
		},

		// ~~~~~~~~~~
		// Accumulator

		// TAX
		0xaa: function() {
			this.cycleCount = 2;
			this.transfer('a', 'x');
		},

		// TAY
		0xa8: function() {
			this.cycleCount = 2;
			this.transfer('a', 'y');
		},

		// TSX
		0xba: function() {
			this.cycleCount = 2;
			this.transfer('sp', 'x');
		},

		// TXA
		0x8a: function() {
			this.cycleCount = 2;
			this.transfer('x', 'a');
		},

		// TXS
		0x9a: function() {
			this.cycleCount = 2;
			this.transfer('x', 'sp');
		},

		// TYA
		0x98: function() {
			this.cycleCount = 2;
			this.transfer('y', 'a');
		},

		// ~~~~~~~~~~
		// Arithmetic

		// INX
		0xe8: function() {
			this.cycleCount = 2;
			this.inc('x');
		},

		// INY
		0xc8: function() {
			this.cycleCount = 2;
			this.inc('y');
		},

		// DEX
		0xca: function() {
			this.cycleCount = 2;
			this.dec('x');
		},

		// DEY
		0x88: function() {
			this.cycleCount = 2;
			this.dec('y');
		},

		// ADC
		0x69: function() {
			this.cycleCount = 2;
			this.add(this.immediateAddress());
		},

		// SBC
		0xe9: function() {
			this.cycleCount = 2;
			this.sub(this.immediateAddress());
		},

		// ~~~~~~~~~~
		// Comparison

		// BIT
		0x24: function() {
			this.cycleCount = 3;
			this.bit(this.zeroPageAddress());
		},

		// AND
		0x29: function() {
			this.cycleCount = 2;
			this.and(this.immediateAddress());
		},

		// ORA
		0x09: function() {
			this.cycleCount = 2;
			this.or(this.immediateAddress());
		},

		// EOR
		0x49: function() {
			this.cycleCount = 2;
			this.eor(this.immediateAddress());
		},

		// CMP
		0xc9: function() {
			this.cycleCount = 2;
			this.cmp(this.immediateAddress(), 'a');
		},

		// CPX
		0xe0: function() {
			this.cycleCount = 2;
			this.cmp(this.immediateAddress(), 'x');
		},

		// CPY
		0xc0: function() {
			this.cycleCount = 2;
			this.cmp(this.immediateAddress(), 'y');
		},

		// ~~~~~~~~~~
		// Interrupt

		// RTI
		0x40: function() {
			this.cycleCount = 6;
			this.rti();
		},

		// ~~~~~~~~~~
		// Sub-routines

		// JSR
		0x20: function() {
			this.cycleCount = 6;
			this.jsr(this.absoluteAddress());
		},

		// RTS
		0x60: function() {
			this.cycleCount = 6;
			this.rts();
		},

		// ~~~~~~~~~~
		// Branch

		// JMP
		0x4c: function() {
			this.cycleCount = 3;
			this.jmp(this.absoluteAddress());
		},

		// BVS
		0x70: function() {
			this.cycleCount = 2;
			this.branch(this.overflow.get());
		},

		// BVC
		0x50: function() {
			this.cycleCount = 2;
			this.branch(!this.overflow.get());
		},

		// BCS
		0xb0: function() {
			this.cycleCount = 2;
			this.branch(this.carry.get());
		},

		// BCC
		0x90: function() {
			this.cycleCount = 2;
			this.branch(!this.carry.get());
		},

		// BEQ
		0xf0: function() {
			this.cycleCount = 2;
			this.branch(this.zero.get());
		},

		// BNE
		0xd0: function() {
			this.cycleCount = 2;
			this.branch(!this.zero.get());
		},

		// BMI
		0x30: function() {
			this.cycleCount = 2;
			this.branch(this.negative.get());
		},

		// BPL
		0x10: function() {
			this.cycleCount = 2;
			this.branch(!this.negative.get());
		},

		// ~~~~~~~~~~
		// Store

		// STA
		0x85: function() {
			this.cycleCount = 3;
			this.store(this.zeroPageAddress(), 'a');
		},

		// STX
		0x86: function() {
			this.cycleCount = 3;
			this.store(this.zeroPageAddress(), 'x');
		},

		// STX
		0x8e: function() {
			this.cycleCount = 4;
			this.store(this.absoluteAddress(), 'x');
		},

		// ~~~~~~~~~~
		// Load

		// LDX
		0xa2: function() {
			this.cycleCount = 2;
			this.load(this.immediateAddress(), 'x');
		},

		// LDX
		0xae: function() {
			this.cycleCount = 4;
			this.load(this.absoluteAddress(), 'x');
		},

		// LDY
		0xa0: function() {
			this.cycleCount = 2;
			this.load(this.immediateAddress(), 'y');
		},

		// LDA
		0xa9: function() {
			this.cycleCount = 2;
			this.load(this.immediateAddress(), 'a');
		},

		// LDA
		0xad: function() {
			this.cycleCount = 4;
			this.load(this.absoluteAddress(), 'a');
		},

		// ~~~~~~~~~~
		// Flags

		// SEI
		0x78: function() {
			this.cycleCount = 2;
			this.irqDisable.set();
		},

		// SEC
		0x38: function() {
			this.cycleCount = 2;
			this.carry.set();
		},

		// CLC
		0x18: function() {
			this.cycleCount = 2;
			this.carry.clear();
		},

		// SED
		0xf8: function() {
			this.cycleCount = 2;
			this.decimalMode.set();
		},

		// CLD
		0xd8: function() {
			this.cycleCount = 2;
			this.decimalMode.clear();
		},

		// CLV
		0xb8: function() {
			this.cycleCount = 2;
			this.overflow.clear();
		},

		// NOP
		0xea: function() {
			this.cycleCount = 2;
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
				this[prop] &= 0x00ff;
				this[prop] |= value << 8;
			},
			get: function() {
				return this[prop] >> 8;
			}
		});

		Object.defineProperty(obj, propl, {
			set: function(value) {
				this[prop] &= 0xff00;
				this[prop] |= value & 0xff;
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
			return obj.p & bit;
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
