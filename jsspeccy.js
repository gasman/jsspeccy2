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

function Memory(use48k) {
	var self = {};
	
	var ramPages = [];
	for (var i = 0; i < 8; i++) {
		ramPages[i] = new Uint8Array(0x3fff);
	}
	
	var scratch = new Uint8Array(0x3fff);
	
	var readSlots = [
		use48k ? roms['48.rom'] : roms['128-0.rom'],
		ramPages[5],
		ramPages[2],
		ramPages[0]
	]
	var writeSlots = [
		scratch,
		ramPages[5],
		ramPages[2],
		ramPages[0]
	]
	
	self.read = function(addr) {
		var page = readSlots[addr >> 14];
		return page[addr & 0x3fff];
	}
	self.write = function(addr, val) {
		var page = writeSlots[addr >> 14];
		page[addr & 0x3fff] = val;
	}
	
	var screenPage = ramPages[5];
	self.readScreen = function(addr) {
		return screenPage[addr];
	}
	
	self.setPaging = function(val) {
		readSlots[3] = writeSlots[3] = ramPages[val & 0x07];
		readSlots[0] = (val & 0x10) ? roms['128-1.rom'] : roms['128-0.rom'];
		screenPage = (val & 0x08) ? ramPages[7] : ramPages[5];
	}
	
	return self;
}
var memory = Memory();

function IOBus() {
	var self = {};
	
	self.read = function(addr) {
		var result = 0xff;
		if ((addr & 0x0001) == 0x0000) {
			/* read keyboard */
			result = 0xff;
			for (var row = 0; row < 8; row++) {
				if (!(addr & (1 << (row+8)))) { /* bit held low, so scan this row */
					result &= keyStates[row];
				}
			}
		}
		return result;
	}
	self.write = function(addr, val) {
		if (!(addr & 0x01)) {
			display.setBorder(val & 0x07);
		}
		if (!(addr & 0x8002)) {
			memory.setPaging(val);
		}
	}
	
	return self;
}
var ioBus = IOBus();

var tstates = 0; /* number of tstates since start if this frame */
var iff1 = 0, iff2 = 0, im = 0, halted = false;

var FRAME_LENGTH = 69888;

function Display() {
	var self = {};
	
	var palette = new Uint8Array([
		/* dark */
		0x00, 0x00, 0x00, 0xff,
		0x00, 0x00, 0xc0, 0xff,
		0xc0, 0x00, 0x00, 0xff,
		0xc0, 0x00, 0xc0, 0xff,
		0x00, 0xc0, 0x00, 0xff,
		0x00, 0xc0, 0xc0, 0xff,
		0xc0, 0xc0, 0x00, 0xff,
		0xc0, 0xc0, 0xc0, 0xff,
		
		/* bright */
		0x00, 0x00, 0x00, 0xff,
		0x00, 0x00, 0xff, 0xff,
		0xff, 0x00, 0x00, 0xff,
		0xff, 0x00, 0xff, 0xff,
		0x00, 0xff, 0x00, 0xff,
		0x00, 0xff, 0xff, 0xff,
		0xff, 0xff, 0x00, 0xff,
		0xff, 0xff, 0xff, 0xff,
	])
	
	var TSTATES_PER_SCANLINE = 228;
	var LEFT_BORDER_CHARS = 4;
	var RIGHT_BORDER_CHARS = 4;
	var TOP_BORDER_LINES = 24;
	var BOTTOM_BORDER_LINES = 24;
	var TSTATES_UNTIL_ORIGIN = 14000;
	var TSTATES_PER_CHAR = 4;
	
	var BEAM_X_MAX = (32 + RIGHT_BORDER_CHARS);
	var BEAM_Y_MAX = (192 + BOTTOM_BORDER_LINES);
	
	var CANVAS_WIDTH = 256 + 8 * (LEFT_BORDER_CHARS + RIGHT_BORDER_CHARS);
	var CANVAS_HEIGHT = 192 + TOP_BORDER_LINES + BOTTOM_BORDER_LINES;
	
	var canvas, ctx, imageData, pixels;
	
	self.init = function() {
		canvas = document.createElement('canvas');
		canvas.width = CANVAS_WIDTH;
		canvas.height = CANVAS_HEIGHT;
		document.body.appendChild(canvas);
		ctx = canvas.getContext('2d');
		imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
		pixels = imageData.data;
	}
	
	var borderColour = 7;
	self.setBorder = function(val) {
		borderColour = val;
	}
	
	var beamX, beamY; /* X character pos and Y pixel pos of beam at next screen event,
		relative to top left of non-border screen; negative / overlarge values are in the border */
	
	var pixelLineAddress; /* Address (relative to start of memory page) of the first screen byte in the current line */
	var attributeLineAddress; /* Address (relative to start of memory page) of the first attribute byte in the current line */
	var imageDataPos; /* offset into imageData buffer of current draw position */
	var currentLineStartTime;
	
	var flashPhase = 0;
	
	self.startFrame = function() {
		self.nextEventTime = currentLineStartTime = TSTATES_UNTIL_ORIGIN - (TOP_BORDER_LINES * TSTATES_PER_SCANLINE) - (LEFT_BORDER_CHARS * TSTATES_PER_CHAR);
		beamX = -LEFT_BORDER_CHARS;
		beamY = -TOP_BORDER_LINES;
		pixelLineAddress = 0x0000;
		attributeLineAddress = 0x1800;
		imageDataPos = 0;
		flashPhase = (flashPhase + 1) & 0x1f; /* FLASH has a period of 32 frames (16 on, 16 off) */
	}
	
	self.doEvent = function() {
		if (beamY < 0 | beamY >= 192 | beamX < 0 | beamX >= 32) {
			/* border */
			var p = borderColour << 2;
			for (var i = 0; i < 8; i++) {
				pixels[imageDataPos++] = palette[p];
				pixels[imageDataPos++] = palette[p+1];
				pixels[imageDataPos++] = palette[p+2];
				pixels[imageDataPos++] = 0xff;
			}
			//console.log(self.nextEventTime, beamX, beamY, '= border');
		} else {
			/* main screen area */
			var pixelByte = memory.readScreen( pixelLineAddress | beamX );
			var attributeByte = memory.readScreen( attributeLineAddress | beamX );
			
			if ( (attributeByte & 0x80) && (flashPhase & 0x10) ) {
				/* FLASH: invert ink / paper */
				var ink = (attributeByte & 0x78) >> 1;
				var paper = ( (attributeByte & 0x07) << 2 ) | ( (attributeByte & 0x40) >> 1 );
			} else {
				var ink = ( (attributeByte & 0x07) << 2 ) | ( (attributeByte & 0x40) >> 1 );
				var paper = (attributeByte & 0x78) >> 1;
			}
			
			for (var b = 0x80; b; b >>= 1) {
				if (pixelByte & b) {
					pixels[imageDataPos++] = palette[ink];
					pixels[imageDataPos++] = palette[ink+1];
					pixels[imageDataPos++] = palette[ink+2];
					pixels[imageDataPos++] = 0xff;
				} else {
					pixels[imageDataPos++] = palette[paper];
					pixels[imageDataPos++] = palette[paper+1];
					pixels[imageDataPos++] = palette[paper+2];
					pixels[imageDataPos++] = 0xff;
				}
			}
			
			//console.log(self.nextEventTime, beamX, beamY, '= screen', pixelLineAddress | beamX, attributeLineAddress | beamX);
		}
		
		/* increment beam / nextEventTime for next event */
		beamX++;
		if (beamX < BEAM_X_MAX) {
			self.nextEventTime += TSTATES_PER_CHAR;
		} else {
			beamX = -LEFT_BORDER_CHARS;
			beamY++;
			
			if (beamY >= 0 && beamY < 192) {
				/* pixel address = 0 0 0 y7 y6 y2 y1 y0 | y5 y4 y3 x4 x3 x2 x1 x0 */
				pixelLineAddress = ( (beamY & 0xc0) << 5 ) | ( (beamY & 0x07) << 8 ) | ( (beamY & 0x38) << 2 );
				/* attribute address = 0 0 0 1 1 0 y7 y6 | y5 y4 y3 x4 x3 x2 x1 x0 */
				attributeLineAddress = 0x1800 | ( (beamY & 0xf8) << 2 );
			}
			
			if (beamY < BEAM_Y_MAX) {
				currentLineStartTime += TSTATES_PER_SCANLINE;
				self.nextEventTime = currentLineStartTime;
			} else {
				self.nextEventTime = null;
			}
		}
	}
	
	self.endFrame = function() {
		ctx.putImageData(imageData, 0, 0);
	}
	
	return self;
}
var display = Display();

var keyStates = [];
for (var row = 0; row < 8; row++) {
	keyStates[row] = 0xff;
}

function keyDown(evt) {
	console.log(evt.keyCode);
	registerKeyDown(evt.keyCode);
	if (!evt.metaKey) return false;
}
function registerKeyDown(keyNum) {
	var keyCode = keyCodes[keyNum];
	if (keyCode == null) return;
	keyStates[keyCode.row] &= ~(keyCode.mask);
	if (keyCode.caps) keyStates[0] &= 0xfe;
}
function keyUp(evt) {
	registerKeyUp(evt.keyCode);
	if (!evt.metaKey) return false;
}
function registerKeyUp(keyNum) {
	var keyCode = keyCodes[keyNum];
	if (keyCode == null) return;
	keyStates[keyCode.row] |= keyCode.mask;
	if (keyCode.caps) keyStates[0] |= 0x01;
}
function keyPress(evt) {
	if (!evt.metaKey) return false;
}

var keyCodes = {
	49: {row: 3, mask: 0x01}, /* 1 */
	50: {row: 3, mask: 0x02}, /* 2 */
	51: {row: 3, mask: 0x04}, /* 3 */
	52: {row: 3, mask: 0x08}, /* 4 */
	53: {row: 3, mask: 0x10}, /* 5 */
	54: {row: 4, mask: 0x10}, /* 6 */
	55: {row: 4, mask: 0x08}, /* 7 */
	56: {row: 4, mask: 0x04}, /* 8 */
	57: {row: 4, mask: 0x02}, /* 9 */
	48: {row: 4, mask: 0x01}, /* 0 */

	81: {row: 2, mask: 0x01}, /* Q */
	87: {row: 2, mask: 0x02}, /* W */
	69: {row: 2, mask: 0x04}, /* E */
	82: {row: 2, mask: 0x08}, /* R */
	84: {row: 2, mask: 0x10}, /* T */
	89: {row: 5, mask: 0x10}, /* Y */
	85: {row: 5, mask: 0x08}, /* U */
	73: {row: 5, mask: 0x04}, /* I */
	79: {row: 5, mask: 0x02}, /* O */
	80: {row: 5, mask: 0x01}, /* P */

	65: {row: 1, mask: 0x01}, /* A */
	83: {row: 1, mask: 0x02}, /* S */
	68: {row: 1, mask: 0x04}, /* D */
	70: {row: 1, mask: 0x08}, /* F */
	71: {row: 1, mask: 0x10}, /* G */
	72: {row: 6, mask: 0x10}, /* H */
	74: {row: 6, mask: 0x08}, /* J */
	75: {row: 6, mask: 0x04}, /* K */
	76: {row: 6, mask: 0x02}, /* L */
	13: {row: 6, mask: 0x01}, /* enter */

	16: {row: 0, mask: 0x01}, /* caps */
	192: {row: 0, mask: 0x01}, /* backtick as caps - because firefox screws up a load of key codes when pressing shift */
	90: {row: 0, mask: 0x02}, /* Z */
	88: {row: 0, mask: 0x04}, /* X */
	67: {row: 0, mask: 0x08}, /* C */
	86: {row: 0, mask: 0x10}, /* V */
	66: {row: 7, mask: 0x10}, /* B */
	78: {row: 7, mask: 0x08}, /* N */
	77: {row: 7, mask: 0x04}, /* M */
	17: {row: 7, mask: 0x02}, /* sym - gah, firefox screws up ctrl+key too */
	32: {row: 7, mask: 0x01}, /* space */
	
	/* shifted combinations */
	8: {row: 4, mask: 0x01, caps: true}, /* backspace => caps + 0 */
	37: {row: 3, mask: 0x10, caps: true}, /* left arrow => caps + 5 */
	38: {row: 4, mask: 0x08, caps: true}, /* up arrow => caps + 7 */
	39: {row: 4, mask: 0x04, caps: true}, /* right arrow => caps + 8 */
	40: {row: 4, mask: 0x10, caps: true}, /* down arrow => caps + 6 */
	
	999: null
};

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

