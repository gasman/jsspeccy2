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
	
	function tick() {
		spectrum.runFrame();
		setTimeout(tick, 20);
	}
	
	tick();
}
