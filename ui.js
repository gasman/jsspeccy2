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
		controller.loadLocalFile(files[0]);
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

	var openButton = addToolbarButton('open file', 'open');
	openButton.onclick = function() {
		showPanel(openFilePanel);
	};

	var panels = [];

	function createPanel() {
		var panel = document.createElement('div');
		panel.className = 'panel';
		container.appendChild(panel);
		panels.push(panel);

		var close = document.createElement('button');
		close.innerText = 'close';
		close.className = 'close';
		close.onclick = function() {hidePanels();};
		panel.appendChild(close);

		return panel;
	}
	var openFilePanel = createPanel();

	var loadFromDiskHeader = document.createElement('h2');
	loadFromDiskHeader.innerText = 'Load from disk:';
	openFilePanel.appendChild(loadFromDiskHeader);
	var fileSelect = document.createElement('input');
	fileSelect.type = 'file';
	openFilePanel.appendChild(fileSelect);
	fileSelect.onchange = function() {
		controller.loadLocalFile(this.files[0]);
		hidePanels();
	};

	var loadFromWebHeader = document.createElement('h2');
	loadFromWebHeader.innerText = 'Load from web:';
	openFilePanel.appendChild(loadFromWebHeader);
	var urlField = document.createElement('input');
	openFilePanel.appendChild(urlField);
	var openUrlButton = document.createElement('button');
	openUrlButton.innerText = 'Open URL';
	openFilePanel.appendChild(openUrlButton);
	openUrlButton.onclick = function() {
		var url = urlField.value;
		if (url !== '') {
			controller.loadFromUrl(url);
			hidePanels();
		}
	};

	function showPanel(requestedPanel) {
		for (var i = 0; i < panels.length; i++) {
			panels[i].style.display = (panels[i] == requestedPanel ? 'block' : 'none');
		}
		controller.deactivateKeyboard();
	}

	function hidePanels() {
		for (var i = 0; i < panels.length; i++) {
			panels[i].style.display = 'none';
		}
		controller.activateKeyboard();
	}

	self.setResolution = function(width, height) {
		container.style.width = width * scaleFactor + 'px';
		
		self.canvas.width = width;
		self.canvas.height = height;
		
		self.canvas.style.width = width * scaleFactor + 'px';
		self.canvas.style.height = height * scaleFactor + 'px';
	};
	
	return self;
};