/* Opcode generator functions: each returns a parameterless function that performs the opcode
	(apart from the ones prefixed by DDCBnn, which are passed the offset nn (converted to a signed byte)).
*/
function ADC_A_iHLi() {
	return function() {
		var val = memory.read(regPairs[rpHL]);
		var adctemp = regs[rA] + val + (regs[rF] & FLAG_C);
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (adctemp & 0x88) >> 1 );
		regs[rA] = adctemp;
		regs[rF] = ( adctemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 4;
	}
}
function ADC_A_N() {
	return function() {
		var val = memory.read(regPairs[rpPC]++);
		var adctemp = regs[rA] + val + (regs[rF] & FLAG_C);
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (adctemp & 0x88) >> 1 );
		regs[rA] = adctemp;
		regs[rF] = ( adctemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 4;
	}
}
function ADC_A_R(r) {
	return function() {
		var adctemp = regs[rA] + regs[r] + (regs[rF] & FLAG_C);
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (regs[r] & 0x88) >> 2 ) | ( (adctemp & 0x88) >> 1 );
		regs[rA] = adctemp;
		regs[rF] = ( adctemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 4;
	}
}
function ADD_A_iHLi() {
	return function() {
		var val = memory.read(regPairs[rpHL]);
		var addtemp = regs[rA] + val;
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (addtemp & 0x88) >> 1 );
		regs[rA] = addtemp;
		regs[rF] = ( addtemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 7;
	}
}
function ADD_A_iRRpNNi(rp) {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var addr = (regPairs[rp] + offset) & 0xffff;
		
		var val = memory.read(addr);
		var addtemp = regs[rA] + val;
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (addtemp & 0x88) >> 1 );
		regs[rA] = addtemp;
		regs[rF] = ( addtemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 19;
	}
}
function ADD_A_N(r) {
	return function() {
		var val = memory.read(regPairs[rpPC]++);
		var addtemp = regs[rA] + val;
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (addtemp & 0x88) >> 1 );
		regs[rA] = addtemp;
		regs[rF] = ( addtemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 7;
	}
}
function ADD_A_R(r) {
	return function() {
		var addtemp = regs[rA] + regs[r];
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (regs[r] & 0x88) >> 2 ) | ( (addtemp & 0x88) >> 1 );
		regs[rA] = addtemp;
		regs[rF] = ( addtemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 4;
	}
}
function ADD_RR_RR(rp1, rp2) {
	var tstatesToAdd = (rp1 == rpHL ? 11 : 15);
	return function() {
		var add16temp = regPairs[rp1] + regPairs[rp2];
		var lookup = ( (regPairs[rp1] & 0x0800) >> 11 ) | ( (regPairs[rp2] & 0x0800) >> 10 ) | ( (add16temp & 0x0800) >>  9 );
		regPairs[rp1] = add16temp;
		regs[rF] = ( regs[rF] & ( FLAG_V | FLAG_Z | FLAG_S ) ) | ( add16temp & 0x10000 ? FLAG_C : 0 ) | ( ( add16temp >> 8 ) & ( FLAG_3 | FLAG_5 ) ) | halfcarryAddTable[lookup];
		tstates += tstatesToAdd;
	}
}
function AND_iHLi() {
	return function() {
		var val = memory.read(regPairs[rpHL]);
		regs[rA] &= val;
		regs[rF] = FLAG_H | sz53pTable[regs[rA]];
		tstates += 7;
	}
}
function AND_N() {
	return function() {
		var val = memory.read(regPairs[rpPC]++);
		regs[rA] &= val;
		regs[rF] = FLAG_H | sz53pTable[regs[rA]];
		tstates += 7;
	}
}
function AND_R(r) {
	return function() {
		regs[rA] &= regs[r];
		regs[rF] = FLAG_H | sz53pTable[regs[rA]];
		tstates += 4;
	}
}
function BIT_N_iRRpNNi(bit, rp) {
	return function(offset) {
		var addr = (regPairs[rp] + offset) & 0xffff;
		var value = memory.read(addr);
		regs[rF] = ( regs[rF] & FLAG_C ) | FLAG_H | ( ( addr >> 8 ) & ( FLAG_3 | FLAG_5 ) );
		if( ! ( (value) & ( 0x01 << (bit) ) ) ) regs[rF] |= FLAG_P | FLAG_Z;
		if( (bit) == 7 && (value) & 0x80 ) regs[rF] |= FLAG_S;
		tstates += 20;
	}
}
function BIT_N_iHLi(bit) {
	return function() {
		var addr = regPairs[rpHL];
		var value = memory.read(addr);
		regs[rF] = ( regs[rF] & FLAG_C ) | FLAG_H | ( value & ( FLAG_3 | FLAG_5 ) );
		if( ! ( (value) & ( 0x01 << (bit) ) ) ) regs[rF] |= FLAG_P | FLAG_Z;
		if( (bit) == 7 && (value) & 0x80 ) regs[rF] |= FLAG_S;
		tstates += 12;
	}
}
function BIT_N_R(bit, r) {
	return function() {
		regs[rF] = ( regs[rF] & FLAG_C ) | FLAG_H | ( regs[r] & ( FLAG_3 | FLAG_5 ) );
		if( ! ( regs[r] & ( 0x01 << (bit) ) ) ) regs[rF] |= FLAG_P | FLAG_Z;
		if( (bit) == 7 && regs[r] & 0x80 ) regs[rF] |= FLAG_S;
		tstates += 8;
	}
}
function CALL_C_NN(flag, sense) {
	if (sense) {
		/* branch if flag set */
		return function() {
			if (regs[rF] & flag) {
				var l = memory.read(regPairs[rpPC]++);
				var h = memory.read(regPairs[rpPC]++);
				memory.write(--regPairs[rpSP], regPairs[rpPC] >> 8);
				memory.write(--regPairs[rpSP], regPairs[rpPC] & 0xff);
				regPairs[rpPC] = (h<<8) | l;
				tstates += 17;
			} else {
				regPairs[rpPC] += 2; /* skip past address bytes */
				tstates += 10;
			}
		}
	} else {
		/* branch if flag reset */
		return function() {
			if (regs[rF] & flag) {
				regPairs[rpPC] += 2; /* skip past address bytes */
				tstates += 10;
			} else {
				var l = memory.read(regPairs[rpPC]++);
				var h = memory.read(regPairs[rpPC]++);
				memory.write(--regPairs[rpSP], regPairs[rpPC] >> 8);
				memory.write(--regPairs[rpSP], regPairs[rpPC] & 0xff);
				regPairs[rpPC] = (h<<8) | l;
				tstates += 17;
			}
		}
	}
}
function CALL_NN() {
	return function() {
		var l = memory.read(regPairs[rpPC]++);
		var h = memory.read(regPairs[rpPC]++);
		memory.write(--regPairs[rpSP], regPairs[rpPC] >> 8);
		memory.write(--regPairs[rpSP], regPairs[rpPC] & 0xff);
		regPairs[rpPC] = (h<<8) | l;
		tstates += 17;
	}
}
function CCF() {
	return function() {
		regs[rF] = ( regs[rF] & (FLAG_P | FLAG_Z | FLAG_S) ) | ( (regs[rF] & FLAG_C) ? FLAG_H : FLAG_C ) | ( regs[rA] & (FLAG_3 | FLAG_5) );
		tstates += 4;
	}
}
function CP_iRRpNNi(rp) {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var addr = (regPairs[rp] + offset) & 0xffff;
		
		var val = memory.read(addr);
		var cptemp = regs[rA] - val;
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
		regs[rF] = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( val & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
		tstates += 19;
	}
}
function CP_iHLi() {
	return function() {
		var val = memory.read(regPairs[rpHL]);
		var cptemp = regs[rA] - val;
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
		regs[rF] = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( val & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
		tstates += 7;
	}
}
function CP_N() {
	return function() {
		var val = memory.read(regPairs[rpPC]++);
		var cptemp = regs[rA] - val;
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
		regs[rF] = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( val & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
		tstates += 7;
	}
}
function CP_R(r) {
	return function() {
		var cptemp = regs[rA] - regs[r];
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (regs[r] & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
		regs[rF] = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( regs[r] & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
		tstates += 4;
	}
}
function CPL() {
	return function() {
		regs[rA] ^= 0xff;
		regs[rF] = ( regs[rF] & (FLAG_C | FLAG_P | FLAG_Z | FLAG_S) ) | ( regs[rA] & (FLAG_3 | FLAG_5) ) | (FLAG_N | FLAG_H);
		tstates += 4;
	}
}
function DEC_iHLi() {
	return function() {
		var value = memory.read(regPairs[rpHL]);
		regs[rF] = (regs[rF] & FLAG_C ) | ( value & 0x0f ? 0 : FLAG_H ) | FLAG_N;
		value = (value - 1) & 0xff;
		memory.write(regPairs[rpHL], value);
		regs[rF] |= (value == 0x7f ? FLAG_V : 0) | sz53Table[value];
		tstates += 7;
	}
}
function DEC_iRRpNNi(rp) {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var addr = (regPairs[rp] + offset) & 0xffff;
		
		var value = memory.read(addr);
		regs[rF] = (regs[rF] & FLAG_C ) | ( value & 0x0f ? 0 : FLAG_H ) | FLAG_N;
		value = (value - 1) & 0xff;
		memory.write(addr, value);
		regs[rF] |= (value == 0x7f ? FLAG_V : 0) | sz53Table[value];
		tstates += 23;
	}
}
function DEC_R(r) {
	return function() {
		regs[rF] = (regs[rF] & FLAG_C ) | ( regs[r] & 0x0f ? 0 : FLAG_H ) | FLAG_N;
		regs[r]--;
		regs[rF] |= (regs[r] == 0x7f ? FLAG_V : 0) | sz53Table[regs[r]];
		tstates += 4;
	}
}
function DEC_RR(rp) {
	return function() {
		regPairs[rp]--;
		tstates += 6;
	}
}
function DI() {
	return function() {
		iff1 = iff2 = 0;
		tstates += 4;
	}
}
function DJNZ_N() {
	return function() {
		regs[rB]--;
		if (regs[rB]) {
			/* take branch */
			var offset = memory.read(regPairs[rpPC]++);
			regPairs[rpPC] += (offset & 0x80 ? offset - 0x100 : offset);
			tstates += 13;
		} else {
			/* do not take branch */
			regPairs[rpPC]++; /* skip past offset byte */
			tstates += 8;
		}
	}
}
function EI() {
	return function() {
		iff1 = iff2 = 1;
		/* TODO: block interrupts from being triggered immediately after an EI */
		tstates += 4;
	}
}
function EX_iSPi_RR(rp) {
	var tstatesToAdd = (rp == rpHL ? 19 : 23);
	return function() {
		var l = memory.read(regPairs[rpSP]);
		var h = memory.read((regPairs[rpSP] + 1) & 0xffff);
		memory.write(regPairs[rpSP], regPairs[rp] & 0xff);
		memory.write((regPairs[rpSP] + 1) & 0xffff, regPairs[rp] >> 8);
		regPairs[rp] = (h<<8) | l;
		tstates += tstatesToAdd;
	}
}
function EX_RR_RR(rp1, rp2) {
	return function() {
		var temp = regPairs[rp1];
		regPairs[rp1] = regPairs[rp2];
		regPairs[rp2] = temp;
		tstates += 4;
	}
}
function EXX() {
	return function() {
		var wordtemp;
		wordtemp = regPairs[rpBC]; regPairs[rpBC] = regPairs[rpBC_]; regPairs[rpBC_] = wordtemp;
		wordtemp = regPairs[rpDE]; regPairs[rpDE] = regPairs[rpDE_]; regPairs[rpDE_] = wordtemp;
		wordtemp = regPairs[rpHL]; regPairs[rpHL] = regPairs[rpHL_]; regPairs[rpHL_] = wordtemp;
		tstates += 4;
	}
}
function HALT() {
	return function() {
		halted = true;
		regPairs[rpPC]--;
		tstates += 4;
	}
}
function IM(val) {
	return function() {
		im = val;
		tstates += 8;
	}
}
function IN_A_N() {
	return function() {
		var val = memory.read(regPairs[rpPC]++);
		regs[rA] = ioBus.read( (regs[rA] << 8) | val );
		tstates += 11;
	}
}
function IN_R_iCi(r) {
	return function() {
		regs[r] = ioBus.read(regPairs[rpBC]);
		regs[rF] = (regs[rF] & FLAG_C) | sz53pTable[regs[r]];
		tstates += 12;
	}
}
function INC_iHLi() {
	return function() {
		var value = memory.read(regPairs[rpHL]);
		regs[rF] = (regs[rF] & FLAG_C ) | ( value & 0x0f ? 0 : FLAG_H ) | FLAG_N;
		value = (value + 1) & 0xff;
		memory.write(regPairs[rpHL], value);
		regs[rF] = (regs[rF] & FLAG_C) | ( value == 0x80 ? FLAG_V : 0 ) | ( value & 0x0f ? 0 : FLAG_H ) | sz53Table[value];
		tstates += 7;
	}
}
function INC_iRRpNNi(rp) {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var addr = (regPairs[rp] + offset) & 0xffff;
		
		var value = memory.read(addr);
		value = (value + 1) & 0xff;
		memory.write(addr, value);
		regs[rF] = (regs[rF] & FLAG_C) | ( value == 0x80 ? FLAG_V : 0 ) | ( value & 0x0f ? 0 : FLAG_H ) | sz53Table[value];
		tstates += 23;
	}
}
function INC_R(r) {
	return function() {
		regs[r]++;
		regs[rF] = (regs[rF] & FLAG_C) | ( regs[r] == 0x80 ? FLAG_V : 0 ) | ( regs[r] & 0x0f ? 0 : FLAG_H ) | sz53Table[regs[r]];
		tstates += 4;
	}
}
function INC_RR(rp) {
	return function() {
		regPairs[rp]++;
		tstates += 6;
	}
}
function JP_C_NN(flag, sense) {
	if (sense) {
		/* branch if flag set */
		return function() {
			if (regs[rF] & flag) {
				var l = memory.read(regPairs[rpPC]++);
				var h = memory.read(regPairs[rpPC]++);
				regPairs[rpPC] = (h<<8) | l;
			} else {
				regPairs[rpPC] += 2; /* skip past address bytes */
			}
			tstates += 10;
		}
	} else {
		/* branch if flag reset */
		return function() {
			if (regs[rF] & flag) {
				regPairs[rpPC] += 2; /* skip past address bytes */
			} else {
				var l = memory.read(regPairs[rpPC]++);
				var h = memory.read(regPairs[rpPC]++);
				regPairs[rpPC] = (h<<8) | l;
			}
			tstates += 10;
		}
	}
}
function JP_RR(rp) {
	var tstatesToAdd = (rp == rpHL ? 4 : 8)
	return function() {
		regPairs[rpPC] = regPairs[rp];
		tstates += tstatesToAdd;
	}
}
function JP_NN() {
	return function() {
		var l = memory.read(regPairs[rpPC]++);
		var h = memory.read(regPairs[rpPC]++);
		regPairs[rpPC] = (h<<8) | l;
		tstates += 10;
	}
}
function JR_C_N(flag, sense) {
	if (sense) {
		/* branch if flag set */
		return function() {
			if (regs[rF] & flag) {
				var offset = memory.read(regPairs[rpPC]++);
				regPairs[rpPC] += (offset & 0x80 ? offset - 0x100 : offset);
				tstates += 12;
			} else {
				regPairs[rpPC]++; /* skip past offset byte */
				tstates += 7;
			}
		}
	} else {
		/* branch if flag reset */
		return function() {
			if (regs[rF] & flag) {
				regPairs[rpPC]++; /* skip past offset byte */
				tstates += 7;
			} else {
				var offset = memory.read(regPairs[rpPC]++);
				regPairs[rpPC] += (offset & 0x80 ? offset - 0x100 : offset);
				tstates += 12;
			}
		}
	}
}
function JR_N() {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		regPairs[rpPC] += (offset & 0x80 ? offset - 0x100 : offset);
		tstates += 12;
	}
}
function LD_A_iNNi() {
	return function() {
		var l = memory.read(regPairs[rpPC]++);
		var h = memory.read(regPairs[rpPC]++);
		var addr = (h<<8) | l;
		regs[rA] = memory.read(addr);
		tstates += 13;
	}
}
function LD_iNNi_A() {
	return function() {
		var l = memory.read(regPairs[rpPC]++);
		var h = memory.read(regPairs[rpPC]++);
		var addr = (h<<8) | l;
		memory.write(addr, regs[rA]);
		tstates += 13;
	}
}
function LD_iNNi_RR(rp) {
	var tstatesToAdd = (rp == rpHL ? 16 : 20);
	return function() {
		var l = memory.read(regPairs[rpPC]++);
		var h = memory.read(regPairs[rpPC]++);
		var addr = (h<<8) | l;
		memory.write(addr, regPairs[rp] & 0xff);
		memory.write((addr + 1) & 0xffff, regPairs[rp] >> 8);
		tstates += tstatesToAdd;
	}
}
function LD_iRRi_N(rp) {
	return function() {
		var n = memory.read(regPairs[rpPC]++);
		memory.write(regPairs[rp], n);
		tstates += 10;
	}
}
function LD_iRRi_R(rp, r) {
	return function() {
		memory.write(regPairs[rp], regs[r]);
		tstates += 7;
	}
}
function LD_iRRpNNi_N(rp) {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var addr = (regPairs[rp] + offset) & 0xffff;
		
		var val = memory.read(regPairs[rpPC]++);
		memory.write(addr, val);
		tstates += 19;
	}
}
function LD_iRRpNNi_R(rp, r) {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var addr = (regPairs[rp] + offset) & 0xffff;
		
		memory.write(addr, regs[r]);
		tstates += 19;
	}
}
function LD_R_iRRi(r, rp) {
	return function() {
		regs[r] = memory.read(regPairs[rp]);
		tstates += 7;
	}
}
function LD_R_iRRpNNi(r, rp) {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var addr = (regPairs[rp] + offset) & 0xffff;
		
		regs[r] = memory.read(addr);
		tstates += 19;
	}
}
function LD_R_N(r) {
	return function() {
		regs[r] = memory.read(regPairs[rpPC]++);
		tstates += 7;
	}
}
function LD_R_R(r1, r2) {
	if (r1 == rI && r2 == rA) {
		return function() {
			regs[r1] = regs[r2];
			tstates += 9;
		}
	} else {
		return function() {
			regs[r1] = regs[r2];
			tstates += 4;
		}
	}
}
function LD_RR_iNNi(rp, shifted) {
	var tstatesToAdd = ( (rp == rpHL && !shifted) ? 16 : 20);
	return function() {
		var l = memory.read(regPairs[rpPC]++);
		var h = memory.read(regPairs[rpPC]++);
		var addr = (h<<8) | l;
		l = memory.read(addr);
		h = memory.read((addr + 1) & 0xffff);
		regPairs[rp] = (h<<8) | l;
		tstates += tstatesToAdd;
	}
}
function LD_RR_NN(rp) {
	var tstatesToAdd = ( (rp == rpIX || rp == rpIY) ? 14 : 10);
	return function() {
		var l = memory.read(regPairs[rpPC]++);
		var h = memory.read(regPairs[rpPC]++);
		regPairs[rp] = (h<<8) | l;
		tstates += tstatesToAdd;
	}
}
function LD_RR_RR(rp1, rp2) {
	/* only used for LD SP,HL/IX/IY */
	var tstatesToAdd = ( rp2 == rpHL ? 6 : 10);
	return function() {
		regPairs[rp1] = regPairs[rp2];
		tstates += tstatesToAdd;
	}
}
function LDDR() {
	return function() {
		var bytetemp = memory.read(regPairs[rpHL]);
		memory.write(regPairs[rpDE],bytetemp);
		regPairs[rpBC]--;
		bytetemp = (bytetemp + regs[rA]) & 0xff;
		regs[rF] = ( regs[rF] & ( FLAG_C | FLAG_Z | FLAG_S ) ) | ( regPairs[rpBC] ? FLAG_V : 0 ) | ( bytetemp & FLAG_3 ) | ( (bytetemp & 0x02) ? FLAG_5 : 0 );
		if (regPairs[rpBC]) {
			regPairs[rpPC]-=2;
			tstates += 21;
		} else {
			tstates += 16;
		}
		regPairs[rpHL]--; regPairs[rpDE]--;
	}
}
function LDI() {
	return function() {
		var bytetemp = memory.read(regPairs[rpHL]);
		regPairs[rpBC]--;
		memory.write(regPairs[rpDE],bytetemp);
		regPairs[rpDE]++; regPairs[rpHL]++;
		bytetemp = (bytetemp + regs[rA]) & 0xff;
		regs[rF] = ( regs[rF] & (FLAG_C | FLAG_Z | FLAG_S) ) | ( regPairs[rpBC] ? FLAG_V : 0 ) | (bytetemp & FLAG_3) | ( (bytetemp & 0x02) ? FLAG_5 : 0 );
		tstates += 16;
	}
}
function LDIR() {
	return function() {
		var bytetemp = memory.read(regPairs[rpHL]);
		memory.write(regPairs[rpDE],bytetemp);
		regPairs[rpBC]--;
		bytetemp = (bytetemp + regs[rA]) & 0xff;
		regs[rF] = ( regs[rF] & ( FLAG_C | FLAG_Z | FLAG_S ) ) | ( regPairs[rpBC] ? FLAG_V : 0 ) | ( bytetemp & FLAG_3 ) | ( (bytetemp & 0x02) ? FLAG_5 : 0 );
		if (regPairs[rpBC]) {
			regPairs[rpPC]-=2;
			tstates += 21;
		} else {
			tstates += 16;
		}
		regPairs[rpHL]++; regPairs[rpDE]++;
	}
}
function NEG() {
	return function() {
		var val = regs[rA];
		var subtemp = -val;
		var lookup = ( (val & 0x88) >> 2 ) | ( (subtemp & 0x88) >> 1 );
		regs[rA] = subtemp;
		regs[rF] = ( subtemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 8;
	}
}
function NOP() {
	return function() {
		tstates += 4;
	}
}
function OR_iHLi() {
	return function() {
		var val = memory.read(regPairs[rpHL]);
		regs[rA] |= val;
		regs[rF] = sz53pTable[regs[rA]];
		tstates += 7;
	}
}
function OR_iRRpNNi(rp) {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var addr = (regPairs[rp] + offset) & 0xffff;
		
		var val = memory.read(addr);
		regs[rA] |= val;
		regs[rF] = sz53pTable[regs[rA]];
		tstates += 19;
	}
}
function OR_N() {
	return function() {
		var val = memory.read(regPairs[rpPC]++);
		regs[rA] |= val;
		regs[rF] = sz53pTable[regs[rA]];
		tstates += 7;
	}
}
function OR_R(r) {
	return function() {
		regs[rA] |= regs[r];
		regs[rF] = sz53pTable[regs[rA]];
		tstates += 4;
	}
}
function OUT_iCi_R(r) {
	return function() {
		ioBus.write(regPairs[rpBC], regs[r]);
		tstates += 12;
	}
}
function OUT_iNi_A() {
	return function() {
		var port = memory.read(regPairs[rpPC]++);
		ioBus.write( (regs[rA] << 8) | port, regs[rA]);
		tstates += 11;
	}
}
function POP_RR(rp) {
	var tstatesToAdd = ( (rp == rpIX || rp == rpIY) ? 14 : 10);
	return function() {
		var l = memory.read(regPairs[rpSP]++);
		var h = memory.read(regPairs[rpSP]++);
		regPairs[rp] = (h<<8) | l;
		tstates += tstatesToAdd;
	}
}
function PUSH_RR(rp) {
	var tstatesToAdd = ( (rp == rpIX || rp == rpIY) ? 15 : 11);
	return function() {
		memory.write(--regPairs[rpSP], regPairs[rp] >> 8);
		memory.write(--regPairs[rpSP], regPairs[rp] & 0xff);
		tstates += tstatesToAdd;
	}
}
function RES_N_iHLi(bit) {
	var hexMask = 0xff ^ (1 << bit);
	return function() {
		var addr = regPairs[rpHL];
		var value = memory.read(addr);
		memory.write(addr, value & hexMask);
		tstates += 15;
	}
}
function RES_N_iRRpNNi(bit, rp) {
	var hexMask = 0xff ^ (1 << bit);
	return function(offset) {
		var addr = (regPairs[rp] + offset) & 0xffff;
		var value = memory.read(addr);
		memory.write(addr, value & hexMask);
		tstates += 23;
	}
}
function RES_N_R(bit, r) {
	var hexMask = 0xff ^ (1 << bit);
	return function() {
		regs[r] &= hexMask;
		tstates += 8;
	}
}
function RET() {
	return function() {
		var l = memory.read(regPairs[rpSP]++);
		var h = memory.read(regPairs[rpSP]++);
		regPairs[rpPC] = (h<<8) | l;
		tstates += 10;
	}
}
function RET_C(flag, sense) {
	if (sense) {
		/* branch if flag set */
		return function() {
			if (regs[rF] & flag) {
				var l = memory.read(regPairs[rpSP]++);
				var h = memory.read(regPairs[rpSP]++);
				regPairs[rpPC] = (h<<8) | l;
				tstates += 11;
			} else {
				tstates += 5;
			}
		}
	} else {
		/* branch if flag reset */
		return function() {
			if (regs[rF] & flag) {
				tstates += 5;
			} else {
				var l = memory.read(regPairs[rpSP]++);
				var h = memory.read(regPairs[rpSP]++);
				regPairs[rpPC] = (h<<8) | l;
				tstates += 11;
			}
		}
	}
}
function RL_R(r) {
	return function() {
		var rltemp = regs[r];
		regs[r] = ( regs[r]<<1 ) | ( regs[rF] & FLAG_C );
		regs[rF] = ( rltemp >> 7 ) | sz53pTable[regs[r]];
		tstates =+ 8;
	}
}
function RLA() {
	return function() {
		var bytetemp = regs[rA];
		regs[rA] = (regs[rA] << 1) | (regs[rF] & FLAG_C);
		regs[rF] = ( regs[rF] & (FLAG_P | FLAG_Z | FLAG_S) ) | ( regs[rA] & (FLAG_3 | FLAG_5) ) | (bytetemp >> 7);
		tstates += 4;
	}
}
function RLC_R(r) {
	return function() {
		regs[r] = ( regs[r]<<1 ) | ( regs[r]>>7 );
		regs[rF] = ( regs[r] & FLAG_C ) | sz53pTable[regs[r]];
		tstates += 8;
	}
}
function RLCA() {
	return function() {
		regs[rA] = (regs[rA] << 1) | (regs[rA] >> 7);
		regs[rF] = ( regs[rF] & ( FLAG_P | FLAG_Z | FLAG_S ) ) | ( regs[rA] & ( FLAG_C | FLAG_3 | FLAG_5) );
		tstates += 4;
	}
}
function RR_R(r) {
	return function() {
		var rrtemp = regs[r];
		regs[r] = ( regs[r]>>1 ) | ( regs[rF] << 7 );
		regs[rF] = ( rrtemp & FLAG_C ) | sz53pTable[regs[r]];
		tstates += 8;
	}
}
function RRCA() {
	return function() {
		regs[rF] = ( regs[rF] & (FLAG_P | FLAG_Z | FLAG_S) ) | (regs[rA] & FLAG_C);
		regs[rA] = ( regs[rA] >> 1) | ( regs[rA] << 7 );
		regs[rF] |= ( regs[rA] & (FLAG_3 | FLAG_5) );
		tstates += 4;
	}
}
function RRA() {
	return function() {
		var bytetemp = regs[rA];
		regs[rA] = ( bytetemp >> 1 ) | ( regs[rF] << 7 );
		regs[rF] = ( regs[rF] & (FLAG_P | FLAG_Z | FLAG_S) ) | ( regs[rA] & (FLAG_3 | FLAG_5) ) | (bytetemp & FLAG_C);
		tstates += 4;
	}
}
function RST(addr) {
	return function() {
		memory.write(--regPairs[rpSP], regPairs[rpPC] >> 8);
		memory.write(--regPairs[rpSP], regPairs[rpPC] & 0xff);
		regPairs[rpPC] = addr;
		tstates += 11;
	}
}
function SBC_A_iHLi() {
	return function() {
		var val = memory.read(regPairs[rpHL]);
		
		var sbctemp = regs[rA] - val - ( regs[rF] & FLAG_C );
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (sbctemp & 0x88) >> 1 );
		regs[rA] = sbctemp;
		regs[rF] = ( sbctemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 7;
	}
}
function SBC_A_N() {
	return function() {
		var val = memory.read(regPairs[rpPC]++);
		
		var sbctemp = regs[rA] - val - ( regs[rF] & FLAG_C );
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (sbctemp & 0x88) >> 1 );
		regs[rA] = sbctemp;
		regs[rF] = ( sbctemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 7;
	}
}
function SBC_A_R(r) {
	return function() {
		var sbctemp = regs[rA] - regs[r] - ( regs[rF] & FLAG_C );
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (regs[r] & 0x88) >> 2 ) | ( (sbctemp & 0x88) >> 1 );
		regs[rA] = sbctemp;
		regs[rF] = ( sbctemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 4;
	}
}
function SBC_HL_RR(rp) {
	return function() {
		var sub16temp = regPairs[rpHL] - regPairs[rp] - (regs[rF] & FLAG_C);
		var lookup = ( (regPairs[rpHL] & 0x8800) >> 11 ) | ( (regPairs[rp] & 0x8800) >> 10 ) | ( (sub16temp & 0x8800) >>  9 );
		regPairs[rpHL] = sub16temp;
		regs[rF] = ( sub16temp & 0x10000 ? FLAG_C : 0 ) | FLAG_N | overflowSubTable[lookup >> 4] | ( regs[rH] & ( FLAG_3 | FLAG_5 | FLAG_S ) ) | halfcarrySubTable[lookup&0x07] | ( regPairs[rpHL] ? 0 : FLAG_Z);
		tstates += 15;
	}
}
function SCF() {
	return function() {
		regs[rF] = ( regs[rF] & (FLAG_P | FLAG_Z | FLAG_S) ) | ( regs[rA] & (FLAG_3 | FLAG_5) ) | FLAG_C;
		tstates += 4;
	}
}
function SET_N_iHLi(bit) {
	var hexMask = 1 << bit;
	return function() {
		var addr = regPairs[rpHL];
		var value = memory.read(addr);
		memory.write(addr, value | hexMask);
		tstates += 15;
	}
}
function SET_N_iRRpNNi(bit, rp) {
	var hexMask = 1 << bit;
	return function(offset) {
		var addr = (regPairs[rp] + offset) & 0xffff;
		var value = memory.read(addr);
		memory.write(addr, value | hexMask);
		tstates += 23;
	}
}
function SET_N_R(bit, r) {
	var hexMask = 1 << bit;
	return function() {
		regs[r] |= hexMask;
		tstates += 8;
	}
}
function SHIFT(opcodeTable) {
	/* Fake instruction for CB/ED-shifted opcodes - passes control to a secondary opcode table */
	return function() {
		var opcode = memory.read(regPairs[rpPC]++);
		if (!opcodeTable[opcode]) console.log(regPairs[rpPC], opcodeTable);
		opcodeTable[opcode]();
	}
}
function SHIFT_DDCB(opcodeTable) {
	/* like SHIFT, but with the extra quirk that we have to pull an offset parameter from PC
	*before* the final opcode to tell us what to do */
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var opcode = memory.read(regPairs[rpPC]++);
		if (!opcodeTable[opcode]) console.log(regPairs[rpPC], opcodeTable);
		opcodeTable[opcode](offset);
	}
}
function SLA_R(r) {
	return function() {
		regs[rF] = regs[r] >> 7;
		regs[r] <<= 1;
		regs[rF] |= sz53pTable[regs[r]];
		tstates += 8;
	}
}
function SRL_R(r) {
	return function() {
		regs[rF] = regs[r] & FLAG_C;
		regs[r] >>= 1;
		regs[rF] |= sz53pTable[regs[r]];
		tstates += 8;
	}
}
function SUB_iHLi() {
	return function() {
		var val = memory.read(regPairs[rpHL]);
		var subtemp = regs[rA] - val;
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (subtemp & 0x88) >> 1 );
		regs[rA] = subtemp;
		regs[rF] = ( subtemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 7;
	}
}
function SUB_iRRpNNi(rp) {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var addr = (regPairs[rp] + offset) & 0xffff;
		
		var val = memory.read(addr);
		var subtemp = regs[rA] - val;
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (subtemp & 0x88) >> 1 );
		regs[rA] = subtemp;
		regs[rF] = ( subtemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 19;
	}
}
function SUB_N(r) {
	return function() {
		var val = memory.read(regPairs[rpPC]++);
		var subtemp = regs[rA] - val;
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (subtemp & 0x88) >> 1 );
		regs[rA] = subtemp;
		regs[rF] = ( subtemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 7;
	}
}
function SUB_R(r) {
	return function() {
		var subtemp = regs[rA] - regs[r];
		var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (regs[r] & 0x88) >> 2 ) | ( (subtemp & 0x88) >> 1 );
		regs[rA] = subtemp;
		regs[rF] = ( subtemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
		tstates += 4;
	}
}
function XOR_iHLi() {
	return function() {
		var val = memory.read(regPairs[rpHL]);
		regs[rA] ^= val;
		regs[rF] = sz53pTable[regs[rA]];
		tstates += 7;
	}
}
function XOR_iRRpNNi(rp) {
	return function() {
		var offset = memory.read(regPairs[rpPC]++);
		if (offset & 0x80) offset -= 0x100;
		var addr = (regPairs[rp] + offset) & 0xffff;
		
		var val = memory.read(addr);
		regs[rA] ^= val;
		regs[rF] = sz53pTable[regs[rA]];
		tstates += 19;
	}
}
function XOR_N() {
	return function() {
		var val = memory.read(regPairs[rpPC]++);
		regs[rA] ^= val;
		regs[rF] = sz53pTable[regs[rA]];
		tstates += 7;
	}
}
function XOR_R(r) {
	return function() {
		regs[rA] ^= regs[r];
		regs[rF] = sz53pTable[regs[rA]];
		tstates += 4;
	}
}

