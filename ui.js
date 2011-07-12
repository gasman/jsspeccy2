JSSpeccy.UI = function(opts) {
	var self = {};
	
	var container = opts.container;
	var controller = opts.controller;
	var scaleFactor = opts.scaleFactor || 2;
	
	self.canvas = document.createElement('canvas');
	container.appendChild(self.canvas);
	self.canvas.style.imageRendering = '-webkit-optimize-contrast';
	
	/* set up drag event on canvas to load files */
	self.canvas.ondragenter = function() {
		// Needed for web browser compatibility
		return false;
	}
	self.canvas.ondragover = function () {
		// Needed for web browser compatibility
		return false;
	}
	self.canvas.ondrop = function(evt) {
		var files = evt.dataTransfer.files;
		var reader = new FileReader();
		reader.onloadend = function() {
			controller.loadFile(files[0].name, this.result);
		}
		reader.readAsBinaryString(files[0]);
		return false;
	}
	
	var stopStartButton = document.createElement('button');
	container.appendChild(stopStartButton);
	stopStartButton.innerText = 'stop / start';
	stopStartButton.onclick = function() {
		if (controller.isRunning) {
			controller.stop();
		} else {
			controller.start();
		}
	}
	
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
