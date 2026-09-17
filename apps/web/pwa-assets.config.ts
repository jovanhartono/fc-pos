import {
	createAppleSplashScreens,
	defineConfig,
} from "@vite-pwa/assets-generator/config";

// Launch screens only. The icons in public/ are hand-made and stay that way —
// every asset list here is empty on purpose, so a regeneration cannot quietly
// replace the app icon a customer sees on their home screen.
export default defineConfig({
	headLinkOptions: { preset: "2023" },
	images: ["public/web-app-manifest-512x512.png"],
	preset: {
		transparent: { sizes: [] },
		maskable: { sizes: [] },
		apple: { sizes: [] },
		appleSplashScreens: createAppleSplashScreens(
			{
				// Matches the two theme-color metas in index.html, so the launch
				// screen is the same colour as the app that replaces it.
				resizeOptions: { background: "#ffffff" },
				darkResizeOptions: { background: "#252525" },
				linkMediaOptions: { log: false },
				padding: 0.4,
			},
			[
				"iPhone 17 Pro Max",
				"iPhone 17 Pro",
				"iPhone Air",
				"iPhone 17",
				"iPhone 16 Pro Max",
				"iPhone 16 Pro",
				"iPhone 16 Plus",
				"iPhone 16",
				"iPhone 16e",
				"iPhone 15 Pro Max",
				"iPhone 15 Pro",
				"iPhone 15",
				'iPhone SE 4.7"',
				'iPad Air 11"',
				'iPad Pro 11"',
				'iPad Pro 12.9"',
			],
		),
	},
});
