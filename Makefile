.PHONY: all
all: roms.js z80.js

roms.js: bin2js.pl roms/*
	perl bin2js.pl roms JSSpeccy.roms > roms.js

z80.js: z80.coffee
	coffee -c z80.coffee

.PHONY: clean
clean:
	rm -f roms.js z80.js
