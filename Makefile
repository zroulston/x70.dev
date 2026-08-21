# x70.dev
#
# IMPORTANT: assets/main.wasm and js/wasm_exec.js are a matched pair. The JS
# shim must come from the same Go toolchain that compiled the binary, so
# `make wasm` always refreshes both together. Never deploy one without the other.

GO      ?= go
PORT    ?= 9090
GOROOT  := $(shell $(GO) env GOROOT)
WASM    := main.wasm

.PHONY: all build wasm shim serve check test dist fonts clean

all: build

build: wasm

## wasm: compile the Go engine and sync the matching JS shim
wasm: shim
	GOOS=js GOARCH=wasm $(GO) build -trimpath -ldflags="-s -w" -o $(WASM) ./cmd/wasm
	@echo "built $(WASM) ($$(du -h $(WASM) | cut -f1)) with $$($(GO) env GOVERSION)"

## shim: copy wasm_exec.js out of the active GOROOT
shim:
	@cp "$(GOROOT)/lib/wasm/wasm_exec.js" js/wasm_exec.js
	@echo "synced js/wasm_exec.js from $$($(GO) env GOVERSION)"

## serve: build, then serve the site at http://localhost:$(PORT)
serve: build
	@echo "serving on http://localhost:$(PORT)"
	$(GO) run ./cmd/server -port $(PORT)

## check: vet the Go packages under their real build constraints
check:
	GOOS=js GOARCH=wasm $(GO) vet ./cmd/wasm
	$(GO) vet ./cmd/server

## test: verify the JS SHA-256 matches a known-good implementation
test:
	node scripts/test-sha256.mjs

## dist: assemble exactly the files that get published, and nothing else
dist: build
	rm -rf dist && mkdir -p dist
	cp index.html favicon.svg favicon.ico robots.txt sitemap.xml $(WASM) dist/
	cp -R css js fonts images projects writing dist/
	@BUILD=$$( { sha256sum $(WASM) 2>/dev/null || shasum -a 256 $(WASM); } | cut -c1-12 ); \
	  sed -i.bak "s/__BUILD__/$$BUILD/g" dist/js/bench.js && rm -f dist/js/bench.js.bak; \
	  grep -q "__BUILD__" dist/js/bench.js && { echo "build stamp failed"; exit 1; }; \
	  echo "stamped build $$BUILD"

	@echo "dist/ ready ($$(find dist -type f | wc -l | tr -d ' ') files, $$(du -sh dist | cut -f1))"

## fonts: re-download the self-hosted latin font subsets
fonts:
	./scripts/fonts.sh

clean:
	rm -rf dist $(WASM)
