JSSpeccy.TzxFile = function(data) {
	var self = {};

	var blocks = [];
	var tzx = new DataView(data);

	var signature = "ZXTape!\x1A";
	for (var i = 0; i < signature.length; i++) {
		if (signature.charCodeAt(i) != tzx.getUint8(i)) {
			alert("Not a valid TZX file");
			return null;
		}
	}

	var offset = 0x0a;

	while (offset < data.byteLength) {
		var blockType = tzx.getUint8(offset);
		offset++;
		switch (blockType) {
			case 0x10:
				var pause = tzx.getUint16(offset, true);
				offset += 2;
				var dataLength = tzx.getUint16(offset, true);
				offset += 2;
				blocks.push({
					'type': 'StandardSpeedData',
					'pause': pause,
					'data': new Uint8Array(data, offset, dataLength)
				});
				offset += dataLength;
				break;
			case 0x11:
				var pilotPulseLength = tzx.getUint16(offset, true); offset += 2;
				var syncPulse1Length = tzx.getUint16(offset, true); offset += 2;
				var syncPulse2Length = tzx.getUint16(offset, true); offset += 2;
				var zeroBitLength = tzx.getUint16(offset, true); offset += 2;
				var oneBitLength = tzx.getUint16(offset, true); offset += 2;
				var pilotPulseCount = tzx.getUint16(offset, true); offset += 2;
				var lastByteMask = tzx.getUint8(offset); offset += 1;
				var pause = tzx.getUint16(offset, true); offset += 2;
				var dataLength = tzx.getUint16(offset, true) | (tzx.getUint8(offset+2) << 16); offset += 3;
				blocks.push({
					'type': 'TurboSpeedData',
					'pilotPulseLength': pilotPulseLength,
					'syncPulse1Length': syncPulse1Length,
					'syncPulse2Length': syncPulse2Length,
					'zeroBitLength': zeroBitLength,
					'oneBitLength': oneBitLength,
					'pilotPulseCount': pilotPulseCount,
					'lastByteMask': lastByteMask,
					'pause': pause,
					'data': new Uint8Array(data, offset, dataLength)
				});
				offset += dataLength;
				break;
			case 0x12:
				var pulseLength = tzx.getUint16(offset, true); offset += 2;
				var pulseCount = tzx.getUint16(offset, true); offset += 2;
				blocks.push({
					'type': 'PureTone',
					'pulseLength': pulseLength,
					'pulseCount': pulseCount
				});
				break;
			case 0x13:
				var pulseCount = tzx.getUint8(offset); offset += 1;
				blocks.push({
					'type': 'PulseSequence',
					'pulseLengths': new Uint16Array(data, offset, pulseCount)
				});
				offset += (pulseCount * 2);
				break;
			case 0x14:
				var zeroBitLength = tzx.getUint16(offset, true); offset += 2;
				var oneBitLength = tzx.getUint16(offset, true); offset += 2;
				var lastByteMask = tzx.getUint8(offset); offset += 1;
				var pause = tzx.getUint16(offset, true); offset += 2;
				var dataLength = tzx.getUint16(offset, true) | (tzx.getUint8(offset+2) << 16); offset += 3;
				blocks.push({
					'type': 'PureData',
					'zeroBitLength': zeroBitLength,
					'oneBitLength': oneBitLength,
					'lastByteMask': lastByteMask,
					'pause': pause,
					'data': new Uint8Array(data, offset, dataLength)
				});
				offset += dataLength;
				break;
			case 0x15:
				var tstatesPerSample = tzx.getUint16(offset, true); offset += 2;
				var pause = tzx.getUint16(offset, true); offset += 2;
				var lastByteMask = tzx.getUint8(offset); offset += 1;
				var dataLength = tzx.getUint16(offset, true) | (tzx.getUint8(offset+2) << 16); offset += 3;
				blocks.push({
					'type': 'DirectRecording',
					'tstatesPerSample': tstatesPerSample,
					'lastByteMask': lastByteMask,
					'pause': pause,
					'data': new Uint8Array(data, offset, dataLength)
				});
				offset += dataLength;
				break;
			case 0x20:
				var pause = tzx.getUint16(offset, true); offset += 2;
				blocks.push({
					'type': 'Pause',
					'pause': pause
				});
				break;
			case 0x21:
				var nameLength = tzx.getUint8(offset); offset += 1;
				var nameBytes = new Uint8Array(data, offset, nameLength);
				offset += nameLength;
				var name = String.fromCharCode.apply(null, nameBytes);
				blocks.push({
					'type': 'GroupStart',
					'name': name
				});
				break;
			case 0x22:
				blocks.push({
					'type': 'GroupEnd'
				});
				break;
			case 0x23:
				var jumpOffset = tzx.getUint16(offset, true); offset += 2;
				blocks.push({
					'type': 'JumpToBlock',
					'offset': jumpOffset
				});
				break;
			case 0x24:
				var repeatCount = tzx.getUint16(offset, true); offset += 2;
				blocks.push({
					'type': 'LoopStart',
					'repeatCount': repeatCount
				});
				break;
			case 0x25:
				blocks.push({
					'type': 'LoopEnd'
				});
				break;
			case 0x26:
				var callCount = tzx.getUint16(offset, true); offset += 2;
				blocks.push({
					'type': 'CallSequence',
					'offsets': new Uint16Array(data, offset, callCount)
				});
				offset += (callCount * 2);
				break;
			case 0x27:
				blocks.push({
					'type': 'ReturnFromSequence'
				});
				break;
			case 0x28:
				var blockLength = tzx.getUint16(offset, true); offset += 2;
				/* This is a silly block. Don't bother parsing it further. */
				blocks.push({
					'type': 'Select',
					'data': new Uint8Array(data, offset, blockLength)
				});
				offset += blockLength;
				break;
			case 0x30:
				var textLength = tzx.getUint8(offset); offset += 1;
				var textBytes = new Uint8Array(data, offset, textLength);
				offset += textLength;
				var text = String.fromCharCode.apply(null, textBytes);
				blocks.push({
					'type': 'TextDescription',
					'text': text
				});
				break;
			case 0x31:
				var displayTime = tzx.getUint8(offset); offset += 1;
				var textLength = tzx.getUint8(offset); offset += 1;
				var textBytes = new Uint8Array(data, offset, textLength);
				offset += textLength;
				var text = String.fromCharCode.apply(null, textBytes);
				blocks.push({
					'type': 'MessageBlock',
					'displayTime': displayTime,
					'text': text
				});
				break;
			case 0x32:
				var blockLength = tzx.getUint16(offset, true); offset += 2;
				blocks.push({
					'type': 'ArchiveInfo',
					'data': new Uint8Array(data, offset, blockLength)
				});
				offset += blockLength;
				break;
			case 0x33:
				var blockLength = tzx.getUint8(offset) * 3; offset += 1;
				blocks.push({
					'type': 'HardwareType',
					'data': new Uint8Array(data, offset, blockLength)
				});
				offset += blockLength;
				break;
			case 0x35:
				var identifierBytes = new Uint8Array(data, offset, 10);
				offset += 10;
				var identifier = String.fromCharCode.apply(null, identifierBytes);
				var dataLength = tzx.getUint32(offset, true);
				blocks.push({
					'type': 'CustomInfo',
					'identifier': identifier,
					'data': new Uint8Array(data, offset, dataLength)
				});
				offset += dataLength;
				break;
			case 0x5A:
				offset += 9;
				blocks.push({
					'type': 'Glue'
				});
				break;
			default:
				/* follow extension rule: next 4 bytes = length of block */
				var blockLength = tzx.getUint32(offset, true);
				offset += 4;
				blocks.push({
					'type': 'unknown',
					'data': new Uint8Array(data, offset, blockLength)
				});
				offset += blockLength;
		}
	}

	var nextBlockIndex = 0;
	var loopToBlockIndex;
	var repeatCount;
	var callStack = [];

	self.getNextMeaningfulBlock = function() {
		var startedAtZero = (nextBlockIndex === 0);
		while (true) {
			if (nextBlockIndex >= blocks.length) {
				if (startedAtZero) return null; /* have looped around; quit now */
				nextBlockIndex = 0;
				startedAtZero = true;
			}
			var block = blocks[nextBlockIndex];
			switch (block.type) {
				case 'StandardSpeedData':
				case 'TurboSpeedData':
				case 'PureTone':
				case 'PulseSequence':
				case 'PureData':
				case 'DirectRecording':
				case 'Pause':
					/* found a meaningful block */
					nextBlockIndex++;
					return block;
				case 'JumpToBlock':
					nextBlockIndex += block.offset;
					break;
				case 'LoopStart':
					loopToBlockIndex = nextBlockIndex + 1;
					repeatCount = block.repeatCount;
					nextBlockIndex++;
					break;
				case 'LoopEnd':
					repeatCount--;
					if (repeatCount > 0) {
						nextBlockIndex = loopToBlockIndex;
					} else {
						nextBlockIndex++;
					}
					break;
				case 'CallSequence':
					/* push the future destinations (where to go on reaching a ReturnFromSequence block)
						onto the call stack in reverse order, starting with the block immediately
						after the CallSequence (which we go to when leaving the sequence) */
					callStack.unshift(nextBlockIndex+1);
					for (var i = block.offsets.length - 1; i >= 0; i--) {
						callStack.unshift(nextBlockIndex + block.offsets[i]);
					}
					/* now visit the first destination on the list */
					nextBlockIndex = callStack.shift();
					break;
				case 'ReturnFromSequence':
					nextBlockIndex = callStack.shift();
					break;
				default:
					/* not one of the types we care about; skip past it */
					nextBlockIndex++;
			}
		}
	};

	self.getNextLoadableBlock = function() {
		while (true) {
			var block = self.getNextMeaningfulBlock();
			if (!block) return null;
			if (block.type == 'StandardSpeedData' || block.type == 'TurboSpeedData') {
				return block.data;
			}
			/* FIXME: avoid infinite loop if the TZX file consists only of meaningful but non-loadable blocks */
		}
	};

	return self;
};
