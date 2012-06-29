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
	controller.loadLocalFile = function(file) {
		var reader = new FileReader();
		reader.onloadend = function() {
			controller.loadFile(file.name, this.result);
		};
		reader.readAsArrayBuffer(file);
	};
	controller.loadFromUrl = function(url) {
		var request = new XMLHttpRequest();

		request.addEventListener('error', function(e) {
			alert('Error loading from URL:' + url);
		});

		request.addEventListener('load', function(e) {
			data = request.response;
			controller.loadFile(url, data);
			/* URL is not ideal for passing as the 'filename' argument - e.g. the file
			may be served through a server-side script with a non-indicative file
			extension - but it's better than nothing, and hopefully the heuristics
			in loadFile will figure out what it is either way.
			Ideally we'd look for a header like Content-Disposition for a better clue,
			but XHR (on Chrome at least) doesn't give us access to that. Grr. */
		});

		/* trigger XHR */
		request.open('GET', url, true);
		request.responseType = "arraybuffer";
		request.send();
	};

	controller.loadFile = function(name, data) {
		var fileType = 'unknown';
		if (name && name.match(/\.sna$/i)) {
			fileType = 'sna';
		} else if (name && name.match(/\.tap$/i)) {
			fileType = 'tap';
		} else if (name && name.match(/\.tzx$/i)) {
			fileType = 'tzx';
		} else {
			var signatureBytes = new Uint8Array(data, 0, 8);
			var signature = String.fromCharCode.apply(null, signatureBytes);
			if (signature == "ZXTape!\x1A") {
				fileType = 'tzx';
			} else if (data.byteLength == 49179) {
				fileType = 'sna';
			} else if (JSSpeccy.TapFile.isValid(data)) {
				fileType = 'tap';
			}
		}

		switch (fileType) {
			case 'sna':
				var snapshot = JSSpeccy.loadSna(data);
				spectrum = JSSpeccy.Spectrum({
					ui: ui,
					keyboard: keyboard,
					model: snapshot.model
				});
				spectrum.loadSnapshot(snapshot);
				break;
			case 'tap':
				controller.currentTape = JSSpeccy.TapFile(data);
				break;
			case 'tzx':
				controller.currentTape = JSSpeccy.TzxFile(data);
				break;
		}
	};

	controller.isRunning = false;
	controller.currentTape = null;

	function tick() {
		var startTime = (new Date()).getTime();
		if (!controller.isRunning) return;
		spectrum.runFrame();
		var endTime = (new Date()).getTime();
		var waitTime = 20 - (endTime - startTime);
		setTimeout(tick, Math.max(0, waitTime));
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

	/* define a list of rules to be triggered when the Z80 executes an opcode at a specified address;
		each rule is a tuple of (address, opcode, expression_to_run). If expression_to_run evaluates
		to false, the remainder of the opcode's execution is skipped */
	var z80Traps = [
		[0x056b, 0xc0, 'JSSpeccy.traps.tapeLoad()'],
		[0x0111, 0xc0, 'JSSpeccy.traps.tapeLoad()']
	];

	JSSpeccy.buildZ80({traps: z80Traps});

	var spectrum = JSSpeccy.Spectrum({
		ui: ui,
		keyboard: keyboard,
		model: JSSpeccy.Spectrum.MODEL_128K,
		controller: controller
	});

	if (!('autostart' in opts) || opts['autostart']) {
		controller.start();
	}
}
JSSpeccy.traps = {};
JSSpeccy.traps.tapeLoad = function() {
	/* will be overridden when a JSSpeccy.Spectrum object is initialised */
};
