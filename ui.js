JSSpeccy.UI = function(opts) {
	var self = {};
	
	var container = opts.container;
	var controller = opts.controller;
	var scaleFactor = opts.scaleFactor || 2;
	
	container.className += ' jsspeccy';
	self.canvas = document.createElement('canvas');
	container.appendChild(self.canvas);
	self.canvas.style.imageRendering = '-webkit-optimize-contrast';
	
	/* set up drag event on canvas to load files */
	self.canvas.ondragenter = function() {
		// Needed for web browser compatibility
		return false;
	};
	self.canvas.ondragover = function () {
		// Needed for web browser compatibility
		return false;
	};
	self.canvas.ondrop = function(evt) {
		var files = evt.dataTransfer.files;
		var reader = new FileReader();
		reader.onloadend = function() {
			controller.loadFile(files[0].name, this.result);
		};
		reader.readAsBinaryString(files[0]);
		return false;
	};
	
	var toolbar = document.createElement('ul');
	container.appendChild(toolbar);
	toolbar.className = 'toolbar';

	function addToolbarButton(className, text) {
		var button = document.createElement('button');
		button.className = className;
		button.innerText = text;
		var li = document.createElement('li');
		toolbar.appendChild(li);
		li.appendChild(button);
		return button;
	}

	var stopStartButton = addToolbarButton('start', 'stop / start');
	stopStartButton.onclick = function() {
		if (controller.isRunning) {
			controller.stop();
		} else {
			controller.start();
		}
	};
	controller.onStart.bind(function() {
		stopStartButton.className = 'stop';
	});
	controller.onStop.bind(function() {
		stopStartButton.className = 'start';
	});

	var resetButton = addToolbarButton('reset', 'reset');
	resetButton.onclick = function() {
		controller.reset();
	};
	
	self.setResolution = function(width, height) {
		container.style.width = width * scaleFactor + 'px';
		
		self.canvas.width = width;
		self.canvas.height = height;
		
		self.canvas.style.width = width * scaleFactor + 'px';
		self.canvas.style.height = height * scaleFactor + 'px';
	};
	
	return self;
};
