function JSSpeccy(container, opts) {
	if (typeof(container) === 'string') {
		container = document.getElementById(container);
	}
	if (!opts) {
		opts = {};
	}
	
	var controller = {};
	controller.reset = function() {
		spectrum.reset();
	}
	controller.loadFile = function(name, data) {
		if ( name.match(/\.sna$/) ) {
			 var snapshot = JSSpeccy.loadSna(data);
			 spectrum = JSSpeccy.Spectrum({
				ui: ui,
				keyboard: keyboard,
				model: snapshot.model
			 });
			 spectrum.loadSnapshot(snapshot);
		}
	}
	
	var ui = JSSpeccy.UI({
		container: container,
		controller: controller,
		scaleFactor: opts.scaleFactor || 2
	});
	
	var keyboard = JSSpeccy.Keyboard();
	
	var spectrum = JSSpeccy.Spectrum({
		ui: ui,
		keyboard: keyboard,
		model: JSSpeccy.Spectrum.MODEL_128K
	})
	
	controller.isRunning = false;
	
	function tick() {
		if (!controller.isRunning) return;
		spectrum.runFrame();
		setTimeout(tick, 20);
	}
	
	controller.start = function() {
		controller.isRunning = true;
		tick();
	}
	controller.stop = function() {
		controller.isRunning = false;
	}
	if (!('autostart' in opts) || opts['autostart']) {
		controller.start();
	}
}
