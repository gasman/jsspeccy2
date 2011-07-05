var memory = Memory();

var display = Display({
	memory: memory
});

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

var z80 = Z80({
	memory: memory,
	ioBus: ioBus,
	display: display
});

function tick() {
	z80.runFrame();
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
