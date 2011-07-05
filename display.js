function Display(opts) {
	var self = {};
	
	var memory = opts.memory;
	
	var palette = new Uint8Array([
		/* dark */
		0x00, 0x00, 0x00, 0xff,
		0x00, 0x00, 0xc0, 0xff,
		0xc0, 0x00, 0x00, 0xff,
		0xc0, 0x00, 0xc0, 0xff,
		0x00, 0xc0, 0x00, 0xff,
		0x00, 0xc0, 0xc0, 0xff,
		0xc0, 0xc0, 0x00, 0xff,
		0xc0, 0xc0, 0xc0, 0xff,
		
		/* bright */
		0x00, 0x00, 0x00, 0xff,
		0x00, 0x00, 0xff, 0xff,
		0xff, 0x00, 0x00, 0xff,
		0xff, 0x00, 0xff, 0xff,
		0x00, 0xff, 0x00, 0xff,
		0x00, 0xff, 0xff, 0xff,
		0xff, 0xff, 0x00, 0xff,
		0xff, 0xff, 0xff, 0xff,
	])
	
	var TSTATES_PER_SCANLINE = 228;
	var LEFT_BORDER_CHARS = 4;
	var RIGHT_BORDER_CHARS = 4;
	var TOP_BORDER_LINES = 24;
	var BOTTOM_BORDER_LINES = 24;
	var TSTATES_UNTIL_ORIGIN = 14000;
	var TSTATES_PER_CHAR = 4;
	
	var BEAM_X_MAX = (32 + RIGHT_BORDER_CHARS);
	var BEAM_Y_MAX = (192 + BOTTOM_BORDER_LINES);
	
	var SCALE_FACTOR = 2;
	
	var CANVAS_WIDTH = 256 + 8 * (LEFT_BORDER_CHARS + RIGHT_BORDER_CHARS);
	var CANVAS_HEIGHT = 192 + TOP_BORDER_LINES + BOTTOM_BORDER_LINES;
	
	var canvas, ctx, imageData, pixels;
	
	self.init = function(container) {
		container.style.width = CANVAS_WIDTH * SCALE_FACTOR + 'px';
		container.style.height = CANVAS_HEIGHT * SCALE_FACTOR + 'px';
		canvas = document.createElement('canvas');
		canvas.width = CANVAS_WIDTH;
		canvas.height = CANVAS_HEIGHT;
		container.appendChild(canvas);
		canvas.style.width = CANVAS_WIDTH * SCALE_FACTOR + 'px';
		canvas.style.height = CANVAS_HEIGHT * SCALE_FACTOR + 'px';
		canvas.style.imageRendering = '-webkit-optimize-contrast';
		ctx = canvas.getContext('2d');
		imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
		pixels = imageData.data;
	}
	
	var borderColour = 7;
	self.setBorder = function(val) {
		borderColour = val;
	}
	
	var beamX, beamY; /* X character pos and Y pixel pos of beam at next screen event,
		relative to top left of non-border screen; negative / overlarge values are in the border */
	
	var pixelLineAddress; /* Address (relative to start of memory page) of the first screen byte in the current line */
	var attributeLineAddress; /* Address (relative to start of memory page) of the first attribute byte in the current line */
	var imageDataPos; /* offset into imageData buffer of current draw position */
	var currentLineStartTime;
	
	var flashPhase = 0;
	
	self.startFrame = function() {
		self.nextEventTime = currentLineStartTime = TSTATES_UNTIL_ORIGIN - (TOP_BORDER_LINES * TSTATES_PER_SCANLINE) - (LEFT_BORDER_CHARS * TSTATES_PER_CHAR);
		beamX = -LEFT_BORDER_CHARS;
		beamY = -TOP_BORDER_LINES;
		pixelLineAddress = 0x0000;
		attributeLineAddress = 0x1800;
		imageDataPos = 0;
		flashPhase = (flashPhase + 1) & 0x1f; /* FLASH has a period of 32 frames (16 on, 16 off) */
	}
	
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
			
			if ( (attributeByte & 0x80) && (flashPhase & 0x10) ) {
				/* FLASH: invert ink / paper */
				var ink = (attributeByte & 0x78) >> 1;
				var paper = ( (attributeByte & 0x07) << 2 ) | ( (attributeByte & 0x40) >> 1 );
			} else {
				var ink = ( (attributeByte & 0x07) << 2 ) | ( (attributeByte & 0x40) >> 1 );
				var paper = (attributeByte & 0x78) >> 1;
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
			beamX = -LEFT_BORDER_CHARS;
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
	}
	
	self.endFrame = function() {
		ctx.putImageData(imageData, 0, 0);
	}
	
	return self;
}
