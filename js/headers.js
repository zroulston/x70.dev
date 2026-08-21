// header-audit: check this site's own security headers against the policy it
// claims to run, and say what each missing one actually costs.
//
// Same-origin only, and that is a hard limit rather than a shortcut. Reading
// response headers from another domain is impossible in a browser: a no-cors
// fetch returns an opaque response with nothing readable on it, and a normal
// cross-origin fetch exposes only the CORS-safelisted headers unless the far
// end opts in. Auditing an arbitrary domain needs a server to fetch it for you.

// The document whose headers get audited. Security headers are applied per
// response, so this reports on the HTML entry point, not on every path.
export const AUDIT_URL = '/';

/* --- the policy this site is written against ------------------------------ */

// Split a Content-Security-Policy into a directive -> sources map.
export function parseCsp(value) {
  const out = new Map();
  for (const part of value.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length) out.set(tokens[0].toLowerCase(), tokens.slice(1));
  }
  return out;
}

// Fetch directives fall back to default-src when absent. These three do not,
// which is the classic way a policy looks complete and leaves a hole: setting
// `default-src 'none'` does nothing whatsoever for framing, form targets or
// <base href>.
const NO_FALLBACK = new Set(['frame-ancestors', 'base-uri', 'form-action']);

const CSP_RULES = [
  {
    directive: 'default-src',
    want: ["'none'"],
    why: 'The backstop every fetch directive falls back to. Starting from none means anything not explicitly allowed is refused.',
  },
  {
    directive: 'script-src',
    want: ["'self'", "'wasm-unsafe-eval'"],
    why: "Load-bearing for this site. 'wasm-unsafe-eval' permits WebAssembly compilation without permitting JavaScript eval — plain 'self' is not enough, and without it instantiateStreaming is refused and the benchmark cannot run at all.",
  },
  {
    directive: 'frame-ancestors',
    want: ["'none'"],
    why: 'Stops the site being framed by anyone, which is what defeats clickjacking. Does not fall back to default-src, so it has to be written out.',
  },
  {
    directive: 'base-uri',
    want: ["'none'"],
    why: 'Stops injected markup rewriting the document base and silently repointing every relative URL on the page. Does not fall back to default-src.',
  },
  {
    directive: 'form-action',
    want: ["'none'"],
    why: 'Stops an injected form posting to somewhere else. This site has no forms, so none is exactly right. Does not fall back to default-src.',
  },
];

// The four headers the README commits to, plus two worth mentioning.
const CHECKS = [
  {
    name: 'content-security-policy',
    level: 'required',
    expect: "default-src 'none', with 'wasm-unsafe-eval' in script-src",
    why: 'The one header that limits the damage of injected markup: what can execute, what it can load, and where it can talk to. Everything this site loads is same-origin, so the policy needs no remote hosts at all.',
  },
  {
    name: 'strict-transport-security',
    level: 'required',
    expect: 'max-age=31536000; includeSubDomains',
    why: 'Pins the origin to HTTPS for the given max-age. Without it, the first request after someone types the bare hostname travels in the clear and can be intercepted before the redirect ever happens.',
    check: (v) => {
      const age = /max-age=(\d+)/i.exec(v);
      if (!age) return { state: 'fail', note: 'no max-age, so the header does nothing' };
      if (Number(age[1]) < 31536000) {
        return { state: 'warn', note: `max-age is ${age[1]}s, short of the documented year (31536000s)` };
      }
      if (!/includesubdomains/i.test(v)) {
        return { state: 'warn', note: 'max-age is good, but includeSubDomains is missing, so assets.x70.dev is not covered' };
      }
      return { state: 'pass' };
    },
  },
  {
    name: 'x-content-type-options',
    level: 'required',
    expect: 'nosniff',
    why: 'Stops the browser second-guessing a response type. That matters more here than on most sites: R2 stores the content type per object and the deploy sets it per extension, so a single mislabelled upload is the whole safety net.',
    check: (v) => (/nosniff/i.test(v) ? { state: 'pass' } : { state: 'fail', note: 'present but not set to nosniff' }),
  },
  {
    name: 'referrer-policy',
    level: 'required',
    expect: 'strict-origin-when-cross-origin',
    why: 'Decides how much of the current URL leaks when a visitor follows a link off-site. The documented value sends the origin only, and nothing at all when the destination downgrades to HTTP.',
    check: (v) => {
      const ok = ['strict-origin-when-cross-origin', 'strict-origin', 'same-origin', 'no-referrer'];
      return ok.includes(v.trim().toLowerCase())
        ? { state: 'pass' }
        : { state: 'warn', note: `set to "${v}", which is looser than the documented policy` };
    },
  },
  {
    name: 'permissions-policy',
    level: 'advisory',
    expect: 'optional — switch off unused features',
    why: 'Turns off browser features this site never asks for, such as camera, microphone and geolocation. It is not in the documented policy, so its absence is a suggestion rather than a gap.',
  },
  {
    name: 'x-frame-options',
    level: 'advisory',
    expect: 'superseded by frame-ancestors',
    why: 'The predecessor to CSP frame-ancestors. If the CSP above sets frame-ancestors, this adds nothing except for browsers old enough that it is not worth the header.',
  },
];

