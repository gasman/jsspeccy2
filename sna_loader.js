JSSpeccy.loadSna = function(data) {
	if (data.byteLength === 49179) {
		var sna = new DataView(data);
		var snapshot = {
			model: JSSpeccy.Spectrum.MODEL_48K,
			registers: {},
			ulaState: {},
			memoryPages: {
				/* construct byte arrays of length 0x4000 at the appropriate offsets into the data stream */
				5: new Uint8Array(data, 27, 0x4000),
				2: new Uint8Array(data, 0x4000 + 27, 0x4000),
				0: new Uint8Array(data, 0x8000 + 27, 0x4000)
			}
		};
		snapshot.registers['IR'] = (sna.getUint8(0) << 8) | sna.getUint8(20);
		snapshot.registers['HL_'] = sna.getUint16(1, true);
		snapshot.registers['DE_'] = sna.getUint16(3, true);
		snapshot.registers['BC_'] = sna.getUint16(5, true);
		snapshot.registers['AF_'] = sna.getUint16(7, true);
		snapshot.registers['HL'] = sna.getUint16(9, true);
		snapshot.registers['DE'] = sna.getUint16(11, true);
		snapshot.registers['BC'] = sna.getUint16(13, true);
		snapshot.registers['IY'] = sna.getUint16(15, true);
		snapshot.registers['IX'] = sna.getUint16(17, true);
		snapshot.registers['iff1'] = snapshot.registers['iff2'] = (sna.getUint8(19) & 0x04) >> 2;
		snapshot.registers['AF'] = sna.getUint16(21, true);
		var sp = sna.getUint16(23, true);
		/* peek memory at SP to get proper value of PC */
		var l = sna.getUint8(sp - 16384 + 27);
		sp = (sp + 1) & 0xffff;
		var h = sna.getUint8(sp - 16384 + 27);
		sp = (sp + 1) & 0xffff;
		snapshot.registers['PC'] = (h<<8) | l;
		snapshot.registers['SP'] = sp;
		snapshot.registers['im'] = sna.getUint8(25);
		
		snapshot.ulaState.borderColour = sna.getUint8(26);
		
		return snapshot;
	} else {
		throw "Cannot handle SNA snapshots of length " + data.byteLength;
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