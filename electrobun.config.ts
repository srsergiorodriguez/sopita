import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Sopita",
		identifier: "com.sergiorodriguez.sopita",
		version: "1.0.0",
	},
	build: {
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
			icons: "assets/sopitaIcon.iconset",
		},
		linux: {
			bundleCEF: true,
			icon: "assets/sopitaIcon.png"
		},
		win: {
			bundleCEF: false,
			icon: "assets/sopitaIcon.ico",
		},
	},
} satisfies ElectrobunConfig;
