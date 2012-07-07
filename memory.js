JSSpeccy.Memory = function(opts) {
	var self = {};
	var model = opts.model || JSSpeccy.Spectrum.MODEL_128K;

	var contentionTableLength = model.frameLength;

	var noContentionTable = model.noContentionTable;
	var contentionTable = model.contentionTable;

	function MemoryPage(data, isContended) {
		var self = {};
		self.memory = (data || new Uint8Array(0x4000));
		self.contentionTable = (isContended ? contentionTable : noContentionTable);
		return self;
	}
	
	var ramPages = [];
	for (var i = 0; i < 8; i++) {
		ramPages[i] = MemoryPage(null, i & 0x01); /* for MODEL_128K (and implicitly 48K), odd pages are contended */
	}

	var romPages = {
		'48.rom': MemoryPage(JSSpeccy.roms['48.rom']),
		'128-0.rom': MemoryPage(JSSpeccy.roms['128-0.rom']),
		'128-1.rom': MemoryPage(JSSpeccy.roms['128-1.rom'])
	};

	var scratch = MemoryPage();
	
	var readSlots = [
		model === JSSpeccy.Spectrum.MODEL_48K ? romPages['48.rom'].memory : romPages['128-0.rom'].memory,
		ramPages[5].memory,
		ramPages[2].memory,
		ramPages[0].memory
	];

	var writeSlots = [
		scratch.memory,
		ramPages[5].memory,
		ramPages[2].memory,
		ramPages[0].memory
	];

	var contentionBySlot = [
		noContentionTable,
		contentionTable,
		noContentionTable,
		noContentionTable
	];

	self.isContended = function(addr) {
		return (contentionBySlot[addr >> 14] == contentionTable);
	};

	self.contend = function(addr, tstate) {
		return contentionBySlot[addr >> 14][tstate % contentionTableLength];
	};

	self.read = function(addr) {
		var page = readSlots[addr >> 14];
		return page[addr & 0x3fff];
	};
	self.write = function(addr, val) {
		var page = writeSlots[addr >> 14];
		page[addr & 0x3fff] = val;
	};
	
	var screenPage = ramPages[5].memory;
	self.readScreen = function(addr) {
		return screenPage[addr];
	};

	var pagingIsLocked = false;
	if (model === JSSpeccy.Spectrum.MODEL_128K) {
		self.setPaging = function(val) {
			if (pagingIsLocked) return;
			var highMemoryPage = ramPages[val & 0x07];
			readSlots[3] = writeSlots[3] = highMemoryPage.memory;
			contentionBySlot[3] = highMemoryPage.contentionTable;
			readSlots[0] = (val & 0x10) ? romPages['128-1.rom'].memory : romPages['128-0.rom'].memory;
			screenPage = (val & 0x08) ? ramPages[7].memory : ramPages[5].memory;
			pagingIsLocked = val & 0x20;
		};
	} else {
		self.setPaging = function(val) {
		};
	}
	
	self.loadFromSnapshot = function(snapshotPages) {
		for (var p in snapshotPages) {
			var ramPage = ramPages[p].memory;
			var snapshotPage = snapshotPages[p];
			for (var i = 0; i < 0x4000; i++) {
				ramPage[i] = snapshotPage[i];
			}
		}
	};

	self.reset = function() {
		pagingIsLocked = false;
		self.setPaging(0);
	};

	return self;
};
