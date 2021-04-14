import { Observable, Observer } from './core';

export function initObservable (origins) {
  return new Observable({
    origins
  })
    .init();
}

export function initObserver (opts = {}) {
  return new Observer({
    parentOrigin: opts.parentOrigin,
    created: opts.created,
    destroyed: opts.destroyed
  })
    .init();
}