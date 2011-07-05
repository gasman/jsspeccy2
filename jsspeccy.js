function JSSpeccy(container) {
	if (typeof(container) === 'string') {
		container = document.getElementById(container);
	}
	var ui = UI({
		container: container
	});
	
	var memory = Memory();
	
	var keyboard = Keyboard();
	
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
	
	function tick() {
		processor.runFrame();
		setTimeout(tick, 20);
	}
	
	tick();
}
