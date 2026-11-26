export const MAX_HISTORY = 50;

export interface EditorHistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  lastPushAt: number;
}

export function createHistory<T>(initial: T): EditorHistoryState<T> {
  return {
    past: [],
    present: initial,
    future: [],
    lastPushAt: 0,
  };
}

export function pushHistory<T>(
  state: EditorHistoryState<T>,
  next: T,
  opts?: { replaceWithinMs?: number; now?: number }
): EditorHistoryState<T> {
  if (Object.is(state.present, next)) {
    return state;
  }
  const now = opts?.now ?? Date.now();
  const replaceWindow = opts?.replaceWithinMs ?? 0;
  const shouldCoalesce =
    replaceWindow > 0 &&
    state.past.length > 0 &&
    state.lastPushAt > 0 &&
    now - state.lastPushAt <= replaceWindow;

  if (shouldCoalesce) {
    return {
      past: state.past,
      present: next,
      future: [],
      lastPushAt: now,
    };
  }

  const nextPast = [...state.past, state.present];
  if (nextPast.length > MAX_HISTORY) {
    nextPast.splice(0, nextPast.length - MAX_HISTORY);
  }

  return {
    past: nextPast,
    present: next,
    future: [],
    lastPushAt: now,
  };
}

export function canUndo<T>(state: EditorHistoryState<T>): boolean {
  return state.past.length > 0;
}

export function canRedo<T>(state: EditorHistoryState<T>): boolean {
  return state.future.length > 0;
}

export function undoHistory<T>(state: EditorHistoryState<T>): EditorHistoryState<T> {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1]!;
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future].slice(0, MAX_HISTORY),
    lastPushAt: 0,
  };
}

export function redoHistory<T>(state: EditorHistoryState<T>): EditorHistoryState<T> {
  if (state.future.length === 0) return state;
  const next = state.future[0]!;
  return {
    past: [...state.past, state.present].slice(-MAX_HISTORY),
    present: next,
    future: state.future.slice(1),
    lastPushAt: 0,
  };
}
