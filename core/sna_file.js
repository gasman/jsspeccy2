JSSpeccy.SnaFile = function(data) {
	var mode128 = false, snapshot = null, len = data.byteLength, sna;

	switch (len) {
		case 131103:
		case 147487:
			mode128 = true;
		case 49179:
			sna = new DataView(data, 0, mode128 ? 49182 : len);
			snapshot = {
				model: (mode128
					? JSSpeccy.Spectrum.MODEL_128K
					: JSSpeccy.Spectrum.MODEL_48K),
				registers: {},
				ulaState: {},
			/* construct byte arrays of length 0x4000 at the appropriate offsets into the data stream */
				memoryPages: {
					5: new Uint8Array(data, 0x0000 + 27, 0x4000),
					2: new Uint8Array(data, 0x4000 + 27, 0x4000)
				}
			};

			if (mode128) {
				var page = (sna.getUint8(49181) & 7);
				snapshot.memoryPages[page] = new Uint8Array(data, 0x8000 + 27, 0x4000);

				for (var i = 0, ptr = 49183; i < 8; i++) {
					if (typeof snapshot.memoryPages[i] === 'undefined') {
						snapshot.memoryPages[i] = new Uint8Array(data, ptr, 0x4000);
						ptr += 0x4000;
					}
				}
			}
			else
				snapshot.memoryPages[0] = new Uint8Array(data, 0x8000 + 27, 0x4000);

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

			if (mode128) {
				snapshot.registers['SP'] = sna.getUint16(23, true);
				snapshot.registers['PC'] = sna.getUint16(49179, true);
				snapshot.ulaState.pagingFlags = sna.getUint8(49181);
			}
			else {
				/* peek memory at SP to get proper value of PC */
				var sp = sna.getUint16(23, true);
				var l = sna.getUint8(sp - 16384 + 27);
				sp = (sp + 1) & 0xffff;
				var h = sna.getUint8(sp - 16384 + 27);
				sp = (sp + 1) & 0xffff;
				snapshot.registers['PC'] = (h << 8) | l;
				snapshot.registers['SP'] = sp;
			}

			snapshot.registers['im'] = sna.getUint8(25);
			snapshot.ulaState.borderColour = sna.getUint8(26);
			break;

		default:
			throw "Cannot handle SNA snapshots of length " + len;
	}

	return snapshot;
}
