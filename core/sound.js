JSSpeccy.Sound = function(opts) {
	var self = {};
	
	var processor = 0;//opts.processor;
	var display = opts.display;

	var sampleRate = 44100;
	var oversampleRate = 8;
	var buzzer_val = 1;

	var soundData = new Array();
	var soundDataFrameBytes = 0;

	var lastaudio = 0;
	
	var frameCount = 0;

	var audio = null;
	var audioContext = null;
	var audioNode = null;
	
	if (typeof(webkitAudioContext)!='undefined') {
		audioContext = new webkitAudioContext();
		audioNode = audioContext.createJavaScriptNode(8192, 1, 1);
	}

	if (audioNode==null && typeof(Audio)!='undefined') {
		audio = new Audio();
		audio.mozSetup(1, sampleRate);
	}
	
	function fillbuffer(buffer) {
		var n = 0;
		
		for (var i=0; i<buffer.length; i++) {
			var avg = 0;
			for (var j=0; j<oversampleRate; j++) {
				avg = avg + soundData[n++];
			}
			avg = avg / oversampleRate;
			buffer[i] = avg *0.7;
		}
		
		if (n>soundData.Length) {
			soundData = new Array();
		}
		else {
			soundData.splice(0,n);
		}
	}

	function processData(e) {
		var buffer = e.outputBuffer.getChannelData(0);
		fillbuffer(buffer);
	}
	
	function writeSoundData() {	
		if (audio!=null) {
			var buffer = Float32Array(soundData.length / oversampleRate);
			
			fillbuffer(buffer);
		
			var written = audio.mozWriteAudio(buffer);
		}

		if (audioNode!=null && audioNode.onaudioprocess != processData) {
			audioNode.onaudioprocess = processData;
			audioNode.connect(audioContext.destination);
		}
	
	}
	
		self.updateBuzzer = function(val) {
		if (val==0) val = -1;

		if (buzzer_val!=val) {	
			var sound_size = (processor.getTstates() - lastaudio) * sampleRate * oversampleRate / 50 / display.frameLength;
			self.createSoundData(sound_size, buzzer_val);			
			
			buzzer_val = val;			
			lastaudio = processor.getTstates();
		}
	}
	
	self.createSoundData = function (size, val) {
		size = Math.floor(size);
		if (size>=1) {
			for (var i=0; i<size; i++) {
				soundData.push(val);
			}
			soundDataFrameBytes+=size;
		}
	}

	self.startFrame = function(p) {
		processor = p;
	}
	
	self.endFrame = function() {
		
		self.createSoundData(sampleRate * oversampleRate / 50 - soundDataFrameBytes, buzzer_val);	
		lastaudio = 0;
		soundDataFrameBytes = 0;	
		if (!frameCount++) return;
		writeSoundData();
		
	}
	
	return self;
};