/* --- running the audit ---------------------------------------------------- */

// audit fetches AUDIT_URL and grades the response's headers. `no-store` keeps
// the browser cache out of it, so these are the headers the edge is serving
// right now rather than whatever was stored earlier.
export async function audit() {
  const res = await fetch(AUDIT_URL, { cache: 'no-store' });
  const h = res.headers;

  // No cf-ray means this is not being served through Cloudflare — a local
  // build, most likely. The results below are then about the dev server, and
  // say nothing about production.
  const behindCloudflare = h.has('cf-ray');

  const checks = CHECKS.map((c) => {
    const found = h.get(c.name);

    if (found === null) {
      return {
        ...c,
        found: null,
        state: c.level === 'required' ? 'fail' : 'warn',
        // No note for a missing required header: the pill and the value line
        // already say it, and repeating "not set" three times reads as noise.
        note: c.level === 'required' ? '' : 'not required by the documented policy',
      };
    }

    const result = c.check ? c.check(found) : { state: 'pass' };
    return { ...c, found, ...result };
  });

  // The CSP gets taken apart directive by directive, because a policy can be
  // present and still miss the parts that matter.
  const cspHeader = h.get('content-security-policy');
  const csp = cspHeader ? gradeCsp(parseCsp(cspHeader)) : null;

  // Roll the directive grades up into the header's own grade. A policy that is
  // present but leaves frame-ancestors open is not a pass, and showing a green
  // token above a list of red ones would be the audit lying to itself.
  const cspCheck = checks.find((c) => c.name === 'content-security-policy');
  const brokenDirectives = (csp || []).filter((d) => d.state === 'fail');
  if (cspCheck && brokenDirectives.length) {
    cspCheck.state = 'fail';
    cspCheck.note = `present, but ${brokenDirectives.length} of the documented directives ${
      brokenDirectives.length === 1 ? 'is' : 'are'
    } missing`;
  }

  return { url: AUDIT_URL, httpStatus: res.status, behindCloudflare, checks, csp };
}

function gradeCsp(directives) {
  const fallback = directives.get('default-src');

  return CSP_RULES.map((rule) => {
    let sources = directives.get(rule.directive);
    let inherited = false;

    if (!sources && !NO_FALLBACK.has(rule.directive) && fallback) {
      sources = fallback;
      inherited = true;
    }

    if (!sources) {
      return {
        ...rule,
        found: null,
        state: 'fail',
        note: NO_FALLBACK.has(rule.directive)
          ? 'missing, and this directive does not fall back to default-src'
          : 'missing, with no default-src to fall back to',
      };
    }

    const found = sources.join(' ');
    const missing = rule.want.filter((w) => !sources.includes(w));

    if (missing.length) {
      return { ...rule, found, inherited, state: 'fail', note: `missing ${missing.join(' and ')}` };
    }
    return { ...rule, found, inherited, state: 'pass', note: inherited ? 'inherited from default-src' : '' };
  });
}

/* --- the sentence worth reading ------------------------------------------- */

export function summarise(result) {
  if (!result.behindCloudflare) {
    return {
      ok: false,
      text:
        'This copy is not being served through Cloudflare, so these are the local dev server\u2019s headers and not the real ones. ' +
        'The result says nothing about production.',
    };
  }

  const required = result.checks.filter((c) => c.level === 'required');
  const missing = required.filter((c) => c.state === 'fail');
  const weak = required.filter((c) => c.state === 'warn');
  const cspFails = (result.csp || []).filter((d) => d.state === 'fail');

  // Only the documented policy decides pass or fail. The advisory headers are
  // suggestions, and a site that skips them has not got anything wrong.
  const ok = !missing.length && !weak.length && !cspFails.length;
  const suggest = result.checks.filter((c) => c.level === 'advisory' && c.state !== 'pass');

  if (ok) {
    const tail = suggest.length ? ` Optional extras not set: ${suggest.map((c) => c.name).join(', ')}.` : '';
    return {
      ok: true,
      text: `All ${required.length} headers in the documented policy are present and correct on ${result.url}.${tail}`,
    };
  }

  const parts = [
    `${required.length - missing.length - weak.length} of ${required.length} required headers are in place on ${result.url}.`,
  ];

  if (missing.length) parts.push(`Missing: ${missing.map((c) => c.name).join(', ')}.`);
  if (weak.length) parts.push(`Present but weaker than documented: ${weak.map((c) => c.name).join(', ')}.`);
  if (cspFails.length) {
    parts.push(`The CSP is present but incomplete: ${cspFails.map((d) => d.directive).join(', ')}.`);
  }

  return { ok: false, text: parts.join(' ') };
}
