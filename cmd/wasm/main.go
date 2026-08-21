// Command wasm is the Go half of the x70.dev engine benchmark.
//
// It exposes a single chained-SHA-256 workload to JavaScript. The same
// workload is implemented in js/sha256.js, so the two can be raced against
// each other in the browser. Both sides return their final digest: if the
// digests match, the two engines provably did identical work.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"runtime"
	"syscall/js"
	"time"
)

// chain hashes a 64-byte block, then feeds each digest back in as the next
// input, iterations times. Chaining is deliberate: it defeats any attempt by
// either engine to hoist the work out of the loop.
func chain(iterations int) (digest string, elapsed float64) {
	var block [64]byte
	for i := range block {
		block[i] = byte(i)
	}

	start := time.Now()
	sum := sha256.Sum256(block[:])
	for i := 1; i < iterations; i++ {
		sum = sha256.Sum256(sum[:])
	}
	elapsed = float64(time.Since(start).Nanoseconds()) / 1e6

	return hex.EncodeToString(sum[:]), elapsed
}

// bench is called from JS as x70.bench(iterations). It returns the elapsed
// milliseconds and the final digest.
func bench() js.Func {
	return js.FuncOf(func(this js.Value, args []js.Value) any {
		iterations := 250000
		if len(args) > 0 && args[0].Type() == js.TypeNumber {
			iterations = args[0].Int()
		}
		if iterations < 1 {
			iterations = 1
		}

		digest, elapsed := chain(iterations)
		return map[string]any{
			"ms":         elapsed,
			"digest":     digest,
			"iterations": iterations,
		}
	})
}

func main() {
	js.Global().Set("x70", js.ValueOf(map[string]any{
		"bench":     bench(),
		"goVersion": runtime.Version(),
		"arch":      runtime.GOOS + "/" + runtime.GOARCH,
	}))

	// Signal readiness so the page can enable the run control.
	if cb := js.Global().Get("__x70Ready"); cb.Type() == js.TypeFunction {
		cb.Invoke()
	}

	select {} // keep the exported funcs alive
}