OPCODE_RUNNERS_CB = {
	0x00: /* RLC B */      RLC_R(rB),
	0x01: /* RLC C */      RLC_R(rC),
	0x02: /* RLC D */      RLC_R(rD),
	0x03: /* RLC E */      RLC_R(rE),
	0x04: /* RLC H */      RLC_R(rH),
	0x05: /* RLC L */      RLC_R(rL),
	
	0x07: /* RLC A */      RLC_R(rA),
	
	0x10: /* RL B */       RL_R(rB),
	0x11: /* RL C */       RL_R(rC),
	0x12: /* RL D */       RL_R(rD),
	0x13: /* RL E */       RL_R(rE),
	0x14: /* RL H */       RL_R(rH),
	0x15: /* RL L */       RL_R(rL),
	
	0x17: /* RL A */       RL_R(rA),
	
	0x18: /* RR B */       RR_R(rB),
	0x19: /* RR C */       RR_R(rC),
	0x1a: /* RR D */       RR_R(rD),
	0x1b: /* RR E */       RR_R(rE),
	0x1c: /* RR H */       RR_R(rH),
	0x1d: /* RR L */       RR_R(rL),
	
	0x1f: /* RR A */       RR_R(rA),
	0x20: /* SLA B */      SLA_R(rB),
	0x21: /* SLA C */      SLA_R(rC),
	0x22: /* SLA D */      SLA_R(rD),
	0x23: /* SLA E */      SLA_R(rE),
	0x24: /* SLA H */      SLA_R(rH),
	0x25: /* SLA L */      SLA_R(rL),
	
	0x27: /* SLA A */      SLA_R(rA),
	
	0x38: /* SRL B */      SRL_R(rB),
	0x39: /* SRL C */      SRL_R(rC),
	0x3a: /* SRL D */      SRL_R(rD),
	0x3b: /* SRL E */      SRL_R(rE),
	0x3c: /* SRL H */      SRL_R(rH),
	0x3d: /* SRL L */      SRL_R(rL),
	
	0x3f: /* SRL A */      SRL_R(rA),
	0x40: /* BIT 0,B */    BIT_N_R(0, rB),
	0x41: /* BIT 0,C */    BIT_N_R(0, rC),
	0x42: /* BIT 0,D */    BIT_N_R(0, rD),
	0x43: /* BIT 0,E */    BIT_N_R(0, rE),
	0x44: /* BIT 0,H */    BIT_N_R(0, rH),
	0x45: /* BIT 0,L */    BIT_N_R(0, rL),
	0x46: /* BIT 0,(HL) */ BIT_N_iHLi(0),
	0x47: /* BIT 0,A */    BIT_N_R(0, rA),
	0x48: /* BIT 1,B */    BIT_N_R(1, rB),
	0x49: /* BIT 1,C */    BIT_N_R(1, rC),
	0x4A: /* BIT 1,D */    BIT_N_R(1, rD),
	0x4B: /* BIT 1,E */    BIT_N_R(1, rE),
	0x4C: /* BIT 1,H */    BIT_N_R(1, rH),
	0x4D: /* BIT 1,L */    BIT_N_R(1, rL),
	0x4E: /* BIT 1,(HL) */ BIT_N_iHLi(1),
	0x4F: /* BIT 1,A */    BIT_N_R(1, rA),
	0x50: /* BIT 2,B */    BIT_N_R(2, rB),
	0x51: /* BIT 2,C */    BIT_N_R(2, rC),
	0x52: /* BIT 2,D */    BIT_N_R(2, rD),
	0x53: /* BIT 2,E */    BIT_N_R(2, rE),
	0x54: /* BIT 2,H */    BIT_N_R(2, rH),
	0x55: /* BIT 2,L */    BIT_N_R(2, rL),
	0x56: /* BIT 2,(HL) */ BIT_N_iHLi(2),
	0x57: /* BIT 2,A */    BIT_N_R(2, rA),
	0x58: /* BIT 3,B */    BIT_N_R(3, rB),
	0x59: /* BIT 3,C */    BIT_N_R(3, rC),
	0x5A: /* BIT 3,D */    BIT_N_R(3, rD),
	0x5B: /* BIT 3,E */    BIT_N_R(3, rE),
	0x5C: /* BIT 3,H */    BIT_N_R(3, rH),
	0x5D: /* BIT 3,L */    BIT_N_R(3, rL),
	0x5E: /* BIT 3,(HL) */ BIT_N_iHLi(3),
	0x5F: /* BIT 3,A */    BIT_N_R(3, rA),
	0x60: /* BIT 4,B */    BIT_N_R(4, rB),
	0x61: /* BIT 4,C */    BIT_N_R(4, rC),
	0x62: /* BIT 4,D */    BIT_N_R(4, rD),
	0x63: /* BIT 4,E */    BIT_N_R(4, rE),
	0x64: /* BIT 4,H */    BIT_N_R(4, rH),
	0x65: /* BIT 4,L */    BIT_N_R(4, rL),
	0x66: /* BIT 4,(HL) */ BIT_N_iHLi(4),
	0x67: /* BIT 4,A */    BIT_N_R(4, rA),
	0x68: /* BIT 5,B */    BIT_N_R(5, rB),
	0x69: /* BIT 5,C */    BIT_N_R(5, rC),
	0x6A: /* BIT 5,D */    BIT_N_R(5, rD),
	0x6B: /* BIT 5,E */    BIT_N_R(5, rE),
	0x6C: /* BIT 5,H */    BIT_N_R(5, rH),
	0x6D: /* BIT 5,L */    BIT_N_R(5, rL),
	0x6E: /* BIT 5,(HL) */ BIT_N_iHLi(5),
	0x6F: /* BIT 5,A */    BIT_N_R(5, rA),
	0x70: /* BIT 6,B */    BIT_N_R(6, rB),
	0x71: /* BIT 6,C */    BIT_N_R(6, rC),
	0x72: /* BIT 6,D */    BIT_N_R(6, rD),
	0x73: /* BIT 6,E */    BIT_N_R(6, rE),
	0x74: /* BIT 6,H */    BIT_N_R(6, rH),
	0x75: /* BIT 6,L */    BIT_N_R(6, rL),
	0x76: /* BIT 6,(HL) */ BIT_N_iHLi(6),
	0x77: /* BIT 6,A */    BIT_N_R(6, rA),
	0x78: /* BIT 7,B */    BIT_N_R(7, rB),
	0x79: /* BIT 7,C */    BIT_N_R(7, rC),
	0x7A: /* BIT 7,D */    BIT_N_R(7, rD),
	0x7B: /* BIT 7,E */    BIT_N_R(7, rE),
	0x7C: /* BIT 7,H */    BIT_N_R(7, rH),
	0x7D: /* BIT 7,L */    BIT_N_R(7, rL),
	0x7E: /* BIT 7,(HL) */ BIT_N_iHLi(7),
	0x7F: /* BIT 7,A */    BIT_N_R(7, rA),
	0x80: /* RES 0,B */    RES_N_R(0, rB),
	0x81: /* RES 0,C */    RES_N_R(0, rC),
	0x82: /* RES 0,D */    RES_N_R(0, rD),
	0x83: /* RES 0,E */    RES_N_R(0, rE),
	0x84: /* RES 0,H */    RES_N_R(0, rH),
	0x85: /* RES 0,L */    RES_N_R(0, rL),
	0x86: /* RES 0,(HL) */ RES_N_iHLi(0),
	0x87: /* RES 0,A */    RES_N_R(0, rA),
	0x88: /* RES 1,B */    RES_N_R(1, rB),
	0x89: /* RES 1,C */    RES_N_R(1, rC),
	0x8A: /* RES 1,D */    RES_N_R(1, rD),
	0x8B: /* RES 1,E */    RES_N_R(1, rE),
	0x8C: /* RES 1,H */    RES_N_R(1, rH),
	0x8D: /* RES 1,L */    RES_N_R(1, rL),
	0x8E: /* RES 1,(HL) */ RES_N_iHLi(1),
	0x8F: /* RES 1,A */    RES_N_R(1, rA),
	0x90: /* RES 2,B */    RES_N_R(2, rB),
	0x91: /* RES 2,C */    RES_N_R(2, rC),
	0x92: /* RES 2,D */    RES_N_R(2, rD),
	0x93: /* RES 2,E */    RES_N_R(2, rE),
	0x94: /* RES 2,H */    RES_N_R(2, rH),
	0x95: /* RES 2,L */    RES_N_R(2, rL),
	0x96: /* RES 2,(HL) */ RES_N_iHLi(2),
	0x97: /* RES 2,A */    RES_N_R(2, rA),
	0x98: /* RES 3,B */    RES_N_R(3, rB),
	0x99: /* RES 3,C */    RES_N_R(3, rC),
	0x9A: /* RES 3,D */    RES_N_R(3, rD),
	0x9B: /* RES 3,E */    RES_N_R(3, rE),
	0x9C: /* RES 3,H */    RES_N_R(3, rH),
	0x9D: /* RES 3,L */    RES_N_R(3, rL),
	0x9E: /* RES 3,(HL) */ RES_N_iHLi(3),
	0x9F: /* RES 3,A */    RES_N_R(3, rA),
	0xA0: /* RES 4,B */    RES_N_R(4, rB),
	0xA1: /* RES 4,C */    RES_N_R(4, rC),
	0xA2: /* RES 4,D */    RES_N_R(4, rD),
	0xA3: /* RES 4,E */    RES_N_R(4, rE),
	0xA4: /* RES 4,H */    RES_N_R(4, rH),
	0xA5: /* RES 4,L */    RES_N_R(4, rL),
	0xA6: /* RES 4,(HL) */ RES_N_iHLi(4),
	0xA7: /* RES 4,A */    RES_N_R(4, rA),
	0xA8: /* RES 5,B */    RES_N_R(5, rB),
	0xA9: /* RES 5,C */    RES_N_R(5, rC),
	0xAA: /* RES 5,D */    RES_N_R(5, rD),
	0xAB: /* RES 5,E */    RES_N_R(5, rE),
	0xAC: /* RES 5,H */    RES_N_R(5, rH),
	0xAD: /* RES 5,L */    RES_N_R(5, rL),
	0xAE: /* RES 5,(HL) */ RES_N_iHLi(5),
	0xAF: /* RES 5,A */    RES_N_R(5, rA),
	0xB0: /* RES 6,B */    RES_N_R(6, rB),
	0xB1: /* RES 6,C */    RES_N_R(6, rC),
	0xB2: /* RES 6,D */    RES_N_R(6, rD),
	0xB3: /* RES 6,E */    RES_N_R(6, rE),
	0xB4: /* RES 6,H */    RES_N_R(6, rH),
	0xB5: /* RES 6,L */    RES_N_R(6, rL),
	0xB6: /* RES 6,(HL) */ RES_N_iHLi(6),
	0xB7: /* RES 6,A */    RES_N_R(6, rA),
	0xB8: /* RES 7,B */    RES_N_R(7, rB),
	0xB9: /* RES 7,C */    RES_N_R(7, rC),
	0xBA: /* RES 7,D */    RES_N_R(7, rD),
	0xBB: /* RES 7,E */    RES_N_R(7, rE),
	0xBC: /* RES 7,H */    RES_N_R(7, rH),
	0xBD: /* RES 7,L */    RES_N_R(7, rL),
	0xBE: /* RES 7,(HL) */ RES_N_iHLi(7),
	0xBF: /* RES 7,A */    RES_N_R(7, rA),
	0xC0: /* SET 0,B */    SET_N_R(0, rB),
	0xC1: /* SET 0,C */    SET_N_R(0, rC),
	0xC2: /* SET 0,D */    SET_N_R(0, rD),
	0xC3: /* SET 0,E */    SET_N_R(0, rE),
	0xC4: /* SET 0,H */    SET_N_R(0, rH),
	0xC5: /* SET 0,L */    SET_N_R(0, rL),
	0xC6: /* SET 0,(HL) */ SET_N_iHLi(0),
	0xC7: /* SET 0,A */    SET_N_R(0, rA),
	0xC8: /* SET 1,B */    SET_N_R(1, rB),
	0xC9: /* SET 1,C */    SET_N_R(1, rC),
	0xCA: /* SET 1,D */    SET_N_R(1, rD),
	0xCB: /* SET 1,E */    SET_N_R(1, rE),
	0xCC: /* SET 1,H */    SET_N_R(1, rH),
	0xCD: /* SET 1,L */    SET_N_R(1, rL),
	0xCE: /* SET 1,(HL) */ SET_N_iHLi(1),
	0xCF: /* SET 1,A */    SET_N_R(1, rA),
	0xD0: /* SET 2,B */    SET_N_R(2, rB),
	0xD1: /* SET 2,C */    SET_N_R(2, rC),
	0xD2: /* SET 2,D */    SET_N_R(2, rD),
	0xD3: /* SET 2,E */    SET_N_R(2, rE),
	0xD4: /* SET 2,H */    SET_N_R(2, rH),
	0xD5: /* SET 2,L */    SET_N_R(2, rL),
	0xD6: /* SET 2,(HL) */ SET_N_iHLi(2),
	0xD7: /* SET 2,A */    SET_N_R(2, rA),
	0xD8: /* SET 3,B */    SET_N_R(3, rB),
	0xD9: /* SET 3,C */    SET_N_R(3, rC),
	0xDA: /* SET 3,D */    SET_N_R(3, rD),
	0xDB: /* SET 3,E */    SET_N_R(3, rE),
	0xDC: /* SET 3,H */    SET_N_R(3, rH),
	0xDD: /* SET 3,L */    SET_N_R(3, rL),
	0xDE: /* SET 3,(HL) */ SET_N_iHLi(3),
	0xDF: /* SET 3,A */    SET_N_R(3, rA),
	0xE0: /* SET 4,B */    SET_N_R(4, rB),
	0xE1: /* SET 4,C */    SET_N_R(4, rC),
	0xE2: /* SET 4,D */    SET_N_R(4, rD),
	0xE3: /* SET 4,E */    SET_N_R(4, rE),
	0xE4: /* SET 4,H */    SET_N_R(4, rH),
	0xE5: /* SET 4,L */    SET_N_R(4, rL),
	0xE6: /* SET 4,(HL) */ SET_N_iHLi(4),
	0xE7: /* SET 4,A */    SET_N_R(4, rA),
	0xE8: /* SET 5,B */    SET_N_R(5, rB),
	0xE9: /* SET 5,C */    SET_N_R(5, rC),
	0xEA: /* SET 5,D */    SET_N_R(5, rD),
	0xEB: /* SET 5,E */    SET_N_R(5, rE),
	0xEC: /* SET 5,H */    SET_N_R(5, rH),
	0xED: /* SET 5,L */    SET_N_R(5, rL),
	0xEE: /* SET 5,(HL) */ SET_N_iHLi(5),
	0xEF: /* SET 5,A */    SET_N_R(5, rA),
	0xF0: /* SET 6,B */    SET_N_R(6, rB),
	0xF1: /* SET 6,C */    SET_N_R(6, rC),
	0xF2: /* SET 6,D */    SET_N_R(6, rD),
	0xF3: /* SET 6,E */    SET_N_R(6, rE),
	0xF4: /* SET 6,H */    SET_N_R(6, rH),
	0xF5: /* SET 6,L */    SET_N_R(6, rL),
	0xF6: /* SET 6,(HL) */ SET_N_iHLi(6),
	0xF7: /* SET 6,A */    SET_N_R(6, rA),
	0xF8: /* SET 7,B */    SET_N_R(7, rB),
	0xF9: /* SET 7,C */    SET_N_R(7, rC),
	0xFA: /* SET 7,D */    SET_N_R(7, rD),
	0xFB: /* SET 7,E */    SET_N_R(7, rE),
	0xFC: /* SET 7,H */    SET_N_R(7, rH),
	0xFD: /* SET 7,L */    SET_N_R(7, rL),
	0xFE: /* SET 7,(HL) */ SET_N_iHLi(7),
	0xFF: /* SET 7,A */    SET_N_R(7, rA),
	0x100: 'cb' /* dummy line so I don't have to keep adjusting trailing commas */
}

