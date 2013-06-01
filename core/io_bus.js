JSSpeccy.IOBus = function(opts) {
	var self = {};
	
	var keyboard = opts.keyboard;
	var display = opts.display;
	var memory = opts.memory;
	var sound = opts.sound;
	var contentionTable = opts.contentionTable;
	var contentionTableLength = contentionTable.length;
	
	self.read = function(addr) {
		if ((addr & 0x0001) === 0x0000) {
			return keyboard.poll(addr);
		} else if ((addr & 0xc002) == 0xc000) {
			/* AY chip */
			return sound.readSoundRegister();
		} else if ((addr & 0x00e0) === 0x0000) {
			/* kempston joystick */
			return 0;
		} else {
			return 0xff;
		}
	};
	self.write = function(addr, val, tstates) {
		if (!(addr & 0x01)) {
			display.setBorder(val & 0x07);

			sound.updateBuzzer((val & 16) >> 4, tstates);
		}
		if (!(addr & 0x8002)) {
			memory.setPaging(val);
		}
		
		if ((addr & 0xc002) == 0xc000) {
			/* AY chip - register select */
			sound.selectSoundRegister( val & 0xF );
		}
		
		if ((addr & 0xc002) == 0x8000) {
			/* AY chip - data write */
			sound.writeSoundRegister(val, tstates);
		}
		
	};

	self.isULAPort = function(addr) {
		return ((addr & 0x0001) === 0x0000);
	};
	self.contend = function(addr, tstates) {
		return contentionTable[tstates % contentionTableLength];
	};

	return self;
};
