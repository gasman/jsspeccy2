JSSpeccy.Z80File = function(data) {
	var file = new DataView(data);

	function extractMemoryBlock(data, fileOffset, isCompressed, unpackedLength) {
		if (!isCompressed) {
			/* uncompressed; extract a byte array directly from data */
			return new Uint8Array(data, fileOffset, unpackedLength);
		} else {
			/* compressed */
			var fileBytes = new Uint8Array(data, fileOffset);
			var memoryBytes = new Uint8Array(unpackedLength);
			var filePtr = 0; var memoryPtr = 0;
			while (memoryPtr < unpackedLength) {
				/* check for coded ED ED nn bb sequence */
				if (
					unpackedLength - memoryPtr >= 2 && /* at least two bytes left to unpack */
					fileBytes[filePtr] == 0xed &&
					fileBytes[filePtr + 1] == 0xed
				) {
					/* coded sequence */
					var count = fileBytes[filePtr + 2];
					var value = fileBytes[filePtr + 3];
					for (var i = 0; i < count; i++) {
						memoryBytes[memoryPtr++] = value;
					}
					filePtr += 4;
				} else {
					/* plain byte */
					memoryBytes[memoryPtr++] = fileBytes[filePtr++];
				}
			}
			return memoryBytes;
		}
	}

	var iReg = file.getUint8(10);
	var byte12 = file.getUint8(12);
	var rReg = (file.getUint8(11) & 0x7f) | ((byte12 & 0x01) << 7);
	var byte29 = file.getUint8(29);

	var snapshot = {
		registers: {
			'AF': file.getUint16(0, false), /* NB Big-endian */
			'BC': file.getUint16(2, true),
			'HL': file.getUint16(4, true),
			'PC': file.getUint16(6, true),
			'SP': file.getUint16(8, true),
			'IR': (iReg << 8) | rReg,
			'DE': file.getUint16(13, true),
			'BC_': file.getUint16(15, true),
			'DE_': file.getUint16(17, true),
			'HL_': file.getUint16(19, true),
			'AF_': file.getUint16(21, false), /* Big-endian */
			'IY': file.getUint16(23, true),
			'IX': file.getUint16(25, true),
			'iff1': !!file.getUint8(27),
			'iff2': !!file.getUint8(28),
			'im': byte29 & 0x03
		},
		ulaState: {
			borderColour: (byte12 & 0x0e) >> 1
		},
		memoryPages: {
		}
	};

	if (snapshot.registers.PC !== 0) {
		/* a non-zero value for PC at offset 6 indicates a version 1 file */
		snapshot.model = JSSpeccy.Spectrum.MODEL_48K;
		var memory = extractMemoryBlock(data, 30, byte12 & 0x20, 0xc000);

		/* construct byte arrays of length 0x4000 at the appropriate offsets into the data stream */
		snapshot.memoryPages[5] = new Uint8Array(memory, 0, 0x4000);
		snapshot.memoryPages[2] = new Uint8Array(memory, 0x4000, 0x4000);
		snapshot.memoryPages[0] = new Uint8Array(memory, 0x8000, 0x4000);
		/* FIXME: memory is a Uint8Array, not an ArrayBuffer - is this valid for the Uint8Array constructor? */
	} else {
		/* version 2-3 snapshot */
		var additionalHeaderLength = file.getUint16(30, true);
		var isVersion2 = (additionalHeaderLength == 23);
		snapshot.registers.PC = file.getUint16(32, true);
		var machineId = file.getUint8(34);
		var is48K = (isVersion2 ? machineId < 3 : machineId < 4);
		snapshot.model = (is48K ? JSSpeccy.Spectrum.MODEL_48K : JSSpeccy.Spectrum.MODEL_128K);
		if (!is48K) {
			snapshot.ulaState.pagingFlags = file.getUint8(35);
		}
		var tstateChunkSize = snapshot.model.frameLength / 4;
		var tstateLowCounter = tstateChunkSize - file.getUint16(55, true);
		var tstateHighCounter = file.getUint8(57);
		snapshot.tstates = tstateLowCounter + (tstateHighCounter * tstateChunkSize);

		var offset = 32 + additionalHeaderLength;

		/* translation table from the IDs Z80 assigns to pages, to the page numbers they
		actually get loaded into */
		var pageIdToNumber;
		if (is48K) {
			pageIdToNumber = {
				4: 2,
				5: 0,
				8: 5
			};
		} else {
			pageIdToNumber = {
				3: 0,
				4: 1,
				5: 2,
				6: 3,
				7: 4,
				8: 5,
				9: 6,
				10: 7
			};
		}
		while (offset < data.byteLength) {
			var compressedLength = file.getUint16(offset, true);
			var isCompressed = true;
			if (compressedLength == 0xffff) {
				compressedLength = 0x4000;
				isCompressed = false;
			}
			var pageId = file.getUint8(offset + 2);
			if (pageId in pageIdToNumber) {
				var pageNumber = pageIdToNumber[pageId];
				var pageData = extractMemoryBlock(data, offset + 3, isCompressed, 0x4000);
				snapshot.memoryPages[pageNumber] = pageData;
			}
			offset += compressedLength + 3;
		}
	}

	return snapshot;
};
