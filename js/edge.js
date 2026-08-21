// edge-cache-probe: measure what Cloudflare's cache actually does with this
// site's own assets, from the client side.
//
// Everything here is same-origin, which is the reason the experiment is
// possible at all: a cross-origin response only exposes the CORS-safelisted
// headers unless the origin opts in with Access-Control-Expose-Headers, and
// `cf-cache-status` is not on that list. Same-origin, every header is readable.

// Cloudflare's own endpoint, present on every zone. It reports which colo
// answered without needing a cached asset to read a ray ID off.
const TRACE_URL = '/cdn-cgi/trace';

// The assets to probe, chosen because they are served under three different
// caching policies and should therefore behave three different ways.
//
// main.wasm is requested as a one-byte range: the cache eligibility decision
// does not depend on the range, and a probe that pulled 2.4 MB twice would
// cost more than the answer is worth.
export const PROBES = [
  { path: '/images/man-in-hat.webp',     policy: 'max-age=86400' },
  { path: '/fonts/archivo-400700.woff2', policy: 'max-age=86400' },
  { path: '/css/styles.css',             policy: 'no-cache' },
  { path: '/js/site.js',                 policy: 'no-cache' },
  { path: '/main.wasm',                  policy: 'immutable', range: true },
  { path: '/',                           policy: 'no-cache' },
];

// What each cf-cache-status value means, in terms of what it cost.
// `edge` is true when the response was served without troubling the origin.
export const STATES = {
  HIT:         { edge: true,  origin: false, note: 'served from the edge cache' },
  MISS:        { edge: true,  origin: true,  note: 'cacheable, but not held at this colo — now stored' },
  EXPIRED:     { edge: true,  origin: true,  note: 'was cached but stale, so it was re-fetched' },
  REVALIDATED: { edge: true,  origin: true,  note: 'held at the edge, but checked with the origin first' },
  UPDATING:    { edge: true,  origin: false, note: 'stale copy served while a refresh runs behind it' },
  STALE:       { edge: true,  origin: false, note: 'stale copy served because the origin did not answer' },
  DYNAMIC:     { edge: false, origin: true,  note: 'not eligible for the edge cache — every request reaches the origin' },
  BYPASS:      { edge: false, origin: true,  note: 'a rule told the edge not to cache this' },
  NONE:        { edge: false, origin: true,  note: 'no caching information' },
};

export function describe(status) {
  return STATES[status] || { edge: false, origin: true, note: 'an unrecognised cf-cache-status' };
}

// readTrace parses the key=value body of /cdn-cgi/trace. Returns null when the
// request is not being served through Cloudflare at all, which is the normal
// case for `make serve` on localhost.
export async function readTrace() {
  try {
    const res = await fetch(TRACE_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const out = {};
    for (const line of text.trim().split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1);
    }
    return out.colo ? out : null;
  } catch {
    return null;
  }
}

// The colo that answered is the suffix of the ray ID: <hex>-<IATA>.
function coloOf(ray) {
  if (!ray) return '';
  const dash = ray.lastIndexOf('-');
  return dash > 0 ? ray.slice(dash + 1) : '';
}

// probe issues one real network request for `target` and reports what came
// back. `cache: 'no-store'` is load-bearing: without it the browser can answer
// from its own cache and the request never reaches Cloudflare, which would
// make the whole measurement a fiction.
export async function probe(target) {
  const headers = target.range ? { Range: 'bytes=0-0' } : undefined;
  const started = performance.now();

  let res;
  try {
    res = await fetch(target.path, { cache: 'no-store', headers });
  } catch (err) {
    return { ok: false, error: err.message, ms: performance.now() - started };
  }

  // Drain the body before stopping the clock, so the timing covers the whole
  // response and not just its headers.
  const body = await res.arrayBuffer();
  const ms = performance.now() - started;

  const h = res.headers;
  const ray = h.get('cf-ray') || '';
  const age = h.get('age');

  return {
    ok: res.ok,
    httpStatus: res.status,
    status: (h.get('cf-cache-status') || 'NONE').toUpperCase(),
    cacheControl: h.get('cache-control') || '',
    age: age === null ? null : Number(age),
    ray,
    colo: coloOf(ray),
    bytes: body.byteLength,
    ms,
  };
}

// run probes every asset twice. The pairing is the point: one request tells
// you what the edge holds right now, two tell you what it does with a miss.
// Assets are probed in sequence rather than in parallel so the timings are not
// competing with each other for the same connection.
//
// onPass fires as each request goes out and onRow as each asset finishes, so a
// caller can fill the table in as the answers land rather than all at the end.
export async function run({ onPass, onRow } = {}) {
  const rows = [];
  for (const target of PROBES) {
    onPass?.(target, 1);
    const first = await probe(target);
    onPass?.(target, 2);
    const second = await probe(target);

    const row = { target, first, second };
    rows.push(row);
    onRow?.(row);
  }
  return rows;
}

// summarise turns the rows into the sentence worth reading. The interesting
// answer is not "how many hits" but "which of these does the edge decline to
// cache at all", because those are the requests that reach the origin every
// single time no matter what Cache-Control says.
export function summarise(rows) {
  const good = rows.filter((r) => r.second.ok);
  if (!good.length) return { ok: false, text: 'Every probe failed, so there is nothing to report.' };

  const uncached = good.filter((r) => !describe(r.second.status).edge);
  const fromEdge = good.filter((r) => describe(r.second.status).edge && !describe(r.second.status).origin);
  const revalidated = good.filter((r) => describe(r.second.status).edge && describe(r.second.status).origin);

  const parts = [
    `${fromEdge.length} of ${good.length} answered from the edge without contacting the origin.`,
  ];

  if (revalidated.length) {
    parts.push(
      `${revalidated.length} ${revalidated.length === 1 ? 'is' : 'are'} held at the edge but revalidated ` +
      `against the origin first — that is what no-cache asks for, and it is working.`
    );
  }

  if (uncached.length) {
    const names = uncached.map((r) => r.target.path).join(', ');
    parts.push(
      `${uncached.length} never ${uncached.length === 1 ? 'reaches' : 'reach'} the cache at all (${names}). ` +
      `Those go to the origin on every request from every visitor, whatever their Cache-Control header says.`
    );
  }

  return { ok: uncached.length === 0, text: parts.join(' ') };
}
