/**
 * Copy tldreveal bundle assets into plugin/tldreveal/ for offline use.
 */
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules', 'tldreveal', 'dist', 'bundle');
const destDir = join(root, 'plugin', 'tldreveal');

const files = [
	{ from: 'index.js', to: 'tldreveal.js' },
	{ from: 'index.css', to: 'tldreveal.css' },
];

if (!existsSync(srcDir)) {
	console.error('tldreveal bundle not found. Run: npm install');
	process.exit(1);
}

mkdirSync(destDir, { recursive: true });

for (const { from, to } of files) {
	const src = join(srcDir, from);
	if (!existsSync(src)) {
		console.error('Missing:', src);
		process.exit(1);
	}
	copyFileSync(src, join(destDir, to));
	const out = join(destDir, to);
	let text = readFileSync(out, 'utf8');
	text = text
		.replace(/\/\/# sourceMappingURL=[^\n]*/g, '')
		.replace(/\/\*# sourceMappingURL=[^*]*\*+\//g, '');

	if (!to.endsWith('.js')) {
		writeFileSync(out, text, 'utf8');
		console.log('Copied', to);
		continue;
	}

	const originalMount = 'function U(oe){c(oe),L({editor:oe,currentSlide:E})}';
	const mountHookLegacy =
		'function U(oe){c(oe),L({editor:oe,currentSlide:E});typeof window!=="undefined"&&window.TldrevealAdapter&&window.TldrevealAdapter.onEditorMount(oe)}';
	// S = setShown (ink visibility), P = setEditing (draw mode); both are useState
	// setters in the same component closure as U, so they are stable across renders.
	const mountHook =
		'function U(oe){c(oe),L({editor:oe,currentSlide:E});typeof window!=="undefined"&&window.TldrevealAdapter&&window.TldrevealAdapter.onEditorMount(oe);typeof window!=="undefined"&&window.TldrevealAdapter&&window.TldrevealAdapter.registerControls&&window.TldrevealAdapter.registerControls({setShown:S,setEditing:P})}';
	if (text.includes(mountHook)) {
		/* mount hook already applied */
	} else if (text.includes(mountHookLegacy)) {
		text = text.replace(mountHookLegacy, mountHook);
	} else if (text.includes(originalMount)) {
		text = text.replace(originalMount, mountHook);
	} else {
		console.warn('tldreveal mount hook pattern not found — platform ink sync may not attach');
	}

	const pageActivatedHook =
		'Mt(oe);typeof window!=="undefined"&&window.TldrevealAdapter&&window.TldrevealAdapter.notifyPageActivated(oe.editor,N)';
	const pageActivatedTarget =
		'Mt(oe)}}(0,ie.useEffect)(()=>{Ar({editor:l,currentSlide:E})},[l,E]);';
	if (text.includes(pageActivatedTarget)) {
		text = text.replace(pageActivatedTarget, pageActivatedHook + '}}(0,ie.useEffect)(()=>{Ar({editor:l,currentSlide:E})},[l,E]);');
	} else if (text.includes('notifyPageActivated(oe.editor,N)')) {
		/* page hook already applied */
	} else {
		console.warn('tldreveal page hook pattern not found — platform ink load may race slide transitions');
	}

	writeFileSync(out, text, 'utf8');
	console.log('Copied', to);
}
