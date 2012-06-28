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
