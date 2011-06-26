/* Offsets into register set when read as register pairs */
var rpAF = 0;
var rpBC = 1;
var rpDE = 2;
var rpHL = 3;
var rpAF_ = 4;
var rpBC_ = 5;
var rpDE_ = 6;
var rpHL_ = 7;
var rpIX = 8;
var rpIY = 9;
var rpIR = 10;
var rpSP = 11;
var rpPC = 12;

var registerBuffer = new ArrayBuffer(26);

/* Expose registerBuffer as both register pairs and individual registers */
var regPairs = new Uint16Array(registerBuffer);
var regs = new Uint8Array(registerBuffer);

/*
Typed arrays are native-endian
(http://lists.w3.org/Archives/Public/public-script-coord/2010AprJun/0048.html, 
http://cat-in-136.blogspot.com/2011/03/javascript-typed-array-use-native.html)
so need to test endianness in order to know the offsets of individual registers
*/
regPairs[rpAF] = 0x0100;
if (regs[0] == 0x01) {
	/* big-endian */
	var rA = 0;
	var rF = 1;
	var rB = 2;
	var rC = 3;
	var rD = 4;
	var rE = 5;
	var rH = 6;
	var rL = 7;
	var rA_ = 8;
	var rF_ = 9;
	var rB_ = 10;
	var rC_ = 11;
	var rD_ = 12;
	var rE_ = 13;
	var rH_ = 14;
	var rL_ = 15;
	var rIXH = 16;
	var rIXL = 17;
	var rIYH = 18;
	var rIYL = 19;
	var rI = 20;
	var rR = 21;
} else {
	/* little-endian */
	var rF = 0;
	var rA = 1;
	var rC = 2;
	var rB = 3;
	var rE = 4;
	var rD = 5;
	var rL = 6;
	var rH = 7;
	var rF_ = 8;
	var rA_ = 9;
	var rC_ = 10;
	var rB_ = 11;
	var rE_ = 12;
	var rD_ = 13;
	var rL_ = 14;
	var rH_ = 15;
	var rIXL = 16;
	var rIXH = 17;
	var rIYL = 18;
	var rIYH = 19;
	var rR = 20;
	var rI = 21;
}

function Memory() {
	var self = {};
	var mem = new Uint8Array(0x10000);
	
	self.read = function(addr) {
		return mem[addr];
	}
	self.write = function(addr, val) {
		if (addr > 0x3fff) mem[addr] = val;
	}
	
	return self;
}
var memory = Memory();

var tstates = 0; /* number of tstates since start if this frame */

var FRAME_LENGTH = 69888;

var FLAG_C = 0x01;
var FLAG_N = 0x02;
var FLAG_P = 0x04;
var FLAG_V = 0x04;
var FLAG_3 = 0x08;
var FLAG_H = 0x10;
var FLAG_5 = 0x10;
var FLAG_Z = 0x40;
var FLAG_S = 0x80;

/* tables for setting Z80 flags */

/* Whether a half carry occurred or not can be determined by looking at
	the 3rd bit of the two arguments and the result; these are hashed
	into this table in the form r12, where r is the 3rd bit of the
	result, 1 is the 3rd bit of the 1st argument and 2 is the
	third bit of the 2nd argument; the tables differ for add and subtract
	operations */
var halfcarryAddTable = new Uint8Array([0, FLAG_H, FLAG_H, FLAG_H, 0, 0, 0, FLAG_H]);
var halfcarrySubTable = new Uint8Array([0, 0, FLAG_H, 0, FLAG_H, 0, FLAG_H, FLAG_H]);

/* Similarly, overflow can be determined by looking at the 7th bits; again
	the hash into this table is r12 */
var overflowAddTable = new Uint8Array([0, 0, 0, FLAG_V, FLAG_V, 0, 0, 0]);
var overflowSubTable = new Uint8Array([0, FLAG_V, 0, 0, 0, 0, FLAG_V, 0]);

