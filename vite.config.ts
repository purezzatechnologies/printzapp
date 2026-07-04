// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// NOTE: We previously set cross-origin isolation headers (COOP: same-origin,
// COEP: credentialless) so the in-browser background-removal model could use
// SharedArrayBuffer. Background removal now runs server-side, so those headers
// are no longer needed — and they break third-party payment widgets (Razorpay,
// PhonePe) whose checkout iframes/popups require a normal (non-isolated)
// browsing context. They are intentionally NOT set anymore.

export default defineConfig({
	// Lovable's preset hard-codes importProtection.behavior to "error".
	// The TanStack server-fn extractor cleanly handles `useSession` imports
	// when behavior is "mock" — it replaces the server-only specifier with a
	// virtual module on the client and uses the real one on the server. We
	// keep "error" for production builds so deploys still catch real leaks.
	tanstackStart: {
		importProtection: {
			behavior: {
				dev: "mock",
				build: "error",
			},
		},
	},
	vite: {
		optimizeDeps: {
			exclude: ["@tanstack/router-core"],
		},
	},
});
