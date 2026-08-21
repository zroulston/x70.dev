// The experiment index. Adding an experiment means adding an entry here —
// both the landing-page rack and /projects/ render from this list.
//
// status: 'live'    — it runs, right now, on this site
//         'wip'     — partly built, not yet wired up
//         'planned' — an intention, nothing built yet
//
// NOTE: 'go-wasm-bench' and 'edge-cache-probe' below are real. The rest are
// placeholder slots marked 'planned' — replace them with your own work.

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
    status: 'planned',
    desc: 'Check a domain’s security headers and report what is missing and why it matters.',
    tags: ['security', 'http'],
  },
  {
    name: 'prompt-harness',
    status: 'planned',
    desc: 'A small rig for running the same prompt across models and diffing the results side by side.',
    tags: ['ai', 'evals'],
  },
];
