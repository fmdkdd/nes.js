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

	cpu.testAndSetCarry = function(result) {
		if (result == 0x1)
			this.carry.set();
		else
			this.carry.clear();
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

	cpu.init = function() {
		this.memory = require('./memory').memory;
		this.memory.init();
	};

	cpu.step = function() {
		this.cycleCount = 0;
		var opcode = this.memory.read(this.pc);
		++this.pc;

		if (this.opcodes.extra[opcode]) {
			this.pc += this.opcodes.extra[opcode];
			console.log("Skipping extra opcode", opcode.toString(16));
		}

		else if (this.opcodes[opcode] == null) {
			console.log("Unknown opcode " + opcode.toString(16));
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

		this.pch = this.memory.read(0xfffd);
		this.pcl = this.memory.read(0xfffc);
	};

	cpu.and = function(location) {
		var value = this.memory.read(location);
		this.a &= value;
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
	};

	cpu.or = function(location) {
		var value = this.memory.read(location);
		this.a |= value;
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
	};

	cpu.eor = function(location) {
		var value = this.memory.read(location);
		this.a ^= value;
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
	};

	cpu.cmp = function(location, register) {
		var value = this.memory.read(location);
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
	};

	cpu.incm = function(location) {
		var result = this.memory.read(location);

		result = (result + 1) & 0xff;

		this.testAndSetZero(result);
		this.testAndSetNegative(result);

		this.memory.write(location, result);
	};

	cpu.dec = function(register) {
		this[register]--;

		this.testAndSetZero(this[register]);
		this.testAndSetNegative(this[register]);
	};

	cpu.decm = function(location) {
		var result = this.memory.read(location);

		result = (result - 1) & 0xff;

		this.testAndSetZero(result);
		this.testAndSetNegative(result);

		this.memory.write(location, result);
	};

	cpu.add = function(location) {
		var value = this.memory.read(location);
		var previous = this.a;
		var result = this.a + value + this.carry.get();
		this.a = result;
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
		this.testAndSetOverflowAddition(previous, value, this.a);
		this.testAndSetCarryAddition(result);
	};

	cpu.sub = function(location) {
		var value = this.memory.read(location);
		var previous = this.a;
		var result = this.a - value - (1 - this.carry.get());
		this.a = result;
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
		this.testAndSetOverflowSubstraction(previous, value, this.a);
		this.testAndSetCarrySubstraction(result);
	};

	cpu.asla = function() {
		var b = (this.a & 0x80) >> 7;
		this.a <<= 1;

		this.testAndSetCarry(b);
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
	};

	cpu.aslm = function(location) {
		var result = this.memory.read(location);

		var b = (result & 0x80) >> 7;
		result = (result << 1) & 0xff;

		this.testAndSetCarry(b);
		this.testAndSetZero(result);
		this.testAndSetNegative(result);

		this.memory.write(location, result);
	};

	cpu.lsra = function() {
		var b = this.a & 0x1;
		this.a >>= 1;

		this.testAndSetCarry(b);
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
	};

	cpu.lsrm = function(location) {
		var result = this.memory.read(location);

		var b = result & 0x1;
		result >>= 1;

		this.testAndSetCarry(b);
		this.testAndSetZero(result);
		this.testAndSetNegative(result);

		this.memory.write(location, result);
	};

	cpu.rola = function() {
		var b = (this.a & 0x80) >> 7;
		this.a <<= 1;
		this.a |= this.carry.get();

		this.testAndSetCarry(b);
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
	};

	cpu.rolm = function(location) {
		var result = this.memory.read(location);

		var b = (this.a & 0x80) >> 7;
		result = (result << 1) & 0xff;
		result |= this.carry.get();

		this.testAndSetCarry(b);
		this.testAndSetZero(result);
		this.testAndSetNegative(result);

		this.memory.write(location, result);
	};

	cpu.rora = function() {
		var b = this.a & 0x1;
		this.a >>= 1;
		this.a |= this.carry.get() << 7;

		this.testAndSetCarry(b);
		this.testAndSetZero(this.a);
		this.testAndSetNegative(this.a);
	};

	cpu.rorm = function(location) {
		var result = this.memory.read(location);

		var b = result & 0x1;
		result >>= 1;
		result |= this.carry.get() << 7;

		this.testAndSetCarry(b);
		this.testAndSetZero(result);
		this.testAndSetNegative(result);

		this.memory.write(location, result);
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
		this.memory.write(0x100 + this.sp, value);
		this.sp--;
	};

	cpu.pullFromStack = function() {
		this.sp++;
		return this.memory.read(0x100 + this.sp);
	}

	cpu.setBranchCycleCount = function(a) {
		// One more cycle if the branch goes to a new page
		if ((((this.pc - 1) & 0xff00) >> 8) != ((a & 0xff00) >> 8))
			this.cycleCount = 4;
		else
			this.cycleCount = 3;
	};

	cpu.immediateAddress = function() {
		return this.pc++;
	};

	cpu.absoluteAddress = function() {
		var high = this.memory.read(this.pc + 1);
		var low = this.memory.read(this.pc);
		this.pc += 2;
		return (high << 8) | low;
	};

	cpu.absoluteXAddress = function() {
		//FIXME: Account for additional cycle if crossing page

		var high = this.memory.read(this.pc + 1);
		var low = this.memory.read(this.pc);
		this.pc += 2;

		var a = (high << 8) | low;
		a = (a + this.x) & 0xffff;

		return a;
	};

	cpu.absoluteYAddress = function() {
		//FIXME: Account for additional cycle if crossing page

		var high = this.memory.read(this.pc + 1);
		var low = this.memory.read(this.pc);
		this.pc += 2;

		var a = (high << 8) | low;
		a = (a + this.y) & 0xffff;

		return a;
	};

	cpu.indirectAddress = function() {
		var high = this.memory.read(this.pc + 1);
		var low = this.memory.read(this.pc);
		this.pc += 2;

		var a = (high << 8) | low;

		// The original 6502 does not cross page boundary when fetching
		// the new address.
		var a1 = (high << 8) | ((low + 1) & 0xff);

		high = this.memory.read(a1);
		low = this.memory.read(a);

		a = (high << 8) | low;

		return a;
	};

	cpu.indirectXAddress = function() {
		var a = this.memory.read(this.pc++);
		a = (a + this.x) & 0xff;

		var high = this.memory.read((a + 1) & 0xff);
		var low = this.memory.read(a);

		return (high << 8) | low;
	};

	cpu.indirectYAddress = function() {
		//FIXME: Account for additional cycle if crossing page

		var a = this.memory.read(this.pc++);

		var high = this.memory.read((a + 1) & 0xff);
		var low = this.memory.read(a);

		a = (high << 8) | low;

		a = (a + this.y) & 0xffff;

		return a;
	};

	cpu.zeroPageAddress = function() {
		return this.memory.read(this.pc++);
	};

	cpu.zeroPageXAddress = function() {
		var a = (this.memory.read(this.pc) + this.x) & 0xff;
		this.pc++;
		return a;
	};

	cpu.zeroPageYAddress = function() {
		var a = (this.memory.read(this.pc) + this.y) & 0xff;
		this.pc++;
		return a;
	};

	cpu.relativeAddress = function() {
		var a = this.memory.read(this.pc);
		if (a < 0x80)
			a = a + this.pc;
		else
			a = a + (this.pc - 0x100);

		++a;

		return a;
	};

	cpu.bit = function(location) {
		var value = this.memory.read(location);
		var result = this.a & value;
		this.testAndSetZero(result);
		this.testAndSetNegative(value);
		this.testAndSetOverflow(value);
	}

	cpu.load = function(location, register) {
		this[register] = this.memory.read(location);
		this.testAndSetNegative(this[register]);
		this.testAndSetZero(this[register]);
	};

	cpu.store = function(location, register) {
		this.memory.write(location, this[register]);
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

		// INC
		0xe6: function() {
			this.cycleCount = 5;
			this.incm(this.zeroPageAddress());
		},

		0xf6: function() {
			this.cycleCount = 6;
			this.incm(this.zeroPageXAddress());
		},

		0xee: function() {
			this.cycleCount = 6;
			this.incm(this.absoluteAddress());
		},

		0xfe: function() {
			this.cycleCount = 7;
			this.incm(this.absoluteXAddress());
		},

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

		// DEC
		0xc6: function() {
			this.cycleCount = 5;
			this.decm(this.zeroPageAddress());
		},

		0xd6: function() {
			this.cycleCount = 6;
			this.decm(this.zeroPageXAddress());
		},

		0xce: function() {
			this.cycleCount = 6;
			this.decm(this.absoluteAddress());
		},

		0xde: function() {
			this.cycleCount = 7;
			this.decm(this.absoluteXAddress());
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

		0x65: function() {
			this.cycleCount = 3;
			this.add(this.zeroPageAddress());
		},

		0x75: function() {
			this.cycleCount = 4;
			this.add(this.zeroPageXAddress());
		},

		0x6d: function() {
			this.cycleCount = 4;
			this.add(this.absoluteAddress());
		},

		0x7d: function() {
			this.cycleCount = 4;
			this.add(this.absoluteXAddress());
		},

		0x79: function() {
			this.cycleCount = 4;
			this.add(this.absoluteYAddress());
		},

		0x61: function() {
			this.cycleCount = 6;
			this.add(this.indirectXAddress());
		},

		0x71: function() {
			this.cycleCount = 5;
			this.add(this.indirectYAddress());
		},

		// SBC
		0xe9: function() {
			this.cycleCount = 2;
			this.sub(this.immediateAddress());
		},

		0xe5: function() {
			this.cycleCount = 3;
			this.sub(this.zeroPageAddress());
		},

		0xf5: function() {
			this.cycleCount = 4;
			this.sub(this.zeroPageXAddress());
		},

		0xed: function() {
			this.cycleCount = 4;
			this.sub(this.absoluteAddress());
		},

		0xfd: function() {
			this.cycleCount = 4;
			this.sub(this.absoluteXAddress());
		},

		0xf9: function() {
			this.cycleCount = 4;
			this.sub(this.absoluteYAddress());
		},

		0xe1: function() {
			this.cycleCount = 6;
			this.sub(this.indirectXAddress());
		},

		0xf1: function() {
			this.cycleCount = 5;
			this.sub(this.indirectYAddress());
		},

		// LSR
		0x4a: function() {
			this.cycleCount = 2;
			this.lsra();
		},

		0x46: function() {
			this.cycleCount = 5;
			this.lsrm(this.zeroPageAddress());
		},

		0x56: function() {
			this.cycleCount = 6;
			this.lsrm(this.zeroPageXAddress());
		},

		0x4e: function() {
			this.cycleCount = 6;
			this.lsrm(this.absoluteAddress());
		},

		0x5e: function() {
			this.cycleCount = 7;
			this.lsrm(this.absoluteXAddress());
		},

		// ASL
		0x0a: function() {
			this.cycleCount = 2;
			this.asla();
		},

		0x06: function() {
			this.cycleCount = 5;
			this.aslm(this.zeroPageAddress());
		},

		0x16: function() {
			this.cycleCount = 6;
			this.aslm(this.zeroPageXAddress());
		},

		0x0e: function() {
			this.cycleCount = 6;
			this.aslm(this.absoluteAddress());
		},

		0x1e: function() {
			this.cycleCount = 7;
			this.aslm(this.absoluteXAddress());
		},

		// ROL
		0x2a: function() {
			this.cycleCount = 2;
			this.rola();
		},

		0x26: function() {
			this.cycleCount = 5;
			this.rolm(this.zeroPageAddress());
		},

		0x36: function() {
			this.cycleCount = 6;
			this.rolm(this.zeroPageXAddress());
		},

		0x2e: function() {
			this.cycleCount = 6;
			this.rolm(this.absoluteAddress());
		},

		0x3e: function() {
			this.cycleCount = 7;
			this.rolm(this.absoluteXAddress());
		},

		// ROR
		0x6a: function() {
			this.cycleCount = 2;
			this.rora();
		},

		0x66: function() {
			this.cycleCount = 5;
			this.rorm(this.zeroPageAddress());
		},

		0x76: function() {
			this.cycleCount = 6;
			this.rorm(this.zeroPageXAddress());
		},

		0x6e: function() {
			this.cycleCount = 6;
			this.rorm(this.absoluteAddress());
		},

		0x7e: function() {
			this.cycleCount = 7;
			this.rorm(this.absoluteXAddress());
		},

		// ~~~~~~~~~~
		// Comparison

		// BIT
		0x24: function() {
			this.cycleCount = 3;
			this.bit(this.zeroPageAddress());
		},

		0x2c: function() {
			this.cycleCount = 4;
			this.bit(this.absoluteAddress());
		},

		// AND
		0x29: function() {
			this.cycleCount = 2;
			this.and(this.immediateAddress());
		},

		0x25: function() {
			this.cycleCount = 3;
			this.and(this.zeroPageAddress());
		},

		0x35: function() {
			this.cycleCount = 4;
			this.and(this.zeroPageXAddress());
		},

		0x2d: function() {
			this.cycleCount = 4;
			this.and(this.absoluteAddress());
		},

		0x3d: function() {
			this.cycleCount = 4;
			this.and(this.absoluteXAddress());
		},

		0x39: function() {
			this.cycleCount = 4;
			this.and(this.absoluteYAddress());
		},

		0x21: function() {
			this.cycleCount = 6;
			this.and(this.indirectXAddress());
		},

		0x31: function() {
			this.cycleCount = 5;
			this.and(this.indirectYAddress());
		},

		// ORA
		0x09: function() {
			this.cycleCount = 2;
			this.or(this.immediateAddress());
		},

		0x05: function() {
			this.cycleCount = 3;
			this.or(this.zeroPageAddress());
		},

		0x15: function() {
			this.cycleCount = 4;
			this.or(this.zeroPageXAddress());
		},

		0x0d: function() {
			this.cycleCount = 4;
			this.or(this.absoluteAddress());
		},

		0x1d: function() {
			this.cycleCount = 4;
			this.or(this.absoluteXAddress());
		},

		0x19: function() {
			this.cycleCount = 4;
			this.or(this.absoluteYAddress());
		},

		0x01: function() {
			this.cycleCount = 6;
			this.or(this.indirectXAddress());
		},

		0x11: function() {
			this.cycleCount = 5;
			this.or(this.indirectYAddress());
		},

		// EOR
		0x49: function() {
			this.cycleCount = 2;
			this.eor(this.immediateAddress());
		},

		0x45: function() {
			this.cycleCount = 3;
			this.eor(this.zeroPageAddress());
		},

		0x55: function() {
			this.cycleCount = 4;
			this.eor(this.zeroPageXAddress());
		},

		0x4d: function() {
			this.cycleCount = 4;
			this.eor(this.absoluteAddress());
		},

		0x5d: function() {
			this.cycleCount = 4;
			this.eor(this.absoluteXAddress());
		},

		0x59: function() {
			this.cycleCount = 4;
			this.eor(this.absoluteYAddress());
		},

		0x41: function() {
			this.cycleCount = 6;
			this.eor(this.indirectXAddress());
		},

		0x51: function() {
			this.cycleCount = 5;
			this.eor(this.indirectYAddress());
		},

		// CMP
		0xc9: function() {
			this.cycleCount = 2;
			this.cmp(this.immediateAddress(), 'a');
		},

		0xc5: function() {
			this.cycleCount = 3;
			this.cmp(this.zeroPageAddress(), 'a');
		},

		0xd5: function() {
			this.cycleCount = 4;
			this.cmp(this.zeroPageXAddress(), 'a');
		},

		0xcd: function() {
			this.cycleCount = 4;
			this.cmp(this.absoluteAddress(), 'a');
		},

		0xdd: function() {
			this.cycleCount = 4;
			this.cmp(this.absoluteXAddress(), 'a');
		},

		0xd9: function() {
			this.cycleCount = 4;
			this.cmp(this.absoluteYAddress(), 'a');
		},

		0xc1: function() {
			this.cycleCount = 6;
			this.cmp(this.indirectXAddress(), 'a');
		},

		0xd1: function() {
			this.cycleCount = 5;
			this.cmp(this.indirectYAddress(), 'a');
		},

		// CPX
		0xe0: function() {
			this.cycleCount = 2;
			this.cmp(this.immediateAddress(), 'x');
		},

		0xe4: function() {
			this.cycleCount = 3;
			this.cmp(this.zeroPageAddress(), 'x');
		},

		0xec: function() {
			this.cycleCount = 4;
			this.cmp(this.absoluteAddress(), 'x');
		},

		// CPY
		0xc0: function() {
			this.cycleCount = 2;
			this.cmp(this.immediateAddress(), 'y');
		},

		0xc4: function() {
			this.cycleCount = 3;
			this.cmp(this.zeroPageAddress(), 'y');
		},

		0xcc: function() {
			this.cycleCount = 4;
			this.cmp(this.absoluteAddress(), 'y');
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

		0x6c: function() {
			this.cycleCount = 5;
			this.jmp(this.indirectAddress());
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

		0x95: function() {
			this.cycleCount = 4;
			this.store(this.zeroPageXAddress(), 'a');
		},

		0x8d: function() {
			this.cycleCount = 4;
			this.store(this.absoluteAddress(), 'a');
		},

		0x9d: function() {
			this.cycleCount = 5;
			this.store(this.absoluteXAddress(), 'a');
		},

		0x99: function() {
			this.cycleCount = 5;
			this.store(this.absoluteYAddress(), 'a');
		},

		0x81: function() {
			this.cycleCount = 6;
			this.store(this.indirectXAddress(), 'a');
		},

		0x91: function() {
			this.cycleCount = 5;
			this.store(this.indirectYAddress(), 'a');
		},

		// STY
		0x84: function() {
			this.cycleCount = 3;
			this.store(this.zeroPageAddress(), 'y');
		},

		0x94: function() {
			this.cycleCount = 4;
			this.store(this.zeroPageXAddress(), 'y');
		},

		0x8c: function() {
			this.cycleCount = 4;
			this.store(this.absoluteAddress(), 'y');
		},

		// STX
		0x86: function() {
			this.cycleCount = 3;
			this.store(this.zeroPageAddress(), 'x');
		},

		0x96: function() {
			this.cycleCount = 4;
			this.store(this.zeroPageYAddress(), 'x');
		},

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

		0xa6: function() {
			this.cycleCount = 3;
			this.load(this.zeroPageAddress(), 'x');
		},

		0xb6: function() {
			this.cycleCount = 4;
			this.load(this.zeroPageYAddress(), 'x');
		},

		0xae: function() {
			this.cycleCount = 4;
			this.load(this.absoluteAddress(), 'x');
		},

		0xbe: function() {
			this.cycleCount = 4;
			this.load(this.absoluteYAddress(), 'x');
		},

		// LDY
		0xa0: function() {
			this.cycleCount = 2;
			this.load(this.immediateAddress(), 'y');
		},

		0xa4: function() {
			this.cycleCount = 3;
			this.load(this.zeroPageAddress(), 'y');
		},

		0xb4: function() {
			this.cycleCount = 4;
			this.load(this.zeroPageXAddress(), 'y');
		},

		0xac: function() {
			this.cycleCount = 4;
			this.load(this.absoluteAddress(), 'y');
		},

		0xbc: function() {
			this.cycleCount = 4;
			this.load(this.absoluteXAddress(), 'y');
		},

		// LDA
		0xa9: function() {
			this.cycleCount = 2;
			this.load(this.immediateAddress(), 'a');
		},

		0xa5: function() {
			this.cycleCount = 3;
			this.load(this.zeroPageAddress(), 'a');
		},

		0xb5: function() {
			this.cycleCount = 4;
			this.load(this.zeroPageXAddress(), 'a');
		},

		0xad: function() {
			this.cycleCount = 4;
			this.load(this.absoluteAddress(), 'a');
		},

		0xbd: function() {
			this.cycleCount = 4;
			this.load(this.absoluteXAddress(), 'a');
		},

		0xb9: function() {
			this.cycleCount = 4;
			this.load(this.absoluteYAddress(), 'a');
		},

		0xa1: function() {
			this.cycleCount = 6;
			this.load(this.indirectXAddress(), 'a');
		},

		0xb1: function() {
			this.cycleCount = 5;
			this.load(this.indirectYAddress(), 'a');
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

		// Extra opcodes, with the number of bytes to skip
		extra: {
			// NOP
			0x1a: 0,
			0x3a: 0,
			0x5a: 0,
			0x7a: 0,
			0xda: 0,
			0xfa: 0,

			// SKB
			0x80: 1,
			0x82: 1,
			0xc2: 1,
			0xe2: 1,

			0x04: 1,
			0x14: 1,
			0x34: 1,
			0x44: 1,
			0x54: 1,
			0x64: 1,
			0x74: 1,
			0xd4: 1,
			0xf4: 1,

			// SKW
			0x0c: 2,
			0x1c: 2,
			0x3c: 2,
			0x5c: 2,
			0x7c: 2,
			0xdc: 2,
			0xfc: 2,
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

}(module.exports || this))
