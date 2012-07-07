JSSpeccy.Spectrum = function(opts) {
	var self = {};

	var model = opts.model || JSSpeccy.Spectrum.MODEL_128K;

	var ui = opts.ui;
	var keyboard = opts.keyboard;
	var controller = opts.controller;

	var memory = JSSpeccy.Memory({
		model: (model === JSSpeccy.Spectrum.MODEL_48K ? JSSpeccy.Memory.MODEL_48K : JSSpeccy.Memory.MODEL_128K)
	});

	var display = JSSpeccy.Display({
		ui: ui,
		memory: memory,
		model: (model === JSSpeccy.Spectrum.MODEL_48K ? JSSpeccy.Display.MODEL_48K : JSSpeccy.Display.MODEL_128K)
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
		display.startFrame();
		processor.z80Interrupt();
		processor.runFrame(display.frameLength);
		display.endFrame();
		processor.setTstates(processor.getTstates() - display.frameLength);
	};
	self.reset = function() {
		processor.reset();
		memory.reset();
	};

	self.loadSnapshot = function(snapshot) {
		memory.loadFromSnapshot(snapshot.memoryPages);
		processor.loadFromSnapshot(snapshot.registers);
		display.setBorder(snapshot.ulaState.borderColour);
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
JSSpeccy.Spectrum.MODEL_48K = 1;
JSSpeccy.Spectrum.MODEL_128K = 2;

