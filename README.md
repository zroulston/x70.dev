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

## The edge cache probe

`/projects/#edge-cache-probe` requests six of this site's own assets twice each
and reads `cf-cache-status` off every response, to check whether Cloudflare's
edge actually does what the upload headers ask of it.

Two things make it work:

- **Everything is same-origin.** A cross-origin response exposes only the
  CORS-safelisted headers unless the origin opts in with
  `Access-Control-Expose-Headers`, and `cf-cache-status` is not on that list.
  Because x70.dev serves the page and the assets, every header is readable.
- **Every probe is sent with `cache: 'no-store'`.** Without it the browser
  answers from its own cache, the request never reaches Cloudflare, and the
  measurement is a fiction.

Two passes rather than one, because a single request cannot separate an asset
the edge declines to cache from one it has simply not seen yet — both look like
a miss. `main.wasm` is requested as a one-byte range: cache eligibility does not
depend on the range, and pulling 2.4 MB twice would cost more than the answer is
worth.

### What the probe found

Measured from DFW on 2026-08-21, the three caching policies produce three
different behaviours, and one of them is not the intended one:

| Asset             | Header                   | `cf-cache-status` |
| ----------------- | ------------------------ | ----------------- |
| `.webp`, `.woff2` | `max-age=86400`          | `HIT`             |
| `.css`, `.js`     | `no-cache`               | `REVALIDATED`     |
| `main.wasm`, `/`  | `immutable` / `no-cache` | `DYNAMIC`         |

The first two rows are working as designed. The third is not: `DYNAMIC` means
the edge never considered the response cacheable, so **every request for the
2.4 MB `main.wasm` and for the HTML reaches R2**, no matter that the wasm is
uploaded `max-age=31536000, immutable`. Cloudflare's default cache is keyed on a
list of static file extensions, and neither `.wasm` nor extensionless HTML is on
it. `Cache-Control` does not add an asset to that list; only a Cache Rule does.

So the `immutable` header on `main.wasm` is buying browser caching, which is
real, and edge caching, which is not happening. Fixing it means a Cache Rule on
the zone setting *Eligible for cache* for `/main.wasm` — zone configuration, not
something this repo can carry, which is the same reason the security headers
live in a Transform Rule.

That is the experiment doing its job: the header was set correctly and the
result was still wrong, and nothing short of measuring it would have said so.

## The header audit

`/projects/#header-audit` reads the response headers off `/` and grades them
against the policy this README publishes, explaining what each one is holding
shut rather than just ticking it off.

It audits **this** site and no other, and that is a hard limit rather than an
unfinished feature. A browser cannot read response headers from another domain:
a `no-cors` fetch returns an opaque response with nothing on it, and a normal
cross-origin fetch exposes only the CORS-safelisted headers unless the far end
opts in. Auditing an arbitrary domain needs a server to do the fetching, which a
static bundle does not have.

The CSP is taken apart directive by directive, because a policy can be present
and still leave the important parts open. `frame-ancestors`, `base-uri` and
`form-action` do **not** fall back to `default-src`, so `default-src 'none'` can
look like a complete answer while doing nothing at all about framing, form
targets or a rewritten `<base>`. A CSP with a failing directive drags the whole
header down to a fail, rather than showing a green token above a list of red
ones.

### What the audit found

