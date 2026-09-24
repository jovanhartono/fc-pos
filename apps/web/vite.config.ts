import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	plugins: [
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		react(),
		tailwindcss(),
		VitePWA({
			// A screen open during a deploy keeps its build until someone taps
			// Reload. Swapping builds at once deleted files that screen still needed.
			registerType: "prompt",
			// Launch screens are generated at build time from pwa-assets.config.ts,
			// so none of them are committed. The theme-color metas are already
			// hand-written in index.html per colour scheme; let those stand.
			pwaAssets: { config: true, injectThemeColor: false },
			manifest: {
				id: "/",
				name: "Fresclean POS",
				short_name: "FC POS",
				description: "Counter, queue, and reports for Fresclean stores",
				start_url: "/",
				scope: "/",
				display: "standalone",
				// Tapping the icon returns the cashier to the order they were
				// already part-way through, instead of a second blank session.
				launch_handler: { client_mode: "focus-existing" },
				orientation: "any",
				shortcuts: [
					{
						name: "New order",
						description: "Take an order and collect payment",
						url: "/transactions",
					},
					{
						name: "Queue",
						description: "Items waiting for work, most urgent first",
						url: "/queue",
					},
				],
				theme_color: "#ffffff",
				background_color: "#ffffff",
				icons: [
					{
						src: "/web-app-manifest-192x192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "/web-app-manifest-512x512.png",
						sizes: "512x512",
						type: "image/png",
					},
					{
						src: "/web-app-manifest-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
				// iOS reads the launch screens from the head links as the app opens,
				// never through the worker. Precaching them would add 400KB to what
				// a counter tablet downloads on install and never use it.
				globIgnores: ["**/apple-splash-*.png"],
				// Orders and payments must always come from the server: a cached
				// /api response at the counter would show a settled order as unpaid.
				navigateFallbackDenylist: [/^\/api\//],
			},
		}),
	],
	server: {
		allowedHosts: ["4961-103-165-128-11.ngrok-free.app"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
