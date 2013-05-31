.PHONY: all

DIST_FILES=\
	build/jsspeccy-core.min.js \
	lib/jdataview.js \
	lib/jquery-1.7.2.min.js \
	ui/index.html \
	ui/ui.js \
	ui/jsspeccy.css \
	README \
	Embedding.txt \
	COPYING

all: $(DIST_FILES) ui/images/*
	mkdir -p dist
	cp -r $(DIST_FILES) ui/images dist

build/roms.js: bin2js.pl roms/*
	mkdir -p build
	perl bin2js.pl roms JSSpeccy.roms > build/roms.js

build/autoloaders.js: bin2js.pl autoloaders/*
	mkdir -p build
	perl bin2js.pl autoloaders JSSpeccy.autoloaders > build/autoloaders.js

build/z80.js: core/z80.coffee
	mkdir -p build
	coffee -c -o build/ core/z80.coffee

CORE_JS_FILES=\
	core/jsspeccy.js \
	core/display.js \
	core/io_bus.js \
	core/keyboard.js \
	core/memory.js \
	core/sound.js \
	build/roms.js \
	build/autoloaders.js \
	core/sna_file.js \
	core/spectrum.js \
	core/tap_file.js \
	core/tzx_file.js \
	core/viewport.js \
	build/z80.js \
	core/z80_file.js

build/jsspeccy-core.min.js: $(CORE_JS_FILES)
	mkdir -p build
	java -jar compiler.jar \
		--js=core/jsspeccy.js --js=core/display.js --js=core/io_bus.js --js=core/keyboard.js --js=core/sound.js \
		--js=core/memory.js --js=build/roms.js --js=build/autoloaders.js --js=core/sna_file.js --js=core/spectrum.js \
		--js=core/tap_file.js --js=core/tzx_file.js --js=core/viewport.js --js=build/z80.js \
		--js=core/z80_file.js \
		--js_output_file=build/jsspeccy-core.min.js

.PHONY: clean
clean:
	rm -rf build dist
