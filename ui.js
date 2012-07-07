JSSpeccy.UI = function(opts) {
	var self = {};
	
	var container = opts.container;
	var controller = opts.controller;
	var scaleFactor = opts.scaleFactor || 2;

	var setInnerText;
	if (document.getElementsByTagName("body")[0].innerText !== undefined) {
		setInnerText = function (elem, text) {
			elem.innerText = text;
		};
	} else {
		setInnerText = function (elem, text) {
			elem.textContent = text;
		};
	}
	
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
		setInnerText(button, text);
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
		setInnerText(close, 'close');
		close.className = 'close';
		close.onclick = function() {hidePanels();};
		panel.appendChild(close);

		return panel;
	}
	var openFilePanel = createPanel();

	var loadFromDiskHeader = document.createElement('h2');
	setInnerText(loadFromDiskHeader, 'Load from disk:');
	openFilePanel.appendChild(loadFromDiskHeader);
	var fileSelect = document.createElement('input');
	fileSelect.type = 'file';
	openFilePanel.appendChild(fileSelect);
	fileSelect.onchange = function() {
		controller.loadLocalFile(this.files[0]);
		hidePanels();
	};

	var loadFromWebHeader = document.createElement('h2');
	setInnerText(loadFromWebHeader, 'Load from web:');
	openFilePanel.appendChild(loadFromWebHeader);
	var urlField = document.createElement('input');
	openFilePanel.appendChild(urlField);
	var openUrlButton = document.createElement('button');
	setInnerText(openUrlButton, 'Open URL');
	openFilePanel.appendChild(openUrlButton);
	openUrlButton.onclick = function() {
		var url = urlField.value;
		if (url !== '') {
			controller.loadFromUrl(url);
			hidePanels();
		}
	};

	if (jQuery) {
		(function ($) {
			var wosSearchField = $('<input type="text">');
			var wosSearchBtn = $('<input type="submit" value="Search title">');
			var wosSearch = $('<form></form>');
			var wosMatches = $('<select style="width: 250px" size="8"></select>');
			var wosDownloads = $('<select style="width: 250px" size="8"></select>');
			var wosOpen = $('<button>Open file</button>').attr('disabled', 'disabled');
			$(openFilePanel).append(
				'<h2>Search World Of Spectrum:</h2>', wosSearch, wosMatches, wosDownloads, wosOpen
			);
			wosSearch.append(wosSearchField, wosSearchBtn);
			wosSearch.submit(function() {
				var query = wosSearchField.val();
				if (query !== '') {
					$.getJSON('http://www.worldofspectrum.org/api/infoseek_search_json.cgi?callback=?',
						{title: query},
						function(results) {
							wosMatches.empty();
							wosDownloads.empty();
							wosOpen.attr('disabled', 'disabled');
							if (results.matches) {
								for (var i = 0; i < results.matches.length; i++) {
									var result = results.matches[i];
									var optionText = result.title;
									if (result.publisher) {
										optionText += " (" + result.publisher + ")";
									}
									var option = $('<option></option>').text(optionText).attr('value', result.id);
									wosMatches.append(option);
								}
								wosMatches.removeAttr('disabled');
							} else {
								wosMatches.append('<option>(no matches found)</option>');
								wosMatches.attr('disabled', 'disabled');
							}
						}
					);
				}
				return false;
			});

			wosMatches.change(function() {
				wosDownloads.empty();
				wosOpen.attr('disabled', 'disabled');
				var id = $(this).val();
				if (id) {
					$.getJSON('http://www.worldofspectrum.org/api/infoseek_select_json.cgi?callback=?',
						{id: id},
						function(response) {
							wosDownloads.empty();
							if (response.downloads) {
								for (var i = 0; i < response.downloads.length; i++) {
									var download = response.downloads[i];
									var optionText;
									if (download.origin !== '') {
										optionText = download.origin + " - " + download.type;
									} else {
										optionText = download.type;
									}
									var option = $('<option></option>').text(optionText).attr('value', download.link);
									wosDownloads.append(option);
								}
								wosDownloads.removeAttr('disabled');
							} else {
								wosDownloads.append('<option>(no downloads available)</option>');
								wosDownloads.attr('disabled', 'disabled');
							}
						}
					);
				}
			});

			wosDownloads.change(function() {
				var url = $(this).val();
				if (url) {
					wosOpen.removeAttr('disabled');
				} else {
					wosOpen.attr('disabled', 'disabled');
				}
			});

			function loadSelectedFile() {
				var url = wosDownloads.val();
				if (url) {
					controller.loadFromUrl(url.replace('ftp://ftp.worldofspectrum.org/pub/sinclair/', 'http://wosproxy.zxdemo.org/unzip/'));
					hidePanels();
				}
			}

			wosOpen.click(loadSelectedFile);
			wosDownloads.dblclick(loadSelectedFile);
		})(jQuery);
	}

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
