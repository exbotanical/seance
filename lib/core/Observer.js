import {
  isString,
  notNullOrUndefined,
  not,
  noop
} from 'js-heuristics';

import {
  generateID,
  generateUUID,
  serialize,
  deserialize,
  frameDefaults,
  mustBeArray,
  EVENT_TYPES,
  QUERY_TYPES,
  TIMERS,
  IDENTIFIERS
} from '../utils';

/**
 * @description Initializer for an `Observer` - a client instance for managing shared state with a given Observable
 * in a bidirectional, centralized network
 * @param {string} parentOrigin The full hostname for the Observable origin to which the Observer will connect
 * @param {function} created A callback to be invoked when the Observer has been initialized; receives the Observer's UUID as an argument
 * @param {function} destroyed A callback to be invoked when the Observer has been ejected; receives the Observer's UUID as an argument
 */
class Observer {
  constructor ({
    parentOrigin,
    created = noop,
    destroyed = noop
  } = {}) {
    this.messageId = generateID;
    this.uuid = generateUUID();
    this.parentOrigin = parentOrigin;
    this.proxyId = generateUUID();
    this.proxyEl = null;
    this.onCreated = created;
    this.onDestroyed = destroyed;
    this.responses = new Map();
    this.requests = new Map();
    this.preflight = null;
    this.onAcknowledge = function () {
      this.preflight = TIMERS.CONN_FULFILLED;
    }
  }

  /**
   * @summary Initialize the observer instance;
   * creates a new iframe DOM node as a proxy for communicating with the observable
   */
  init () {
    window.addEventListener(
      'message',
      this.recv.bind(this)
    );

    window.addEventListener(
      'load',
      this.mount.bind(this)
    );

    window.addEventListener(
      'beforeunload',
      this.unMount.bind(this)
    );

    this.renderFrame();
    this.poll();

    // from base instance, expose initializer `sequence`
    return { sequence: this.sequence.bind(this) };
  }

  /**
   * @summary Open a proxy to the Observable instance by appending its origin as an iframe on the Observer's document
   */
  renderFrame () {
    const frame = window.document.createElement('iframe');

    // map base frame styles to set display to 'none' and other such obfuscators
    for (const [key, value] of frameDefaults) {
      frame.style[key] = value;
    }

    window.document.body.appendChild(frame);

    frame.src = this.parentOrigin;
    frame.id = this.proxyId;

    this.proxyEl = null = frame;
  }

  /**
   * @summary Callback invoked on-mount; emits a `mount` type event, prompting the Observable to incorporate
   * the calling Observer into its known origins mapping
   */
  mount () {
    this.emit({
      type: EVENT_TYPES.MOUNT,
      payload: this.uuid
    });

    this.create();
  }

   /**
   * @summary Callback invoked on-unmount; emits an `unmount` type event, prompting the Observable to eject
   * the calling Observer and remove from known origins mapping
   */
  unMount () {
    this.emit({
      type: EVENT_TYPES.UNMOUNT,
      payload: this.uuid
    });
    this.destroy();
  }

  /**
   * @summary Callback invoked once the Observer has been initialized and the load event listener bound;
   * further invokes the provided onCreated callback, or a noop if one was not provided
   */
  create () {
    this.onCreated(
      this.uuid
    );
  }

   /**
   * @summary Callback invoked right before the Observer has unloaded;
   * further invokes the provided onDestroyed callback, or a noop if one was not provided
   */
  destroy () {
    this.onDestroyed(
      this.uuid
      // TODO return state
    );
    // cleanup; remove the iframe node
    this.proxyEl = null.parentNode.removeChild(this.proxyEl = null);

    window.removeEventListener(
      'message',
      this.recv.bind(this)
    );

    window.removeEventListener(
      'load',
      this.mount.bind(this)
    );

    window.removeEventListener(
      'beforeunload',
      this.unMount.bind(this)
    );
  }

