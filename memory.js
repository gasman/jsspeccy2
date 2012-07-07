JSSpeccy.Memory = function(opts) {
	var self = {};
	var model = opts.model || JSSpeccy.Memory.MODEL_128K;

	function MemoryPage(data) {
		var self = {};
		self.memory = (data || new Uint8Array(0x4000));
		return self;
	}
	
	var ramPages = [];
	for (var i = 0; i < 8; i++) {
		ramPages[i] = MemoryPage();
	}

	var romPages = {
		'48.rom': MemoryPage(JSSpeccy.roms['48.rom']),
		'128-0.rom': MemoryPage(JSSpeccy.roms['128-0.rom']),
		'128-1.rom': MemoryPage(JSSpeccy.roms['128-1.rom'])
	};

	var scratch = MemoryPage();
	
	var readSlots = [
		model === JSSpeccy.Memory.MODEL_48K ? romPages['48.rom'].memory : romPages['128-0.rom'].memory,
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

	self.isContended = function(addr) {
		return ((addr & 0xc000) == 0x4000);
	};

	self.contend = function(addr) {
		if (self.oncontend) self.oncontend(addr);
		return 0;
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
	if (model === JSSpeccy.Memory.MODEL_128K) {
		self.setPaging = function(val) {
			if (pagingIsLocked) return;
			readSlots[3] = writeSlots[3] = ramPages[val & 0x07].memory;
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
JSSpeccy.Memory.MODEL_48K = 1;
JSSpeccy.Memory.MODEL_128K = 2;