/* Generate the opcode runner lookup table for either the DD or FD set, acting on the
specified register pair (IX or IY) */
function generateDDFDOpcodeSet(rp) {
	var ddcbOpcodeRunners = {
		
		0x46: /* BIT 0,(IX+nn) */ BIT_N_iRRpNNi(0, rp),
		
		0x4E: /* BIT 1,(IX+nn) */ BIT_N_iRRpNNi(1, rp),
		
		0x56: /* BIT 2,(IX+nn) */ BIT_N_iRRpNNi(2, rp),
		
		0x5E: /* BIT 3,(IX+nn) */ BIT_N_iRRpNNi(3, rp),
		
		0x66: /* BIT 4,(IX+nn) */ BIT_N_iRRpNNi(4, rp),
		
		0x6E: /* BIT 5,(IX+nn) */ BIT_N_iRRpNNi(5, rp),
		
		0x76: /* BIT 6,(IX+nn) */ BIT_N_iRRpNNi(6, rp),
		
		0x7E: /* BIT 7,(IX+nn) */ BIT_N_iRRpNNi(7, rp),
		
		0x86: /* RES 0,(IX+nn) */ RES_N_iRRpNNi(0, rp),
		
		0x8E: /* RES 1,(IX+nn) */ RES_N_iRRpNNi(1, rp),
		
		0x96: /* RES 2,(IX+nn) */ RES_N_iRRpNNi(2, rp),
		
		0x9E: /* RES 3,(IX+nn) */ RES_N_iRRpNNi(3, rp),
		
		0xA6: /* RES 4,(IX+nn) */ RES_N_iRRpNNi(4, rp),
		
		0xAE: /* RES 5,(IX+nn) */ RES_N_iRRpNNi(5, rp),
		
		0xB6: /* RES 6,(IX+nn) */ RES_N_iRRpNNi(6, rp),
		
		0xBE: /* RES 7,(IX+nn) */ RES_N_iRRpNNi(7, rp),
		
		0xC6: /* SET 0,(IX+nn) */ SET_N_iRRpNNi(0, rp),
		
		0xCE: /* SET 1,(IX+nn) */ SET_N_iRRpNNi(1, rp),
		
		0xD6: /* SET 2,(IX+nn) */ SET_N_iRRpNNi(2, rp),
		
		0xDE: /* SET 3,(IX+nn) */ SET_N_iRRpNNi(3, rp),
		
		0xE6: /* SET 4,(IX+nn) */ SET_N_iRRpNNi(4, rp),
		
		0xEE: /* SET 5,(IX+nn) */ SET_N_iRRpNNi(5, rp),
		
		0xF6: /* SET 6,(IX+nn) */ SET_N_iRRpNNi(6, rp),
		
		0xFE: /* SET 7,(IX+nn) */ SET_N_iRRpNNi(7, rp),
		
		0x100: 'ddcb' /* dummy line so I don't have to keep adjusting trailing commas */
	}
	
	return {
		0x09: /* ADD IX,BC */  ADD_RR_RR(rp, rpBC),
		
		0x19: /* ADD IX,DE */  ADD_RR_RR(rp, rpDE),
		
		0x21: /* LD IX,nnnn */ LD_RR_NN(rp),
		0x22: /* LD (nnnn),IX */ LD_iNNi_RR(rp),
		
		0x29: /* ADD IX,IX */  ADD_RR_RR(rp, rp),
		0x2A: /* LD IX,(nnnn) */ LD_RR_iNNi(rp),
		
		0x34: /* INC (IX+nn) */ INC_iRRpNNi(rp),
		0x35: /* DEC (IX+nn) */ DEC_iRRpNNi(rp),
		0x36: /* LD (IX+nn),nn */ LD_iRRpNNi_N(rp),
		
		0x39: /* ADD IX,SP */  ADD_RR_RR(rp, rpSP),
		
		0x46: /* LD B,(IX+nn) */ LD_R_iRRpNNi(rB, rp),
		
		0x4E: /* LD C,(IX+nn) */ LD_R_iRRpNNi(rC, rp),
		
		0x56: /* LD D,(IX+nn) */ LD_R_iRRpNNi(rD, rp),
		
		0x5E: /* LD E,(IX+nn) */ LD_R_iRRpNNi(rE, rp),
		
		0x66: /* LD H,(IX+nn) */ LD_R_iRRpNNi(rH, rp),
		
		0x6E: /* LD L,(IX+nn) */ LD_R_iRRpNNi(rL, rp),
		
		0x70: /* LD (IX+nn),B */ LD_iRRpNNi_R(rp, rB),
		0x71: /* LD (IX+nn),C */ LD_iRRpNNi_R(rp, rC),
		0x72: /* LD (IX+nn),D */ LD_iRRpNNi_R(rp, rD),
		0x73: /* LD (IX+nn),E */ LD_iRRpNNi_R(rp, rE),
		0x74: /* LD (IX+nn),H */ LD_iRRpNNi_R(rp, rH),
		0x75: /* LD (IX+nn),L */ LD_iRRpNNi_R(rp, rL),
		0x77: /* LD (IX+nn),A */ LD_iRRpNNi_R(rp, rA),
		
		0x7E: /* LD A,(IX+nn) */ LD_R_iRRpNNi(rA, rp),
		
		0x86: /* ADD A,(IX+nn) */ ADD_A_iRRpNNi(rp),
		
		0x96: /* SUB A,(IX+dd) */ SUB_iRRpNNi(rp),
		
		0xAE: /* XOR A,(IX+dd) */ XOR_iRRpNNi(rp),
		
		0xB6: /* OR A,(IX+dd) */ OR_iRRpNNi(rp),
		
		0xBE: /* CP (IX+dd) */ CP_iRRpNNi(rp),
		
		0xCB: /* shift code */ SHIFT_DDCB(ddcbOpcodeRunners),
		
		0xE1: /* POP IX */     POP_RR(rp),
		
		0xE3: /* EX (SP),IX */ EX_iSPi_RR(rp),
		
		0xE5: /* PUSH IX */    PUSH_RR(rp),
		
		0xE9: /* JP (IX) */    JP_RR(rp),
		
		0xF9: /* LD SP,IX */   LD_RR_RR(rpSP, rp),
		
		0x100: 'dd' /* dummy line so I don't have to keep adjusting trailing commas */
	}
}