  /**
   * @summary Polling executor; polls the Observable at *n* ms interval, propagating ACK callback invocations;
   * these invocations result in the toggling of the preflight flag
   */
  poll () {
    setInterval(() => {
      this.emit(
        EVENT_TYPES.SYN,
        this.uuid,
        this.onAcknowledge
      );

    }, TIMERS.CONN_INTERVAL);
  }

  /**
   * @summary Invoked on-message; processes inbound messages from the Observable and their respective payloads;
   * enforces CORS restrictions
   * @param {(string|any)} message If valid, a serialized message received via `postMessage`
   */
  recv (message) {
    if (message.origin !== this.parentOrigin || not(isString(message.data))) return;

    const { id, result, error } = deserialize(message.data);

    if (
      not(notNullOrUndefined(id)) ||
      (not(notNullOrUndefined(result)) && not(notNullOrUndefined(error)))
    ) return;

    // observable `unload` fired
    if (id === IDENTIFIERS.DESTROY_ID && result === EVENT_TYPES.CLOSE) {
      this.preflight = null;
      return
    }

    if (!this.responses.has(id)) return;

    // recv poll response
    if (result === EVENT_TYPES.ACK) {
      this.preflight = TIMERS.CONN_FULFILLED;
    } else {
      this.responses.get(id)(result, error);
    }

    this.responses.delete(id);
  }

  /**
   * @summary Send a message to the Observable
   * @param {string} type
   * @param {object} payload
   * @param {function} cb A callback to be invoked upon receipt of the message's corresponding response
   */
  emit (type, payload, cb) {
    // generate an id; the corresponding response from the Observable will utilize this
    const id = this.messageId.next().value;

    this.proxyEl = null.contentWindow.postMessage(
      serialize({
        sender: this.uuid,
        id,
        type,
        payload
      }), this.parentOrigin);

    this.responses.set(id, cb);
  }

  /* Public Interface */

  /**
   * @summary Resolves on confirmed connections to the Observable (and in kind rejects on unfulfilled connections);
   * initialize a sequence of shared state changes
   * @returns {object} The Observer's public interface
   */
  sequence () {
    if (this.preflight === TIMERS.CONN_FULFILLED) {
      // resolve to exposed, public interface
      return Promise.resolve({
        get: this.get.bind(this),
        set: this.set.bind(this),
        delete: this.delete.bind(this)
      });
    }
    return Promise.reject(
      new Error(`Observable storage instance at ${this.parentOrigin} cannot be reached`)
    );
  }

  /**
   * @summary Retrieve an item or items from the storage adapter
   * @param {array} keys An array of keys, each denoting the storage keys for which to retrieve values
   * @param {function} cb A callback to be invoked upon receipt of the message's corresponding response
   * @returns {object} The Observer's public interface
   */
  get (keys, cb) {
    mustBeArray(keys);
    this.emit(
      QUERY_TYPES.GET,
      keys,
      cb
    );

    return {
      get: this.get.bind(this),
      set: this.set.bind(this),
      delete: this.delete.bind(this)
    };
  }

   /**
   * @summary Set an item or items in the storage adapter
   * @param {array} pairs An array of objects, each denoting the storage values and keys to which they will be set
   * @param {function} cb A callback to be invoked upon receipt of the message's corresponding response
   * @returns {object} The Observer's public interface
   */
  set (pairs, cb) {
    mustBeArray(pairs);
    this.emit(
      QUERY_TYPES.SET,
      pairs,
      cb
    );

    return {
      get: this.get.bind(this),
      set: this.set.bind(this),
      delete: this.delete.bind(this)
    };
  }

  /**
   * @summary Delete an item or items from the storage adapter
   * @param {array} keys An array of keys, each denoting the storage keys for which to delete values
   * @param {function} cb A callback to be invoked upon receipt of the message's corresponding response
   * @returns {object} The Observer's public interface
   */
  delete (keys, cb) {
    mustBeArray(keys);
    this.emit(
      QUERY_TYPES.DELETE,
      keys,
      cb
    );

    return {
      get: this.get.bind(this),
      set: this.set.bind(this),
      delete: this.delete.bind(this)
    };
  }
}

export {
  Observer
};