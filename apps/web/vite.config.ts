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
			registerType: "autoUpdate",
			manifest: {
				id: "/",
				name: "Fresclean POS",
				short_name: "FC POS",
				description: "Counter, queue, and reports for Fresclean stores",
				start_url: "/",
				scope: "/",
				display: "standalone",
				orientation: "any",
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
