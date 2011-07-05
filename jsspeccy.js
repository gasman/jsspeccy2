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
