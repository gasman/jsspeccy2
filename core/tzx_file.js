JSSpeccy.TzxFile = function(data) {
	var self = {};
	
	var blocks = [];
	var tzx = new DataView(data);

	var sound = null;
	
	var tzxPlaying = false;
	var tzxTotalTs = 0;
	var earBit = 0;
	var tzxState = 0;
	var tzxAimTStates = 0;
	var tzxByte = 0;
	
	var tzxPulsesDone = 0;
	var tzxBitCounter = 0;
	var tzxBitLimit = 0;

	var tzxTurbo = false;
	
	var forceTurbo = false;
	
	var block = null;

	var lastTstates = 0;
	
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

				var pilotPulseLength = 2168;
				var pilotPulseCount = 0;			  
				var syncPulse1Length = 667;
				var syncPulse2Length = 735;
				var zeroBitLength = 855;
				var oneBitLength = 1710;		  		
				var lastByteMask = 8;
			
				var pause = tzx.getUint16(offset, true);
				offset += 2;
				var dataLength = tzx.getUint16(offset, true);
				offset += 2;
				
				if (tzx.getUint8(offset)>=128)
					pilotPulseCount = 3223
				else
					pilotPulseCount = 8063;				
				blocks.push({
					'type': 'StandardSpeedData',
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
				tzxTurbo = true;
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
				tzxTurbo = true;
				blocks.push({
					'type': 'PureTone',
					'pulseLength': pulseLength,
					'pulseCount': pulseCount
				});
				break;
			case 0x13:
				var pulseCount = tzx.getUint8(offset); offset += 1;
				tzxTurbo = true;
				blocks.push({
					'type': 'PulseSequence',
					'pulseLengths': new Uint8Array(data, offset, pulseCount*2)
				});
				offset += (pulseCount * 2);
				break;
			case 0x14:
				var zeroBitLength = tzx.getUint16(offset, true); offset += 2;
				var oneBitLength = tzx.getUint16(offset, true); offset += 2;
				var lastByteMask = tzx.getUint8(offset); offset += 1;
				var pause = tzx.getUint16(offset, true); offset += 2;
				var dataLength = tzx.getUint16(offset, true) | (tzx.getUint8(offset+2) << 16); offset += 3;
				tzxTurbo = true;
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
				tzxTurbo = true;
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
					'offsets': new Uint18rray(data, offset, callCount*2)
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
			case 0xFE:
				blocks.push({
					'type': 'Stop'
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
	blocks.push({
					'type': 'Stop'
				});

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
				case 'DirectRecording':
				case 'Pause':
					/* found a meaningful block */
					tzxState = 0;
					tzxByte = 0;
					tzxAimTStates = block.pause * 3500;
					nextBlockIndex++;
					return block;
				case 'PureTone':
					tzxState = 0;
					tzxByte = 1;
					tzxAimTStates = block.pulseLength;
					nextBlockIndex++;
					return block;
				case 'PulseSequence':
					tzxState = 0;
					tzxByte = 2;
					tzxPulsesDone = 1;
					tzxAimTStates = block.pulseLengths[0] + 256 * block.pulseLengths[1] ;
					nextBlockIndex++;
					return block;

				case 'PureData':
					tzxState = 3;
					tzxByte = 0;
					if ((block.data[tzxByte] & 128) > 0) tzxAimTStates = block.oneBitLength; else tzxAimTStates = block.zeroBitLength;
					tzxPulsesDone = 2;
					if (tzxByte == block.data.length-1) tzxBitLimit = 1<< (8 - block.lastByteMask); else tzxBitLimit = 1;
					tzxBitCounter = 128;
			
					nextBlockIndex++;
					return block;
					break;
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
					for (var i = block.offsets.length - 2; i >= 0; i-=2) {
						callStack.unshift(nextBlockIndex + block.offsets[i] + 256 * block.offsets[i+1]);
					}
					/* now visit the first destination on the list */
					nextBlockIndex = callStack.shift();
					break;
				case 'ReturnFromSequence':
					nextBlockIndex = callStack.shift();
					break;
				case 'Stop':
					tzxAimTStates = 0;
					nextBlockIndex++;
					return block;
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
	
	
	self.updateEarState = function(tstates) {
		
		if (tstates<lastTstates) lastTstates = 0;
		
		if ((!tzxTurbo & !forceTurbo) || !tzxPlaying) return;

		if (block == null) block = self.getNextMeaningfulBlock();
		
		tzxTotalTs += (tstates - lastTstates);
		lastTstates = tstates;

		while (tzxTotalTs >= tzxAimTStates & tzxPlaying) {
		
			tzxTotalTs  = tzxTotalTs - tzxAimTStates;

			switch (block.type) {
				case 'StandardSpeedData':
				case 'TurboSpeedData':
				case 'PureData':
					switch(tzxState) {
						case 0:	//Playing Pilot tone.
							earBit = earBit ^ 64;
							if (tzxByte < block.pilotPulseCount) {// TZXByte holds number of pulses
								tzxAimTStates = block.pilotPulseLength;
								tzxByte = tzxByte + 1;
							}
							else {
								tzxByte = 0;
								tzxState = 1; // Set to SYNC1 Pulse output
								tzxAimTStates = block.syncPulse1Length;
							}
							break;
						case 1:	// SYNC 1
							earBit = earBit ^ 64;
							tzxState = 2 ;// Set to SYNC2 Pulse output
							tzxAimTStates = block.syncPulse2Length;
							break;
						case 2:	// SYNC 2
							earBit = earBit ^ 64;
							tzxState = 3; // Set to DATA Byte(s) output
							tzxByte = 0;
							if ((block.data[tzxByte] & 128) > 0) // Set next pulse length
								tzxAimTStates = block.oneBitLength
							else
								tzxAimTStates = block.zeroBitLength;

							tzxPulsesDone = 2; // *2* edges per Data BIT, one on, one off
							tzxBitCounter = 128; // Start with the full byte
							tzxBitLimit = 1;
							break;
						case 3:
							earBit = earBit ^ 64;
							tzxPulsesDone--;
							if (!tzxPulsesDone) { // Done both pulses for this bit?
								if (tzxBitCounter > tzxBitLimit) { // Done all the bits for this byte?
									tzxBitCounter = tzxBitCounter >> 1; // Bitcounter counts *down*
									tzxPulsesDone = 2;
									if ((block.data[tzxByte] & tzxBitCounter) > 0)
										tzxAimTStates = block.oneBitLength
									else
										tzxAimTStates = block.zeroBitLength
								}
								else { // all bits done, setup for next byte
									tzxByte++;
									if (tzxByte < block.data.length) { // last byte?
										if (tzxByte == block.data.length - 1) 
											tzxBitLimit = 1 << (8 - block.lastByteMask) // if so, set up the last bits used
										else
											tzxBitLimit = 1; // else use full 8 bits

										tzxBitCounter = 128;
										tzxPulsesDone = 2;
										if ((block.data[tzxByte] & 128) > 0) 
											tzxAimTStates = block.oneBitLength
										else
											tzxAimTStates = block.zeroBitLength;

									}
									else {
										if (block.pause > 0) {
											tzxAimTStates = block.pause * 3500;
											tzxState = 4; // Set to Pause output
										}
										else {
											tzxState = 0;
											block = self.getNextMeaningfulBlock();
										}
									}
								}
							}
							else { // Not done both pulses, flip the ear bit next time
								if ((block.data[tzxByte] & tzxBitCounter) > 0)
									tzxAimTStates = block.oneBitLength
								else
									tzxAimTStates = block.zeroBitLength;

							}
							break;
						case 4:
							block = self.getNextMeaningfulBlock();
							break;
					}
					break;
				case 'PureTone':
					earBit = earBit ^ 64;
					if (tzxByte < block.pulseCount) {
						tzxAimTStates = block.pulseLength;
						tzxByte++;
					}
					else
						block = self.getNextMeaningfulBlock();
					break;
					
				case 'PulseSequence':
					earBit = earBit ^ 64;			

					if (tzxByte < block.pulseLengths.length) {
						tzxAimTStates = block.pulseLengths[tzxByte] + 256 * block.pulseLengths[tzxByte+1];
						tzxByte += 2;
					}
					else
						block = self.getNextMeaningfulBlock();
					break;
				
				case 'DirectRecording':
					//not implemented
					block = self.getNextMeaningfulBlock();
					break;
				case 'Pause':
					if (block.pause==0) {
						self.stopTape();
					}
					else {
						tzxAimTStates = block.pause * 3500;
						block = self.getNextMeaningfulBlock();
					}
					break;
				case 'Stop':
					self.stopTape();
					break;
					
				default:
					block = self.getNextMeaningfulBlock();
					
			}
			if (sound!=null) sound.setEarBit(earBit,tstates);
		}
	};
		
	self.startTape = function() {
		tzxPlaying = true;
		tzxTotalTs = 0;
		tzxByte = 0;
		tzxState = 0;
		earBit = 0;
	};

	self.stopTape = function() {
		if (tzxPlaying) tzxPlaying = false;
	};
	
	self.startStopTape = function() {
		if (tzxPlaying) stopTape(); else startTape();
	};
	
	self.isTurbo = function() {
		return tzxTurbo | forceTurbo;
	};

	self.getEarBit = function() {
		return earBit;
	};
	
	self.setForce = function(val) {
		forceTurbo = val;
	};
	self.setSound = function(soundGen) {
		sound = soundGen;
	};

	return self;
};
