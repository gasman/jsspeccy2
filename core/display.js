JSSpeccy.Display = function(opts) {
	var self = {};
	
	var viewport = opts.viewport;
	var memory = opts.memory;
	var model = opts.model || JSSpeccy.Spectrum.MODEL_128K;
	var border = ('undefined' != typeof viewport.border) ? viewport.border : true;
	
	var palette = new Uint8Array([
		/* dark */
		0x00, 0x00, 0x00, 0xff,
		0x20, 0x30, 0xc0, 0xff,
		0xc0, 0x40, 0x10, 0xff,
		0xc0, 0x40, 0xc0, 0xff,
		0x40, 0xb0, 0x10, 0xff,
		0x50, 0xc0, 0xb0, 0xff,
		0xe0, 0xc0, 0x10, 0xff,
		0xc0, 0xc0, 0xc0, 0xff,
		
		/* bright */
		0x00, 0x00, 0x00, 0xff,
		0x30, 0x40, 0xff, 0xff,
		0xff, 0x40, 0x30, 0xff,
		0xff, 0x70, 0xf0, 0xff,
		0x50, 0xe0, 0x10, 0xff,
		0x50, 0xe0, 0xff, 0xff,
		0xff, 0xe8, 0x50, 0xff,
		0xff, 0xff, 0xff, 0xff
	]);
	
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
	var imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
	var pixels = imageData.data;
	
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
			var p = borderColour << 2;
			for (var i = 0; i < 8; i++) {
				pixels[imageDataPos++] = palette[p];
				pixels[imageDataPos++] = palette[p+1];
				pixels[imageDataPos++] = palette[p+2];
				pixels[imageDataPos++] = 0xff;
			}
			//console.log(self.nextEventTime, beamX, beamY, '= border');
		} else {
			/* main screen area */
			var pixelByte = memory.readScreen( pixelLineAddress | beamX );
			var attributeByte = memory.readScreen( attributeLineAddress | beamX );
			
			var ink, paper;
			if ( (attributeByte & 0x80) && (flashPhase & 0x10) ) {
				/* FLASH: invert ink / paper */
				ink = (attributeByte & 0x78) >> 1;
				paper = ( (attributeByte & 0x07) << 2 ) | ( (attributeByte & 0x40) >> 1 );
			} else {
				ink = ( (attributeByte & 0x07) << 2 ) | ( (attributeByte & 0x40) >> 1 );
				paper = (attributeByte & 0x78) >> 1;
			}
			
			for (var b = 0x80; b; b >>= 1) {
				if (pixelByte & b) {
					pixels[imageDataPos++] = palette[ink];
					pixels[imageDataPos++] = palette[ink+1];
					pixels[imageDataPos++] = palette[ink+2];
					pixels[imageDataPos++] = 0xff;
				} else {
					pixels[imageDataPos++] = palette[paper];
					pixels[imageDataPos++] = palette[paper+1];
					pixels[imageDataPos++] = palette[paper+2];
					pixels[imageDataPos++] = 0xff;
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
