JSSpeccy.Sound = function(opts) {
	var self = {};
	
	var processor = 0;//opts.processor;
	var display = opts.display;

	var sampleRate = 44100;
	var oversampleRate = 8;
	var buzzer_val = 1;

	var soundData = new Array();
	var soundDataFrameBytes = 0;

	var audio = new Audio();

	var ay_registers = new Array;
	var ay_reg_select = 0;

	var lastaudio = 0;
	
	var frameCount = 0;

	audio.mozSetup(1, sampleRate);

	function writeSoundData() {
		var buffer = Float32Array(soundData.length / oversampleRate);
		
		var n = 0;
		
		for (var i=0; i<buffer.length; i++) {
			var avg = 0;
			for (var j=0; j<oversampleRate; j++) {
				avg = avg + soundData[n++];
			}
			avg = avg / oversampleRate;
			buffer[i] = avg *0.7;
		}
		
		var written = audio.mozWriteAudio(buffer);
		soundData = new Array();
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
		size = Math.round(size);
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
