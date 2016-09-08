JSSpeccy.Display = function(opts) {
	var self = {};
	
	var viewport = opts.viewport;
	var memory = opts.memory;
	var model = opts.model || JSSpeccy.Spectrum.MODEL_128K;
	var border = ('undefined' != typeof viewport.border) ? viewport.border : true;
	
	var palette = new Int32Array([
		/* RGBA dark */
		0x000000ff,
		0x2030c0ff,
		0xc04010ff,
		0xc040c0ff,
		0x40b010ff,
		0x50c0b0ff,
		0xe0c010ff,
		0xc0c0c0ff,
		/* RGBA bright */
		0x000000ff,
		0x3040ffff,
		0xff4030ff,
		0xff70f0ff,
		0x50e010ff,
		0x50e0ffff,
		0xffe850ff,
		0xffffffff
	]);

	var testUint8 = new Uint8Array(new Uint16Array([0x8000]).buffer);
	var isLittleEndian = (testUint8[0] === 0);
	if(isLittleEndian) {
		/* need to reverse the byte ordering of palette */
		for(var i = 0; i < 16; i++) {
			var color = palette[i];
			palette[i] = ((color << 24) & 0xff000000) | ((color << 8) & 0xff0000) | ((color >>> 8) & 0xff00) | ((color >>> 24) & 0xff);
		}
	}


	var LEFT_BORDER_CHARS = 4;
	var RIGHT_BORDER_CHARS = 4;
	var TOP_BORDER_LINES = 24;
	var BOTTOM_BORDER_LINES = 24;
	var TSTATES_PER_CHAR = 4;
	
	var TSTATES_UNTIL_ORIGIN = model.tstatesUntilOrigin;
	var TSTATES_PER_SCANLINE = model.tstatesPerScanline;
	self.frameLength = model.frameLength;
	
	var BEAM_X_MAX = 32 + (border ? RIGHT_BORDER_CHARS : 0);
	var BEAM_Y_MAX = 192 + (border ? BOTTOM_BORDER_LINES : 0);
	
	var CANVAS_WIDTH = 256 + (border ? ((LEFT_BORDER_CHARS + RIGHT_BORDER_CHARS) * 8) : 0);
	var CANVAS_HEIGHT = 192 + (border ? (TOP_BORDER_LINES + BOTTOM_BORDER_LINES) : 0);
	
	viewport.setResolution(CANVAS_WIDTH, CANVAS_HEIGHT);
	var ctx = viewport.canvas.getContext('2d');
	var imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	var pixels = new Int32Array(imageData.data.buffer);
	
	var borderColour = 7;
	self.setBorder = function(val) {
		borderColour = val;
	};
	
	var beamX, beamY; /* X character pos and Y pixel pos of beam at next screen event,
		relative to top left of non-border screen; negative / overlarge values are in the border */
	
	var pixelLineAddress; /* Address (relative to start of memory page) of the first screen byte in the current line */
	var attributeLineAddress; /* Address (relative to start of memory page) of the first attribute byte in the current line */
	var imageDataPos; /* offset into imageData buffer of current draw position */
	var currentLineStartTime;
	
	var flashPhase = 0;
	
	self.startFrame = function() {
		self.nextEventTime = currentLineStartTime = TSTATES_UNTIL_ORIGIN - (TOP_BORDER_LINES * TSTATES_PER_SCANLINE) - (LEFT_BORDER_CHARS * TSTATES_PER_CHAR);
		beamX = (border ? -LEFT_BORDER_CHARS : 0);
		beamY = (border ? -TOP_BORDER_LINES : 0);
		pixelLineAddress = 0x0000;
		attributeLineAddress = 0x1800;
		imageDataPos = 0;
		flashPhase = (flashPhase + 1) & 0x1f; /* FLASH has a period of 32 frames (16 on, 16 off) */
	};
	
	self.doEvent = function() {
		if (beamY < 0 | beamY >= 192 | beamX < 0 | beamX >= 32) {
			/* border */
			for (var i = 0; i < 8; i++) {
				pixels[imageDataPos++] = palette[borderColour];
			}
			//console.log(self.nextEventTime, beamX, beamY, '= border');
		} else {
			/* main screen area */
			var pixelByte = memory.readScreen( pixelLineAddress | beamX );
			var attributeByte = memory.readScreen( attributeLineAddress | beamX );
			
			var ink, paper;
			if ( (attributeByte & 0x80) && (flashPhase & 0x10) ) {
				/* FLASH: invert ink / paper */
				ink = palette[(attributeByte & 0x78) >> 3];
				paper = palette[(attributeByte & 0x07) | ((attributeByte & 0x40) >> 3)];
			} else {
				ink = palette[(attributeByte & 0x07) | ((attributeByte & 0x40) >> 3)];
				paper = palette[(attributeByte & 0x78) >> 3];
			}
			
			for (var b = 0x80; b; b >>= 1) {
				if (pixelByte & b) {
					pixels[imageDataPos++] = ink;
				} else {
					pixels[imageDataPos++] = paper;
				}
			}
			
			//console.log(self.nextEventTime, beamX, beamY, '= screen', pixelLineAddress | beamX, attributeLineAddress | beamX);
		}
		
		/* increment beam / nextEventTime for next event */
		beamX++;
		if (beamX < BEAM_X_MAX) {
			self.nextEventTime += TSTATES_PER_CHAR;
		} else {
			beamX = (border ? -LEFT_BORDER_CHARS : 0);
			beamY++;
			
			if (beamY >= 0 && beamY < 192) {
				/* pixel address = 0 0 0 y7 y6 y2 y1 y0 | y5 y4 y3 x4 x3 x2 x1 x0 */
				pixelLineAddress = ( (beamY & 0xc0) << 5 ) | ( (beamY & 0x07) << 8 ) | ( (beamY & 0x38) << 2 );
				/* attribute address = 0 0 0 1 1 0 y7 y6 | y5 y4 y3 x4 x3 x2 x1 x0 */
				attributeLineAddress = 0x1800 | ( (beamY & 0xf8) << 2 );
			}
			
			if (beamY < BEAM_Y_MAX) {
				currentLineStartTime += TSTATES_PER_SCANLINE;
				self.nextEventTime = currentLineStartTime;
			} else {
				self.nextEventTime = null;
			}
		}
	};
	
	self.endFrame = function() {
		ctx.putImageData(imageData, 0, 0);
	};

	self.drawFullScreen = function() {
		self.startFrame();
		while (self.nextEventTime) self.doEvent();
		self.endFrame();
	};
	
	return self;
};
