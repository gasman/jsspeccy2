JSSpeccy.Memory = function(opts) {
	var self = {};
	var model = opts.model || JSSpeccy.Memory.MODEL_128K;
	
	var ramPages = [];
	for (var i = 0; i < 8; i++) {
		ramPages[i] = new Uint8Array(0x4000);
	}
	
	var scratch = new Uint8Array(0x4000);
	
	var readSlots = [
		model === JSSpeccy.Memory.MODEL_48K ? JSSpeccy.roms['48.rom'] : JSSpeccy.roms['128-0.rom'],
		ramPages[5],
		ramPages[2],
		ramPages[0]
	]
	var writeSlots = [
		scratch,
		ramPages[5],
		ramPages[2],
		ramPages[0]
	]
	
	self.read = function(addr) {
		var page = readSlots[addr >> 14];
		return page[addr & 0x3fff];
	}
	self.write = function(addr, val) {
		var page = writeSlots[addr >> 14];
		page[addr & 0x3fff] = val;
	}
	
	var screenPage = ramPages[5];
	self.readScreen = function(addr) {
		return screenPage[addr];
	}
	
	var pagingIsLocked = false;
	if (model === JSSpeccy.Memory.MODEL_128K) {
		self.setPaging = function(val) {
			if (pagingIsLocked) return;
			readSlots[3] = writeSlots[3] = ramPages[val & 0x07];
			readSlots[0] = (val & 0x10) ? JSSpeccy.roms['128-1.rom'] : JSSpeccy.roms['128-0.rom'];
			screenPage = (val & 0x08) ? ramPages[7] : ramPages[5];
			pagingIsLocked = val & 0x20;
		}
	} else {
		self.setPaging = function(val) {
		}
	}
	
	self.loadFromSnapshot = function(snapshotPages) {
		for (p in snapshotPages) {
			for (var i = 0; i < 0x4000; i++) {
				ramPages[p][i] = snapshotPages[p][i];
			}
		}
	}
	
	self.reset = function() {
		pagingIsLocked = false;
		self.setPaging(0);
	}
	
	return self;
}
JSSpeccy.Memory.MODEL_48K = 1;
JSSpeccy.Memory.MODEL_128K = 2;
