JSSpeccy.Spectrum = function(opts) {
	var self = {};
	
	var ui = opts.ui;
	var keyboard = opts.keyboard;
	
	var memory = JSSpeccy.Memory();
	
	var display = JSSpeccy.Display({
		ui: ui,
		memory: memory
	});
	
	var ioBus = JSSpeccy.IOBus({
		keyboard: keyboard,
		display: display,
		memory: memory
	});
	
	var processor = JSSpeccy.Z80({
		memory: memory,
		ioBus: ioBus,
		display: display
	});
	
	self.runFrame = function() {
		processor.runFrame();
	}
	
	return self;
}
