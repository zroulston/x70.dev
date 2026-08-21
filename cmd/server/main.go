// Command server is a local development file server for x70.dev.
// It is not used in production — the site is served as static objects from
// Cloudflare R2.
package main

import (
	"flag"
	"log"
	"net/http"
	"strconv"
)

func main() {
	port := flag.Int("port", 9090, "port to listen on")
	dir := flag.String("dir", ".", "directory to serve")
	flag.Parse()

	addr := ":" + strconv.Itoa(*port)
	fs := http.FileServer(http.Dir(*dir))

	// Dev-only: never cache, so a rebuilt main.wasm is picked up on reload.
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		fs.ServeHTTP(w, r)
	})

	log.Printf("serving %s on http://localhost%s", *dir, addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
