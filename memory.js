JSSpeccy.Memory = function(opts) {
	var self = {};
	var model = opts.model || JSSpeccy.Memory.MODEL_128K;
	
	var ramPages = [];
	for (var i = 0; i < 8; i++) {
		ramPages[i] = new Uint8Array(0x3fff);
	}
	
	var scratch = new Uint8Array(0x3fff);
	
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
	
	if (model === JSSpeccy.Memory.MODEL_128K) {
		self.setPaging = function(val) {
			readSlots[3] = writeSlots[3] = ramPages[val & 0x07];
			readSlots[0] = (val & 0x10) ? JSSpeccy.roms['128-1.rom'] : JSSpeccy.roms['128-0.rom'];
			screenPage = (val & 0x08) ? ramPages[7] : ramPages[5];
		}
	} else {
		self.setPaging = function(val) {
		}
	}
	
	return self;
}
JSSpeccy.Memory.MODEL_48K = 1;
JSSpeccy.Memory.MODEL_128K = 2;
