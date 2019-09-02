JSSpeccy.Keyboard = function() {
	var self = {};
	self.active = true;
	
	var keyStates = [];
	for (var row = 0; row < 8; row++) {
		keyStates[row] = 0xff;
	}
	
	function keyDown(evt) {
		if (self.active) {
			registerKeyDown(evt.keyCode);
			if (!evt.metaKey) return false;
		}
	}
	function registerKeyDown(keyNum) {
		var keyCode = keyCodes[keyNum];
		if (keyCode == null) return;
		keyStates[keyCode.row] &= ~(keyCode.mask);
		if (keyCode.caps) keyStates[0] &= 0xfe;
		if (keyCode.sym) keyStates[7] &= 0xfd;
	}
	function keyUp(evt) {
		registerKeyUp(evt.keyCode);
		if (self.active && !evt.metaKey) return false;
	}
	function registerKeyUp(keyNum) {
		var keyCode = keyCodes[keyNum];
		if (keyCode == null) return;
		keyStates[keyCode.row] |= keyCode.mask;
		if (keyCode.caps) keyStates[0] |= 0x01;
		if (keyCode.sym) keyStates[7] |= 0x02;
	}
	function keyPress(evt) {
		if (self.active && !evt.metaKey) return false;
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
		9: {row: 7, mask: 0x02, caps: true}, /* tab => caps + sym (ext) */
		20: {row: 3, mask: 0x02, caps: true}, /* caps lock => caps + 2 */
		27: {row: 3, mask: 0x01, caps: true}, /* escape => caps + 1 (edit) */
		37: {row: 3, mask: 0x10, caps: true}, /* left arrow => caps + 5 */
		38: {row: 4, mask: 0x08, caps: true}, /* up arrow => caps + 7 */
		39: {row: 4, mask: 0x04, caps: true}, /* right arrow => caps + 8 */
		40: {row: 4, mask: 0x10, caps: true}, /* down arrow => caps + 6 */
		
		/* symbols */
		59: {row: 5, mask: 0x02, sym: true}, /* ; => sym + O */
		188: {row: 7, mask: 0x08, sym: true}, /* , => sym + N */
		190: {row: 7, mask: 0x04, sym: true}, /* . => sym + M */
		222: {row: 4, mask: 0x08, sym: true}, /* ' => sym + 7 */
		
		999: null
	};
	
	self.poll = function(addr) {
		var result = 0xff;
		for (var row = 0; row < 8; row++) {
			if (!(addr & (1 << (row+8)))) { /* bit held low, so scan this row */
				result &= keyStates[row];
			}
		}
		return result;
	}
	
	document.onkeydown = keyDown;
	document.onkeyup = keyUp;
	document.onkeypress = keyPress;
	
	return self;
}
