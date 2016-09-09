JSSpeccy.Spectrum = function(opts) {
	var self = {};

	model = opts.model || JSSpeccy.Spectrum.MODEL_128K;

	var viewport = opts.viewport;
	var keyboard = opts.keyboard;
	var controller = opts.controller;
	var soundBackend = opts.soundBackend;

	var memory = JSSpeccy.Memory({
		model: model
	});

	var display = JSSpeccy.Display({
		viewport: viewport,
		memory: memory,
		model: model,
		borderEnabled: opts.borderEnabled,
		settings: {
			'checkerboardFilter': controller.settings.checkerboardFilter
		}
	});

	var sound = JSSpeccy.SoundGenerator({
		model: model,
		soundBackend: soundBackend
	});

	var ioBus = JSSpeccy.IOBus({
		keyboard: keyboard,
		display: display,
		memory: memory,
		sound: sound,
		contentionTable: model.contentionTable
	});

	var processor = JSSpeccy.Z80({
		memory: memory,
		ioBus: ioBus,
		display: display
	});

	/* internal state to allow picking up mid-frame (e.g. when loading from a snapshot) */
	var startNextFrameWithInterrupt = true;

	self.runFrame = function() {
		display.startFrame();
		if (startNextFrameWithInterrupt) {
			processor.requestInterrupt();
		}
		processor.runFrame(model.frameLength);
		display.endFrame();
		sound.endFrame();
		processor.setTstates(processor.getTstates() - model.frameLength);
		startNextFrameWithInterrupt = true;
	};
	self.reset = function() {
		processor.reset();
		memory.reset();
		sound.reset();
	};

	self.loadSnapshot = function(snapshot) {
		memory.loadFromSnapshot(snapshot.memoryPages);
		if ('pagingFlags' in snapshot.ulaState) {
			memory.setPaging(snapshot.ulaState.pagingFlags);
		}
		processor.loadFromSnapshot(snapshot.registers);
		display.setBorder(snapshot.ulaState.borderColour);
		if ('tstates' in snapshot) {
			processor.setTstates(snapshot.tstates);
			startNextFrameWithInterrupt = false;
		}
	};

	self.drawFullScreen = function() {
		display.drawFullScreen();
	};

	JSSpeccy.traps.tapeLoad = function() {
		if (!controller.currentTape) return true; /* no current tape, so return from trap;
			resume the trapped instruction */
		var block = controller.currentTape.getNextLoadableBlock();
		if (!block) return true; /* no loadable blocks on tape, so return from trap */

		var success = true;

		var expectedBlockType = processor.getA_();
		var startAddress = processor.getIX();
		var requestedLength = processor.getDE();

		var actualBlockType = block[0];
		if (expectedBlockType != actualBlockType) {
			success = false;
		} else {
			/* block type is the one we're looking for */
			if (processor.getCarry_()) {
				/* perform a LOAD */
				var offset = 0;
				var checksum = actualBlockType;

				while (offset < requestedLength) {
					var loadedByte = block[offset+1];
					if (typeof(loadedByte) == 'undefined') {
						/* have run out of bytes to load - indicate error */
						success = false;
						break;
					}
					memory.write((startAddress + offset) & 0xffff, loadedByte);
					checksum ^= loadedByte;
					offset++;
				}

				/* if the full quota of bytes has been loaded, compare checksums now */
				var expectedChecksum = block[offset+1];
				success = (checksum === expectedChecksum);
			} else {
				/* perform a VERIFY */
				success = true; /* for now, just report success. TODO: do VERIFY properly... */
			}
		}

		processor.setCarry(success); /* set or reset carry flag to indicate success or failure respectively */
		processor.setPC(0x05e2); /* address at which to exit tape trap */
		return false; /* cancel execution of the opcode where this trap happened */
	};

	return self;
};


JSSpeccy.buildContentionTables = function(model) {
	function buildTable(pattern) {
		var table = new Uint8Array(model.frameLength);
		for (var line = 0; line < 192; line++) {
			var lineStartTime = model.tstatesUntilOrigin + (line * model.tstatesPerScanline);
			for (var x = 0; x < 128; x++) {
				table[lineStartTime + x] = pattern[x % 8];
			}
		}
		return table;
	}

	model.contentionTable = buildTable(model.contentionPattern);
	model.noContentionTable = buildTable([0,0,0,0,0,0,0,0]);
};

JSSpeccy.Spectrum.MODEL_48K = {
	id: '48k',
	name: 'Spectrum 48K',
	tapeAutoloader: 'tape_48.z80',
	tstatesUntilOrigin: 14336,
	tstatesPerScanline: 224,
	frameLength: 69888,
	clockSpeed: 3500000,
	contentionPattern: [6,5,4,3,2,1,0,0]
};
JSSpeccy.buildContentionTables(JSSpeccy.Spectrum.MODEL_48K);

JSSpeccy.Spectrum.MODEL_128K = {
	id: '128k',
	name: 'Spectrum 128K',
	tapeAutoloader: 'tape_128.z80',
	tstatesUntilOrigin: 14362,
	tstatesPerScanline: 228,
	frameLength: 70908,
	clockSpeed: 3546900,
	contentionPattern: [6,5,4,3,2,1,0,0]
};
JSSpeccy.buildContentionTables(JSSpeccy.Spectrum.MODEL_128K);

JSSpeccy.Spectrum.MODELS = [
	JSSpeccy.Spectrum.MODEL_48K,
	JSSpeccy.Spectrum.MODEL_128K
];
