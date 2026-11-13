// A signal for "the user changed the library on this device", so automatic sync knows when to run.
// Changes that arrive from a sync itself don't go through here, so a sync never triggers another one.
const listeners = new Set<() => void>();

export function onLocalEdit(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function markLocalEdit() {
  listeners.forEach((fn) => fn());
}