OPCODE_RUNNERS_DD = generateDDFDOpcodeSet(rpIX);

OPCODE_RUNNERS_ED = {
	
	0x40: /* IN B,(C) */   IN_R_iCi(rB),
	0x41: /* OUT (C),B */  OUT_iCi_R(rB),
	0x42: /* SBC HL,BC */  SBC_HL_RR(rpBC),
	0x43: /* LD (nnnn),BC */ LD_iNNi_RR(rpBC),
	0x44: /* NEG */        NEG(),
	
	0x46: /* IM 0 */       IM(0),
	0x47: /* LD I,A */     LD_R_R(rI, rA),
	0x48: /* IN C,(C) */   IN_R_iCi(rC),
	0x49: /* OUT (C),C */  OUT_iCi_R(rC),
	
	0x4B: /* LD BC,(nnnn) */ LD_RR_iNNi(rpBC),
	
	0x50: /* IN D,(C) */   IN_R_iCi(rD),
	0x51: /* OUT (C),D */  OUT_iCi_R(rD),
	0x52: /* SBC HL,DE */  SBC_HL_RR(rpDE),
	0x53: /* LD (nnnn),DE */ LD_iNNi_RR(rpDE),
	
	0x56: /* IM 1 */       IM(1),
	
	0x58: /* IN E,(C) */   IN_R_iCi(rE),
	0x59: /* OUT (C),E */  OUT_iCi_R(rE),
	
	0x5B: /* LD DE,(nnnn) */ LD_RR_iNNi(rpDE),
	
	0x5E: /* IM 2 */       IM(2),
	
	0x60: /* IN H,(C) */   IN_R_iCi(rH),
	0x61: /* OUT (C),H */  OUT_iCi_R(rH),
	0x62: /* SBC HL,HL */  SBC_HL_RR(rpHL),
	
	0x68: /* IN L,(C) */   IN_R_iCi(rL),
	0x69: /* OUT (C),L */  OUT_iCi_R(rL),
	
	0x6B: /* LD HL,(nnnn) */ LD_RR_iNNi(rpHL, true),
	
	0x72: /* SBC HL,SP */  SBC_HL_RR(rpSP),
	0x73: /* LD (nnnn),SP */ LD_iNNi_RR(rpSP),
	
	0x78: /* IN A,(C) */   IN_R_iCi(rA),
	0x79: /* OUT (C),A */  OUT_iCi_R(rA),
	
	0x7B: /* LD SP,(nnnn) */ LD_RR_iNNi(rpSP),
	
	0xA0: /* LDI */        LDI(),
	
	0xB0: /* LDIR */       LDIR(),
	
	0xB8: /* LDDR */       LDDR(),
	
	0x100: 'ed' /* dummy line so I don't have to keep adjusting trailing commas */
}

