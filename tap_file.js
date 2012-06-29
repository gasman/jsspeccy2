JSSpeccy.TapFile = function(data) {
	var self = {};

	var i = 0;
	var blocks = [];
	var tap = new DataView(data);

	while ((i+1) < data.byteLength) {
		var blockLength = tap.getUint16(i, true);
		i += 2;
		blocks.push(new Uint8Array(data, i, blockLength));
		i += blockLength;
	}

	var nextBlockIndex = 0;
	self.getNextLoadableBlock = function() {
		if (blocks.length === 0) return null;
		var block = blocks[nextBlockIndex];
		nextBlockIndex = (nextBlockIndex + 1) % blocks.length;
		return block;
	};

	return self;
};

JSSpeccy.TapFile.isValid = function(data) {
	/* test whether the given ArrayBuffer is a valid TAP file, i.e. EOF is consistent with the
	block lengths we read from the file */
	var pos = 0;
	var tap = new DataView(data);

	while (pos < data.byteLength) {
		if (pos + 1 >= data.byteLength) return false; /* EOF in the middle of a length word */
		var blockLength = tap.getUint16(pos, true);
		pos += blockLength + 2;
	}

	return (pos == data.byteLength); /* file is a valid TAP if pos is exactly at EOF and no further */
};
