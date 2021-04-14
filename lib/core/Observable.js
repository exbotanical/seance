import {
  serialize,
  deserialize,
  EVENT_TYPES,
  QUERY_TYPES,
  IDENTIFIERS
} from '../utils';

/**
 * @description Initializer for an `Observable` - a server instance for managing shared state with a given Observer or allotment thereof
 * in a bidirectional, centralized network
 * @param {array} origins An array of the hostnames for existing Observers awaiting network incorporation
 */
class Observable {
  constructor ({ origins = [] } = {}) {
    // pool of pending observers
    this.pool = origins;
    // map of incorporated observers
    this.observatory = new Map();
  }

  /**
   * @summary Initialize prime observable instance
   * Binds `message` and `beforeunload` event listeners, incorporates pre-extant observers
   */
  init () {
    // incorporate all pending observers, if any
    this.pool.forEach(this.incorporate.bind(this));

    // bind message listener
    window.addEventListener(
      'message',
      this.onMessage.bind(this)
    );

    window.addEventListener(
      'beforeunload',
      this.beforeDestroy.bind(this)
    );
  }

  /**
   * @summary Incorporate a new observer and render it eligible for communications
   * @param {string} origin
   * @param {number} id
   */
  incorporate (origin, id) {
    const prospect = this.pool.find(observer => observer === origin);
    // observer for given id exists, abort
    if (!prospect || this.observatory.has(origin)) {
      return;
    }

    this.observatory.set(origin, { origin });
    this.emit({
      id,
      result: EVENT_TYPES.ACK,
      error: null
    }, origin);
  }

  /**
   * @summary Detach observer and un-incorporate, if extant
   * @param {string} origin
   * @param {number} id
   */
  detach (origin) {
    if (this.observatory.has(origin)) {
      this.observatory.delete(origin);
    }
  }

  /**
   * @summary Primary event callback; dispatches requested actions
   * @param {(string|any)} message If valid, a serialized message received via `postMessage`
   */
  onMessage (message) {
    const { origin, data } = message;

    if (!origin || !data) return;

    // observer has not been incorporated; return
    if (!this.observatory.has(origin)) return; // TODO permissions

    const deserialized = { id, type, payload } = deserialize(data);

    if (!id || !type || !payload) return;

    switch(true) {
      case type === EVENT_TYPES.MOUNT:
        this.incorporate(origin, id);
        break;
      case type === EVENT_TYPES.UNMOUNT:
        this.detach(origin, id);
        break;
      case type === EVENT_TYPES.SYN:
        this.emit({
          id,
          result: EVENT_TYPES.ACK,
          error: null
        });
        break;
      // action is a match; invoke it
      case Object.keys(QUERY_TYPES).includes(type):
        this.processAction(deserialized, origin)
        break;
      default:
        break;
    }
  }

  /**
   * @summary Invoked prior to `beforeunload` event resolution;
   * messages all observers indicating conn close, subsequently unregisters events
   */
  beforeDestroy () {
    for (const [ _, { origin } ] of this.observatory.entries()) {
      this.emit({
        id: IDENTIFIERS.DESTROY_ID,
        result: EVENT_TYPES.CLOSE,
        error: null
      }, origin);
    }

    window.removeEventListener(
      'message',
      this.onMessage.bind(this)
    );

    window.removeEventListener(
      'beforeunload',
      this.beforeDestroy.bind(this)
    );
  }

  /**
   * @summary Send a message to the specified observer
   * @param {object} payload
   * @param {string} origin
   */
  emit ({ id, result, error }, origin) {
    window.parent.postMessage(
      serialize({
        id,
        result,
        error
      }),
      origin
    );
  }

  /**
   * @summary Process valid action types requested by a given observer
   * @param {number} object.id
   * @param {string} object.type
   * @param {string} object.origin
   * @param {object} object.payload
   */
  processAction ({ id, type, payload }, origin) {
    let result = error = null;

    const action = type.toLowerCase();

    try {
      result = this[action](payload);
    } catch (ex) {
      error = ex.message;
    }

    this.emit({ id, result, error }, origin);
  }

  /**
   * @summary Retrieve an item or items from the storage adapter
   * @param {array} payload
   * @returns {array} An array of objects, denoting the result of each operation
   */
  get (payload) {
    const result = [];

    for (const key of payload) {
      try {
        const item = localStorage.getItem(key);
        result.push({ [key]: item });
      } catch (ex) {
        result.push({ [key]: null });
      }
    }

    return result;
  }

  /**
   * @summary Set an item or items from the storage adapter
   * @param {array} payload
   * @returns {array} An array of objects, denoting the result of each operation
   */
  set (payload) {
    const result = [];

    for (const { key, value } of payload) {
      try {
        localStorage.setItem(key, value);
        result.push({ [key]: true });
      } catch (ex) {
        result.push({ [key]: false });
      }
    }

    return result;
  }

  /**
   * @summary Delete an item or items from the storage adapter
   * @param {array} payload
   * @returns {array} An array of objects, denoting the corresponding result of each operation
   */
  delete (payload) {
    const result = [];

    for (const key of payload) {
      try {
        localStorage.removeItem(key);
        result.push({ [key]: true });
      } catch (ex) {
        result.push({ [key]: false });
      }
    }

    return result;
  }
}

export {
  Observable
};