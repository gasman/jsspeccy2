JSSpeccy.UI = function(opts) {
	var self = {};

	var container = opts.container;
	if (typeof(container) === 'string') {
		container = document.getElementById(container);
	}
	var controller = opts.controller;

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

	$(container).addClass('jsspeccy');


	/* Set up toolbar */
	var toolbar = $('.toolbar', container);

	var stopStartButton = $('button.stop-start', toolbar);
	stopStartButton.click(function() {
		if (controller.isRunning) {
			controller.stop();
		} else {
			controller.start();
		}
	});
	function refreshStopStartButton() {
		if (controller.isRunning) {
			stopStartButton.removeClass('start').addClass('stop');
		} else {
			stopStartButton.removeClass('stop').addClass('start');
		}
	}
	controller.onStart.bind(refreshStopStartButton);
	controller.onStop.bind(refreshStopStartButton);
	refreshStopStartButton();

	$('button.reset', toolbar).click(function() {
		controller.reset();
	});

	var audioButton = $('button.audio', toolbar);
	audioButton.click(function() {
		controller.setAudioState(!controller.getAudioState());
	});
	function refreshAudioButton(audioState) {
		audioButton.toggleClass('enabled', audioState);
	}
	controller.onChangeAudioState.bind(refreshAudioButton);
	refreshAudioButton(controller.getAudioState());

	$('button.open', toolbar).click(function() {
		showPanel('.open-file');
	});

	$('button.about', toolbar).click(function() {
		showPanel('.about');
	});

	var selectModel = $('select.select-model', toolbar);
	var modelsById = {};
	for (var i = 0; i < JSSpeccy.Spectrum.MODELS.length; i++) {
		var model = JSSpeccy.Spectrum.MODELS[i];
		modelsById[model.id] = model;
		selectModel.append(
			$('<option></option>').text(model.name).attr({'value': model.id})
		);
	}
	selectModel.change(function() {
		var modelId = $(this).val();
		controller.setModel(modelsById[modelId]);
	});
	function refreshModel() {
		selectModel.val(controller.getModel().id);
	}
	refreshModel();
	controller.onChangeModel.bind(refreshModel);

	var autoloadTapes = $('input.autoload-tapes');

	/* Set up panels */
	var panels = [];

	function showPanel(selector) {
		$('.panel', container).not(selector).hide();
		$('.panel', container).filter(selector).show();
		controller.deactivateKeyboard();
	}

	function hidePanels() {
		$('.panel', container).hide();
		controller.activateKeyboard();
	}

	$('.panel button.close', container).click(function() {
		hidePanels();
	});

	var openFilePanel = $('.panel.open-file', container);

	var fileSelect = openFilePanel.find('input[type="file"]');
	fileSelect.change(function() {
		controller.loadLocalFile(this.files[0], {'autoload': autoloadTapes.is(':checked')});
		fileSelect.val('');
		hidePanels();
	});

	var urlField = openFilePanel.find('input[type="url"]');
	openFilePanel.find('button.open-url').click(function() {
		var url = urlField.val();
		if (url !== '') {
			controller.loadFromUrl(url, {'autoload': autoloadTapes.is(':checked')});
			hidePanels();
		}
	});


	/* World Of Spectrum search interface */

	var wosSearch = openFilePanel.find('form.search-wos');
	var wosSearchField = wosSearch.find('input[type="search"]');
	var wosSearchBtn = wosSearch.find('input[type="submit"]');

	var wosMatches = openFilePanel.find('select.wos-matches');
	var wosDownloads = openFilePanel.find('select.wos-downloads');
	var wosOpen = openFilePanel.find('button.open-from-wos');

	wosOpen.attr('disabled', 'disabled');

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
			controller.loadFromUrl(
				url.replace('ftp://ftp.worldofspectrum.org/pub/sinclair/', 'http://wosproxy.zxdemo.org/unzip/'),
				{'autoload': autoloadTapes.is(':checked')}
			);
			hidePanels();
		}
	}

	wosOpen.click(loadSelectedFile);
	wosDownloads.dblclick(loadSelectedFile);

	return self;
};
