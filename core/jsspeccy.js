if (!window.DataView) window.DataView = jDataView;

function JSSpeccy(container, opts) {
	var self = {};

	if (typeof(container) === 'string') {
		container = document.getElementById(container);
	}
	if (!opts) {
		opts = {};
	}

	var viewport = JSSpeccy.Viewport({
		container: container,
		scaleFactor: opts.scaleFactor || 2,
		onClickIcon: function() {self.start();}
	});

	if (!('dragToLoad' in opts) || opts['dragToLoad']) {
		/* set up drag event on canvas to load files */
		viewport.canvas.ondragenter = function() {
			// Needed for web browser compatibility
			return false;
		};
		viewport.canvas.ondragover = function () {
			// Needed for web browser compatibility
			return false;
		};
		viewport.canvas.ondrop = function(evt) {
			var files = evt.dataTransfer.files;
			self.loadLocalFile(files[0]);
			return false;
		};
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

	self.reset = function() {
		spectrum.reset();
	};

	function updateViewportIcon() {
		if (self.isLoading) {
			viewport.showIcon('loading');
		} else if (!self.isRunning) {
			viewport.showIcon('play');
		} else {
			viewport.showIcon(null);
		}
	}

	self.isLoading = false;
	self.loadLocalFile = function(file, opts) {
		var reader = new FileReader();
		self.isLoading = true;
		updateViewportIcon();
		reader.onloadend = function() {
			self.isLoading = false;
			updateViewportIcon();
			self.loadFile(file.name, this.result, opts);
		};
		reader.readAsArrayBuffer(file);
	};
	self.loadFromUrl = function(url, opts) {
		var request = new XMLHttpRequest();

		request.addEventListener('error', function(e) {
			alert('Error loading from URL:' + url);
		});

		request.addEventListener('load', function(e) {
			self.isLoading = false;
			updateViewportIcon();
			data = request.response;
			self.loadFile(url, data, opts);
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
		self.isLoading = true;
		updateViewportIcon();
		request.send();
	};

	self.loadFile = function(name, data, opts) {
		if (!opts) opts = {};

		var fileType = 'unknown';
		if (name && name.match(/\.sna(\.zip)?$/i)) {
			fileType = 'sna';
		} else if (name && name.match(/\.tap(\.zip)?$/i)) {
			fileType = 'tap';
		} else if (name && name.match(/\.tzx(\.zip)?$/i)) {
			fileType = 'tzx';
		} else if (name && name.match(/\.z80(\.zip)?$/i)) {
			fileType = 'z80';
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
				loadSnapshot(JSSpeccy.SnaFile(data));
				break;
			case 'z80':
				loadSnapshot(JSSpeccy.Z80File(data));
				break;
			case 'tap':
				loadTape(JSSpeccy.TapFile(data), opts);
				break;
			case 'tzx':
				loadTape(JSSpeccy.TzxFile(data), opts);
				break;
		}
	};

	/* Load a snapshot from a snapshot object (i.e. the result of loadSna) */
	function loadSnapshot(snapshot) {
		self.setModel(snapshot.model);
		self.reset(); /* required for the scenario that setModel does not change the current
			active machine, and current machine state would interfere with the snapshot loading -
			e.g. paging is locked */
		spectrum.loadSnapshot(snapshot);
		if (!self.isRunning) {
			spectrum.drawFullScreen();
		}
	}
	function loadTape(tape, opts) {
		if (!opts) opts = {};
		self.currentTape = tape;
		if (opts.autoload) {
			var snapshotBuffer = JSSpeccy.autoloaders[currentModel.tapeAutoloader].buffer;
			var snapshot = JSSpeccy.Z80File(snapshotBuffer);
			loadSnapshot(snapshot);
		}
	}

	self.isRunning = false;
	self.currentTape = null;

	function tick() {
		var startTime = (new Date()).getTime();
		if (!self.isRunning) return;
		spectrum.runFrame();
		var endTime = (new Date()).getTime();
		var waitTime = 20 - (endTime - startTime);
		setTimeout(tick, Math.max(0, waitTime));
	}

	self.onStart = Event();
	self.start = function() {
		if (self.isRunning) return;
		self.isRunning = true;
		updateViewportIcon();
		self.onStart.trigger();
		tick();
	};
	self.onStop = Event();
	self.stop = function() {
		self.isRunning = false;
		updateViewportIcon();
		self.onStop.trigger();
	};
	self.deactivateKeyboard = function() {
		keyboard.active = false;
	};
	self.activateKeyboard = function() {
		keyboard.active = true;
	};

	var keyboard = JSSpeccy.Keyboard();

	/* define a list of rules to be triggered when the Z80 executes an opcode at a specified address;
		each rule is a tuple of (address, opcode, expression_to_run). If expression_to_run evaluates
		to false, the remainder of the opcode's execution is skipped */
	var z80Traps = [
		[0x056b, 0xc0, 'JSSpeccy.traps.tapeLoad()'],
		[0x0111, 0xc0, 'JSSpeccy.traps.tapeLoad()']
	];

	JSSpeccy.buildZ80({
		traps: z80Traps,
		applyContention: true
	});

	var currentModel, spectrum;

	self.onChangeModel = Event();
	self.getModel = function() {
		return currentModel;
	};
	self.setModel = function(newModel) {
		if (newModel != currentModel) {
			spectrum = JSSpeccy.Spectrum({
				viewport: viewport,
				keyboard: keyboard,
				model: newModel,
				controller: self
			});
			currentModel = newModel;
			self.onChangeModel.trigger(newModel);
		}
	};
	self.setModel(JSSpeccy.Spectrum.MODEL_128K);

	if (opts.loadFile) {
		self.loadFromUrl(opts.loadFile, {'autoload': opts.autoload});
	}

	if (!('autostart' in opts) || opts['autostart']) {
		self.start();
	} else {
		self.stop();
	}

	return self;
}
JSSpeccy.traps = {};
JSSpeccy.traps.tapeLoad = function() {
	/* will be overridden when a JSSpeccy.Spectrum object is initialised */
};
