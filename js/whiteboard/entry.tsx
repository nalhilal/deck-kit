import { createRoot, type Root } from 'react-dom/client';
import { WhiteboardApp, type WhiteboardMountOptions } from './whiteboard-app';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
	serializeAsJSON,
	loadFromBlob,
	restoreElements,
	restoreAppState,
} from '@excalidraw/excalidraw';

type MountRecord = {
	root: Root;
	apiRef: { current: ExcalidrawImperativeAPI | null };
	suppressPersist: { current: boolean };
};

const mounts = new Map<HTMLElement, MountRecord>();

function parseSceneJson(raw: string) {
	try {
		const data = JSON.parse(raw);
		if (!data || typeof data !== 'object') {
			return null;
		}
		return {
			elements: restoreElements(data.elements || [], null),
			appState: restoreAppState(data.appState || {}, null),
			files: data.files || {},
		};
	} catch {
		return null;
	}
}

export function mount(container: HTMLElement, options: WhiteboardMountOptions): void {
	unmount(container);
	const apiRef = { current: null as ExcalidrawImperativeAPI | null };
	const suppressPersist = { current: false };
	const root = createRoot(container);
	root.render(
		<WhiteboardApp
			options={{ ...options, suppressPersistRef: suppressPersist }}
			apiRef={apiRef}
		/>
	);
	mounts.set(container, { root, apiRef, suppressPersist });
}

export function unmount(container: HTMLElement): void {
	const record = mounts.get(container);
	if (!record) {
		return;
	}
	record.root.unmount();
	mounts.delete(container);
}

export function exportJson(container: HTMLElement): string | null {
	const api = mounts.get(container)?.apiRef.current;
	if (!api) {
		return null;
	}
	return serializeAsJSON(
		api.getSceneElements(),
		api.getAppState(),
		api.getFiles(),
		'local'
	);
}

export async function importBlob(container: HTMLElement, file: File): Promise<void> {
	const api = mounts.get(container)?.apiRef.current;
	if (!api) {
		return;
	}
	const scene = await loadFromBlob(file, null, null);
	api.updateScene(scene);
}

export function refresh(container: HTMLElement): void {
	const api = mounts.get(container)?.apiRef.current;
	if (api && typeof api.refresh === 'function') {
		api.refresh();
	}
}

export type ApplySceneOptions = {
	suppressPersist?: boolean;
	/** When false (default for remote sync), only elements and files are applied. */
	applyAppState?: boolean;
};

export function applyScene(
	container: HTMLElement,
	sceneJson: string,
	opts?: ApplySceneOptions
): void {
	const record = mounts.get(container);
	const api = record?.apiRef.current;
	if (!api || !record) {
		return;
	}
	const parsed = parseSceneJson(sceneJson);
	if (!parsed) {
		return;
	}
	const applyAppState = opts?.applyAppState === true;
	record.suppressPersist.current = true;
	try {
		const update: {
			elements: ReturnType<typeof restoreElements>;
			files: Record<string, unknown>;
			appState?: ReturnType<typeof restoreAppState>;
		} = {
			elements: parsed.elements,
			files: parsed.files,
		};
		if (applyAppState) {
			update.appState = parsed.appState;
		}
		api.updateScene(update);
	} finally {
		queueMicrotask(() => {
			record.suppressPersist.current = false;
		});
	}
}

declare global {
	interface Window {
		CP2077Whiteboard?: {
			mount: typeof mount;
			unmount: typeof unmount;
			exportJson: typeof exportJson;
			importBlob: typeof importBlob;
			refresh: typeof refresh;
			applyScene: typeof applyScene;
		};
	}
}

if (typeof window !== 'undefined') {
	window.CP2077Whiteboard = {
		mount,
		unmount,
		exportJson,
		importBlob,
		refresh,
		applyScene,
	};
}
