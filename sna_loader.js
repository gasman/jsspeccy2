JSSpeccy.loadSna = function(sna) {
	function getWord(offset) {
		return sna.charCodeAt(offset) | ( sna.charCodeAt(offset+1) << 8 );
	}
	
	if (sna.length === 49179) {
		var snapshot = {
			model: JSSpeccy.Spectrum.MODEL_48K,
			registers: {},
			ulaState: {},
			memoryPages: {
				5: new Uint8Array(0x4000),
				2: new Uint8Array(0x4000),
				0: new Uint8Array(0x4000)
			}
		}
		snapshot.registers['IR'] = (sna.charCodeAt(0) << 8) | sna.charCodeAt(20);
		snapshot.registers['HL_'] = getWord(1);
		snapshot.registers['DE_'] = getWord(3);
		snapshot.registers['BC_'] = getWord(5);
		snapshot.registers['AF_'] = getWord(7);
		snapshot.registers['HL'] = getWord(9);
		snapshot.registers['DE'] = getWord(11);
		snapshot.registers['BC'] = getWord(13);
		snapshot.registers['IY'] = getWord(15);
		snapshot.registers['IX'] = getWord(17);
		snapshot.registers['iff1'] = snapshot.registers['iff2'] = (sna.charCodeAt(19) & 0x04) >> 2;
		snapshot.registers['AF'] = getWord(21);
		var sp = getWord(23);
		/* peek memory at SP to get proper value of PC */
		var l = sna.charCodeAt(sp - 16384 + 27);
		sp = (sp + 1) & 0xffff;
		var h = sna.charCodeAt(sp - 16384 + 27);
		sp = (sp + 1) & 0xffff;
		snapshot.registers['PC'] = (h<<8) | l;
		snapshot.registers['SP'] = sp;
		snapshot.registers['im'] = sna.charCodeAt(25);
		
		snapshot.ulaState.borderColour = sna.charCodeAt(26);
		
		for (var i = 0; i < 0x4000; i++) {
			snapshot.memoryPages[5][i] = sna.charCodeAt(i + 27);
		}
		for (var i = 0; i < 0x4000; i++) {
			snapshot.memoryPages[2][i] = sna.charCodeAt(i + 0x4000 + 27);
		}
		for (var i = 0; i < 0x4000; i++) {
			snapshot.memoryPages[0][i] = sna.charCodeAt(i + 0x8000 + 27);
		}
		return snapshot;
	} else {
		throw "Cannot handle SNA snapshots of length " + str.length;
	}
}

/*
	var registers = [
		'i', 'l_', 'h_', 'e_', 'd_', 'c_', 'b_', 'f_', 'a_',
		'l', 'h', 'e', 'd', 'c', 'b',
		'iyl', 'iyh', 'ixl', 'ixh'];
	for (var i = 0; i < registers.length; i++) {
		z80[registers[i]] = sna.charCodeAt(i);
	}
	z80.iff1 = z80.iff2 = (sna.charCodeAt(19) & 0x04) ? 1 : 0;
	var r = sna.charCodeAt(20);
	z80.r = r & 0x7f;
	z80.r7 = r & 0x80;
	z80.f = sna.charCodeAt(21);
	z80.a = sna.charCodeAt(22);
	z80.sp = sna.charCodeAt(23) | (sna.charCodeAt(24) << 8);
	z80.im = sna.charCodeAt(25);
	writeport(0xfe, sna.charCodeAt(26) & 0x07);
	for (var i = 0; i < 0xc000; i++) {
		memory[i + 0x4000] = sna.charCodeAt(i + 27);
	}
	paintFullScreen();
	// simulate a retn to populate pc correctly
	var lowbyte =readbyte_internal(z80.sp++);
	z80.sp &= 0xffff;
	var highbyte=readbyte_internal(z80.sp++);
	z80.sp &= 0xffff;
	z80.pc = lowbyte | (highbyte << 8);

*/