var memory = Memory();

var display = Display({
	memory: memory
});

function IOBus() {
	var self = {};
	
	self.read = function(addr) {
		if ((addr & 0x0001) == 0x0000) {
			return keyboard.poll(addr);
		} else {
			return 0xff;
		}
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
var keyboard = Keyboard();

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
	keyboard.attachEvents();
	tick();
	//runFrame();
}
