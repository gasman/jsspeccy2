window.JSSpeccy.Z80 = (opts) ->
	self = {}
	
	memory = opts.memory
	ioBus = opts.ioBus
	display = opts.display
	
	# Offsets into register set when read as register pairs
	rpAF = 0
	rpBC = 1
	rpDE = 2
	rpHL = 3
	rpAF_ = 4
	rpBC_ = 5
	rpDE_ = 6
	rpHL_ = 7
	rpIX = 8
	rpIY = 9
	rpIR = 10
	rpSP = 11
	rpPC = 12
	
	registerBuffer = new ArrayBuffer(26);
	
	# Expose registerBuffer as both register pairs and individual registers
	regPairs = new Uint16Array(registerBuffer)
	regs = new Uint8Array(registerBuffer)
	
	###
	Typed arrays are native-endian
	(http://lists.w3.org/Archives/Public/public-script-coord/2010AprJun/0048.html, 
	http://cat-in-136.blogspot.com/2011/03/javascript-typed-array-use-native.html)
	so need to test endianness in order to know the offsets of individual registers
	###
	
	regPairs[rpAF] = 0x0100;
	if regs[0] == 0x01
		# big-endian
		rA = 0
		rF = 1
		rB = 2
		rC = 3
		rD = 4
		rE = 5
		rH = 6
		rL = 7
		rA_ = 8
		rF_ = 9
		rB_ = 10
		rC_ = 11
		rD_ = 12
		rE_ = 13
		rH_ = 14
		rL_ = 15
		rIXH = 16
		rIXL = 17
		rIYH = 18
		rIYL = 19
		rI = 20
		rR = 21
	else
		# little-endian
		rF = 0
		rA = 1
		rC = 2
		rB = 3
		rE = 4
		rD = 5
		rL = 6
		rH = 7
		rF_ = 8
		rA_ = 9
		rC_ = 10
		rB_ = 11
		rE_ = 12
		rD_ = 13
		rL_ = 14
		rH_ = 15
		rIXL = 16
		rIXH = 17
		rIYL = 18
		rIYH = 19
		rR = 20
		rI = 21
	
	tstates = 0 # number of tstates since start of this frame
	iff1 = iff2 = im = 0
	halted = false
	
	FLAG_C = 0x01
	FLAG_N = 0x02
	FLAG_P = 0x04
	FLAG_V = 0x04
	FLAG_3 = 0x08
	FLAG_H = 0x10
	FLAG_5 = 0x10
	FLAG_Z = 0x40
	FLAG_S = 0x80
	
	# tables for setting Z80 flags
	
	###
		Whether a half carry occurred or not can be determined by looking at
		the 3rd bit of the two arguments and the result; these are hashed
		into this table in the form r12, where r is the 3rd bit of the
		result, 1 is the 3rd bit of the 1st argument and 2 is the
		third bit of the 2nd argument; the tables differ for add and subtract
		operations
	###
	halfcarryAddTable = new Uint8Array([0, FLAG_H, FLAG_H, FLAG_H, 0, 0, 0, FLAG_H])
	halfcarrySubTable = new Uint8Array([0, 0, FLAG_H, 0, FLAG_H, 0, FLAG_H, FLAG_H])
	
	# Similarly, overflow can be determined by looking at the 7th bits; again
	# the hash into this table is r12
	overflowAddTable = new Uint8Array([0, 0, 0, FLAG_V, FLAG_V, 0, 0, 0])
	overflowSubTable = new Uint8Array([0, FLAG_V, 0, 0, 0, 0, FLAG_V, 0])
	
	# Some more tables; initialised in z80InitTables()
	sz53Table = new Uint8Array(0x100) # The S, Z, 5 and 3 bits of the index
	parityTable = new Uint8Array(0x100) # The parity of the lookup value
	sz53pTable = new Uint8Array(0x100) # OR the above two tables together
	
	z80InitTables = ->
		for i in [0...0x100]
			sz53Table[i] = i & ( FLAG_3 | FLAG_5 | FLAG_S )
			j = i; parity = 0
			for k in [0...8]
				parity ^= j & 1; j >>=1
			
			parityTable[i] = if parity then 0 else FLAG_P
			sz53pTable[i] = sz53Table[i] | parityTable[i]
		
		sz53Table[0] |= FLAG_Z
		sz53pTable[0] |= FLAG_Z
	
	z80InitTables()
	
	###
		Opcode generator functions: each returns a string of Javascript that performs the opcode
		when executed within this module's scope. Note that instructions with DDCBnn opcodes also
		require an 'offset' variable to be defined as nn (as a signed byte).
	###
	ADC_A_iHLi = () ->
		"""
			var val = memory.read(regPairs[rpHL]);
			var adctemp = regs[rA] + val + (regs[rF] & FLAG_C);
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (adctemp & 0x88) >> 1 );
			regs[rA] = adctemp;
			regs[rF] = ( adctemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 7;
		"""
	
	ADC_A_iRRpNNi = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var val = memory.read(addr);
			var adctemp = regs[rA] + val + (regs[rF] & FLAG_C);
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (adctemp & 0x88) >> 1 );
			regs[rA] = adctemp;
			regs[rF] = ( adctemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 19;
		"""
	
	ADC_A_N = () ->
		"""
			var val = memory.read(regPairs[rpPC]++);
			var adctemp = regs[rA] + val + (regs[rF] & FLAG_C);
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (adctemp & 0x88) >> 1 );
			regs[rA] = adctemp;
			regs[rF] = ( adctemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 4;
		"""
	
	ADC_A_R = (r) ->
		"""
			var adctemp = regs[rA] + regs[#{r}] + (regs[rF] & FLAG_C);
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (regs[#{r}] & 0x88) >> 2 ) | ( (adctemp & 0x88) >> 1 );
			regs[rA] = adctemp;
			regs[rF] = ( adctemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 4;
		"""
	
	ADD_A_iHLi = () ->
		"""
			var val = memory.read(regPairs[rpHL]);
			var addtemp = regs[rA] + val;
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (addtemp & 0x88) >> 1 );
			regs[rA] = addtemp;
			regs[rF] = ( addtemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 7;
		"""
	
	ADD_A_iRRpNNi = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var val = memory.read(addr);
			var addtemp = regs[rA] + val;
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (addtemp & 0x88) >> 1 );
			regs[rA] = addtemp;
			regs[rF] = ( addtemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 19;
		"""
	
	ADD_A_N = () ->
		"""
			var val = memory.read(regPairs[rpPC]++);
			var addtemp = regs[rA] + val;
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (addtemp & 0x88) >> 1 );
			regs[rA] = addtemp;
			regs[rF] = ( addtemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 7;
		"""
	
	ADD_A_R = (r) ->
		"""
			var addtemp = regs[rA] + regs[#{r}];
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (regs[#{r}] & 0x88) >> 2 ) | ( (addtemp & 0x88) >> 1 );
			regs[rA] = addtemp;
			regs[rF] = ( addtemp & 0x100 ? FLAG_C : 0 ) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 4;
		"""
	
	ADD_RR_RR = (rp1, rp2) ->
		tstatesToAdd = if rp1 == rpHL then 11 else 15
		"""
			var add16temp = regPairs[#{rp1}] + regPairs[#{rp2}];
			var lookup = ( (regPairs[#{rp1}] & 0x0800) >> 11 ) | ( (regPairs[#{rp2}] & 0x0800) >> 10 ) | ( (add16temp & 0x0800) >>  9 );
			regPairs[#{rp1}] = add16temp;
			regs[rF] = ( regs[rF] & ( FLAG_V | FLAG_Z | FLAG_S ) ) | ( add16temp & 0x10000 ? FLAG_C : 0 ) | ( ( add16temp >> 8 ) & ( FLAG_3 | FLAG_5 ) ) | halfcarryAddTable[lookup];
			tstates += #{tstatesToAdd};
		"""
	
	AND_iHLi = () ->
		"""
			var val = memory.read(regPairs[rpHL]);
			regs[rA] &= val;
			regs[rF] = FLAG_H | sz53pTable[regs[rA]];
			tstates += 7;
		"""
	
	AND_iRRpNNi = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var val = memory.read(addr);
			regs[rA] &= val;
			regs[rF] = FLAG_H | sz53pTable[regs[rA]];
			tstates += 19;
		"""
	
	AND_N = () ->
		"""
			var val = memory.read(regPairs[rpPC]++);
			regs[rA] &= val;
			regs[rF] = FLAG_H | sz53pTable[regs[rA]];
			tstates += 7;
		"""
	
	AND_R = (r) ->
		"""
			regs[rA] &= regs[#{r}];
			regs[rF] = FLAG_H | sz53pTable[regs[rA]];
			tstates += 4;
		"""
	
	BIT_N_iRRpNNi = (bit, rp) -> # requires 'offset'
		"""
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			var value = memory.read(addr);
			regs[rF] = ( regs[rF] & FLAG_C ) | FLAG_H | ( ( addr >> 8 ) & ( FLAG_3 | FLAG_5 ) );
			if( ! ( (value) & ( 0x01 << (#{bit}) ) ) ) regs[rF] |= FLAG_P | FLAG_Z;
			if( (#{bit}) == 7 && (value) & 0x80 ) regs[rF] |= FLAG_S;
			tstates += 20;
		"""
	
	BIT_N_iHLi = (bit) ->
		"""
			var addr = regPairs[rpHL];
			var value = memory.read(addr);
			regs[rF] = ( regs[rF] & FLAG_C ) | FLAG_H | ( value & ( FLAG_3 | FLAG_5 ) );
			if( ! ( (value) & ( 0x01 << (#{bit}) ) ) ) regs[rF] |= FLAG_P | FLAG_Z;
			if( (#{bit}) == 7 && (value) & 0x80 ) regs[rF] |= FLAG_S;
			tstates += 12;
		"""
	
	BIT_N_R = (bit, r) ->
		"""
			regs[rF] = ( regs[rF] & FLAG_C ) | FLAG_H | ( regs[#{r}] & ( FLAG_3 | FLAG_5 ) );
			if( ! ( regs[#{r}] & ( 0x01 << (#{bit}) ) ) ) regs[rF] |= FLAG_P | FLAG_Z;
			if( (#{bit}) == 7 && regs[#{r}] & 0x80 ) regs[rF] |= FLAG_S;
			tstates += 8;
		"""
	
	CALL_C_NN = (flag, sense) ->
		if sense
			# branch if flag set
			"""
				if (regs[rF] & #{flag}) {
					var l = memory.read(regPairs[rpPC]++);
					var h = memory.read(regPairs[rpPC]++);
					memory.write(--regPairs[rpSP], regPairs[rpPC] >> 8);
					memory.write(--regPairs[rpSP], regPairs[rpPC] & 0xff);
					regPairs[rpPC] = (h<<8) | l;
					tstates += 17;
				} else {
					regPairs[rpPC] += 2; /* skip past address bytes */
					tstates += 10;
				}
			"""
		else
			# branch if flag reset
			"""
				if (regs[rF] & #{flag}) {
					regPairs[rpPC] += 2; /* skip past address bytes */
					tstates += 10;
				} else {
					var l = memory.read(regPairs[rpPC]++);
					var h = memory.read(regPairs[rpPC]++);
					memory.write(--regPairs[rpSP], regPairs[rpPC] >> 8);
					memory.write(--regPairs[rpSP], regPairs[rpPC] & 0xff);
					regPairs[rpPC] = (h<<8) | l;
					tstates += 17;
				}
			"""
	
	CALL_NN = () ->
		"""
			var l = memory.read(regPairs[rpPC]++);
			var h = memory.read(regPairs[rpPC]++);
			memory.write(--regPairs[rpSP], regPairs[rpPC] >> 8);
			memory.write(--regPairs[rpSP], regPairs[rpPC] & 0xff);
			regPairs[rpPC] = (h<<8) | l;
			tstates += 17;
		"""
	
	CCF = () ->
		"""
			regs[rF] = ( regs[rF] & (FLAG_P | FLAG_Z | FLAG_S) ) | ( (regs[rF] & FLAG_C) ? FLAG_H : FLAG_C ) | ( regs[rA] & (FLAG_3 | FLAG_5) );
			tstates += 4;
		"""
	
	CP_iRRpNNi = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var val = memory.read(addr);
			var cptemp = regs[rA] - val;
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
			regs[rF] = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( val & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
			tstates += 19;
		"""
	
	CP_iHLi = () ->
		"""
			var val = memory.read(regPairs[rpHL]);
			var cptemp = regs[rA] - val;
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
			regs[rF] = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( val & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
			tstates += 7;
		"""
	
	CP_N = () ->
		"""
			var val = memory.read(regPairs[rpPC]++);
			var cptemp = regs[rA] - val;
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
			regs[rF] = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( val & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
			tstates += 7;
		"""
	
	CP_R = (r) ->
		"""
			var cptemp = regs[rA] - regs[#{r}];
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (regs[#{r}] & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
			regs[rF] = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( regs[#{r}] & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
			tstates += 4;
		"""
	
	CPDR = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			var bytetemp = (regs[rA] - value) & 0xff;
			var lookup = ( (regs[rA] & 0x08) >> 3 ) | ( (value & 0x08) >> 2 ) | ( (bytetemp & 0x08) >> 1 );
			regPairs[rpBC]--;
			regs[rF] = (regs[rF] & FLAG_C) | ( regPairs[rpBC] ? (FLAG_V | FLAG_N) : FLAG_N ) | halfcarrySubTable[lookup] | (bytetemp ? 0 : FLAG_Z) | (bytetemp & FLAG_S);
			if (regs[rF] & FLAG_H) bytetemp--;
			regs[rF] |= (bytetemp & FLAG_3) | ( (bytetemp & 0x02) ? FLAG_5 : 0 );
			if( ( regs[rF] & (FLAG_V | FLAG_Z) ) == FLAG_V ) {
				regPairs[rpPC] -= 2;
				tstates += 5;
			}
			regPairs[rpHL]--;
			tstates += 16;
		"""
	
	CPIR = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			var bytetemp = (regs[rA] - value) & 0xff;
			var lookup = ( (regs[rA] & 0x08) >> 3 ) | ( (value & 0x08) >> 2 ) | ( (bytetemp & 0x08) >> 1 );
			regPairs[rpBC]--;
			regs[rF] = (regs[rF] & FLAG_C) | ( regPairs[rpBC] ? (FLAG_V | FLAG_N) : FLAG_N ) | halfcarrySubTable[lookup] | (bytetemp ? 0 : FLAG_Z) | (bytetemp & FLAG_S);
			if (regs[rF] & FLAG_H) bytetemp--;
			regs[rF] |= (bytetemp & FLAG_3) | ( (bytetemp & 0x02) ? FLAG_5 : 0 );
			if( ( regs[rF] & (FLAG_V | FLAG_Z) ) == FLAG_V ) {
				regPairs[rpPC] -= 2;
				tstates += 5;
			}
			regPairs[rpHL]++;
			tstates += 16;
		"""
	
	CPL = () ->
		"""
			regs[rA] ^= 0xff;
			regs[rF] = ( regs[rF] & (FLAG_C | FLAG_P | FLAG_Z | FLAG_S) ) | ( regs[rA] & (FLAG_3 | FLAG_5) ) | (FLAG_N | FLAG_H);
			tstates += 4;
		"""
	
	DEC_iHLi = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			regs[rF] = (regs[rF] & FLAG_C ) | ( value & 0x0f ? 0 : FLAG_H ) | FLAG_N;
			value = (value - 1) & 0xff;
			memory.write(regPairs[rpHL], value);
			regs[rF] |= (value == 0x7f ? FLAG_V : 0) | sz53Table[value];
			tstates += 7;
		"""
	
	DEC_iRRpNNi = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var value = memory.read(addr);
			regs[rF] = (regs[rF] & FLAG_C ) | ( value & 0x0f ? 0 : FLAG_H ) | FLAG_N;
			value = (value - 1) & 0xff;
			memory.write(addr, value);
			regs[rF] |= (value == 0x7f ? FLAG_V : 0) | sz53Table[value];
			tstates += 23;
		"""
	
	DEC_R = (r) ->
		"""
			regs[rF] = (regs[rF] & FLAG_C ) | ( regs[#{r}] & 0x0f ? 0 : FLAG_H ) | FLAG_N;
			regs[#{r}]--;
			regs[rF] |= (regs[#{r}] == 0x7f ? FLAG_V : 0) | sz53Table[regs[#{r}]];
			tstates += 4;
		"""
	
	DEC_RR = (rp) ->
		tstatesToAdd = if (rp == rpIX || rp == rpIY) then 10 else 6
		"""
			regPairs[#{rp}]--;
			tstates += #{tstatesToAdd};
		"""
	
	DI = () ->
		"""
			iff1 = iff2 = 0;
			tstates += 4;
		"""
	
	DJNZ_N = () ->
		"""
			regs[rB]--;
			if (regs[rB]) {
				/* take branch */
				var offset = memory.read(regPairs[rpPC]++);
				regPairs[rpPC] += (offset & 0x80 ? offset - 0x100 : offset);
				tstates += 13;
			} else {
				/* do not take branch */
				regPairs[rpPC]++; /* skip past offset byte */
				tstates += 8;
			}
		"""
	
	EI = () ->
		"""
			iff1 = iff2 = 1;
			/* TODO: block interrupts from being triggered immediately after an EI */
			tstates += 4;
		"""
	
	EX_iSPi_RR = (rp) ->
		tstatesToAdd = if (rp == rpHL) then 19 else 23
		"""
			var l = memory.read(regPairs[rpSP]);
			var h = memory.read((regPairs[rpSP] + 1) & 0xffff);
			memory.write(regPairs[rpSP], regPairs[#{rp}] & 0xff);
			memory.write((regPairs[rpSP] + 1) & 0xffff, regPairs[#{rp}] >> 8);
			regPairs[#{rp}] = (h<<8) | l;
			tstates += #{tstatesToAdd};
		"""
	
	EX_RR_RR = (rp1, rp2) ->
		"""
			var temp = regPairs[#{rp1}];
			regPairs[#{rp1}] = regPairs[#{rp2}];
			regPairs[#{rp2}] = temp;
			tstates += 4;
		"""
	
	EXX = () ->
		"""
			var wordtemp;
			wordtemp = regPairs[rpBC]; regPairs[rpBC] = regPairs[rpBC_]; regPairs[rpBC_] = wordtemp;
			wordtemp = regPairs[rpDE]; regPairs[rpDE] = regPairs[rpDE_]; regPairs[rpDE_] = wordtemp;
			wordtemp = regPairs[rpHL]; regPairs[rpHL] = regPairs[rpHL_]; regPairs[rpHL_] = wordtemp;
			tstates += 4;
		"""
	
	HALT = () ->
		"""
			halted = true;
			regPairs[rpPC]--;
			tstates += 4;
		"""
	
	IM = (val) ->
		"""
			im = #{val};
			tstates += 8;
		"""
	
	IN_A_N = () ->
		"""
			var val = memory.read(regPairs[rpPC]++);
			regs[rA] = ioBus.read( (regs[rA] << 8) | val );
			tstates += 11;
		"""
	
	IN_R_iCi = (r) ->
		"""
			regs[#{r}] = ioBus.read(regPairs[rpBC]);
			regs[rF] = (regs[rF] & FLAG_C) | sz53pTable[regs[#{r}]];
			tstates += 12;
		"""
	
	INC_iHLi = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			regs[rF] = (regs[rF] & FLAG_C ) | ( value & 0x0f ? 0 : FLAG_H ) | FLAG_N;
			value = (value + 1) & 0xff;
			memory.write(regPairs[rpHL], value);
			regs[rF] = (regs[rF] & FLAG_C) | ( value == 0x80 ? FLAG_V : 0 ) | ( value & 0x0f ? 0 : FLAG_H ) | sz53Table[value];
			tstates += 7;
		"""
	
	INC_iRRpNNi = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var value = memory.read(addr);
			value = (value + 1) & 0xff;
			memory.write(addr, value);
			regs[rF] = (regs[rF] & FLAG_C) | ( value == 0x80 ? FLAG_V : 0 ) | ( value & 0x0f ? 0 : FLAG_H ) | sz53Table[value];
			tstates += 23;
		"""
	
	INC_R = (r) ->
		"""
			regs[#{r}]++;
			regs[rF] = (regs[rF] & FLAG_C) | ( regs[#{r}] == 0x80 ? FLAG_V : 0 ) | ( regs[#{r}] & 0x0f ? 0 : FLAG_H ) | sz53Table[regs[#{r}]];
			tstates += 4;
		"""
	
	INC_RR = (rp) ->
		tstatesToAdd = if (rp == rpIX || rp == rpIY) then 10 else 6
		"""
			regPairs[#{rp}]++;
			tstates += #{tstatesToAdd};
		"""
	
	JP_C_NN = (flag, sense) ->
		if sense
			# branch if flag set
			"""
				if (regs[rF] & #{flag}) {
					var l = memory.read(regPairs[rpPC]++);
					var h = memory.read(regPairs[rpPC]++);
					regPairs[rpPC] = (h<<8) | l;
				} else {
					regPairs[rpPC] += 2; /* skip past address bytes */
				}
				tstates += 10;
			"""
		else
			# branch if flag reset
			"""
				if (regs[rF] & #{flag}) {
					regPairs[rpPC] += 2; /* skip past address bytes */
				} else {
					var l = memory.read(regPairs[rpPC]++);
					var h = memory.read(regPairs[rpPC]++);
					regPairs[rpPC] = (h<<8) | l;
				}
				tstates += 10;
			"""
	
	JP_RR = (rp) ->
		tstatesToAdd = if rp == rpHL then 4 else 8
		"""
			regPairs[rpPC] = regPairs[#{rp}];
			tstates += #{tstatesToAdd};
		"""
	
	JP_NN = () ->
		"""
			var l = memory.read(regPairs[rpPC]++);
			var h = memory.read(regPairs[rpPC]++);
			regPairs[rpPC] = (h<<8) | l;
			tstates += 10;
		"""
	
	JR_C_N = (flag, sense) ->
		if sense
			# branch if flag set
			"""
				if (regs[rF] & #{flag}) {
					var offset = memory.read(regPairs[rpPC]++);
					regPairs[rpPC] += (offset & 0x80 ? offset - 0x100 : offset);
					tstates += 12;
				} else {
					regPairs[rpPC]++; /* skip past offset byte */
					tstates += 7;
				}
			"""
		else
			# branch if flag reset
			"""
				if (regs[rF] & #{flag}) {
					regPairs[rpPC]++; /* skip past offset byte */
					tstates += 7;
				} else {
					var offset = memory.read(regPairs[rpPC]++);
					regPairs[rpPC] += (offset & 0x80 ? offset - 0x100 : offset);
					tstates += 12;
				}
			"""
	
	JR_N = () ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			regPairs[rpPC] += (offset & 0x80 ? offset - 0x100 : offset);
			tstates += 12;
		"""
	
	LD_A_iNNi = () ->
		"""
			var l = memory.read(regPairs[rpPC]++);
			var h = memory.read(regPairs[rpPC]++);
			var addr = (h<<8) | l;
			regs[rA] = memory.read(addr);
			tstates += 13;
		"""
	
	LD_iNNi_A = () ->
		"""
			var l = memory.read(regPairs[rpPC]++);
			var h = memory.read(regPairs[rpPC]++);
			var addr = (h<<8) | l;
			memory.write(addr, regs[rA]);
			tstates += 13;
		"""
	
	LD_iNNi_RR = (rp) ->
		tstatesToAdd = if rp == rpHL then 16 else 20
		"""
			var l = memory.read(regPairs[rpPC]++);
			var h = memory.read(regPairs[rpPC]++);
			var addr = (h<<8) | l;
			memory.write(addr, regPairs[#{rp}] & 0xff);
			memory.write((addr + 1) & 0xffff, regPairs[#{rp}] >> 8);
			tstates += #{tstatesToAdd};
		"""
	
	LD_iRRi_N = (rp) ->
		"""
			var n = memory.read(regPairs[rpPC]++);
			memory.write(regPairs[#{rp}], n);
			tstates += 10;
		"""
	
	LD_iRRi_R = (rp, r) ->
		"""
			memory.write(regPairs[#{rp}], regs[#{r}]);
			tstates += 7;
		"""
	
	LD_iRRpNNi_N = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var val = memory.read(regPairs[rpPC]++);
			memory.write(addr, val);
			tstates += 19;
		"""
	
	LD_iRRpNNi_R = (rp, r) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			memory.write(addr, regs[#{r}]);
			tstates += 19;
		"""
	
	LD_R_iRRi = (r, rp) ->
		"""
			regs[#{r}] = memory.read(regPairs[#{rp}]);
			tstates += 7;
		"""
	
	LD_R_iRRpNNi = (r, rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			regs[#{r}] = memory.read(addr);
			tstates += 19;
		"""
	
	LD_R_N = (r) ->
		tstatesToAdd = if (r == rIXH || r == rIXL || r == rIYH || r == rIYL) then 11 else 7
		"""
			regs[#{r}] = memory.read(regPairs[rpPC]++);
			tstates += #{tstatesToAdd};
		"""
	
	LD_R_R = (r1, r2) ->
		if (r1 == rIXH || r1 == rIXL || r1 == rIYH || r1 == rIYL)
			tstatesToAdd = 8
		else if (r2 == rIXH || r2 == rIXL || r2 == rIYH || r2 == rIYL)
			tstatesToAdd = 8
		else if r1 == rI && r2 == rA
			tstatesToAdd = 9
		else
			tstatesToAdd = 4
		"""
			regs[#{r1}] = regs[#{r2}];
			tstates += 9;
		"""
	
	LD_RR_iNNi = (rp, shifted) ->
		tstatesToAdd = if (rp == rpHL && !shifted) then 16 else 20
		"""
			var l = memory.read(regPairs[rpPC]++);
			var h = memory.read(regPairs[rpPC]++);
			var addr = (h<<8) | l;
			l = memory.read(addr);
			h = memory.read((addr + 1) & 0xffff);
			regPairs[#{rp}] = (h<<8) | l;
			tstates += #{tstatesToAdd};
		"""
	
	LD_RR_NN = (rp) ->
		tstatesToAdd = if (rp == rpIX || rp == rpIY) then 14 else 10
		"""
			var l = memory.read(regPairs[rpPC]++);
			var h = memory.read(regPairs[rpPC]++);
			regPairs[#{rp}] = (h<<8) | l;
			tstates += #{tstatesToAdd};
		"""
	
	LD_RR_RR = (rp1, rp2) ->
		# only used for LD SP,HL/IX/IY
		tstatesToAdd = if rp2 == rpHL then 6 else 10
		"""
			regPairs[#{rp1}] = regPairs[#{rp2}];
			tstates += #{tstatesToAdd};
		"""
	
	LDDR = () ->
		"""
			var bytetemp = memory.read(regPairs[rpHL]);
			memory.write(regPairs[rpDE],bytetemp);
			regPairs[rpBC]--;
			bytetemp = (bytetemp + regs[rA]) & 0xff;
			regs[rF] = ( regs[rF] & ( FLAG_C | FLAG_Z | FLAG_S ) ) | ( regPairs[rpBC] ? FLAG_V : 0 ) | ( bytetemp & FLAG_3 ) | ( (bytetemp & 0x02) ? FLAG_5 : 0 );
			if (regPairs[rpBC]) {
				regPairs[rpPC]-=2;
				tstates += 21;
			} else {
				tstates += 16;
			}
			regPairs[rpHL]--; regPairs[rpDE]--;
		"""
	
	LDI = () ->
		"""
			var bytetemp = memory.read(regPairs[rpHL]);
			regPairs[rpBC]--;
			memory.write(regPairs[rpDE],bytetemp);
			regPairs[rpDE]++; regPairs[rpHL]++;
			bytetemp = (bytetemp + regs[rA]) & 0xff;
			regs[rF] = ( regs[rF] & (FLAG_C | FLAG_Z | FLAG_S) ) | ( regPairs[rpBC] ? FLAG_V : 0 ) | (bytetemp & FLAG_3) | ( (bytetemp & 0x02) ? FLAG_5 : 0 );
			tstates += 16;
		"""
	
	LDIR = () ->
		"""
			var bytetemp = memory.read(regPairs[rpHL]);
			memory.write(regPairs[rpDE],bytetemp);
			regPairs[rpBC]--;
			bytetemp = (bytetemp + regs[rA]) & 0xff;
			regs[rF] = ( regs[rF] & ( FLAG_C | FLAG_Z | FLAG_S ) ) | ( regPairs[rpBC] ? FLAG_V : 0 ) | ( bytetemp & FLAG_3 ) | ( (bytetemp & 0x02) ? FLAG_5 : 0 );
			if (regPairs[rpBC]) {
				regPairs[rpPC]-=2;
				tstates += 21;
			} else {
				tstates += 16;
			}
			regPairs[rpHL]++; regPairs[rpDE]++;
		"""
	
	NEG = () ->
		"""
			var val = regs[rA];
			var subtemp = -val;
			var lookup = ( (val & 0x88) >> 2 ) | ( (subtemp & 0x88) >> 1 );
			regs[rA] = subtemp;
			regs[rF] = ( subtemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 8;
		"""
	
	NOP = () ->
		"""
			tstates += 4;
		"""
	
	OR_iHLi = () ->
		"""
			var val = memory.read(regPairs[rpHL]);
			regs[rA] |= val;
			regs[rF] = sz53pTable[regs[rA]];
			tstates += 7;
		"""
	
	OR_iRRpNNi = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var val = memory.read(addr);
			regs[rA] |= val;
			regs[rF] = sz53pTable[regs[rA]];
			tstates += 19;
		"""
	
	OR_N = () ->
		"""
			var val = memory.read(regPairs[rpPC]++);
			regs[rA] |= val;
			regs[rF] = sz53pTable[regs[rA]];
			tstates += 7;
		"""
	
	OR_R = (r) ->
		"""
			regs[rA] |= regs[#{r}];
			regs[rF] = sz53pTable[regs[rA]];
			tstates += 4;
		"""
	
	OUT_iCi_R = (r) ->
		"""
			ioBus.write(regPairs[rpBC], regs[#{r}]);
			tstates += 12;
		"""
	
	OUT_iNi_A = () ->
		"""
			var port = memory.read(regPairs[rpPC]++);
			ioBus.write( (regs[rA] << 8) | port, regs[rA]);
			tstates += 11;
		"""
	
	POP_RR = (rp) ->
		tstatesToAdd = if (rp == rpIX || rp == rpIY) then 14 else 10
		"""
			var l = memory.read(regPairs[rpSP]++);
			var h = memory.read(regPairs[rpSP]++);
			regPairs[#{rp}] = (h<<8) | l;
			tstates += #{tstatesToAdd};
		"""
	
	PUSH_RR = (rp) ->
		tstatesToAdd = if (rp == rpIX || rp == rpIY) then 15 else 11
		"""
			memory.write(--regPairs[rpSP], regPairs[#{rp}] >> 8);
			memory.write(--regPairs[rpSP], regPairs[#{rp}] & 0xff);
			tstates += #{tstatesToAdd};
		"""
	
	RES_N_iHLi = (bit) ->
		hexMask = 0xff ^ (1 << bit)
		"""
			var addr = regPairs[rpHL];
			var value = memory.read(addr);
			memory.write(addr, value & #{hexMask});
			tstates += 15;
		"""
	
	RES_N_iRRpNNi = (bit, rp) -> # expects 'offset'
		hexMask = 0xff ^ (1 << bit)
		"""
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			var value = memory.read(addr);
			memory.write(addr, value & #{hexMask});
			tstates += 23;
		"""
	
	RES_N_R = (bit, r) ->
		hexMask = 0xff ^ (1 << bit)
		"""
			regs[#{r}] &= #{hexMask};
			tstates += 8;
		"""
	
	RET = () ->
		"""
			var l = memory.read(regPairs[rpSP]++);
			var h = memory.read(regPairs[rpSP]++);
			regPairs[rpPC] = (h<<8) | l;
			tstates += 10;
		"""
	
	RET_C = (flag, sense) ->
		if sense
			# branch if flag set
			"""
				if (regs[rF] & #{flag}) {
					var l = memory.read(regPairs[rpSP]++);
					var h = memory.read(regPairs[rpSP]++);
					regPairs[rpPC] = (h<<8) | l;
					tstates += 11;
				} else {
					tstates += 5;
				}
			"""
		else
			# branch if flag reset
			"""
				if (regs[rF] & #{flag}) {
					tstates += 5;
				} else {
					var l = memory.read(regPairs[rpSP]++);
					var h = memory.read(regPairs[rpSP]++);
					regPairs[rpPC] = (h<<8) | l;
					tstates += 11;
				}
			"""
	
	RL_iHLi = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			var rltemp = value;
			value = ( (value << 1) | (regs[rF] & FLAG_C) ) & 0xff;
			regs[rF] = ( rltemp >> 7 ) | sz53pTable[value];
			memory.write(regPairs[rpHL], value);
			tstates =+ 15;
		"""
	
	RL_iRRpNNi = (rp) -> # expects 'offset'
		"""
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			var value = memory.read(addr);
			var rltemp = value;
			value = ( (value << 1) | (regs[rF] & FLAG_C) ) & 0xff;
			regs[rF] = ( rltemp >> 7 ) | sz53pTable[value];
			memory.write(addr, value);
			tstates =+ 23;
		"""
	
	RL_R = (r) ->
		"""
			var rltemp = regs[#{r}];
			regs[#{r}] = ( regs[#{r}]<<1 ) | ( regs[rF] & FLAG_C );
			regs[rF] = ( rltemp >> 7 ) | sz53pTable[regs[#{r}]];
			tstates =+ 8;
		"""
	
	RLA = () ->
		"""
			var bytetemp = regs[rA];
			regs[rA] = (regs[rA] << 1) | (regs[rF] & FLAG_C);
			regs[rF] = ( regs[rF] & (FLAG_P | FLAG_Z | FLAG_S) ) | ( regs[rA] & (FLAG_3 | FLAG_5) ) | (bytetemp >> 7);
			tstates += 4;
		"""
	
	RLC_iHLi = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			value = ( (value << 1) | (value >> 7) ) & 0xff;
			regs[rF] = (value & FLAG_C) | sz53pTable[value];
			memory.write(regPairs[rpHL], value);
			tstates += 15;
		"""
	
	RLC_iRRpNNi = (rp) -> # expects 'offset'
		"""
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			var value = memory.read(addr);
			value = ( (value << 1) | (value >> 7) ) & 0xff;
			regs[rF] = (value & FLAG_C) | sz53pTable[value];
			memory.write(addr, value);
			tstates += 23;
		"""
	
	RLC_R = (r) ->
		"""
			regs[#{r}] = ( regs[#{r}]<<1 ) | ( regs[#{r}]>>7 );
			regs[rF] = ( regs[#{r}] & FLAG_C ) | sz53pTable[regs[#{r}]];
			tstates += 8;
		"""
	
	RLCA = () ->
		"""
			regs[rA] = (regs[rA] << 1) | (regs[rA] >> 7);
			regs[rF] = ( regs[rF] & ( FLAG_P | FLAG_Z | FLAG_S ) ) | ( regs[rA] & ( FLAG_C | FLAG_3 | FLAG_5) );
			tstates += 4;
		"""
	
	RR_iHLi = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			var rrtemp = value;
			value = ( (value >> 1) | ( regs[rF] << 7 ) ) & 0xff;
			regs[rF] = ( rrtemp & FLAG_C ) | sz53pTable[value];
			memory.write(regPairs[rpHL], value);
			tstates += 15;
		"""
	
	RR_iRRpNNi = (rp) -> # expects 'offset'
		"""
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			var value = memory.read(addr);
			var rrtemp = value;
			value = ( (value >> 1) | ( regs[rF] << 7 ) ) & 0xff;
			regs[rF] = ( rrtemp & FLAG_C ) | sz53pTable[value];
			memory.write(addr, value);
			tstates += 15;
		"""
	
	RR_R = (r) ->
		"""
			var rrtemp = regs[#{r}];
			regs[#{r}] = ( regs[#{r}]>>1 ) | ( regs[rF] << 7 );
			regs[rF] = ( rrtemp & FLAG_C ) | sz53pTable[regs[#{r}]];
			tstates += 8;
		"""
	
	RRC_iHLi = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			regs[rF] = value & FLAG_C;
			value = ( (value >> 1) | (value << 7) ) & 0xff;
			regs[rF] |= sz53pTable[value];
			memory.write(regPairs[rpHL], value);
			tstates += 15;
		"""
	
	RRC_iRRpNNi = (rp) ->
		"""
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			var value = memory.read(addr);
			regs[rF] = value & FLAG_C;
			value = ( (value >> 1) | (value << 7) ) & 0xff;
			regs[rF] |= sz53pTable[value];
			memory.write(addr, value);
			tstates += 23;
		"""
	
	RRC_R = (r) ->
		"""
			regs[rF] = regs[#{r}] & FLAG_C;
			regs[#{r}] = ( regs[#{r}] >> 1 ) | ( regs[#{r}] <<7 );
			regs[rF] |= sz53pTable[regs[#{r}]];
			tstates += 8;
		"""
	
	RRCA = () ->
		"""
			regs[rF] = ( regs[rF] & (FLAG_P | FLAG_Z | FLAG_S) ) | (regs[rA] & FLAG_C);
			regs[rA] = ( regs[rA] >> 1) | ( regs[rA] << 7 );
			regs[rF] |= ( regs[rA] & (FLAG_3 | FLAG_5) );
			tstates += 4;
		"""
	
	RRA = () ->
		"""
			var bytetemp = regs[rA];
			regs[rA] = ( bytetemp >> 1 ) | ( regs[rF] << 7 );
			regs[rF] = ( regs[rF] & (FLAG_P | FLAG_Z | FLAG_S) ) | ( regs[rA] & (FLAG_3 | FLAG_5) ) | (bytetemp & FLAG_C);
			tstates += 4;
		"""
	
	RST = (addr) ->
		"""
			memory.write(--regPairs[rpSP], regPairs[rpPC] >> 8);
			memory.write(--regPairs[rpSP], regPairs[rpPC] & 0xff);
			regPairs[rpPC] = #{addr};
			tstates += 11;
		"""
	
	SBC_A_iHLi = () ->
		"""
			var val = memory.read(regPairs[rpHL]);
			
			var sbctemp = regs[rA] - val - ( regs[rF] & FLAG_C );
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (sbctemp & 0x88) >> 1 );
			regs[rA] = sbctemp;
			regs[rF] = ( sbctemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 7;
		"""
	
	SBC_A_iRRpNNi = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var val = memory.read(addr);
			
			var sbctemp = regs[rA] - val - ( regs[rF] & FLAG_C );
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (sbctemp & 0x88) >> 1 );
			regs[rA] = sbctemp;
			regs[rF] = ( sbctemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 19;
		"""
	
	SBC_A_N = () ->
		"""
			var val = memory.read(regPairs[rpPC]++);
			
			var sbctemp = regs[rA] - val - ( regs[rF] & FLAG_C );
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (sbctemp & 0x88) >> 1 );
			regs[rA] = sbctemp;
			regs[rF] = ( sbctemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 7;
		"""
	
	SBC_A_R = (r) ->
		"""
			var sbctemp = regs[rA] - regs[#{r}] - ( regs[rF] & FLAG_C );
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (regs[#{r}] & 0x88) >> 2 ) | ( (sbctemp & 0x88) >> 1 );
			regs[rA] = sbctemp;
			regs[rF] = ( sbctemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 4;
		"""
	
	SBC_HL_RR = (rp) ->
		"""
			var sub16temp = regPairs[rpHL] - regPairs[#{rp}] - (regs[rF] & FLAG_C);
			var lookup = ( (regPairs[rpHL] & 0x8800) >> 11 ) | ( (regPairs[#{rp}] & 0x8800) >> 10 ) | ( (sub16temp & 0x8800) >>  9 );
			regPairs[rpHL] = sub16temp;
			regs[rF] = ( sub16temp & 0x10000 ? FLAG_C : 0 ) | FLAG_N | overflowSubTable[lookup >> 4] | ( regs[rH] & ( FLAG_3 | FLAG_5 | FLAG_S ) ) | halfcarrySubTable[lookup&0x07] | ( regPairs[rpHL] ? 0 : FLAG_Z);
			tstates += 15;
		"""
	
	SCF = () ->
		"""
			regs[rF] = ( regs[rF] & (FLAG_P | FLAG_Z | FLAG_S) ) | ( regs[rA] & (FLAG_3 | FLAG_5) ) | FLAG_C;
			tstates += 4;
		"""
	
	SET_N_iHLi = (bit) ->
		hexMask = 1 << bit
		"""
			var addr = regPairs[rpHL];
			var value = memory.read(addr);
			memory.write(addr, value | #{hexMask});
			tstates += 15;
		"""
	
	SET_N_iRRpNNi = (bit, rp) -> # expects 'offset'
		hexMask = 1 << bit
		"""
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			var value = memory.read(addr);
			memory.write(addr, value | #{hexMask});
			tstates += 23;
		"""
	
	SET_N_R = (bit, r) ->
		hexMask = 1 << bit
		"""
			regs[#{r}] |= #{hexMask};
			tstates += 8;
		"""
	
	SHIFT = (opcodeTable) -> # returns a function, NOT a string
		# Fake instruction for CB/ED-shifted opcodes - passes control to a secondary opcode table
		return () ->
			opcode = memory.read(regPairs[rpPC]++)
			if !opcodeTable[opcode]
				console.log(regPairs[rpPC], opcodeTable)
			opcodeTable[opcode]();
	
	SHIFT_DDCB = (opcodeTable) -> # returns a function, NOT a string
		# like SHIFT, but with the extra quirk that we have to pull an offset parameter from PC
		# *before* the final opcode to tell us what to do
		return () ->
			offset = memory.read(regPairs[rpPC]++)
			if (offset & 0x80)
				offset -= 0x100
			opcode = memory.read(regPairs[rpPC]++)
			if !opcodeTable[opcode]
				console.log(regPairs[rpPC], opcodeTable)
			opcodeTable[opcode](offset)
	
	SLA_iHLi = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			regs[rF] = value >> 7;
			value = (value << 1) & 0xff;
			regs[rF] |= sz53pTable[value];
			memory.write(regPairs[rpHL], value);
			tstates += 15;
		"""
	
	SLA_iRRpNNi = (rp) -> # expects 'offset'
		"""
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			var value = memory.read(addr);
			regs[rF] = value >> 7;
			value = (value << 1) & 0xff;
			regs[rF] |= sz53pTable[value];
			memory.write(addr, value);
			tstates += 23;
		"""
	
	SLA_R = (r) ->
		"""
			regs[rF] = regs[#{r}] >> 7;
			regs[#{r}] <<= 1;
			regs[rF] |= sz53pTable[regs[#{r}]];
			tstates += 8;
		"""
	
	SRA_iHLi = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			regs[rF] = value & FLAG_C;
			value = ( (value & 0x80) | (value >> 1) ) & 0xff;
			regs[rF] |= sz53pTable[value];
			memory.write(regPairs[rpHL], value);
			tstates += 15;
		"""
	
	SRA_iRRpNNi = (rp) -> # expects 'offset'
		"""
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			var value = memory.read(addr);
			regs[rF] = value & FLAG_C;
			value = ( (value & 0x80) | (value >> 1) ) & 0xff;
			regs[rF] |= sz53pTable[value];
			memory.write(addr, value);
			tstates += 15;
		"""
	
	SRA_R = (r) ->
		"""
			regs[rF] = regs[#{r}] & FLAG_C;
			regs[#{r}] = (regs[#{r}] & 0x80) | (regs[#{r}] >> 1);
			regs[rF] |= sz53pTable[regs[#{r}]];
			tstates += 8;
		"""
	
	SRL_iHLi = () ->
		"""
			var value = memory.read(regPairs[rpHL]);
			regs[rF] = value & FLAG_C;
			value >>= 1;
			regs[rF] |= sz53pTable[value];
			memory.write(regPairs[rpHL], value);
			tstates += 15;
		"""
	
	SRL_iRRpNNi = (rp) -> # expects 'offset'
		"""
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			var value = memory.read(addr);
			regs[rF] = value & FLAG_C;
			value >>= 1;
			regs[rF] |= sz53pTable[value];
			memory.write(addr, value);
			tstates += 15;
		"""
	
	SRL_R = (r) ->
		"""
			regs[rF] = regs[#{r}] & FLAG_C;
			regs[#{r}] >>= 1;
			regs[rF] |= sz53pTable[regs[#{r}]];
			tstates += 8;
		"""
	
	SUB_iHLi = () ->
		"""
			var val = memory.read(regPairs[rpHL]);
			var subtemp = regs[rA] - val;
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (subtemp & 0x88) >> 1 );
			regs[rA] = subtemp;
			regs[rF] = ( subtemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 7;
		"""
	
	SUB_iRRpNNi = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var val = memory.read(addr);
			var subtemp = regs[rA] - val;
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (subtemp & 0x88) >> 1 );
			regs[rA] = subtemp;
			regs[rF] = ( subtemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 19;
		"""
	
	SUB_N = () ->
		"""
			var val = memory.read(regPairs[rpPC]++);
			var subtemp = regs[rA] - val;
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (subtemp & 0x88) >> 1 );
			regs[rA] = subtemp;
			regs[rF] = ( subtemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 7;
		"""
	
	SUB_R = (r) ->
		"""
			var subtemp = regs[rA] - regs[#{r}];
			var lookup = ( (regs[rA] & 0x88) >> 3 ) | ( (regs[#{r}] & 0x88) >> 2 ) | ( (subtemp & 0x88) >> 1 );
			regs[rA] = subtemp;
			regs[rF] = ( subtemp & 0x100 ? FLAG_C : 0 ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[regs[rA]];
			tstates += 4;
		"""
	
	XOR_iHLi = () ->
		"""
			var val = memory.read(regPairs[rpHL]);
			regs[rA] ^= val;
			regs[rF] = sz53pTable[regs[rA]];
			tstates += 7;
		"""
	
	XOR_iRRpNNi = (rp) ->
		"""
			var offset = memory.read(regPairs[rpPC]++);
			if (offset & 0x80) offset -= 0x100;
			var addr = (regPairs[#{rp}] + offset) & 0xffff;
			
			var val = memory.read(addr);
			regs[rA] ^= val;
			regs[rF] = sz53pTable[regs[rA]];
			tstates += 19;
		"""
	
	XOR_N = () ->
		"""
			var val = memory.read(regPairs[rpPC]++);
			regs[rA] ^= val;
			regs[rF] = sz53pTable[regs[rA]];
			tstates += 7;
		"""
	
	XOR_R = (r) ->
		"""
			regs[rA] ^= regs[#{r}];
			regs[rF] = sz53pTable[regs[rA]];
			tstates += 4;
		"""
	
	# wrapper to make the string from an opcode generator into a function
	op = (str) ->
		eval "(function() {#{str}})"
	ddcbOp = (str) ->
		eval "(function(offset) {#{str}})"
	
	OPCODE_RUNNERS_CB = {
		0x00: op(RLC_R(rB))        # RLC B
		0x01: op(RLC_R(rC))        # RLC C
		0x02: op(RLC_R(rD))        # RLC D
		0x03: op(RLC_R(rE))        # RLC E
		0x04: op(RLC_R(rH))        # RLC H
		0x05: op(RLC_R(rL))        # RLC L
		0x06: op(RLC_iHLi())        # RLC (HL)
		0x07: op(RLC_R(rA))        # RLC A
		0x08: op(RRC_R(rB))        # RRC B
		0x09: op(RRC_R(rC))        # RRC C
		0x0a: op(RRC_R(rD))        # RRC D
		0x0b: op(RRC_R(rE))        # RRC E
		0x0c: op(RRC_R(rH))        # RRC H
		0x0d: op(RRC_R(rL))        # RRC L
		0x0e: op(RRC_iHLi())        # RRC (HL)
		0x0f: op(RRC_R(rA))        # RRC A
		0x10: op(RL_R(rB))        # RL B
		0x11: op(RL_R(rC))        # RL C
		0x12: op(RL_R(rD))        # RL D
		0x13: op(RL_R(rE))        # RL E
		0x14: op(RL_R(rH))        # RL H
		0x15: op(RL_R(rL))        # RL L
		0x16: op(RL_iHLi())        # RL (HL)
		0x17: op(RL_R(rA))        # RL A
		0x18: op(RR_R(rB))        # RR B
		0x19: op(RR_R(rC))        # RR C
		0x1a: op(RR_R(rD))        # RR D
		0x1b: op(RR_R(rE))        # RR E
		0x1c: op(RR_R(rH))        # RR H
		0x1d: op(RR_R(rL))        # RR L
		0x1e: op(RR_iHLi())        # RR (HL)
		0x1f: op(RR_R(rA))        # RR A
		0x20: op(SLA_R(rB))        # SLA B
		0x21: op(SLA_R(rC))        # SLA C
		0x22: op(SLA_R(rD))        # SLA D
		0x23: op(SLA_R(rE))        # SLA E
		0x24: op(SLA_R(rH))        # SLA H
		0x25: op(SLA_R(rL))        # SLA L
		0x26: op(SLA_iHLi())        # SLA (HL)
		0x27: op(SLA_R(rA))        # SLA A
		0x28: op(SRA_R(rB))        # SRA B
		0x29: op(SRA_R(rC))        # SRA C
		0x2a: op(SRA_R(rD))        # SRA D
		0x2b: op(SRA_R(rE))        # SRA E
		0x2c: op(SRA_R(rH))        # SRA H
		0x2d: op(SRA_R(rL))        # SRA L
		0x2e: op(SRA_iHLi())        # SRA (HL)
		0x2f: op(SRA_R(rA))        # SRA A
		
		0x38: op(SRL_R(rB))        # SRL B
		0x39: op(SRL_R(rC))        # SRL C
		0x3a: op(SRL_R(rD))        # SRL D
		0x3b: op(SRL_R(rE))        # SRL E
		0x3c: op(SRL_R(rH))        # SRL H
		0x3d: op(SRL_R(rL))        # SRL L
		0x3e: op(SRL_iHLi())        # SRL (HL)
		0x3f: op(SRL_R(rA))        # SRL A
		0x40: op(BIT_N_R(0, rB))        # BIT 0,B
		0x41: op(BIT_N_R(0, rC))        # BIT 0,C
		0x42: op(BIT_N_R(0, rD))        # BIT 0,D
		0x43: op(BIT_N_R(0, rE))        # BIT 0,E
		0x44: op(BIT_N_R(0, rH))        # BIT 0,H
		0x45: op(BIT_N_R(0, rL))        # BIT 0,L
		0x46: op(BIT_N_iHLi(0))        # BIT 0,(HL)
		0x47: op(BIT_N_R(0, rA))        # BIT 0,A
		0x48: op(BIT_N_R(1, rB))        # BIT 1,B
		0x49: op(BIT_N_R(1, rC))        # BIT 1,C
		0x4A: op(BIT_N_R(1, rD))        # BIT 1,D
		0x4B: op(BIT_N_R(1, rE))        # BIT 1,E
		0x4C: op(BIT_N_R(1, rH))        # BIT 1,H
		0x4D: op(BIT_N_R(1, rL))        # BIT 1,L
		0x4E: op(BIT_N_iHLi(1))        # BIT 1,(HL)
		0x4F: op(BIT_N_R(1, rA))        # BIT 1,A
		0x50: op(BIT_N_R(2, rB))        # BIT 2,B
		0x51: op(BIT_N_R(2, rC))        # BIT 2,C
		0x52: op(BIT_N_R(2, rD))        # BIT 2,D
		0x53: op(BIT_N_R(2, rE))        # BIT 2,E
		0x54: op(BIT_N_R(2, rH))        # BIT 2,H
		0x55: op(BIT_N_R(2, rL))        # BIT 2,L
		0x56: op(BIT_N_iHLi(2))        # BIT 2,(HL)
		0x57: op(BIT_N_R(2, rA))        # BIT 2,A
		0x58: op(BIT_N_R(3, rB))        # BIT 3,B
		0x59: op(BIT_N_R(3, rC))        # BIT 3,C
		0x5A: op(BIT_N_R(3, rD))        # BIT 3,D
		0x5B: op(BIT_N_R(3, rE))        # BIT 3,E
		0x5C: op(BIT_N_R(3, rH))        # BIT 3,H
		0x5D: op(BIT_N_R(3, rL))        # BIT 3,L
		0x5E: op(BIT_N_iHLi(3))        # BIT 3,(HL)
		0x5F: op(BIT_N_R(3, rA))        # BIT 3,A
		0x60: op(BIT_N_R(4, rB))        # BIT 4,B
		0x61: op(BIT_N_R(4, rC))        # BIT 4,C
		0x62: op(BIT_N_R(4, rD))        # BIT 4,D
		0x63: op(BIT_N_R(4, rE))        # BIT 4,E
		0x64: op(BIT_N_R(4, rH))        # BIT 4,H
		0x65: op(BIT_N_R(4, rL))        # BIT 4,L
		0x66: op(BIT_N_iHLi(4))        # BIT 4,(HL)
		0x67: op(BIT_N_R(4, rA))        # BIT 4,A
		0x68: op(BIT_N_R(5, rB))        # BIT 5,B
		0x69: op(BIT_N_R(5, rC))        # BIT 5,C
		0x6A: op(BIT_N_R(5, rD))        # BIT 5,D
		0x6B: op(BIT_N_R(5, rE))        # BIT 5,E
		0x6C: op(BIT_N_R(5, rH))        # BIT 5,H
		0x6D: op(BIT_N_R(5, rL))        # BIT 5,L
		0x6E: op(BIT_N_iHLi(5))        # BIT 5,(HL)
		0x6F: op(BIT_N_R(5, rA))        # BIT 5,A
		0x70: op(BIT_N_R(6, rB))        # BIT 6,B
		0x71: op(BIT_N_R(6, rC))        # BIT 6,C
		0x72: op(BIT_N_R(6, rD))        # BIT 6,D
		0x73: op(BIT_N_R(6, rE))        # BIT 6,E
		0x74: op(BIT_N_R(6, rH))        # BIT 6,H
		0x75: op(BIT_N_R(6, rL))        # BIT 6,L
		0x76: op(BIT_N_iHLi(6))        # BIT 6,(HL)
		0x77: op(BIT_N_R(6, rA))        # BIT 6,A
		0x78: op(BIT_N_R(7, rB))        # BIT 7,B
		0x79: op(BIT_N_R(7, rC))        # BIT 7,C
		0x7A: op(BIT_N_R(7, rD))        # BIT 7,D
		0x7B: op(BIT_N_R(7, rE))        # BIT 7,E
		0x7C: op(BIT_N_R(7, rH))        # BIT 7,H
		0x7D: op(BIT_N_R(7, rL))        # BIT 7,L
		0x7E: op(BIT_N_iHLi(7))        # BIT 7,(HL)
		0x7F: op(BIT_N_R(7, rA))        # BIT 7,A
		0x80: op(RES_N_R(0, rB))        # RES 0,B
		0x81: op(RES_N_R(0, rC))        # RES 0,C
		0x82: op(RES_N_R(0, rD))        # RES 0,D
		0x83: op(RES_N_R(0, rE))        # RES 0,E
		0x84: op(RES_N_R(0, rH))        # RES 0,H
		0x85: op(RES_N_R(0, rL))        # RES 0,L
		0x86: op(RES_N_iHLi(0))        # RES 0,(HL)
		0x87: op(RES_N_R(0, rA))        # RES 0,A
		0x88: op(RES_N_R(1, rB))        # RES 1,B
		0x89: op(RES_N_R(1, rC))        # RES 1,C
		0x8A: op(RES_N_R(1, rD))        # RES 1,D
		0x8B: op(RES_N_R(1, rE))        # RES 1,E
		0x8C: op(RES_N_R(1, rH))        # RES 1,H
		0x8D: op(RES_N_R(1, rL))        # RES 1,L
		0x8E: op(RES_N_iHLi(1))        # RES 1,(HL)
		0x8F: op(RES_N_R(1, rA))        # RES 1,A
		0x90: op(RES_N_R(2, rB))        # RES 2,B
		0x91: op(RES_N_R(2, rC))        # RES 2,C
		0x92: op(RES_N_R(2, rD))        # RES 2,D
		0x93: op(RES_N_R(2, rE))        # RES 2,E
		0x94: op(RES_N_R(2, rH))        # RES 2,H
		0x95: op(RES_N_R(2, rL))        # RES 2,L
		0x96: op(RES_N_iHLi(2))        # RES 2,(HL)
		0x97: op(RES_N_R(2, rA))        # RES 2,A
		0x98: op(RES_N_R(3, rB))        # RES 3,B
		0x99: op(RES_N_R(3, rC))        # RES 3,C
		0x9A: op(RES_N_R(3, rD))        # RES 3,D
		0x9B: op(RES_N_R(3, rE))        # RES 3,E
		0x9C: op(RES_N_R(3, rH))        # RES 3,H
		0x9D: op(RES_N_R(3, rL))        # RES 3,L
		0x9E: op(RES_N_iHLi(3))        # RES 3,(HL)
		0x9F: op(RES_N_R(3, rA))        # RES 3,A
		0xA0: op(RES_N_R(4, rB))        # RES 4,B
		0xA1: op(RES_N_R(4, rC))        # RES 4,C
		0xA2: op(RES_N_R(4, rD))        # RES 4,D
		0xA3: op(RES_N_R(4, rE))        # RES 4,E
		0xA4: op(RES_N_R(4, rH))        # RES 4,H
		0xA5: op(RES_N_R(4, rL))        # RES 4,L
		0xA6: op(RES_N_iHLi(4))        # RES 4,(HL)
		0xA7: op(RES_N_R(4, rA))        # RES 4,A
		0xA8: op(RES_N_R(5, rB))        # RES 5,B
		0xA9: op(RES_N_R(5, rC))        # RES 5,C
		0xAA: op(RES_N_R(5, rD))        # RES 5,D
		0xAB: op(RES_N_R(5, rE))        # RES 5,E
		0xAC: op(RES_N_R(5, rH))        # RES 5,H
		0xAD: op(RES_N_R(5, rL))        # RES 5,L
		0xAE: op(RES_N_iHLi(5))        # RES 5,(HL)
		0xAF: op(RES_N_R(5, rA))        # RES 5,A
		0xB0: op(RES_N_R(6, rB))        # RES 6,B
		0xB1: op(RES_N_R(6, rC))        # RES 6,C
		0xB2: op(RES_N_R(6, rD))        # RES 6,D
		0xB3: op(RES_N_R(6, rE))        # RES 6,E
		0xB4: op(RES_N_R(6, rH))        # RES 6,H
		0xB5: op(RES_N_R(6, rL))        # RES 6,L
		0xB6: op(RES_N_iHLi(6))        # RES 6,(HL)
		0xB7: op(RES_N_R(6, rA))        # RES 6,A
		0xB8: op(RES_N_R(7, rB))        # RES 7,B
		0xB9: op(RES_N_R(7, rC))        # RES 7,C
		0xBA: op(RES_N_R(7, rD))        # RES 7,D
		0xBB: op(RES_N_R(7, rE))        # RES 7,E
		0xBC: op(RES_N_R(7, rH))        # RES 7,H
		0xBD: op(RES_N_R(7, rL))        # RES 7,L
		0xBE: op(RES_N_iHLi(7))        # RES 7,(HL)
		0xBF: op(RES_N_R(7, rA))        # RES 7,A
		0xC0: op(SET_N_R(0, rB))        # SET 0,B
		0xC1: op(SET_N_R(0, rC))        # SET 0,C
		0xC2: op(SET_N_R(0, rD))        # SET 0,D
		0xC3: op(SET_N_R(0, rE))        # SET 0,E
		0xC4: op(SET_N_R(0, rH))        # SET 0,H
		0xC5: op(SET_N_R(0, rL))        # SET 0,L
		0xC6: op(SET_N_iHLi(0))        # SET 0,(HL)
		0xC7: op(SET_N_R(0, rA))        # SET 0,A
		0xC8: op(SET_N_R(1, rB))        # SET 1,B
		0xC9: op(SET_N_R(1, rC))        # SET 1,C
		0xCA: op(SET_N_R(1, rD))        # SET 1,D
		0xCB: op(SET_N_R(1, rE))        # SET 1,E
		0xCC: op(SET_N_R(1, rH))        # SET 1,H
		0xCD: op(SET_N_R(1, rL))        # SET 1,L
		0xCE: op(SET_N_iHLi(1))        # SET 1,(HL)
		0xCF: op(SET_N_R(1, rA))        # SET 1,A
		0xD0: op(SET_N_R(2, rB))        # SET 2,B
		0xD1: op(SET_N_R(2, rC))        # SET 2,C
		0xD2: op(SET_N_R(2, rD))        # SET 2,D
		0xD3: op(SET_N_R(2, rE))        # SET 2,E
		0xD4: op(SET_N_R(2, rH))        # SET 2,H
		0xD5: op(SET_N_R(2, rL))        # SET 2,L
		0xD6: op(SET_N_iHLi(2))        # SET 2,(HL)
		0xD7: op(SET_N_R(2, rA))        # SET 2,A
		0xD8: op(SET_N_R(3, rB))        # SET 3,B
		0xD9: op(SET_N_R(3, rC))        # SET 3,C
		0xDA: op(SET_N_R(3, rD))        # SET 3,D
		0xDB: op(SET_N_R(3, rE))        # SET 3,E
		0xDC: op(SET_N_R(3, rH))        # SET 3,H
		0xDD: op(SET_N_R(3, rL))        # SET 3,L
		0xDE: op(SET_N_iHLi(3))        # SET 3,(HL)
		0xDF: op(SET_N_R(3, rA))        # SET 3,A
		0xE0: op(SET_N_R(4, rB))        # SET 4,B
		0xE1: op(SET_N_R(4, rC))        # SET 4,C
		0xE2: op(SET_N_R(4, rD))        # SET 4,D
		0xE3: op(SET_N_R(4, rE))        # SET 4,E
		0xE4: op(SET_N_R(4, rH))        # SET 4,H
		0xE5: op(SET_N_R(4, rL))        # SET 4,L
		0xE6: op(SET_N_iHLi(4))        # SET 4,(HL)
		0xE7: op(SET_N_R(4, rA))        # SET 4,A
		0xE8: op(SET_N_R(5, rB))        # SET 5,B
		0xE9: op(SET_N_R(5, rC))        # SET 5,C
		0xEA: op(SET_N_R(5, rD))        # SET 5,D
		0xEB: op(SET_N_R(5, rE))        # SET 5,E
		0xEC: op(SET_N_R(5, rH))        # SET 5,H
		0xED: op(SET_N_R(5, rL))        # SET 5,L
		0xEE: op(SET_N_iHLi(5))        # SET 5,(HL)
		0xEF: op(SET_N_R(5, rA))        # SET 5,A
		0xF0: op(SET_N_R(6, rB))        # SET 6,B
		0xF1: op(SET_N_R(6, rC))        # SET 6,C
		0xF2: op(SET_N_R(6, rD))        # SET 6,D
		0xF3: op(SET_N_R(6, rE))        # SET 6,E
		0xF4: op(SET_N_R(6, rH))        # SET 6,H
		0xF5: op(SET_N_R(6, rL))        # SET 6,L
		0xF6: op(SET_N_iHLi(6))        # SET 6,(HL)
		0xF7: op(SET_N_R(6, rA))        # SET 6,A
		0xF8: op(SET_N_R(7, rB))        # SET 7,B
		0xF9: op(SET_N_R(7, rC))        # SET 7,C
		0xFA: op(SET_N_R(7, rD))        # SET 7,D
		0xFB: op(SET_N_R(7, rE))        # SET 7,E
		0xFC: op(SET_N_R(7, rH))        # SET 7,H
		0xFD: op(SET_N_R(7, rL))        # SET 7,L
		0xFE: op(SET_N_iHLi(7))        # SET 7,(HL)
		0xFF: op(SET_N_R(7, rA))        # SET 7,A
		0x100: 'cb'
	}
	
	# Generate the opcode runner lookup table for either the DD or FD set, acting on the
	# specified register pair (IX or IY)
	generateddcbOpcodeSet = (rp, rh, rl) ->
		ddcbOpcodeRunners = {
			
			0x06: ddcbOp( RLC_iRRpNNi(rp) )        # RLC (IX+nn)
			
			0x0E: ddcbOp( RRC_iRRpNNi(rp) )        # RRC (IX+nn)
			
			0x16: ddcbOp( RL_iRRpNNi(rp) )        # RL (IX+nn)
			
			0x1E: ddcbOp( RR_iRRpNNi(rp) )        # RR (IX+nn)
			
			0x26: ddcbOp( SLA_iRRpNNi(rp) )        # SLA (IX+nn)
			
			0x2E: ddcbOp( SRA_iRRpNNi(rp) )        # SRA (IX+nn)
			
			0x3E: ddcbOp( SRL_iRRpNNi(rp) )        # SRL (IX+nn)
			
			0x46: ddcbOp( BIT_N_iRRpNNi(0, rp) )        # BIT 0,(IX+nn)
			
			0x4E: ddcbOp( BIT_N_iRRpNNi(1, rp) )        # BIT 1,(IX+nn)
			
			0x56: ddcbOp( BIT_N_iRRpNNi(2, rp) )        # BIT 2,(IX+nn)
			
			0x5E: ddcbOp( BIT_N_iRRpNNi(3, rp) )        # BIT 3,(IX+nn)
			
			0x66: ddcbOp( BIT_N_iRRpNNi(4, rp) )        # BIT 4,(IX+nn)
			
			0x6E: ddcbOp( BIT_N_iRRpNNi(5, rp) )        # BIT 5,(IX+nn)
			
			0x76: ddcbOp( BIT_N_iRRpNNi(6, rp) )        # BIT 6,(IX+nn)
			
			0x7E: ddcbOp( BIT_N_iRRpNNi(7, rp) )        # BIT 7,(IX+nn)
			
			0x86: ddcbOp( RES_N_iRRpNNi(0, rp) )        # RES 0,(IX+nn)
			
			0x8E: ddcbOp( RES_N_iRRpNNi(1, rp) )        # RES 1,(IX+nn)
			
			0x96: ddcbOp( RES_N_iRRpNNi(2, rp) )        # RES 2,(IX+nn)
			
			0x9E: ddcbOp( RES_N_iRRpNNi(3, rp) )        # RES 3,(IX+nn)
			
			0xA6: ddcbOp( RES_N_iRRpNNi(4, rp) )        # RES 4,(IX+nn)
			
			0xAE: ddcbOp( RES_N_iRRpNNi(5, rp) )        # RES 5,(IX+nn)
			
			0xB6: ddcbOp( RES_N_iRRpNNi(6, rp) )        # RES 6,(IX+nn)
			
			0xBE: ddcbOp( RES_N_iRRpNNi(7, rp) )        # RES 7,(IX+nn)
			
			0xC6: ddcbOp( SET_N_iRRpNNi(0, rp) )        # SET 0,(IX+nn)
			
			0xCE: ddcbOp( SET_N_iRRpNNi(1, rp) )        # SET 1,(IX+nn)
			
			0xD6: ddcbOp( SET_N_iRRpNNi(2, rp) )        # SET 2,(IX+nn)
			
			0xDE: ddcbOp( SET_N_iRRpNNi(3, rp) )        # SET 3,(IX+nn)
			
			0xE6: ddcbOp( SET_N_iRRpNNi(4, rp) )        # SET 4,(IX+nn)
			
			0xEE: ddcbOp( SET_N_iRRpNNi(5, rp) )        # SET 5,(IX+nn)
			
			0xF6: ddcbOp( SET_N_iRRpNNi(6, rp) )        # SET 6,(IX+nn)
			
			0xFE: ddcbOp( SET_N_iRRpNNi(7, rp) )        # SET 7,(IX+nn)
			
			0x100: 'ddcb'
		}
		
		return {
			0x09: op( ADD_RR_RR(rp, rpBC) )        # ADD IX,BC
			
			0x19: op( ADD_RR_RR(rp, rpDE) )        # ADD IX,DE
			
			0x21: op( LD_RR_NN(rp) )        # LD IX,nnnn
			0x22: op( LD_iNNi_RR(rp) )        # LD (nnnn),IX
			0x23: op( INC_RR(rp) )        # INC IX
			
			0x26: op( LD_R_N(rh) )        # LD IXh, nn
			
			0x29: op( ADD_RR_RR(rp, rp) )        # ADD IX,IX
			0x2A: op( LD_RR_iNNi(rp) )        # LD IX,(nnnn)
			0x2B: op( DEC_RR(rp) )        # DEC IX
			
			0x2E: op( LD_R_N(rl) )        # LD IXl, nn
			
			0x34: op( INC_iRRpNNi(rp) )        # INC (IX+nn)
			0x35: op( DEC_iRRpNNi(rp) )        # DEC (IX+nn)
			0x36: op( LD_iRRpNNi_N(rp) )        # LD (IX+nn),nn
			
			0x39: op( ADD_RR_RR(rp, rpSP) )        # ADD IX,SP
			
			0x44: op( LD_R_R(rB, rh) )        # LD B,IXh
			0x45: op( LD_R_R(rB, rl) )        # LD B,IXl
			0x46: op( LD_R_iRRpNNi(rB, rp) )        # LD B,(IX+nn)
			
			0x4C: op( LD_R_R(rC, rh) )        # LD C,IXh
			0x4D: op( LD_R_R(rC, rl) )        # LD C,IXl
			0x4E: op( LD_R_iRRpNNi(rC, rp) )        # LD C,(IX+nn)
			
			0x54: op( LD_R_R(rD, rh) )        # LD D,IXh
			0x55: op( LD_R_R(rD, rl) )        # LD D,IXl
			0x56: op( LD_R_iRRpNNi(rD, rp) )        # LD D,(IX+nn)
			
			0x5C: op( LD_R_R(rE, rh) )        # LD E,IXh
			0x5D: op( LD_R_R(rE, rl) )        # LD E,IXl
			0x5E: op( LD_R_iRRpNNi(rE, rp) )        # LD E,(IX+nn)
			
			0x60: op( LD_R_R(rh, rB) )        # LD IXh,B
			0x61: op( LD_R_R(rh, rC) )        # LD IXh,C
			0x62: op( LD_R_R(rh, rD) )        # LD IXh,D
			0x63: op( LD_R_R(rh, rE) )        # LD IXh,E
			0x64: op( LD_R_R(rh, rh) )        # LD IXh,IXh
			0x65: op( LD_R_R(rh, rl) )        # LD IXh,IXl
			0x66: op( LD_R_iRRpNNi(rH, rp) )        # LD H,(IX+nn)
			0x67: op( LD_R_R(rh, rA) )        # LD IXh,A
			0x68: op( LD_R_R(rl, rB) )        # LD IXl,B
			0x69: op( LD_R_R(rl, rC) )        # LD IXl,C
			0x6A: op( LD_R_R(rl, rD) )        # LD IXl,D
			0x6B: op( LD_R_R(rl, rE) )        # LD IXl,E
			0x6C: op( LD_R_R(rl, rh) )        # LD IXl,IXh
			0x6D: op( LD_R_R(rl, rl) )        # LD IXl,IXl
			0x6E: op( LD_R_iRRpNNi(rL, rp) )        # LD L,(IX+nn)
			0x6F: op( LD_R_R(rl, rA) )        # LD IXl,A
			0x70: op( LD_iRRpNNi_R(rp, rB) )        # LD (IX+nn),B
			0x71: op( LD_iRRpNNi_R(rp, rC) )        # LD (IX+nn),C
			0x72: op( LD_iRRpNNi_R(rp, rD) )        # LD (IX+nn),D
			0x73: op( LD_iRRpNNi_R(rp, rE) )        # LD (IX+nn),E
			0x74: op( LD_iRRpNNi_R(rp, rH) )        # LD (IX+nn),H
			0x75: op( LD_iRRpNNi_R(rp, rL) )        # LD (IX+nn),L
			0x77: op( LD_iRRpNNi_R(rp, rA) )        # LD (IX+nn),A
			
			0x7C: op( LD_R_R(rA, rh) )        # LD A,IXh
			0x7D: op( LD_R_R(rA, rl) )        # LD A,IXl
			0x7E: op( LD_R_iRRpNNi(rA, rp) )        # LD A,(IX+nn)
			
			0x86: op( ADD_A_iRRpNNi(rp) )        # ADD A,(IX+nn)
			
			0x8E: op( ADC_A_iRRpNNi(rp) )        # ADC A,(IX+nn)
			
			0x96: op( SUB_iRRpNNi(rp) )        # SUB A,(IX+dd)
			
			0x9E: op( SBC_A_iRRpNNi(rp) )        # SBC A,(IX+dd)
			
			0xA6: op( AND_iRRpNNi(rp) )        # AND (IX+dd)
			
			0xAE: op( XOR_iRRpNNi(rp) )        # XOR A,(IX+dd)
			
			0xB6: op( OR_iRRpNNi(rp) )        # OR A,(IX+dd)
			
			0xBE: op( CP_iRRpNNi(rp) )        # CP (IX+dd)
			
			0xCB: SHIFT_DDCB(ddcbOpcodeRunners),        # shift code
			
			0xE1: op( POP_RR(rp) )        # POP IX
			
			0xE3: op( EX_iSPi_RR(rp) )        # EX (SP),IX
			
			0xE5: op( PUSH_RR(rp) )        # PUSH IX
			
			0xE9: op( JP_RR(rp) )        # JP (IX)
			
			0xF9: op( LD_RR_RR(rpSP, rp) )        # LD SP,IX
			
			0x100: 'dd'
		}
	
	OPCODE_RUNNERS_DD = generateddcbOpcodeSet(rpIX, rIXH, rIXL)
	
	OPCODE_RUNNERS_ED = {
		
		0x40: op( IN_R_iCi(rB) )        # IN B,(C)
		0x41: op( OUT_iCi_R(rB) )        # OUT (C),B
		0x42: op( SBC_HL_RR(rpBC) )        # SBC HL,BC
		0x43: op( LD_iNNi_RR(rpBC) )        # LD (nnnn),BC
		0x44: op( NEG() )        # NEG
		
		0x46: op( IM(0) )        # IM 0
		0x47: op( LD_R_R(rI, rA) )        # LD I,A
		0x48: op( IN_R_iCi(rC) )        # IN C,(C)
		0x49: op( OUT_iCi_R(rC) )        # OUT (C),C
		
		0x4B: op( LD_RR_iNNi(rpBC) )        # LD BC,(nnnn)
		
		0x50: op( IN_R_iCi(rD) )        # IN D,(C)
		0x51: op( OUT_iCi_R(rD) )        # OUT (C),D
		0x52: op( SBC_HL_RR(rpDE) )        # SBC HL,DE
		0x53: op( LD_iNNi_RR(rpDE) )        # LD (nnnn),DE
		
		0x56: op( IM(1) )        # IM 1
		
		0x58: op( IN_R_iCi(rE) )        # IN E,(C)
		0x59: op( OUT_iCi_R(rE) )        # OUT (C),E
		
		0x5B: op( LD_RR_iNNi(rpDE) )        # LD DE,(nnnn)
		
		0x5E: op( IM(2) )        # IM 2
		
		0x60: op( IN_R_iCi(rH) )        # IN H,(C)
		0x61: op( OUT_iCi_R(rH) )        # OUT (C),H
		0x62: op( SBC_HL_RR(rpHL) )        # SBC HL,HL
		
		0x68: op( IN_R_iCi(rL) )        # IN L,(C)
		0x69: op( OUT_iCi_R(rL) )        # OUT (C),L
		
		0x6B: op( LD_RR_iNNi(rpHL, true) )        # LD HL,(nnnn)
		
		0x72: op( SBC_HL_RR(rpSP) )        # SBC HL,SP
		0x73: op( LD_iNNi_RR(rpSP) )        # LD (nnnn),SP
		
		0x78: op( IN_R_iCi(rA) )        # IN A,(C)
		0x79: op( OUT_iCi_R(rA) )        # OUT (C),A
		
		0x7B: op( LD_RR_iNNi(rpSP) )        # LD SP,(nnnn)
		
		0xA0: op( LDI() )        # LDI
		
		0xB0: op( LDIR() )        # LDIR
		0xb1: op( CPIR() )        # CPIR
		
		0xB8: op( LDDR() )        # LDDR
		0xb9: op( CPDR() )        # CPDR
		
		0x100: 'ed'
	}
	
	OPCODE_RUNNERS_FD = generateddcbOpcodeSet(rpIY, rIYH, rIYL)
	
	OPCODE_RUNNERS = {
		0x00: op( NOP() )        # NOP
		0x01: op( LD_RR_NN(rpBC) )        # LD BC,nnnn
		0x02: op( LD_iRRi_R(rpBC, rA) )        # LD (BC),A
		0x03: op( INC_RR(rpBC) )        # INC BC
		0x04: op( INC_R(rB) )        # INC B
		0x05: op( DEC_R(rB) )        # DEC B
		0x06: op( LD_R_N(rB) )        # LD B,nn
		0x07: op( RLCA() )        # RLCA
		0x08: op( EX_RR_RR(rpAF, rpAF_) )        # EX AF,AF'
		0x09: op( ADD_RR_RR(rpHL, rpBC) )        # ADD HL,BC
		0x0A: op( LD_R_iRRi(rA, rpBC) )        # LD A,(BC)
		0x0B: op( DEC_RR(rpBC) )        # DEC BC
		0x0C: op( INC_R(rC) )        # INC C
		0x0D: op( DEC_R(rC) )        # DEC C
		0x0E: op( LD_R_N(rC) )        # LD C,nn
		0x0F: op( RRCA() )        # RRCA
		0x10: op( DJNZ_N() )        # DJNZ nn
		0x11: op( LD_RR_NN(rpDE) )        # LD DE,nnnn
		0x12: op( LD_iRRi_R(rpDE, rA) )        # LD (DE),A
		0x13: op( INC_RR(rpDE) )        # INC DE
		0x14: op( INC_R(rD) )        # INC D
		0x15: op( DEC_R(rD) )        # DEC D
		0x16: op( LD_R_N(rD) )        # LD D,nn
		0x17: op( RLA() )        # RLA
		0x18: op( JR_N() )        # JR nn
		0x19: op( ADD_RR_RR(rpHL, rpDE) )        # ADD HL,DE
		0x1A: op( LD_R_iRRi(rA, rpDE) )        # LD A,(DE)
		0x1B: op( DEC_RR(rpDE) )        # DEC DE
		0x1C: op( INC_R(rE) )        # INC E
		0x1D: op( DEC_R(rE) )        # DEC E
		0x1E: op( LD_R_N(rE) )        # LD E,nn
		0x1F: op( RRA() )        # RRA
		0x20: op( JR_C_N(FLAG_Z, false) )        # JR NZ,nn
		0x21: op( LD_RR_NN(rpHL) )        # LD HL,nnnn
		0x22: op( LD_iNNi_RR(rpHL) )        # LD (nnnn),HL
		0x23: op( INC_RR(rpHL) )        # INC HL
		0x24: op( INC_R(rH) )        # INC H
		0x25: op( DEC_R(rH) )        # DEC H
		0x26: op( LD_R_N(rH) )        # LD H,nn
		
		0x28: op( JR_C_N(FLAG_Z, true) )        # JR Z,nn
		0x29: op( ADD_RR_RR(rpHL, rpHL) )        # ADD HL,HL
		0x2A: op( LD_RR_iNNi(rpHL) )        # LD HL,(nnnn)
		0x2B: op( DEC_RR(rpHL) )        # DEC HL
		0x2C: op( INC_R(rL) )        # INC L
		0x2D: op( DEC_R(rL) )        # DEC L
		0x2E: op( LD_R_N(rL) )        # LD L,nn
		0x2F: op( CPL() )        # CPL
		0x30: op( JR_C_N(FLAG_C, false) )        # JR NC,nn
		0x31: op( LD_RR_NN(rpSP) )        # LD SP,nnnn
		0x32: op( LD_iNNi_A() )        # LD (nnnn),a
		0x33: op( INC_RR(rpSP) )        # INC SP
		0x34: op( INC_iHLi() )        # INC (HL)
		0x35: op( DEC_iHLi() )        # DEC (HL)
		0x36: op( LD_iRRi_N(rpHL) )        # LD (HL),nn
		0x37: op( SCF() )        # SCF
		0x38: op( JR_C_N(FLAG_C, true) )        # JR C,nn
		0x39: op( ADD_RR_RR(rpHL, rpSP) )        # ADD HL,SP
		0x3A: op( LD_A_iNNi() )        # LD A,(nnnn)
		0x3B: op( DEC_RR(rpSP) )        # DEC SP
		0x3C: op( INC_R(rA) )        # INC A
		0x3D: op( DEC_R(rA) )        # DEC A
		0x3E: op( LD_R_N(rA) )        # LD A,nn
		0x3F: op( CCF() )        # CCF
		0x40: op( LD_R_R(rB, rB) )        # LD B,B
		0x41: op( LD_R_R(rB, rC) )        # LD B,C
		0x42: op( LD_R_R(rB, rD) )        # LD B,D
		0x43: op( LD_R_R(rB, rE) )        # LD B,E
		0x44: op( LD_R_R(rB, rH) )        # LD B,H
		0x45: op( LD_R_R(rB, rL) )        # LD B,L
		0x46: op( LD_R_iRRi(rB, rpHL) )        # LD B,(HL)
		0x47: op( LD_R_R(rB, rA) )        # LD B,A
		0x48: op( LD_R_R(rC, rB) )        # LD C,B
		0x49: op( LD_R_R(rC, rC) )        # LD C,C
		0x4a: op( LD_R_R(rC, rD) )        # LD C,D
		0x4b: op( LD_R_R(rC, rE) )        # LD C,E
		0x4c: op( LD_R_R(rC, rH) )        # LD C,H
		0x4d: op( LD_R_R(rC, rL) )        # LD C,L
		0x4e: op( LD_R_iRRi(rC, rpHL) )        # LD C,(HL)
		0x4f: op( LD_R_R(rC, rA) )        # LD C,A
		0x50: op( LD_R_R(rD, rB) )        # LD D,B
		0x51: op( LD_R_R(rD, rC) )        # LD D,C
		0x52: op( LD_R_R(rD, rD) )        # LD D,D
		0x53: op( LD_R_R(rD, rL) )        # LD D,L
		0x54: op( LD_R_R(rD, rH) )        # LD D,H
		0x55: op( LD_R_R(rD, rL) )        # LD D,L
		0x56: op( LD_R_iRRi(rD, rpHL) )        # LD D,(HL)
		0x57: op( LD_R_R(rD, rA) )        # LD D,A
		0x58: op( LD_R_R(rE, rB) )        # LD E,B
		0x59: op( LD_R_R(rE, rC) )        # LD E,C
		0x5a: op( LD_R_R(rE, rD) )        # LD E,D
		0x5b: op( LD_R_R(rE, rE) )        # LD E,E
		0x5c: op( LD_R_R(rE, rH) )        # LD E,H
		0x5d: op( LD_R_R(rE, rL) )        # LD E,L
		0x5e: op( LD_R_iRRi(rE, rpHL) )        # LD E,(HL)
		0x5f: op( LD_R_R(rE, rA) )        # LD E,A
		0x60: op( LD_R_R(rH, rB) )        # LD H,B
		0x61: op( LD_R_R(rH, rC) )        # LD H,C
		0x62: op( LD_R_R(rH, rD) )        # LD H,D
		0x63: op( LD_R_R(rH, rE) )        # LD H,E
		0x64: op( LD_R_R(rH, rH) )        # LD H,H
		0x65: op( LD_R_R(rH, rL) )        # LD H,L
		0x66: op( LD_R_iRRi(rH, rpHL) )        # LD H,(HL)
		0x67: op( LD_R_R(rH, rA) )        # LD H,A
		0x68: op( LD_R_R(rL, rB) )        # LD L,B
		0x69: op( LD_R_R(rL, rC) )        # LD L,C
		0x6a: op( LD_R_R(rL, rD) )        # LD L,D
		0x6b: op( LD_R_R(rL, rE) )        # LD L,E
		0x6c: op( LD_R_R(rL, rH) )        # LD L,H
		0x6d: op( LD_R_R(rL, rL) )        # LD L,L
		0x6e: op( LD_R_iRRi(rL, rpHL) )        # LD L,(HL)
		0x6f: op( LD_R_R(rL, rA) )        # LD L,A
		0x70: op( LD_iRRi_R(rpHL, rB) )        # LD (HL),B
		0x71: op( LD_iRRi_R(rpHL, rC) )        # LD (HL),C
		0x72: op( LD_iRRi_R(rpHL, rD) )        # LD (HL),D
		0x73: op( LD_iRRi_R(rpHL, rE) )        # LD (HL),E
		0x74: op( LD_iRRi_R(rpHL, rH) )        # LD (HL),H
		0x75: op( LD_iRRi_R(rpHL, rL) )        # LD (HL),L
		0x76: op( HALT() )        # HALT
		0x77: op( LD_iRRi_R(rpHL, rA) )        # LD (HL),A
		0x78: op( LD_R_R(rA, rB) )        # LD A,B
		0x79: op( LD_R_R(rA, rC) )        # LD A,C
		0x7a: op( LD_R_R(rA, rD) )        # LD A,D
		0x7b: op( LD_R_R(rA, rE) )        # LD A,E
		0x7c: op( LD_R_R(rA, rH) )        # LD A,H
		0x7d: op( LD_R_R(rA, rL) )        # LD A,L
		0x7e: op( LD_R_iRRi(rA, rpHL) )        # LD A,(HL)
		0x7f: op( LD_R_R(rA, rA) )        # LD A,A
		0x80: op( ADD_A_R(rB) )        # ADD A,B
		0x81: op( ADD_A_R(rC) )        # ADD A,C
		0x82: op( ADD_A_R(rD) )        # ADD A,D
		0x83: op( ADD_A_R(rE) )        # ADD A,E
		0x84: op( ADD_A_R(rH) )        # ADD A,H
		0x85: op( ADD_A_R(rL) )        # ADD A,L
		0x86: op( ADD_A_iHLi() )        # ADD A,(HL)
		0x87: op( ADD_A_R(rA) )        # ADD A,A
		0x88: op( ADC_A_R(rB) )        # ADC A,B
		0x89: op( ADC_A_R(rC) )        # ADC A,C
		0x8a: op( ADC_A_R(rD) )        # ADC A,D
		0x8b: op( ADC_A_R(rE) )        # ADC A,E
		0x8c: op( ADC_A_R(rH) )        # ADC A,H
		0x8d: op( ADC_A_R(rL) )        # ADC A,L
		0x8e: op( ADC_A_iHLi() )        # ADC A,(HL)
		0x8f: op( ADC_A_R(rA) )        # ADC A,A
		0x90: op( SUB_R(rB) )        # SUB A,B
		0x91: op( SUB_R(rC) )        # SUB A,C
		0x92: op( SUB_R(rD) )        # SUB A,D
		0x93: op( SUB_R(rE) )        # SUB A,E
		0x94: op( SUB_R(rH) )        # SUB A,H
		0x95: op( SUB_R(rL) )        # SUB A,L
		0x96: op( SUB_iHLi() )        # SUB A,(HL)
		0x97: op( SUB_R(rA) )        # SUB A,A
		0x98: op( SBC_A_R(rB) )        # SBC A,B
		0x99: op( SBC_A_R(rC) )        # SBC A,C
		0x9a: op( SBC_A_R(rD) )        # SBC A,D
		0x9b: op( SBC_A_R(rE) )        # SBC A,E
		0x9c: op( SBC_A_R(rH) )        # SBC A,H
		0x9d: op( SBC_A_R(rL) )        # SBC A,L
		0x9e: op( SBC_A_iHLi() )        # SBC A,(HL)
		0x9f: op( SBC_A_R(rA) )        # SBC A,A
		0xa0: op( AND_R(rB) )        # AND A,B
		0xa1: op( AND_R(rC) )        # AND A,C
		0xa2: op( AND_R(rD) )        # AND A,D
		0xa3: op( AND_R(rE) )        # AND A,E
		0xa4: op( AND_R(rH) )        # AND A,H
		0xa5: op( AND_R(rL) )        # AND A,L
		0xa6: op( AND_iHLi() )        # AND A,(HL)
		0xa7: op( AND_R(rA) )        # AND A,A
		0xA8: op( XOR_R(rB) )        # XOR B
		0xA9: op( XOR_R(rC) )        # XOR C
		0xAA: op( XOR_R(rD) )        # XOR D
		0xAB: op( XOR_R(rE) )        # XOR E
		0xAC: op( XOR_R(rH) )        # XOR H
		0xAD: op( XOR_R(rL) )        # XOR L
		0xAE: op( XOR_iHLi() )        # XOR (HL)
		0xAF: op( XOR_R(rA) )        # XOR A
		0xb0: op( OR_R(rB) )        # OR B
		0xb1: op( OR_R(rC) )        # OR C
		0xb2: op( OR_R(rD) )        # OR D
		0xb3: op( OR_R(rE) )        # OR E
		0xb4: op( OR_R(rH) )        # OR H
		0xb5: op( OR_R(rL) )        # OR L
		0xb6: op( OR_iHLi() )        # OR (HL)
		0xb7: op( OR_R(rA) )        # OR A
		0xb8: op( CP_R(rB) )        # CP B
		0xb9: op( CP_R(rC) )        # CP C
		0xba: op( CP_R(rD) )        # CP D
		0xbb: op( CP_R(rE) )        # CP E
		0xbc: op( CP_R(rH) )        # CP H
		0xbd: op( CP_R(rL) )        # CP L
		0xbe: op( CP_iHLi() )        # CP (HL)
		0xbf: op( CP_R(rA) )        # CP A
		0xC0: op( RET_C(FLAG_Z, false) )        # RET NZ
		0xC1: op( POP_RR(rpBC) )        # POP BC
		0xC2: op( JP_C_NN(FLAG_Z, false) )        # JP NZ,nnnn
		0xC3: op( JP_NN() )        # JP nnnn
		0xC4: op( CALL_C_NN(FLAG_Z, false) )        # CALL NZ,nnnn
		0xC5: op( PUSH_RR(rpBC) )        # PUSH BC
		0xC6: op( ADD_A_N() )        # ADD A,nn
		0xC7: op( RST(0x0000) )        # RST 0x00
		0xC8: op( RET_C(FLAG_Z, true) )        # RET Z
		0xC9: op( RET() )        # RET
		0xCA: op( JP_C_NN(FLAG_Z, true) )        # JP Z,nnnn
		0xCB: SHIFT(OPCODE_RUNNERS_CB)        # shift code
		0xCC: op( CALL_C_NN(FLAG_Z, true) )        # CALL Z,nnnn
		0xCD: op( CALL_NN() )        # CALL nnnn
		0xCE: op( ADC_A_N() )        # ADC A,nn
		0xCF: op( RST(0x0008) )        # RST 0x08
		0xD0: op( RET_C(FLAG_C, false) )        # RET NC
		0xD1: op( POP_RR(rpDE) )        # POP DE
		0xD2: op( JP_C_NN(FLAG_C, false) )        # JP NC,nnnn
		0xD3: op( OUT_iNi_A() )        # OUT (nn),A
		0xD4: op( CALL_C_NN(FLAG_C, false) )        # CALL NC,nnnn
		0xD5: op( PUSH_RR(rpDE) )        # PUSH DE
		0xD6: op( SUB_N() )        # SUB nn
		0xD7: op( RST(0x0010) )        # RST 0x10
		0xD8: op( RET_C(FLAG_C, true) )        # RET C
		0xD9: op( EXX() )        # EXX
		0xDA: op( JP_C_NN(FLAG_C, true) )        # JP C,nnnn
		0xDB: op( IN_A_N() )        # IN A,(nn)
		0xDC: op( CALL_C_NN(FLAG_C, true) )        # CALL C,nnnn
		0xDD: SHIFT(OPCODE_RUNNERS_DD)        # shift code
		0xDE: op( SBC_A_N() )        # SBC A,nn
		0xDF: op( RST(0x0018) )        # RST 0x18
		0xE0: op( RET_C(FLAG_P, false) )        # RET PO
		0xE1: op( POP_RR(rpHL) )        # POP HL
		0xE2: op( JP_C_NN(FLAG_P, false) )        # JP PO,nnnn
		0xE3: op( EX_iSPi_RR(rpHL) )        # EX (SP),HL
		0xE4: op( CALL_C_NN(FLAG_P, false) )        # CALL PO,nnnn
		0xE5: op( PUSH_RR(rpHL) )        # PUSH HL
		0xE6: op( AND_N() )        # AND nn
		0xE7: op( RST(0x0020) )        # RST 0x20
		0xE8: op( RET_C(FLAG_P, true) )        # RET PE
		0xE9: op( JP_RR(rpHL) )        # JP (HL)
		0xEA: op( JP_C_NN(FLAG_P, true) )        # JP PE,nnnn
		0xEB: op( EX_RR_RR(rpDE, rpHL) )        # EX DE,HL
		0xEC: op( CALL_C_NN(FLAG_P, true) )        # CALL PE,nnnn
		0xED: SHIFT(OPCODE_RUNNERS_ED)        # shift code
		0xEE: op( XOR_N() )        # XOR nn
		0xEF: op( RST(0x0028) )        # RST 0x28
		0xF0: op( RET_C(FLAG_S, false) )        # RET P
		0xF1: op( POP_RR(rpAF) )        # POP AF
		0xF2: op( JP_C_NN(FLAG_S, false) )        # JP NZ,nnnn
		0xF3: op( DI() )        # DI
		0xF4: op( CALL_C_NN(FLAG_S, false) )        # CALL P,nnnn
		0xF5: op( PUSH_RR(rpAF) )        # PUSH AF
		0xF6: op( OR_N() )        # OR nn
		0xF7: op( RST(0x0030) )        # RST 0x30
		0xF8: op( RET_C(FLAG_S, true) )        # RET M
		0xF9: op( LD_RR_RR(rpSP, rpHL) )        # LD SP,HL
		0xFA: op( JP_C_NN(FLAG_S, true) )        # JP M,nnnn
		0xFB: op( EI() )        # EI
		0xFC: op( CALL_C_NN(FLAG_S, true) )        # CALL M,nnnn
		0xFD: SHIFT(OPCODE_RUNNERS_FD)        # shift code
		0xFE: op( CP_N() )        # CP nn
		0xFF: op( RST(0x0038) )        # RST 0x38
		0x100: 0
	}
	
	z80Interrupt = ->
		if iff1
			if halted
				regPairs[rpPC]++
				halted = false
			iff1 = iff2 = 0
			
			memory.write(--regPairs[rpSP], regPairs[rpPC] >> 8)
			memory.write(--regPairs[rpSP], regPairs[rpPC] & 0xff)
			
			# TODO: R register
			
			switch im
				when 0
					regPairs[rpPC] = 0x0038
					tstates += 12
				when 1
					regPairs[rpPC] = 0x0038
					tstates += 13
				when 2
					inttemp = (regs[rI] << 8) | 0xff
					l = memory.read(inttemp)
					h = memory.read( (inttemp+1) & 0xffff )
					regPairs[rpPC] = (h<<8) | l
					tstates += 19
	
	self.runFrame = ->
		display.startFrame()
		z80Interrupt()
		while tstates < display.frameLength
			opcode = memory.read(regPairs[rpPC]++)
			OPCODE_RUNNERS[opcode]()
			while display.nextEventTime != null && display.nextEventTime <= tstates
				display.doEvent();
		
		display.endFrame()
		tstates -= display.frameLength
	
	self.reset = ->
		regPairs[rpPC] = regPairs[rpIR] = 0
		iff1 = 0; iff2 = 0; im = 0; halted = false
	
	self.loadFromSnapshot = (snapRegs) ->
		regPairs[rpAF] = snapRegs['AF']
		regPairs[rpBC] = snapRegs['BC']
		regPairs[rpDE] = snapRegs['DE']
		regPairs[rpHL] = snapRegs['HL']
		regPairs[rpAF_] = snapRegs['AF_']
		regPairs[rpBC_] = snapRegs['BC_']
		regPairs[rpDE_] = snapRegs['DE_']
		regPairs[rpHL_] = snapRegs['HL_']
		regPairs[rpIX] = snapRegs['IX']
		regPairs[rpIY] = snapRegs['IY']
		regPairs[rpSP] = snapRegs['SP']
		regPairs[rpPC] = snapRegs['PC']
		regPairs[rpIR] = snapRegs['IR']
		iff1 = snapRegs['iff1']
		iff2 = snapRegs['iff2']
		im = snapRegs['im']
	
	self