OPCODE_RUNNERS_FD = generateDDFDOpcodeSet(rpIY);

OPCODE_RUNNERS = {
	0x00: /* NOP */        NOP(),
	0x01: /* LD BC,nnnn */ LD_RR_NN(rpBC),
	0x02: /* LD (BC),A */  LD_iRRi_R(rpBC, rA),
	0x03: /* INC BC */     INC_RR(rpBC),
	0x04: /* INC B */      INC_R(rB),
	0x05: /* DEC B */      DEC_R(rB),
	0x06: /* LD B,nn */    LD_R_N(rB),
	0x07: /* RLCA */       RLCA(),
	0x08: /* EX AF,AF' */  EX_RR_RR(rpAF, rpAF_),
	0x09: /* ADD HL,BC */  ADD_RR_RR(rpHL, rpBC),
	0x0A: /* LD A,(BC) */  LD_R_iRRi(rA, rpBC),
	0x0B: /* DEC BC */     DEC_RR(rpBC),
	0x0C: /* INC C */      INC_R(rC),
	0x0D: /* DEC C */      DEC_R(rC),
	0x0E: /* LD C,nn */    LD_R_N(rC),
	0x0F: /* RRCA */       RRCA(),
	0x10: /* DJNZ nn */    DJNZ_N(),
	0x11: /* LD DE,nnnn */ LD_RR_NN(rpDE),
	0x12: /* LD (DE),A */  LD_iRRi_R(rpDE, rA),
	0x13: /* INC DE */     INC_RR(rpDE),
	0x14: /* INC D */      INC_R(rD),
	0x15: /* DEC D */      DEC_R(rD),
	0x16: /* LD D,nn */    LD_R_N(rD),
	0x17: /* RLA */        RLA(),
	0x18: /* JR nn */      JR_N(),
	0x19: /* ADD HL,DE */  ADD_RR_RR(rpHL, rpDE),
	0x1A: /* LD A,(DE) */  LD_R_iRRi(rA, rpDE),
	0x1B: /* DEC DE */     DEC_RR(rpDE),
	0x1C: /* INC E */      INC_R(rE),
	0x1D: /* DEC E */      DEC_R(rE),
	0x1E: /* LD E,nn */    LD_R_N(rE),
	0x1F: /* RRA */        RRA(),
	0x20: /* JR NZ,nn */   JR_C_N(FLAG_Z, false),
	0x21: /* LD HL,nnnn */ LD_RR_NN(rpHL),
	0x22: /* LD (nnnn),HL */ LD_iNNi_RR(rpHL),
	0x23: /* INC HL */     INC_RR(rpHL),
	0x24: /* INC H */      INC_R(rH),
	0x25: /* DEC H */      DEC_R(rH),
	0x26: /* LD H,nn */    LD_R_N(rH),
	
	0x28: /* JR Z,nn */    JR_C_N(FLAG_Z, true),
	0x29: /* ADD HL,HL */  ADD_RR_RR(rpHL, rpHL),
	0x2A: /* LD HL,(nnnn) */ LD_RR_iNNi(rpHL),
	0x2B: /* DEC HL */     DEC_RR(rpHL),
	0x2C: /* INC L */      INC_R(rL),
	0x2D: /* DEC L */      DEC_R(rL),
	0x2E: /* LD L,nn */    LD_R_N(rL),
	0x2F: /* CPL */        CPL(),
	0x30: /* JR NC,nn */   JR_C_N(FLAG_C, false),
	0x31: /* LD SP,nnnn */ LD_RR_NN(rpSP),
	0x32: /* LD (nnnn),a */ LD_iNNi_A(),
	0x33: /* INC SP */     INC_RR(rpSP),
	0x34: /* INC (HL) */   INC_iHLi(),
	0x35: /* DEC (HL) */   DEC_iHLi(),
	0x36: /* LD (HL),nn */ LD_iRRi_N(rpHL),
	0x37: /* SCF */        SCF(),
	0x38: /* JR C,nn */    JR_C_N(FLAG_C, true),
	0x39: /* ADD HL,SP */  ADD_RR_RR(rpHL, rpSP),
	0x3A: /* LD A,(nnnn) */ LD_A_iNNi(),
	0x3B: /* DEC SP */     DEC_RR(rpSP),
	0x3C: /* INC A */      INC_R(rA),
	0x3D: /* DEC A */      DEC_R(rA),
	0x3E: /* LD A,nn */    LD_R_N(rA),
	0x3F: /* CCF */        CCF(),
	0x40: /* LD B,B */     LD_R_R(rB, rB),
	0x41: /* LD B,C */     LD_R_R(rB, rC),
	0x42: /* LD B,D */     LD_R_R(rB, rD),
	0x43: /* LD B,E */     LD_R_R(rB, rE),
	0x44: /* LD B,H */     LD_R_R(rB, rH),
	0x45: /* LD B,L */     LD_R_R(rB, rL),
	0x46: /* LD B,(HL) */  LD_R_iRRi(rB, rpHL),
	0x47: /* LD B,A */     LD_R_R(rB, rA),
	0x48: /* LD C,B */     LD_R_R(rC, rB),
	0x49: /* LD C,C */     LD_R_R(rC, rC),
	0x4a: /* LD C,D */     LD_R_R(rC, rD),
	0x4b: /* LD C,E */     LD_R_R(rC, rE),
	0x4c: /* LD C,H */     LD_R_R(rC, rH),
	0x4d: /* LD C,L */     LD_R_R(rC, rL),
	0x4e: /* LD C,(HL) */  LD_R_iRRi(rC, rpHL),
	0x4f: /* LD C,A */     LD_R_R(rC, rA),
	0x50: /* LD D,B */     LD_R_R(rD, rB),
	0x51: /* LD D,C */     LD_R_R(rD, rC),
	0x52: /* LD D,D */     LD_R_R(rD, rD),
	0x53: /* LD D,E */     LD_R_R(rD, rE),
	0x54: /* LD D,H */     LD_R_R(rD, rH),
	0x55: /* LD D,L */     LD_R_R(rD, rL),
	0x56: /* LD D,(HL) */  LD_R_iRRi(rD, rpHL),
	0x57: /* LD D,A */     LD_R_R(rD, rA),
	0x58: /* LD E,B */     LD_R_R(rE, rB),
	0x59: /* LD E,C */     LD_R_R(rE, rC),
	0x5a: /* LD E,D */     LD_R_R(rE, rD),
	0x5b: /* LD E,E */     LD_R_R(rE, rE),
	0x5c: /* LD E,H */     LD_R_R(rE, rH),
	0x5d: /* LD E,L */     LD_R_R(rE, rL),
	0x5e: /* LD E,(HL) */  LD_R_iRRi(rE, rpHL),
	0x5f: /* LD E,A */     LD_R_R(rE, rA),
	0x60: /* LD H,B */     LD_R_R(rH, rB),
	0x61: /* LD H,C */     LD_R_R(rH, rC),
	0x62: /* LD H,D */     LD_R_R(rH, rD),
	0x63: /* LD H,E */     LD_R_R(rH, rE),
	0x64: /* LD H,H */     LD_R_R(rH, rH),
	0x65: /* LD H,L */     LD_R_R(rH, rL),
	0x66: /* LD H,(HL) */  LD_R_iRRi(rH, rpHL),
	0x67: /* LD H,A */     LD_R_R(rH, rA),
	0x68: /* LD L,B */     LD_R_R(rL, rB),
	0x69: /* LD L,C */     LD_R_R(rL, rC),
	0x6a: /* LD L,D */     LD_R_R(rL, rD),
	0x6b: /* LD L,E */     LD_R_R(rL, rE),
	0x6c: /* LD L,H */     LD_R_R(rL, rH),
	0x6d: /* LD L,L */     LD_R_R(rL, rL),
	0x6e: /* LD L,(HL) */  LD_R_iRRi(rL, rpHL),
	0x6f: /* LD L,A */     LD_R_R(rL, rA),
	0x70: /* LD (HL),B */  LD_iRRi_R(rpHL, rB),
	0x71: /* LD (HL),C */  LD_iRRi_R(rpHL, rC),
	0x72: /* LD (HL),D */  LD_iRRi_R(rpHL, rD),
	0x73: /* LD (HL),E */  LD_iRRi_R(rpHL, rE),
	0x74: /* LD (HL),H */  LD_iRRi_R(rpHL, rH),
	0x75: /* LD (HL),L */  LD_iRRi_R(rpHL, rL),
	0x76: /* HALT */       HALT(),
	0x77: /* LD (HL),A */  LD_iRRi_R(rpHL, rA),
	0x78: /* LD A,B */     LD_R_R(rA, rB),
	0x79: /* LD A,C */     LD_R_R(rA, rC),
	0x7a: /* LD A,D */     LD_R_R(rA, rD),
	0x7b: /* LD A,E */     LD_R_R(rA, rE),
	0x7c: /* LD A,H */     LD_R_R(rA, rH),
	0x7d: /* LD A,L */     LD_R_R(rA, rL),
	0x7e: /* LD A,(HL) */  LD_R_iRRi(rA, rpHL),
	0x7f: /* LD A,A */     LD_R_R(rA, rA),
	0x80: /* ADD A,B */    ADD_A_R(rB),
	0x81: /* ADD A,C */    ADD_A_R(rC),
	0x82: /* ADD A,D */    ADD_A_R(rD),
	0x83: /* ADD A,E */    ADD_A_R(rE),
	0x84: /* ADD A,H */    ADD_A_R(rH),
	0x85: /* ADD A,L */    ADD_A_R(rL),
	0x86: /* ADD A,(HL) */ ADD_A_iHLi(),
	0x87: /* ADD A,A */    ADD_A_R(rA),
	0x88: /* ADC A,B */    ADC_A_R(rB),
	0x89: /* ADC A,C */    ADC_A_R(rC),
	0x8a: /* ADC A,D */    ADC_A_R(rD),
	0x8b: /* ADC A,E */    ADC_A_R(rE),
	0x8c: /* ADC A,H */    ADC_A_R(rH),
	0x8d: /* ADC A,L */    ADC_A_R(rL),
	0x8e: /* ADC A,(HL) */ ADC_A_iHLi(),
	0x8f: /* ADC A,A */    ADC_A_R(rA),
	0x90: /* SUB A,B */    SUB_R(rB),
	0x91: /* SUB A,C */    SUB_R(rC),
	0x92: /* SUB A,D */    SUB_R(rD),
	0x93: /* SUB A,E */    SUB_R(rE),
	0x94: /* SUB A,H */    SUB_R(rH),
	0x95: /* SUB A,L */    SUB_R(rL),
	0x96: /* SUB A,(HL) */ SUB_iHLi(),
	0x97: /* SUB A,A */    SUB_R(rA),
	0x98: /* SBC A,B */    SBC_A_R(rB),
	0x99: /* SBC A,C */    SBC_A_R(rC),
	0x9a: /* SBC A,D */    SBC_A_R(rD),
	0x9b: /* SBC A,E */    SBC_A_R(rE),
	0x9c: /* SBC A,H */    SBC_A_R(rH),
	0x9d: /* SBC A,L */    SBC_A_R(rL),
	0x9e: /* SBC A,(HL) */ SBC_A_iHLi(),
	0x9f: /* SBC A,A */    SBC_A_R(rA),
	0xa0: /* AND A,B */    AND_R(rB),
	0xa1: /* AND A,C */    AND_R(rC),
	0xa2: /* AND A,D */    AND_R(rD),
	0xa3: /* AND A,E */    AND_R(rE),
	0xa4: /* AND A,H */    AND_R(rH),
	0xa5: /* AND A,L */    AND_R(rL),
	0xa6: /* AND A,(HL) */ AND_iHLi(),
	0xa7: /* AND A,A */    AND_R(rA),
	0xA8: /* XOR B */      XOR_R(rB),
	0xA9: /* XOR C */      XOR_R(rC),
	0xAA: /* XOR D */      XOR_R(rD),
	0xAB: /* XOR E */      XOR_R(rE),
	0xAC: /* XOR H */      XOR_R(rH),
	0xAD: /* XOR L */      XOR_R(rL),
	0xAE: /* XOR (HL) */   XOR_iHLi(),
	0xAF: /* XOR A */      XOR_R(rA),
	0xb0: /* OR B */       OR_R(rB),
	0xb1: /* OR C */       OR_R(rC),
	0xb2: /* OR D */       OR_R(rD),
	0xb3: /* OR E */       OR_R(rE),
	0xb4: /* OR H */       OR_R(rH),
	0xb5: /* OR L */       OR_R(rL),
	0xb6: /* OR (HL) */    OR_iHLi(),
	0xb7: /* OR A */       OR_R(rA),
	0xb8: /* CP B */       CP_R(rB),
	0xb9: /* CP C */       CP_R(rC),
	0xba: /* CP D */       CP_R(rD),
	0xbb: /* CP E */       CP_R(rE),
	0xbc: /* CP H */       CP_R(rH),
	0xbd: /* CP L */       CP_R(rL),
	0xbe: /* CP (HL) */    CP_iHLi(),
	0xbf: /* CP A */       CP_R(rA),
	0xC0: /* RET NZ */     RET_C(FLAG_Z, false),
	0xC1: /* POP BC */     POP_RR(rpBC),
	0xC2: /* JP NZ,nnnn */ JP_C_NN(FLAG_Z, false),
	0xC3: /* JP nnnn */    JP_NN(),
	0xC4: /* CALL NZ,nnnn */ CALL_C_NN(FLAG_Z, false),
	0xC5: /* PUSH BC */    PUSH_RR(rpBC),
	0xC6: /* ADD A,nn */   ADD_A_N(),
	0xC7: /* RST 0x00 */   RST(0x0000),
	0xC8: /* RET Z */      RET_C(FLAG_Z, true),
	0xC9: /* RET */        RET(),
	0xCA: /* JP Z,nnnn */  JP_C_NN(FLAG_Z, true),
	0xCB: /* shift code */ SHIFT(OPCODE_RUNNERS_CB),
	0xCC: /* CALL Z,nnnn */ CALL_C_NN(FLAG_Z, true),
	0xCD: /* CALL nnnn */  CALL_NN(),
	0xCE: /* ADC A,nn */   ADC_A_N(),
	0xCF: /* RST 0x08 */   RST(0x0008),
	0xD0: /* RET NC */     RET_C(FLAG_C, false),
	0xD1: /* POP DE */     POP_RR(rpDE),
	0xD2: /* JP NC,nnnn */ JP_C_NN(FLAG_C, false),
	0xD3: /* OUT (nn),A */ OUT_iNi_A(),
	0xD4: /* CALL NC,nnnn */ CALL_C_NN(FLAG_C, false),
	0xD5: /* PUSH DE */    PUSH_RR(rpDE),
	0xD6: /* SUB nn */     SUB_N(),
	0xD7: /* RST 0x10 */   RST(0x0010),
	0xD8: /* RET C */      RET_C(FLAG_C, true),
	0xD9: /* EXX */        EXX(),
	0xDA: /* JP C,nnnn */  JP_C_NN(FLAG_C, true),
	0xDB: /* IN A,(nn) */  IN_A_N(),
	0xDC: /* CALL C,nnnn */ CALL_C_NN(FLAG_C, true),
	0xDD: /* shift code */ SHIFT(OPCODE_RUNNERS_DD),
	0xDE: /* SBC A,nn */   SBC_A_N(),
	0xDF: /* RST 0x18 */   RST(0x0018),
	0xE0: /* RET PO */     RET_C(FLAG_P, false),
	0xE1: /* POP HL */     POP_RR(rpHL),
	0xE2: /* JP PO,nnnn */ JP_C_NN(FLAG_P, false),
	0xE3: /* EX (SP),HL */ EX_iSPi_RR(rpHL),
	0xE4: /* CALL PO,nnnn */ CALL_C_NN(FLAG_P, false),
	0xE5: /* PUSH HL */    PUSH_RR(rpHL),
	0xE6: /* AND nn */     AND_N(),
	0xE7: /* RST 0x20 */   RST(0x0020),
	0xE8: /* RET PE */     RET_C(FLAG_P, true),
	0xE9: /* JP (HL) */    JP_RR(rpHL),
	0xEA: /* JP PE,nnnn */ JP_C_NN(FLAG_P, true),
	0xEB: /* EX DE,HL */   EX_RR_RR(rpDE, rpHL),
	0xEC: /* CALL PE,nnnn */ CALL_C_NN(FLAG_P, true),
	0xED: /* shift code */ SHIFT(OPCODE_RUNNERS_ED),
	0xEE: /* XOR nn */     XOR_N(),
	0xEF: /* RST 0x28 */   RST(0x0028),
	0xF0: /* RET P */      RET_C(FLAG_S, false),
	0xF1: /* POP AF */     POP_RR(rpAF),
	0xF2: /* JP NZ,nnnn */ JP_C_NN(FLAG_S, false),
	0xF3: /* DI */         DI(),
	0xF4: /* CALL P,nnnn */ CALL_C_NN(FLAG_S, false),
	0xF5: /* PUSH AF */    PUSH_RR(rpAF),
	0xF6: /* OR nn */      OR_N(),
	0xF7: /* RST 0x30 */   RST(0x0030),
	0xF8: /* RET M */      RET_C(FLAG_S, true),
	0xF9: /* LD SP,HL */   LD_RR_RR(rpSP, rpHL),
	0xFA: /* JP M,nnnn */  JP_C_NN(FLAG_S, true),
	0xFB: /* EI */         EI(),
	0xFC: /* CALL M,nnnn */ CALL_C_NN(FLAG_S, true),
	0xFD: /* shift code */ SHIFT(OPCODE_RUNNERS_FD),
	0xFE: /* CP nn */      CP_N(),
	0xFF: /* RST 0x38 */   RST(0x0038),
	0x100: 0 /* dummy line so I don't have to keep adjusting trailing commas */
}

