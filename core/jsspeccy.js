/**
 * @license JSSpeccy v2.2.1 - http://jsspeccy.zxdemo.org/
 * Copyright 2014 Matt Westcott <matt@west.co.tt> and contributors
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation, either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <http://www.gnu.org/licenses/>.
 */

if (!window.DataView) window.DataView = jDataView;

function JSSpeccy(container, opts) {
	var self = {};

	if (typeof(container) === 'string') {
		container = document.getElementById(container);
	}
	if (!opts) {
		opts = {};
	}

	var originalDocumentTitle = document.title;


	/* == Z80 core == */
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


	/* == Event mechanism == */
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

	function Setting(initialValue) {
		var self = {};

		var value = initialValue;

		self.onChange = Event();

		self.get = function() {
			return value;
		};
		self.set = function(newValue) {
			if (newValue == value) return;
			value = newValue;
			self.onChange.trigger(newValue);
		};
		return self;
	}

	self.settings = {
		'checkerboardFilter': Setting(opts.checkerboardFilter || false)
	};

	/* == Execution state == */
	self.isDownloading = false;
	self.isRunning = false;
	self.currentTape = null;
	var currentModel, spectrum;


	/* == Set up viewport == */
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

	function updateViewportIcon() {
		if (self.isDownloading) {
			viewport.showIcon('loading');
		} else if (!self.isRunning) {
			viewport.showIcon('play');
		} else {
			viewport.showIcon(null);
		}
	}


	/* == Keyboard control == */
	var keyboard = JSSpeccy.Keyboard();
	self.deactivateKeyboard = function() {
		keyboard.active = false;
	};
	self.activateKeyboard = function() {
		keyboard.active = true;
	};


	/* == Audio == */
	var soundBackend = JSSpeccy.SoundBackend();
	self.onChangeAudioState = Event();
	self.getAudioState = function() {
		return soundBackend.isEnabled;
	};
	self.setAudioState = function(requestedState) {
		var originalState = soundBackend.isEnabled;
		var newState = soundBackend.setAudioState(requestedState);
		if (originalState != newState) self.onChangeAudioState.trigger(newState);
	};

	/* == Snapshot / Tape file handling == */
	self.loadLocalFile = function(file, opts) {
		var reader = new FileReader();
		self.isDownloading = true;
		updateViewportIcon();
		reader.onloadend = function() {
			self.isDownloading = false;
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
			self.isDownloading = false;
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
		self.isDownloading = true;
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
			} else if (data.byteLength === 49179 || data.byteLength === 131103 || data.byteLength === 147487) {
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

	/* Load a snapshot from a snapshot object (i.e. JSSpeccy.SnaFile or JSSpeccy.Z80File) */
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
			if (tape.isTurbo()) tape.startTape();

		}
	}


	/* == Selecting Spectrum model == */
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
				soundBackend: soundBackend,
				controller: self,
				borderEnabled: ('border' in opts) ? opts.border : true
			});
			currentModel = newModel;
			initReferenceTime();
			self.onChangeModel.trigger(newModel);
		}
	};


	/* == Timing / main execution loop == */
	var msPerFrame;
	var remainingMs = 0; /* number of milliseconds that have passed that have not yet been
	'consumed' by running a frame of emulation */

	function initReferenceTime() {
		msPerFrame = (currentModel.frameLength * 1000) / currentModel.clockSpeed;
		remainingMs = 0;
		lastFrameStamp = performance.now();
	}

	var PERFORMANCE_FRAME_COUNT = 10;  /* average over this many frames when measuring performance */
	var performanceTotalMilliseconds = 0;
	var performanceFrameNum = 0;

	var requestAnimationFrame = (
		window.requestAnimationFrame || window.msRequestAnimationFrame ||
		window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame ||
		window.oRequestAnimationFrame ||
		function(callback) {
			setTimeout(function() {
				callback(performance.now());
			}, 10);
		}
	);

	function tick() {
		if (!self.isRunning) return;

		stampBefore = performance.now();
		var timeElapsed = stampBefore - lastFrameStamp;
		remainingMs += stampBefore - lastFrameStamp;
		if (remainingMs > msPerFrame) {
			/* run a frame of emulation */
			spectrum.runFrame();
			var stampAfter = performance.now();

			if (opts.measurePerformance) {
				performanceTotalMilliseconds += (stampAfter - stampBefore);
				performanceFrameNum = (performanceFrameNum + 1) % PERFORMANCE_FRAME_COUNT;
				if (performanceFrameNum === 0) {
					document.title = originalDocumentTitle + ' ' + (performanceTotalMilliseconds / PERFORMANCE_FRAME_COUNT).toFixed(1) + " ms/frame; elapsed: " + timeElapsed;
					performanceTotalMilliseconds = 0;
				}
			}

			remainingMs -= msPerFrame;

			/* As long as requestAnimationFrame runs more frequently than the Spectrum's frame rate -
			which should normally be the case for a focused browser window (approx 60Hz vs 50Hz) -
			there should be either zero or one emulation frames run per call to tick(). If there's more
			than one emulation frame to run (i.e. remainingMs > msPerFrame at this point), we have
			insufficient performance to run at full speed (either the frame is taking more than 20ms to
			execute, or requestAnimationFrame is being called too infrequently). If so, clear
			remainingMs so that it doesn't grow indefinitely
			*/
			if (remainingMs > msPerFrame) remainingMs = 0;
		}
		lastFrameStamp = stampBefore;

		requestAnimationFrame(tick);
	}

	self.onStart = Event();
	self.start = function() {
		if (self.isRunning) return;
		self.isRunning = true;
		updateViewportIcon();
		self.onStart.trigger();

		initReferenceTime();

		requestAnimationFrame(tick);
	};
	self.onStop = Event();
	self.stop = function() {
		self.isRunning = false;
		updateViewportIcon();
		self.onStop.trigger();
	};
	self.reset = function() {
		spectrum.reset();
	};


	/* == Startup conditions == */
	self.setModel(JSSpeccy.Spectrum.MODEL_128K);

	if (opts.loadFile) {
		self.loadFromUrl(opts.loadFile, {'autoload': opts.autoload});
	}

	if (!('audio' in opts) || opts['audio']) {
		self.setAudioState(true);
	} else {
		self.setAudioState(false);
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
