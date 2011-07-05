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
	
	var SCALE_FACTOR = 2;
	
	var CANVAS_WIDTH = 256 + 8 * (LEFT_BORDER_CHARS + RIGHT_BORDER_CHARS);
	var CANVAS_HEIGHT = 192 + TOP_BORDER_LINES + BOTTOM_BORDER_LINES;
	
	var canvas, ctx, imageData, pixels;
	
	self.init = function() {
		document.body.style.backgroundColor = 'black';
		var div = document.createElement('div');
		div.style.width = CANVAS_WIDTH * SCALE_FACTOR + 'px';
		div.style.height = CANVAS_HEIGHT * SCALE_FACTOR + 'px';
		div.style.margin = '75px auto';
		canvas = document.createElement('canvas');
		canvas.width = CANVAS_WIDTH;
		canvas.height = CANVAS_HEIGHT;
		div.appendChild(canvas);
		document.body.appendChild(div);
		canvas.style.width = CANVAS_WIDTH * SCALE_FACTOR + 'px';
		canvas.style.height = CANVAS_HEIGHT * SCALE_FACTOR + 'px';
		canvas.style.imageRendering = '-webkit-optimize-contrast';
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

function tick() {
	runFrame();
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
