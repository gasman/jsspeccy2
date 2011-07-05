function UI(opts) {
	var self = {};
	
	var container = opts.container;
	var scaleFactor = opts.scaleFactor || 2;
	
	self.canvas = document.createElement('canvas');
	container.appendChild(self.canvas);
	self.canvas.style.imageRendering = '-webkit-optimize-contrast';
	
	self.setResolution = function(width, height) {
		container.style.width = width * scaleFactor + 'px';
		container.style.height = height * scaleFactor + 'px';
		
		self.canvas.width = width;
		self.canvas.height = height;
		
		self.canvas.style.width = width * scaleFactor + 'px';
		self.canvas.style.height = height * scaleFactor + 'px';
	}
	
	return self;
}
