.PHONY: all
all: jsspeccy-core.min.js

roms.js: bin2js.pl roms/*
	perl bin2js.pl roms JSSpeccy.roms > roms.js

z80.js: z80.coffee
	coffee -c z80.coffee

CORE_JS_FILES=\
	jsspeccy.js \
	display.js \
	io_bus.js \
	keyboard.js \
	memory.js \
	roms.js \
	sna_file.js \
	spectrum.js \
	tap_file.js \
	tzx_file.js \
	viewport.js \
	z80.js \
	z80_file.js

jsspeccy-core.min.js: $(CORE_JS_FILES)
	java -jar compiler.jar \
		--js=jsspeccy.js --js=display.js --js=io_bus.js --js=keyboard.js \
		--js=memory.js --js=roms.js --js=sna_file.js --js=spectrum.js --js=tap_file.js \
		--js=tzx_file.js --js=viewport.js --js=z80.js --js=z80_file.js \
		--js_output_file=jsspeccy-core.min.js

.PHONY: clean
clean:
	rm -f roms.js z80.js jsspeccy-core.min.js
