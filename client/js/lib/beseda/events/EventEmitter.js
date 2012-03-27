var BesedaPackage = {};
BesedaPackage.utils = {};
BesedaPackage.events = {};
BesedaPackage.transport = {};
BesedaPackage.transport.request = {};

/**
 * @constructor
 */
BesedaPackage.events.EventEmitter = function() { };

BesedaPackage.events.EventEmitter.defaultMaxListeners = 10;
BesedaPackage.events.EventEmitter.isArray = Array.isArray || function(o) { return o.prototype.toString.call(o) === '[object Array]'; };

BesedaPackage.events.EventEmitter.prototype.setMaxListeners = function(n) {
    if (!this._events) this._events = {};
    this._events.maxListeners = n;
};

/**
 * 
 * @param {string} type
 * @param {... Object} var_args
 */
BesedaPackage.events.EventEmitter.prototype.emit = function(type, var_args) {
    // If there is no 'error' event listener then throw.
    if (type === 'error') {
        if (!this._events || !this._events.error ||
                (BesedaPackage.events.EventEmitter.isArray(this._events.error) && !this._events.error.length))
        {
            if (arguments[1] instanceof Error) {
                throw arguments[1]; // Unhandled 'error' event
            } else {
                throw new Error("Uncaught, unspecified 'error' event.");
            }
        }
    }

    if (!this._events) return false;
    var handler = this._events[type];
    if (!handler) return false;

    if (typeof handler == 'function') {
        switch (arguments.length) {
            // fast cases
            case 1:
                handler.call(this);
                break;
            case 2:
                handler.call(this, arguments[1]);
                break;
            case 3:
                handler.call(this, arguments[1], arguments[2]);
                break;
            // slower
            default:
                var args = Array.prototype.slice.call(arguments, 1);
                handler.apply(this, args);
        }
        return true;

    } else if (BesedaPackage.events.EventEmitter.isArray(handler)) {
        var args = Array.prototype.slice.call(arguments, 1);

        var listeners = handler.slice();
        for (var i = 0, l = listeners.length; i < l; i++) {
            listeners[i].apply(this, args);
        }
        return true;

    } else {
        return false;
    }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
BesedaPackage.events.EventEmitter.prototype.addListener = function(type, listener) {
    if ('function' !== typeof listener) {
        throw new Error('addListener only takes instances of Function');
    }

    if (!this._events) this._events = {};

    // To avoid recursion in the case that type == "newListeners"! Before
    // adding it to the listeners, first emit "newListeners".
    this.emit('newListener', type, listener);

    if (!this._events[type]) {
        // Optimize the case of one listener. Don't need the extra array object.
        this._events[type] = listener;
    } else if (BesedaPackage.events.EventEmitter.isArray(this._events[type])) {

        // If we've already got an array, just append.
        this._events[type].push(listener);

        // Check for listener leak
        if (!this._events[type].warned) {
            var m;
            if (this._events.maxListeners !== undefined) {
                m = this._events.maxListeners;
            } else {
                m = BesedaPackage.events.EventEmitter.defaultMaxListeners;
            }

            if (m && m > 0 && this._events[type].length > m) {
                this._events[type].warned = true;
                alert('(node) warning: possible EventEmitter memory ' +
					  'leak detected. %d listeners added. ' +
					  'Use emitter.setMaxListeners() to increase limit. ' +
					  this._events[type].length);
            }
        }
    } else {
        // Adding the second element, need to change to array.
        this._events[type] = [this._events[type], listener];
    }

    return this;
};

BesedaPackage.events.EventEmitter.prototype.on =
	BesedaPackage.events.EventEmitter.prototype.addListener;

BesedaPackage.events.EventEmitter.prototype.once = function(type, listener) {
    if ('function' !== typeof listener) {
        throw new Error('.once only takes instances of Function');
    }

    var self = this;
    function g() {
        self.removeListener(type, g);
        listener.apply(this, arguments);
    };

    g.listener = listener;
    self.on(type, g);

    return this;
};

BesedaPackage.events.EventEmitter.prototype.removeListener = function(type, listener) {
    if ('function' !== typeof listener) {
        throw new Error('removeListener only takes instances of Function');
    }

    // does not use listeners(), so no side effect of creating _events[type]
    if (!this._events || !this._events[type]) return this;

    var list = this._events[type];

    if (BesedaPackage.events.EventEmitter.isArray(list)) {
        var position = -1;
        for (var i = 0, length = list.length; i < length; i++) {
            if (list[i] === listener ||
                    (list[i].listener && list[i].listener === listener))
            {
                position = i;
                break;
            }
        }

        if (position < 0) return this;
        list.splice(position, 1);
        if (list.length == 0)
            delete this._events[type];
    } else if (list === listener ||
                         (list.listener && list.listener === listener))
    {
        delete this._events[type];
    }

    return this;
};

BesedaPackage.events.EventEmitter.prototype.removeAllListeners = function(type) {
    if (arguments.length === 0) {
        this._events = {};
        return this;
    }

    // does not use listeners(), so no side effect of creating _events[type]
    if (type && this._events && this._events[type]) this._events[type] = null;
    return this;
};

BesedaPackage.events.EventEmitter.prototype.listeners = function(type) {
    if (!this._events) this._events = {};
    if (!this._events[type]) this._events[type] = [];
    if (!BesedaPackage.events.EventEmitter.isArray(this._events[type])) {
        this._events[type] = [this._events[type]];
    }
    return this._events[type];
};