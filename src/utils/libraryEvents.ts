// A tiny signal so the Library reloads after a change made elsewhere (for example Undo on a deleted song).
const listeners = new Set<() => void>();

export function onLibraryChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitLibraryChanged() {
  listeners.forEach((fn) => fn());
}
