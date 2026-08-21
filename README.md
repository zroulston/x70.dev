# x70.dev

A personal engineering testbed: a place to try things in infrastructure, systems,
security and AI, and leave them running where they can be poked at.

The site is a static bundle served from Cloudflare R2. There is no framework and
no build step beyond compiling one Go program to WebAssembly.

## The engine benchmark

The landing page races a Go program compiled to WebAssembly against a
hand-written JavaScript implementation of the same algorithm. Both hash a
64-byte block with SHA-256, then feed each digest back in as the next input,
250,000 times.

Two details make the comparison honest rather than decorative:

- **Both sides print their final digest.** If the digests match, the two engines
  provably did identical work. If they ever diverge, that is a bug, not a result.
- **Both get a warm-up pass** before the timed run, so neither is measured cold
  against a warmed rival.

The result is frequently *not* a win for WebAssembly. A JIT-warmed JavaScript
engine is extremely good at 32-bit integer arithmetic, which is essentially all
SHA-256 is. That is the interesting part, and the page says so.

The 2.3 MB binary is only downloaded when you press run.

## Layout

```
index.html          landing page and the benchmark panel
projects/           experiment index, rendered from js/experiments.js
writing/            posts (empty for now)
css/                styles.css, plus generated fonts.css
js/                 site.js, bench.js, sha256.js, experiments.js, wasm_exec.js
fonts/              self-hosted latin subsets — no third-party font requests
cmd/wasm/           the Go engine, compiled to WebAssembly
cmd/server/         local dev file server, not used in production
scripts/            font sync and the SHA-256 test
```

Adding an experiment means adding an entry to `js/experiments.js`. Both the
landing-page rack and `/projects/` render from that one list.

## Working on it

```sh
make serve     # build the wasm, then serve on http://localhost:9090
make test      # check js/sha256.js against Node's crypto
make check     # go vet, under the real js/wasm build constraints
make dist      # assemble exactly the files that get published
make fonts     # re-download the self-hosted font subsets
```

When running on localhost the page loads `/assets/main.wasm` from the local
build; in production it loads it from `assets.x70.dev`.

### One rule about the WebAssembly build

`assets/main.wasm` and `js/wasm_exec.js` are a **matched pair**. The JS shim must
come from the same Go toolchain that compiled the binary, or the page breaks at
`instantiateStreaming` with an ABI mismatch. `make wasm` always refreshes both
together — never update one on its own. CI enforces this with a `diff` against
the build toolchain's `GOROOT`.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which vets, tests, builds
`dist/`, and syncs to two R2 buckets: the site bucket for HTML/CSS/JS/fonts, and
the assets bucket for `main.wasm`. The binary is published *before* the page code
that loads it, so a visitor mid-deploy never gets new HTML pointing at an old
engine.

Required repository secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_SITE_BUCKET`, `R2_ASSETS_BUCKET`.

### Security headers

R2 serves objects directly and does not read a `_headers` file, so headers are
set with a Cloudflare Transform Rule on the zone rather than from this repo. The
policy this site is written against:

```
Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval';
  style-src 'self';
  font-src 'self'; img-src 'self' https://assets.x70.dev;
  connect-src 'self' https://assets.x70.dev; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Two directives are load-bearing and easy to get wrong:

- **`'wasm-unsafe-eval'`** is required, or `WebAssembly.instantiateStreaming`
  is refused and the benchmark cannot run. It permits WebAssembly compilation
  *without* permitting JavaScript `eval`, which plain `'self'` does not.
- **`connect-src https://assets.x70.dev`** is what allows the page to fetch
  `main.wasm` cross-origin.

The site uses no inline scripts and no `style` attributes, so `'unsafe-inline'`
is not needed. This policy is verified against the running site, not assumed.

## Licence

MIT. See [LICENSE](LICENSE).
