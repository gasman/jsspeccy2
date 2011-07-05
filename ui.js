JSSpeccy.UI = function(opts) {
	var self = {};
	
	var container = opts.container;
	var controller = opts.controller;
	var scaleFactor = opts.scaleFactor || 2;
	
	self.canvas = document.createElement('canvas');
	container.appendChild(self.canvas);
	self.canvas.style.imageRendering = '-webkit-optimize-contrast';
	
	var resetButton = document.createElement('button');
	container.appendChild(resetButton);
	resetButton.innerText = 'reset';
	resetButton.onclick = function() {
		controller.reset();
	}
	
	self.setResolution = function(width, height) {
		container.style.width = width * scaleFactor + 'px';
		
		self.canvas.width = width;
		self.canvas.height = height;
		
		self.canvas.style.width = width * scaleFactor + 'px';
		self.canvas.style.height = height * scaleFactor + 'px';
	}
	
	return self;
}
