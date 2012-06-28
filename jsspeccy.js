function JSSpeccy(container, opts) {
	if (typeof(container) === 'string') {
		container = document.getElementById(container);
	}
	if (!opts) {
		opts = {};
	}

	function Event() {
		var self = {};
		var listeners = [];

		self.bind = function(callback) {
			listeners.push(callback);
		};
		self.unbind = function(callback) {
			for (var i = listeners.length - 1; i >= 0; i--) {
				if (listeners[i] == callback) listeners.splice(i, 1);
			}
		};
		self.trigger = function() {
			var args = arguments;
			/* event is considered 'cancelled' if any handler returned a value of false
				(specifically false, not just a falsy value). Exactly what this means is
				up to the caller - we just return false */
			var cancelled = false;
			for (var i = 0; i < listeners.length; i++) {
				cancelled = cancelled || (listeners[i].apply(null, args) === false);
			}
			return !cancelled;
		};

		return self;
	}

	var controller = {};
	controller.reset = function() {
		spectrum.reset();
	};
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
	};

	controller.isRunning = false;

	function tick() {
		if (!controller.isRunning) return;
		spectrum.runFrame();
		setTimeout(tick, 20);
	}

	controller.onStart = Event();
	controller.start = function() {
		controller.isRunning = true;
		controller.onStart.trigger();
		tick();
	};
	controller.onStop = Event();
	controller.stop = function() {
		controller.isRunning = false;
		controller.onStop.trigger();
	};

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
	});

	if (!('autostart' in opts) || opts['autostart']) {
		controller.start();
	}
}
