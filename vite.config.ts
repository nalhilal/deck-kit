import { resolve } from 'path';
import fs from 'node:fs';
import { ModuleFormat } from 'rollup';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { rewriteLegacyCoreDtsPath } from './build/dts-paths.ts';
import { injectDeckMeta } from './scripts/inject-deck-meta.mjs';
import { loadInjectedIndexHtml, listOverlayCss } from './scripts/deck-content.mjs';

export const appendExtension = (format: ModuleFormat, name: String): string => {
	if (format === 'es') {
		return `${name}.mjs`;
	} else {
		return `${name}.js`;
	}
};

function deckSlidesPlugin() {
	return {
		name: 'deck-slides',
		configureServer(server: { middlewares: { use: Function } }) {
			injectDeckMeta();
			server.middlewares.use(
				(req: { url?: string }, res: { setHeader: Function; end: Function }, next: () => void) => {
					const pathname = (req.url ?? '').split('?')[0];
					const match = listOverlayCss().find((file) => pathname === `/css/${file.name}`);
					if (!match) {
						next();
						return;
					}
					res.setHeader('Content-Type', 'text/css; charset=utf-8');
					res.end(fs.readFileSync(match.full));
				}
			);
		},
		transformIndexHtml(html: string, ctx: { filename?: string }) {
			if (ctx.filename && !ctx.filename.endsWith('index.html')) {
				return html;
			}
			if (!html.includes('<!-- DECK_SLIDES -->')) {
				return html;
			}
			injectDeckMeta();
			return loadInjectedIndexHtml();
		},
	};
}

export default defineConfig({
	server: {
		port: Number(process.env.npm_config_port || 8000),
	},
	build: {
		target: ['es2015'],
		emptyOutDir: true,
		lib: {
			formats: ['es', 'umd'],
			entry: resolve(__dirname, 'js/index.ts'),
			name: 'Reveal',
			fileName: (format, entryName) => {
				return appendExtension(format, 'reveal');
			},
		},
		rollupOptions: {
			output: {
				assetFileNames: 'reveal.[ext]',
			},
		},
	},
	resolve: {
		alias: {
			// Matches the exported paths in package.json
			'reveal.js/plugin': '/plugin',
			'reveal.js': '/js',
			'reveal.css': '/css/reveal.scss',
		},
	},
	plugins: [
		deckSlidesPlugin(),
		dts({
			insertTypesEntry: true,
			rollupTypes: false,
			exclude: ['**/index.ts'],
			copyDtsFiles: true,
			beforeWriteFile(filePath, content) {
				return {
					filePath: rewriteLegacyCoreDtsPath(filePath),
					content,
				};
			},
		}),
	],
	css: {
		preprocessorOptions: {
			scss: {
				api: 'modern-compiler',
			},
		},
	},
});