/* Some more tables; initialised in z80InitTables() */
var sz53Table = new Uint8Array(0x100); /* The S, Z, 5 and 3 bits of the index */
var parityTable = new Uint8Array(0x100); /* The parity of the lookup value */
var sz53pTable = new Uint8Array(0x100); /* OR the above two tables together */

function z80InitTables() {
	for (var i=0; i<0x100; i++) {
		sz53Table[i] = i & ( FLAG_3 | FLAG_5 | FLAG_S );
		var j = i, parity = 0;
		for (var k=0; k<8; k++) {
			parity ^= j & 1; j >>=1;
		}
		parityTable[i]= ( parity ? 0 : FLAG_P );
		sz53pTable[i] = sz53Table[i] | parityTable[i];
	}
	
	sz53Table[0] |= FLAG_Z;
	sz53pTable[0] |= FLAG_Z;
}
z80InitTables();

/* Opcode generator functions: each returns a parameterless function that performs the opcode */
function NOP() {
	return function() {
		tstates += 4;
	}
}
function LD_RR_N(rp) {
	return function() {
		var l = memory.read(regPairs[rpPC]++);
		var h = memory.read(regPairs[rpPC]++);
		regPairs[rp] = (h<<8) | l;
		tstates += 10;
	}
}
function LD_iRRi_R(rp, r) {
	return function() {
		memory.write(regPairs[rp], regs[r]);
		tstates += 7;
	}
}
function INC_RR(rp) {
	return function() {
		regPairs[rp]++;
		tstates += 6;
	}
}
function INC_R(r) {
	return function() {
		regs[r]++;
		regs[rF] = (regs[rF] & FLAG_C) | ( regs[r] == 0x80 ? FLAG_V : 0 ) | ( regs[r] & 0x0f ? 0 : FLAG_H ) | sz53Table[regs[r]];
	}
}
function DEC_R(r) {
	return function() {
		regs[rF] = (regs[rF] & FLAG_C ) | ( regs[r] & 0x0f ? 0 : FLAG_H ) | FLAG_N;
		regs[r]--;
		regs[rF] |= (regs[r] == 0x7f ? FLAG_V : 0) | sz53Table[regs[r]];
	}
}

OPCODE_RUNNERS = {
	0x00: /* NOP */        NOP(),
	0x01: /* LD BC,nnnn */ LD_RR_N(rpBC),
	0x02: /* LD (BC),A */  LD_iRRi_R(rpBC, rA),
	0x03: /* INC BC */     INC_RR(rpBC),
	0x04: /* INC B */      INC_R(rB),
	0x05: /* DEC B */      DEC_R(rB),
	
	0x0C: /* INC C */      INC_R(rC),
	0x0D: /* DEC C */      DEC_R(rC),
	
	0x11: /* LD DE,nnnn */ LD_RR_N(rpDE),
	0x12: /* LD (DE),A */  LD_iRRi_R(rpDE, rA),
	0x13: /* INC DE */     INC_RR(rpDE),
	0x14: /* INC D */      INC_R(rD),
	0x15: /* DEC D */      DEC_R(rD),
	
	0x1C: /* INC E */      INC_R(rE),
	0x1D: /* DEC E */      DEC_R(rE),
	
	0x21: /* LD HL,nnnn */ LD_RR_N(rpHL),
	
	0x23: /* INC HL */     INC_RR(rpHL),
	0x24: /* INC H */      INC_R(rH),
	0x25: /* DEC H */      DEC_R(rH),
	
	0x2C: /* INC L */      INC_R(rL),
	0x2D: /* DEC L */      DEC_R(rL),
	
	0x31: /* LD SP,nnnn */ LD_RR_N(rpSP),
	
	0x33: /* INC SP */     INC_RR(rpSP),

	0x3C: /* INC A */      INC_R(rA),
	
	0x100: 0 /* dummy line so I don't have to keep adjusting trailing commas */
}

function runFrame() {
	while (tstates < FRAME_LENGTH) {
		var opcode = memory.read(regPairs[rpPC]++);
		OPCODE_RUNNERS[opcode]();
	}
}

runFrame();
console.log(regPairs[rpPC]);