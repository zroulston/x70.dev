// The experiment index. Adding an experiment means adding an entry here —
// both the landing-page rack and /projects/ render from this list.
//
// status: 'live'    — it runs, right now, on this site
//         'wip'     — partly built, not yet wired up
//         'planned' — an intention, nothing built yet
//
// NOTE: the first three below are real. 'prompt-harness' is a placeholder slot
// marked 'planned' — it needs an API key, which a static bundle cannot hold.

export const experiments = [
  {
    name: 'go-wasm-bench',
    status: 'live',
    href: '/projects/#go-wasm-bench',
    desc: 'Races Go compiled to WebAssembly against a hand-written JavaScript SHA-256. Both print their digest, so you can check they did the same work.',
    tags: ['go', 'wasm', 'benchmark'],
  },
  {
    name: 'edge-cache-probe',
    status: 'live',
    href: '/projects/#edge-cache-probe',
    desc: 'Reads cf-cache-status off this site’s own assets, twice each, to show which of them Cloudflare actually caches — and which reach the origin every time.',
    tags: ['cloudflare', 'edge', 'infra'],
  },
  {
    name: 'header-audit',
    status: 'live',
    href: '/projects/#header-audit',
    desc: 'Grades this site’s own security headers against the policy it publishes, takes the CSP apart directive by directive, and says what each one is holding shut.',
    tags: ['security', 'http'],
  },
  {
    name: 'prompt-harness',
    status: 'planned',
    desc: 'A small rig for running the same prompt across models and diffing the results side by side.',
    tags: ['ai', 'evals'],
  },
];
