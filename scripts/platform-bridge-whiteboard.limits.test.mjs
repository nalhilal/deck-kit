import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GATEWAY_PATH = path.resolve(ROOT, '../../backend/apps/web/lib/ws/gateway-handlers.ts');
const BRIDGE_PATH = path.resolve(ROOT, 'js/platform-bridge-whiteboard.js');

function readMaxBytes(source, pattern) {
  const match = pattern.exec(source);
  assert.ok(match, 'pattern not found in source');
  return Number(match[1].replace(/_/g, ''));
}

test('client SCENE_MAX_BYTES matches gateway WHITEBOARD_SCENE_MAX_BYTES', () => {
  const gateway = readFileSync(GATEWAY_PATH, 'utf8');
  const bridge = readFileSync(BRIDGE_PATH, 'utf8');
  const gatewayMax = readMaxBytes(gateway, /WHITEBOARD_SCENE_MAX_BYTES = ([\d_]+)/);
  const clientMax = readMaxBytes(bridge, /SCENE_MAX_BYTES = (\d+)/);
  assert.equal(clientMax, gatewayMax);
  assert.equal(clientMax, 512000);
});
