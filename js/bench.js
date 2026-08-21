// Benchmark orchestration: load the Go/WASM engine on demand, then race it
// against the JavaScript implementation in js/sha256.js.

import { chain as jsChain } from './sha256.js';

// Local dev serves the freshly built binary; production reads it from R2.
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const WASM_URL = LOCAL ? '/assets/main.wasm' : 'https://assets.x70.dev/main.wasm';
const ITERATIONS = 250000;
const WARMUP = 5000;

let enginePromise = null;

// Yield to the browser so status text and bar widths actually paint between
// the two runs — both workloads block the main thread while they execute.
const paint = () =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

// loadEngine fetches wasm_exec.js and main.wasm, starts the Go runtime, and
// resolves once main() has published the x70 global.
function loadEngine() {
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    if (typeof WebAssembly !== 'object' || !WebAssembly.instantiate) {
      throw new Error('this browser has no WebAssembly support');
    }

    await loadScript('/js/wasm_exec.js');

    const ready = new Promise((resolve) => {
      window.__x70Ready = resolve;
    });

    /* global Go */
    const go = new Go();
    const source = await WebAssembly.instantiateStreaming(fetch(WASM_URL), go.importObject);

    // go.run() only settles when the Go program exits; ours blocks forever by
    // design, so it is deliberately not awaited.
    go.run(source.instance).catch((err) => console.error('go runtime exited:', err));

    await Promise.race([ready, new Promise((_, rej) => setTimeout(() => rej(new Error('engine start timed out')), 10000))]);

    if (!window.x70 || typeof window.x70.bench !== 'function') {
      throw new Error('engine loaded but exported no bench function');
    }
    return window.x70;
  })();

  return enginePromise;
}

export { loadEngine, jsChain, paint, ITERATIONS, WARMUP };