**Nothing is set.** As of 2026-08-21, `https://x70.dev/` returns no
`Content-Security-Policy`, no `Strict-Transport-Security`, no
`X-Content-Type-Options` and no `Referrer-Policy` — 0 of the 4 headers below.
The Transform Rule described under [Security headers](#security-headers) either
does not exist on the zone or is not matching.

This matters most for the benchmark: the documented policy is the only reason
`'wasm-unsafe-eval'` was ever reasoned about, and with no policy served at all
the site is running without the protection its own README describes.

## Layout

```
index.html          landing page and the benchmark panel
projects/           experiment index, rendered from js/experiments.js
writing/            posts (empty for now)
css/                styles.css, plus generated fonts.css
js/                 site.js, bench.js, sha256.js, edge.js, headers.js, experiments.js, wasm_exec.js
fonts/              self-hosted latin subsets — no third-party font requests
images/             the emblem
main.wasm           built artifact, gitignored (make wasm)
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

Everything the page loads is same-origin, so `make serve` behaves exactly like
production. To preview the published tree byte for byte:

```sh
make dist && go run ./cmd/server -port 9091 -dir dist
```

### One rule about the WebAssembly build

`main.wasm` and `js/wasm_exec.js` are a **matched pair**. The JS shim must
come from the same Go toolchain that compiled the binary, or the page breaks at
`instantiateStreaming` with an ABI mismatch. `make wasm` always refreshes both
together — never update one on its own. CI enforces this with a `diff` against
the build toolchain's `GOROOT`.

## Deploying

`x70.dev` and `assets.x70.dev` are two custom domains bound to a **single** R2
bucket (`www-x70-dev`), so there is one place to publish to and the site loads
everything same-origin.

Pushing to `main` runs `.github/workflows/deploy.yml`, which vets, tests, builds
`dist/`, and uploads it with `wrangler r2 object put`. No AWS tooling is
involved. `main.wasm` goes up first and the HTML last, so a visitor loading the
page mid-deploy never gets new page code pointing at an older engine.

R2 stores the content type per object, so the workflow sets it explicitly on
every upload. Two are load-bearing: `main.wasm` must be `application/wasm` or
`instantiateStreaming` refuses it, and the ES modules must be `text/javascript`
or the browser will not execute them.

### Caching

HTML, JS and CSS are served `no-cache`, meaning the browser stores them but
revalidates before reuse — normally a 304 with no body. They are cheap (about
30 KB combined) and they must move together: a visitor holding day-old JS
alongside fresh HTML is running a combination that was never deployed.

`main.wasm` is the exception, served `immutable` for a year, because
`bench.js` requests it with a hash of its own contents in the query string.
That same hash also keys `wasm_exec.js`, so the shim and the binary can never
be served from cache in mismatched versions — which is a real failure mode,
not a theoretical one: Go 1.24 renamed the wasm import namespace from `go` to
`gojs`, so an older cached shim fails to instantiate a newer binary with
`Import #0 "gojs": module is not an object or function`.

That `immutable` header buys browser caching only. The edge-cache-probe measures
`main.wasm` coming back `DYNAMIC`, meaning Cloudflare never caches it and every
cold visitor pulls all 2.4 MB from R2 — see
[what the probe found](#what-the-probe-found) above.

Uploading to the bucket is not the same as publishing. The custom domain sits
behind Cloudflare's cache, which can keep serving the previous copy of a stable
path after a successful upload. This is invisible to a spot check with a
cache-busting query string, because that is a different cache key.

How much of a risk this is varies by asset, and the probe is what settles it:
the fonts and images are true `HIT`s and would hold a stale copy for their full
day, while the JS and CSS come back `REVALIDATED` — held at the edge but checked
against R2 on every request, so a new upload is picked up without a purge. Note
that a spot check with `curl -I` cannot see any of this: Cloudflare does not
cache `HEAD` requests and reports `DYNAMIC` for all of them.

Two things address it, and the first is what makes a deploy reliable:

- `scripts/stamp.sh` rewrites every internal reference — the module imports,
  the stylesheet link and its `@import`, and the wasm and shim URLs — to carry
  a build id derived from `main.wasm`. Each deploy is therefore a new set of
  cache keys, so a fresh page can never pull a stale module, with or without a
  purge.
- The workflow also purges the zone after uploading, which clears the previous
  build rather than leaving it to expire.

Set these repository secrets (**Settings → Secrets and variables → Actions**):

| Name                   | Value                                       |
| ---------------------- | ------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | API token with **Workers R2 Storage: Edit** |
| `R2_ACCOUNT_ID`        | the Cloudflare account ID                   |
| `R2_BUCKET`            | `www-x70-dev`                               |
| `CF_ZONE_ID`           | the `x70.dev` zone ID, for the cache purge  |

The API token needs **Zone → Cache Purge** in addition to R2 write, or the
purge step warns and the CDN keeps serving the previous build.

The account ID and bucket name are not genuinely secret. Storing them as
secrets works, but GitHub masks them in the logs, so a failed upload prints
`***` instead of the bucket it tried. Moving them to repository *variables*
makes failures easier to read; the workflow would then read them from `vars.`.

### Removing stale objects

`wrangler` has no `sync --delete`, so files dropped from the repo linger in the
bucket until removed by hand:

```sh
wrangler r2 object delete www-x70-dev/js/scripts.js --remote
wrangler r2 object delete www-x70-dev/images/x70-logo.jpg --remote
```

If this becomes a recurring annoyance, Cloudflare Workers Static Assets or Pages
would give atomic deploys with automatic cleanup — and native `_headers`
support, which would replace the Transform Rule below.

### Security headers

R2 serves objects directly and does not read a `_headers` file, so headers are
set with a Cloudflare Transform Rule on the zone rather than from this repo. The
policy this site is written against:

```
Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval';
  style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self';
  base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Because everything is same-origin, the policy needs no remote hosts at all.
One directive is load-bearing and easy to get wrong: **`'wasm-unsafe-eval'`** is
required, or `WebAssembly.instantiateStreaming` is refused and the benchmark
cannot run. It permits WebAssembly compilation *without* permitting JavaScript
`eval`, which plain `'self'` does not.

The site uses no inline scripts and no `style` attributes, so `'unsafe-inline'`
is not needed.

> **This policy is not currently being served.** The header-audit reports 0 of 4
> on `https://x70.dev/`, so the Transform Rule above is either absent or not
> matching. Until it is fixed, the block above describes an intention rather
> than a deployed configuration.

The audit is the check, and it runs against production rather than against the
built tree — which is the only place the answer actually lives, since the rule
is zone configuration and not a file in this repo.

## Licence

MIT. See [LICENSE](LICENSE).
