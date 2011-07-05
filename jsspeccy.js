function Spectrum(opts) {
	var self = {};
	
	var ui = opts.ui;
	var keyboard = opts.keyboard;
	
	var memory = Memory();
	
	var display = Display({
		ui: ui,
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
	
	self.runFrame = function() {
		processor.runFrame();
	}
	
	return self;
}

function JSSpeccy(container) {
	if (typeof(container) === 'string') {
		container = document.getElementById(container);
	}
	var ui = UI({
		container: container
	});
	
	var keyboard = Keyboard();
	
	var spectrum = Spectrum({
		ui: ui,
		keyboard: keyboard
	})
	
	function tick() {
		spectrum.runFrame();
		setTimeout(tick, 20);
	}
	
	tick();
}
