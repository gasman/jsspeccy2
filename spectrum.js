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
