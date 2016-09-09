JSSpeccy.Display = function(opts) {
	var self = {};
	
	var viewport = opts.viewport;
	var memory = opts.memory;
	var model = opts.model || JSSpeccy.Spectrum.MODEL_128K;
	var border = opts.borderEnabled;

	var checkerboardFilterEnabled = opts.settings.checkerboardFilter.get();
	opts.settings.checkerboardFilter.onChange.bind(function(newValue) {
		checkerboardFilterEnabled = newValue;
	});
	
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

	/* for post-processing */
	var imageData2 = ctx.createImageData(imageData);
	var pixels2 = new Int32Array(imageData2.data.buffer);
	
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
			var color = palette[borderColour];
			pixels[imageDataPos++] = color;
			pixels[imageDataPos++] = color;
			pixels[imageDataPos++] = color;
			pixels[imageDataPos++] = color;
			pixels[imageDataPos++] = color;
			pixels[imageDataPos++] = color;
			pixels[imageDataPos++] = color;
			pixels[imageDataPos++] = color;
		} else {
			/* main screen area */
			var pixelByte = memory.readScreen( pixelLineAddress | beamX );
			var attributeByte = memory.readScreen( attributeLineAddress | beamX );
			
			var inkColor, paperColor;
			if ( (attributeByte & 0x80) && (flashPhase & 0x10) ) {
				/* FLASH: invert ink / paper */
				inkColor = palette[(attributeByte & 0x78) >> 3];
				paperColor = palette[(attributeByte & 0x07) | ((attributeByte & 0x40) >> 3)];
			} else {
				inkColor = palette[(attributeByte & 0x07) | ((attributeByte & 0x40) >> 3)];
				paperColor = palette[(attributeByte & 0x78) >> 3];
			}
			
			pixels[imageDataPos++] = (pixelByte & 0x80) ? inkColor : paperColor;
			pixels[imageDataPos++] = (pixelByte & 0x40) ? inkColor : paperColor;
			pixels[imageDataPos++] = (pixelByte & 0x20) ? inkColor : paperColor;
			pixels[imageDataPos++] = (pixelByte & 0x10) ? inkColor : paperColor;
			pixels[imageDataPos++] = (pixelByte & 0x08) ? inkColor : paperColor;
			pixels[imageDataPos++] = (pixelByte & 0x04) ? inkColor : paperColor;
			pixels[imageDataPos++] = (pixelByte & 0x02) ? inkColor : paperColor;
			pixels[imageDataPos++] = (pixelByte & 0x01) ? inkColor : paperColor;
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
		if (checkerboardFilterEnabled) {
			self.postProcess();
		} else {
			ctx.putImageData(imageData, 0, 0);
		}
	};

	self.drawFullScreen = function() {
		self.startFrame();
		while (self.nextEventTime) self.doEvent();
		self.endFrame();
	};

	self.postProcess = function() {
		var pix = pixels;
		pixels2.set(pix);
		var ofs = border ? (TOP_BORDER_LINES * CANVAS_WIDTH) + (LEFT_BORDER_CHARS << 3) : 0;
		var skip = border ? ((LEFT_BORDER_CHARS + RIGHT_BORDER_CHARS) << 3) : 0;
		var width = CANVAS_WIDTH;
		var x = 0, y = 1; /* 1-pixel top/bottom margin */
		var k0 = 0, k1 = 0, k2 = 0, k3 = 0, k4 = 0, k5 = 0, k6 = 0, k7 = 0, k8 = 0;
		var avg0, avg1, avg2;
		while (y++ < 191) {
			while (x++ < 256) {
				k0 = pix[ofs - 1]; k1 = pix[ofs]; k2 = pix[ofs + 1]; ofs += width;
				k3 = pix[ofs - 1]; k4 = pix[ofs]; k5 = pix[ofs + 1]; ofs += width;
				k6 = pix[ofs - 1]; k7 = pix[ofs]; k8 = pix[ofs + 1];
				
				var mixed = ((k4 !== k1 || k4 !== k7) && (k4 !== k3 || k4 !== k5));
				
				if (k4 === k0 && k4 === k2 && k4 !== k1 && k4 !== k3 && k4 !== k5) {
					pixels2[ofs - width] = (((k4 ^ k3) & 0xfefefefe) >> 1) + (k4 & k3);
				}
				else if (k4 === k6 && k4 === k8 && k4 !== k3 && k4 !== k5 && k4 !== k7) {
					pixels2[ofs - width] = (((k4 ^ k3) & 0xfefefefe) >> 1) + (k4 & k3);
				}
				else if (k4 === k0 && k4 === k6 && k4 !== k1 && k4 !== k3 && k4 !== k7) {
					pixels2[ofs - width] = (((k4 ^ k1) & 0xfefefefe) >> 1) + (k4 & k1);
				}
				else if (k4 === k2 && k4 === k8 && k4 !== k1 && k4 !== k5 && k4 !== k7) {
					pixels2[ofs - width] = (((k4 ^ k1) & 0xfefefefe) >> 1) + (k4 & k1);
				}
				else if (mixed) {
					avg0 = (((k3 ^ k5) & 0xfefefefe) >> 1) + (k3 & k5);
					avg1 = (((k1 ^ k7) & 0xfefefefe) >> 1) + (k1 & k7);
					avg2 = (((avg0 ^ avg1) & 0xfefefefe) >> 1) + (avg0 & avg1);
					avg2 = (((k4 ^ avg2) & 0xfefefefe) >> 1) + (k4 & avg2);
					pixels2[ofs - width] = (((k4 ^ avg2) & 0xfefefefe) >> 1) + (k4 & avg2);
				}
				ofs -= (width + width - 1);
			}
			ofs += skip;
			x = 0;
		}
		ctx.putImageData(imageData2, 0, 0);
	};

	return self;
};