function runFrame() {
	display.startFrame();
	z80Interrupt();
	while (tstates < FRAME_LENGTH) {
		var opcode = memory.read(regPairs[rpPC]++);
		OPCODE_RUNNERS[opcode]();
		// if (tstates > 8500) console.log(tstates);
		while (display.nextEventTime != null && display.nextEventTime <= tstates) display.doEvent();
	}
	display.endFrame();
}

function z80Interrupt() {
	if (iff1) {
		if (halted) {
			regPairs[rpPC]++;
			halted = false;
		}
		iff1 = iff2 = 0;
		
		memory.write(--regPairs[rpSP], regPairs[rpPC] >> 8);
		memory.write(--regPairs[rpSP], regPairs[rpPC] & 0xff);
		
		/* TODO: R register */
		
		switch (im) {
			case 0:
				regPairs[rpPC] = 0x0038;
				tstates += 12;
				break;
			case 1:
				regPairs[rpPC] = 0x0038;
				tstates += 13;
				break;
			case 2:
				var inttemp = (regs[rI] << 8) | 0xff;
				var l = memory.read(inttemp);
				var h = memory.read( (inttemp+1) & 0xffff );
				regPairs[rpPC] = (h<<8) | l;
				tstates += 19;
				break;
		}
	}
}

function tick() {
	runFrame();
	tstates -= FRAME_LENGTH;
	setTimeout(tick, 20);
}

window.onload = function() {
	display.init();
	document.onkeydown = keyDown;
	document.onkeyup = keyUp;
	document.onkeypress = keyPress;
	tick();
	//runFrame();
}
