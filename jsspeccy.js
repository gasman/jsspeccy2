var memory = Memory();

var keyboard = Keyboard();

var display = Display({
	memory: memory
});

var ioBus = IOBus({
	keyboard: keyboard,
	display: display,
	memory: memory
});

var processor = Z80({
	memory: memory,
	ioBus: ioBus,
	display: display
});

function tick() {
	processor.runFrame();
	setTimeout(tick, 20);
}

function JSSpeccy(container) {
	if (typeof(container) === 'string') {
		container = document.getElementById(container);
	}
	display.init(container);
	keyboard.attachEvents();
	tick();
}
