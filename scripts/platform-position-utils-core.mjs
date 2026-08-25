/**
 * Pure slide position comparison helpers (Node-testable).
 */

export function normalizeKey(h, v) {
  return h + '/' + (v || 0);
}

export function positionFromState(state) {
  if (!state) return { indexh: 0, indexv: 0, indexf: 0 };
  return {
    indexh: state.indexh || 0,
    indexv: state.indexv || 0,
    indexf: state.indexf || 0,
  };
}

export function keyFromPosition(pos) {
  if (!pos) return '0/0';
  if (typeof pos === 'string') return pos;
  return normalizeKey(pos.indexh, pos.indexv);
}

export function compareSlidePosition(a, b, orderedKeys) {
  var keys = orderedKeys && orderedKeys.length ? orderedKeys : ['0/0'];
  var keyA = keyFromPosition(a);
  var keyB = keyFromPosition(b);
  var idxA = keys.indexOf(keyA);
  var idxB = keys.indexOf(keyB);
  if (idxA < 0) idxA = 0;
  if (idxB < 0) idxB = 0;
  if (idxA !== idxB) return idxA < idxB ? -1 : 1;
  var fA = typeof a === 'string' ? 0 : a.indexf || 0;
  var fB = typeof b === 'string' ? 0 : b.indexf || 0;
  if (fA === fB) return 0;
  return fA < fB ? -1 : 1;
}

export function canNavigateForward(learnerPos, instructorPos, orderedKeys) {
  return compareSlidePosition(learnerPos, instructorPos, orderedKeys) < 0;
}

export function canNavigateNotesForward(editingKey, instructorKey, orderedKeys) {
  if (!editingKey || !instructorKey) return true;
  var keys = orderedKeys && orderedKeys.length ? orderedKeys : ['0/0'];
  var index = keys.indexOf(editingKey);
  if (index < 0 || index >= keys.length - 1) return false;
  var nextKey = keys[index + 1];
  return compareSlidePosition(nextKey, instructorKey, keys) <= 0;
}

/**
 * Apply gate for incoming deck.state: compare learner to instructor position
 * *before* updating from the payload (doc 19).
 */
export function shouldApplyIncomingDeckState(learnerPos, previousInstructorPos, orderedKeys) {
  if (!previousInstructorPos) return true;
  return compareSlidePosition(learnerPos, previousInstructorPos, orderedKeys) === 0;
}
