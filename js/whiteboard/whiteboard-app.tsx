import { useCallback, useMemo, useRef } from 'react';
import {
	Excalidraw,
	serializeAsJSON,
	restoreElements,
	restoreAppState,
} from '@excalidraw/excalidraw';
import type {
	AppState,
	BinaryFiles,
	ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';

export type WhiteboardMountOptions = {
	boardId: string;
	storageKey: string;
	initialScene: string | null;
	theme?: 'light' | 'dark';
	suppressPersistRef?: React.MutableRefObject<boolean>;
	onPersist?: (json: string) => void;
	onApiReady?: () => void;
	onPointerRefresh?: () => void;
	onPointerUpdate?: (payload: { pointer: { x: number; y: number }; button: string }) => void;
};

type WhiteboardAppProps = {
	options: WhiteboardMountOptions;
	apiRef: React.MutableRefObject<ExcalidrawImperativeAPI | null>;
};

function parseInitialScene(raw: string | null) {
	if (!raw) {
		return null;
	}
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

export function WhiteboardApp({ options, apiRef }: WhiteboardAppProps) {
	const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const localSuppressPersist = useRef(false);
	const suppressPersist = options.suppressPersistRef ?? localSuppressPersist;
	const initialData = useMemo(
		() => parseInitialScene(options.initialScene),
		[options.boardId, options.initialScene]
	);

	const handleChange = useCallback(
		(
			elements: readonly OrderedExcalidrawElement[],
			appState: AppState,
			files: BinaryFiles
		) => {
			if (suppressPersist.current) {
				return;
			}
			if (!options.onPersist) {
				return;
			}
			if (persistTimer.current) {
				clearTimeout(persistTimer.current);
			}
			persistTimer.current = setTimeout(() => {
				const json = serializeAsJSON(elements, appState, files, 'local');
				options.onPersist?.(json);
			}, 500);
		},
		[options]
	);

	return (
		<div
			className="cp2077-whiteboard-canvas excalidraw-wrapper"
			style={{
				position: 'relative',
				height: '100%',
				width: '100%',
				boxSizing: 'border-box',
			}}
		>
			<Excalidraw
				excalidrawAPI={(api) => {
					apiRef.current = api;
					if (api) {
						queueMicrotask(() => options.onApiReady?.());
					}
				}}
				initialData={initialData ?? undefined}
				onChange={handleChange}
				detectScroll={true}
				onPointerDown={() => options.onPointerRefresh?.()}
				onPointerUpdate={(payload) => options.onPointerUpdate?.(payload)}
				theme={options.theme ?? 'dark'}
				UIOptions={{
					canvasActions: {
						export: false,
						loadScene: false,
						saveToActiveFile: false,
					},
				}}
			/>
		</div>
	);
}
