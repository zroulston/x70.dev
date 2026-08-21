// Page wiring: experiment rack, footer year, disclaimer dialog, and the
// benchmark panel when one is present.

import { experiments } from './experiments.js';
import { loadEngine, jsChain, paint, ITERATIONS, WARMUP } from './bench.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

/* --- experiment rack ------------------------------------------------------ */

function renderRack(el) {
  el.innerHTML = '';
  for (const x of experiments) {
    const li = document.createElement('li');
    li.className = 'slot';
    li.id = x.name;

    const name = x.href
      ? `<a href="${x.href}">${x.name}</a>`
      : x.name;

    li.innerHTML = `
      <div class="slot__top">
        <h3 class="slot__name">${name}</h3>
        <span class="tok" data-s="${x.status}">${x.status}</span>
      </div>
      <p class="slot__desc">${x.desc}</p>
      <ul class="slot__tags">${x.tags.map((t) => `<li>${t}</li>`).join('')}</ul>`;
    el.appendChild(li);
  }
}

/* --- disclaimer ----------------------------------------------------------- */

// The disclaimer lives here rather than in each page's markup, so the text has
// one home and every page gets the same copy.
const DISCLAIMER = [
  `The information on x70.dev is for general information purposes only. x70.dev assumes no responsibility for errors or omissions in its contents.`,
  `In no event shall x70.dev be liable for any special, direct, indirect, consequential, or incidental damages, whether in an action of contract, negligence or other tort, arising out of or in connection with the use of the site or its contents. x70.dev reserves the right to make additions, deletions, or modifications to the contents at any time without prior notice.`,
  `This site may contain links to external sites that are not provided or maintained by, or in any way affiliated with, x70.dev. x70.dev does not guarantee the accuracy, relevance, timeliness, or completeness of any information on those sites, and is not responsible for their privacy practices.`,
  `The site is provided on an “as is” basis without warranties of any kind, express or implied, including without limitation any implied warranties of merchantability, fitness for a particular purpose, or non-infringement.`,
  `By using this site, you agree to the above. If you do not agree, please do not use it.`,
];

function wireDisclaimer() {
  const open = $('disclaimer-open');
  if (!open) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  dialog.id = 'disclaimer';
  dialog.innerHTML = `
    <div class="sheet__head">
      <h2 class="section__title">Disclaimer</h2>
      <button class="x" id="disclaimer-close" type="button" aria-label="Close disclaimer">&#10005;</button>
    </div>
    <div class="sheet__body">${DISCLAIMER.map((p) => `<p>${p}</p>`).join('')}</div>`;
  document.body.appendChild(dialog);

  // <dialog> gives focus trapping, Escape-to-close and focus restore for free.
  open.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('#disclaimer-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close(); // click on the backdrop
  });
}

/* --- benchmark ------------------------------------------------------------ */

function wireBench() {
  const run = $('run');
  if (!run) return;

  const lamp = $('lamp');
  const status = $('status');
  const verdict = $('verdict');
  const iterLabel = $('iter-label');
  if (iterLabel) iterLabel.textContent = fmt(ITERATIONS);

  const setLamp = (state, text) => {
    if (!lamp) return;
    lamp.dataset.state = state;
    lamp.textContent = text;
  };

  const show = (key, result, widthPct) => {
    const time = $(`${key}-time`);
    const fill = $(`${key}-fill`);
    const digest = $(`${key}-digest`);
    time.dataset.empty = 'false';
    time.textContent = `${result.ms.toFixed(1)} ms`;
    fill.style.width = `${widthPct}%`;
    digest.textContent = `digest ${result.digest}`;
  };

  const reset = () => {
    for (const key of ['go', 'js']) {
      const time = $(`${key}-time`);
      time.dataset.empty = 'true';
      time.textContent = '— ms';
      $(`${key}-fill`).style.width = '0';
      $(`${key}-digest`).textContent = '';
    }
    verdict.hidden = true;
  };

  run.addEventListener('click', async () => {
    run.disabled = true;
    reset();

    try {
      setLamp('loading', 'engine loading');
      status.textContent = 'Downloading the WebAssembly binary…';
      const engine = await loadEngine();

      setLamp('ready', 'engine ready');
      const build = $('build-label');
      if (build) build.textContent = `${engine.goVersion} · ${engine.arch}`;
      const label = $('engine-label');
      if (label) label.textContent = `engine ${engine.goVersion}`;

      // Warm both sides so neither is measured cold against a warmed rival.
      status.textContent = 'Warming up both engines…';
      await paint();
      engine.bench(WARMUP);
      jsChain(WARMUP);

      status.textContent = 'Running go / wasm…';
      await paint();
      const go = engine.bench(ITERATIONS);

      status.textContent = 'Running javascript…';
      await paint();
      const js = jsChain(ITERATIONS);

      // Scale both bars against the slower run, so the longer bar fills the track.
      const slowest = Math.max(go.ms, js.ms);
      show('go', go, (go.ms / slowest) * 100);
      show('js', js, (js.ms / slowest) * 100);

      const match = go.digest === js.digest;
      verdict.hidden = false;
      verdict.dataset.ok = String(match);

      if (match) {
        const fast = go.ms < js.ms ? 'go / wasm' : 'javascript';
        const ratio = (slowest / Math.min(go.ms, js.ms)).toFixed(2);
        verdict.textContent =
          `Digests match — both engines computed the same ${fmt(ITERATIONS)} chained hashes. ` +
          `${fast} was ${ratio}× faster on this machine.`;
      } else {
        verdict.textContent =
          'Digests differ. The two engines did not compute the same thing — that is a bug, not a result.';
      }

      status.textContent = 'Done. Run it again for a second sample.';
    } catch (err) {
      console.error(err);
      setLamp('error', 'engine failed');
      status.textContent = `Could not run the benchmark: ${err.message}`;
    } finally {
      run.disabled = false;
    }
  });
}

/* --- boot ----------------------------------------------------------------- */

const rack = $('rack');
if (rack) renderRack(rack);

const year = $('year');
if (year) year.textContent = String(new Date().getFullYear());

wireDisclaimer();
wireBench();
