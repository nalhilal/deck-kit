import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	define: {
		'process.env.NODE_ENV': JSON.stringify('production'),
	},
	build: {
		emptyOutDir: true,
		outDir: 'dist/whiteboard',
		assetsDir: 'assets',
		lib: {
			entry: resolve(__dirname, 'js/whiteboard/entry.tsx'),
			name: 'CP2077Whiteboard',
			formats: ['iife'],
			fileName: () => 'whiteboard.js',
		},
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
				assetFileNames: 'whiteboard.[ext]',
			},
		},
		target: 'es2020',
	},
});
