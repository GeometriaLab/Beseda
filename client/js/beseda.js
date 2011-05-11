// TODO: Reconnect? and update subscribes on server when it down and up

function inherits(Class, Parent)
{
	var Link = function() {};
	Link.prototype = Parent.prototype;

	Class.prototype = new Link();
	Class.prototype.constructor = Class;
	Class._super = Class.prototype._super = Parent.prototype;
};

var IO = function(host, port) {
	this.__host = host;
	this.__port = port;

	this.__transport = new JSONPPolling();
};

IO.prototype.setEmitter = function(emitter) {
	this.__transport.setEmitter(emitter);
};

IO.prototype.connect = function() {
	this.__transport.connect(this.__host, this.__port);
};

IO.prototype.send = function(data) {
	this.__transport.send(data);
};

IO.prototype.disconnect = function() {
	this.__transport.disconnect();
};

///////////////////////////////////////////////////////////////////////////////

var Transport = function() {
	this._url = null;
	this._typeSuffix = null;
	this._connectionID = null;
	this._emitter = null;
	
	this.__sendQueue = [];
};

Transport.EVENT_CONNECT 	   = 'io_connect';
Transport.EVENT_MESSAGE 	   = 'io_message';
Transport.EVENT_DISCONNECT = 'io_disconnect';
Transport.EVENT_ERROR 	   = 'io_error';

Transport.DATA_SEPARATOR	 = '|';

Transport.prototype.connect = function(host, port) {
	throw Error('Abstract method calling.');
};

Transport.prototype.send = function(data) {
	throw Error('Abstract method calling.');
};

Transport.prototype.disconnect = function() {
	throw Error('Abstract method calling.');
};

Transport.prototype.setEmitter = function(emitter) {
	this._emitter = emitter;
};

Transport.prototype._handleConnection = function(data) {
	this._connectionID = data;

	if (this._emitter) {
		this._emitter.emit(Transport.EVENT_CONNECT, this._connectionID);
	}
	
	while(this.__sendQueue.length) {
		this.send(this.__sendQueue.shift());
	}
};

Transport.prototype._handleMessage = function(data) {
	if (data && data.length > 0) {
		var parsedData = data.split(Transport.DATA_SEPARATOR);
		
		while(parsedData.length) {
			this._emitter.emit(Transport.EVENT_MESSAGE, parsedData.shift());
		}
	}
};

Transport.prototype._enqueue = function(data) {
	this.__sendQueue.push(data);
};

///////////////////////////////////////////////////////////////////////////////

var LongPolling = function() {
	LongPolling._super.constructor.call(this);
	
	this._dataType = 'text';
	this._typeSuffix = '/long-polling';
	this._getParams = '';
};

inherits(LongPolling, Transport);

LongPolling.prototype.connect = function(host, port) {
	if (!this._url) {
		this._url = 'http://' + host + ':' + port + "/beseda/io";

		this.__doConnect();
	}
};

LongPolling.prototype.__doConnect = function() {
	if (!this.__handleConnectionClosure) {
		var self = this;
		
		this.__handleConnectionClosure = function(data) {
			self._handleConnection(data);
		};
	}

	$.get(
		this._url + "/connect" + this._typeSuffix + this._getParams, 
		this.__handleConnectionClosure, 
		this._dataType
	);
};

LongPolling.prototype._handleConnection = function(data) {
	LongPolling._super._handleConnection.call(this, data);

	this.__poll();
};

LongPolling.prototype.__poll = function() {
	if (this._connectionID) {

		if (!this.__handleMessageClosure) {
			var self = this;

			this.__handleMessageClosure = function(data) {
				self._handleMessage(data);
			};
		}

		$.get(
			this._url + "/" + this._connectionID + this._getParams, 
			this.__handleMessageClosure, 
			this._dataType
		);
	}
};


LongPolling.prototype._handleMessage = function(data) {
	LongPolling._super._handleMessage.call(this, data);

	this.__poll();
};

LongPolling.prototype.send = function(data) {
	if (this._connectionID) {
		$.post(this._url + "/" + this._connectionID + this._getParams, data);
	} else {
		this._enqueue(data);
	}
};

///////////////////////////////////////////////////////////////////////////////

var JSONPPolling = function() {
	JSONPPolling._super.constructor.call(this);
	
	this._dataType = 'jsonp';
	this._typeSuffix = '/jsonp-polling';
	this._getParams = '?callback=?';
};

inherits(JSONPPolling, LongPolling);

///////////////////////////////////////////////////////////////////////////////


var Beseda = function(options) {
    this.setOptions({
        io : {
            host : document.location.hostname,
            port : document.location.port || 4000
        }
    }, options);

    this._events       = {};
    this._status       = Beseda._statuses.DISCONNECTED;
    this._messageQueue = [];

    this.router   = new Beseda.Router(this);
    this.clientId = null;

    if (this.options.io.constructor == Object) {
        this.__io = new IO(this.options.io.host, this.options.io.port);
        this.__io.setEmitter(this);
    } else {
    		debugger;
        //this.socketIO = this.options.socketIO;
    }

    var self = this;
    this.on(Transport.EVENT_MESSAGE, function(data) {
        self.router.dispatch(JSON.parse(data));
    });
	
    
    //this.socketIO.on('reconnect', function(){
    //    self._onReconnect();
    // });
    //this.socketIO.on('disconnect', function(){
    //    self._onDisconnect();
    //});
};

Beseda.prototype.isConnected = function() {
    return this._status == Beseda._statuses.CONNECTED;
};

Beseda.prototype.isDisconnected = function() {
    return this._status == Beseda._statuses.DISCONNECTED;
};

Beseda.prototype.isConnecting = function() {
    return this._status == Beseda._statuses.CONNECTING;
};

Beseda.prototype.subscribe = function(channel, callback, additionalMessage) {
    if (this.isDisconnected()) {
        this.connect();
    }

    var message = additionalMessage || {};
    message.subscription = channel;

    message = this._sendMessage('/meta/subscribe', message);

    this.log('Beseda send subscribe request', message);

    if (callback) {
        this.on('subscribe:' + message.id, callback);
    }
};

Beseda.prototype.unsubscribe = function(channel, callback, additionalMessage) {
    if (this.isDisconnected()) {
        this.connect();
    }

    var message = additionalMessage || {};
    message.subscription = channel;

    message = this._sendMessage('/meta/unsubscribe', message);

    this.log('Beseda send unsubscribe request', message);

    if (callback) {
    		// TODO: implement once()
        this.on('unsubscribe:' + message.id, callback);
    }
};

Beseda.prototype.publish = function(channel, message, callback) {
    if (this.isDisconnected()) {
        this.connect();
    }

    message = this._sendMessage(channel, { data : message });

    this.log('Beseda send publish request', message);

    if (callback) {
        this.on('message:' + channel + ':' + message.id, callback);
    }

    return this;
};

Beseda.prototype.connect = function(callback, additionalMessage) {
    if (this.isConnected()) {
        return false;
    }

    this._status = Beseda._statuses.CONNECTING;

    var self = this;

    this.on('io_connect', function(connectionID) {
        self.clientId = connectionID;

        var message = self._createMessage('/meta/connect', additionalMessage);
        
    		self.__io.send(message);
    		
   		this.log('Beseda send connection request', message);

   		self.removeAllListeners('io_connect');
    });

    this.__io.connect();
};

Beseda.prototype.disconnect = function() {
    this.__io.disconnect();
};

Beseda.prototype.setOptions = function(options, extend) {
    this.options = Beseda.utils.mergeObjects(options, extend);
};

Beseda.prototype.log = function() {
    if ('console' in window && 'log' in console) {
		console.log.apply(console, arguments);
    }
};

Beseda.prototype._sendMessage = function(channel, message) {
    if (this.isDisconnected()) {
        throw 'You must connect before send message';
    }

    if (this.isConnecting()) {
        this._messageQueue.push(channel, message);
    } else {
        this.__io.send(this._createMessage(channel, message));
    }

    return message;
};

Beseda.prototype._createMessage = function(channel, message) {
    message = message || {};

    message.id       = this.clientId + '_' + ++Beseda.__lastMessageID;
    message.channel  = channel;
    message.clientId = this.clientId;

    return JSON.stringify(message);
};

Beseda.prototype._onReconnect = function() {
    this.log('Beseda reconnected');
    this.emit('reconnect');
};

Beseda.prototype._onDisconnect = function() {
    this._status == Beseda._statuses.DISCONNECTED;

    this.emit('disconnect');

    this.log('Beseda disconnected');
};

Beseda.prototype.flushMessageQueue = function() {
	while (this._messageQueue.length) {
		this.__io.send(this._createMessage(this._messageQueue.shift(), this._messageQueue.shift()));
	}
};

Beseda._statuses = {
    DISCONNECTED : 0,
    CONNECTING   : 1,
    CONNECTED    : 2
};

Beseda.__lastMessageID = 0;

Beseda.prototype.on = function(event, listener) {
    if (!(event in this._events)) {
        this._events[event] = [];
    }
    this._events[event].push(listener);
};

Beseda.prototype.addListener = Beseda.prototype.on;

Beseda.prototype.removeListener = function(event, listener) {
    if (event in this._events) {
        for (var i = 0; i < this._events[event].length; i++) {
            if (this._events[event][i] == listener) {
                this._events[event].splice(i, 1);
            }
        }
    }
};

Beseda.prototype.removeAllListeners = function(event) {
    if (event in this._events) {
        this._events[event] = [];
    }
};

Beseda.prototype.emit = function() {
    var args = Array.prototype.slice.call(arguments);
    var event = args.shift();

    if (event in this._events) {
        for (var i = 0; i < this._events[event].length; i++) {
            this._events[event][i].apply(this, args);
        }
    }
};

Beseda.prototype.listeners = function(event) {
    return event in this._events ? this._events[event] : [];
};

// TODO: Change router!
Beseda.Router = function(client) {
    this.client = client;
};

Beseda.Router.prototype.dispatch = function(message) {
    if (message.channel == undefined || message.clientId == undefined || message.id == undefined) {
        this.client.log('Beseda receive incorrect message', message);
        this.client.emit('error', message);
    } else {
        if (message.channel.indexOf('/meta/') == 0) {
            var metaChannel = message.channel.substr(6);
            if (!metaChannel in ['connect', 'error', 'subscribe', 'unsubscribe']) {
                this.client.log('Unsupported meta channel ' + message.channel);
                this.client.emit('error', message);
            }

            this['_' + metaChannel].call(this, message);
        } else {
            this._message(message);
        }
    }
};

Beseda.Router.prototype._connect = function(message) {
    if (message.successful) {
        this.client._status = Beseda._statuses.CONNECTED;

        this.client.flushMessageQueue();

        this.client.log('Beseda connected');
        
   		this.client.emit('connection', message);
    } else {
        this.client.disconnect();

        this.client.log('Beseda connection request declined', message);
        
        this.client.emit('error', message);
    }
};

Beseda.Router.prototype._error = function(message) {
    this.client.log('Beseda error: ' + message.data);
    this.client.emit('error', message);
};

Beseda.Router.prototype._subscribe = function(message) {
    if (message.successful) {
        this.client.log('Beseda subscribed to ' + message.subscription.toString(), message);
    } else {
        this.client.log('Beseda subscribe request declined', message);
        this.client.emit('error', message);
    }

    this.client.emit('subscribe', message.error, message);
    this.client.emit('subscribe:' + message.id, message.error, message);
};

Beseda.Router.prototype._unsubscribe = function(message) {
    if (message.successful) {
        this.client.log('Beseda unsubscribed from ' + message.subscription.toString(), message);
    } else {
        this.client.log('Beseda unsubscribe request declined', message);
        this.client.emit('error', message);
    }

    this.client.emit('unsubscribe', message.error, message);
    this.client.emit('unsubscribe:' + message.id, message.error, message);
};

Beseda.Router.prototype._message = function(message) {
    if ('successful' in message) {
        this.client.emit('message:' + message.channel + ':' + message.id, message.error, message);

        if (message.successful) {
            this.client.log('Beseda publish to ' + message.channel, message);
        } else {
            this.client.log('Beseda publish request declined', message);
            this.client.emit('error', message);
        }
    } else {
        this.client.log('Beseda get a new message from ' + message.channel, message);

        this.client.emit('message:' + message.channel, message.data, message);
        this.client.emit('message', message.channel, message.data, message);
    }
};

Beseda.utils = {
    uid : function() {
        var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'.split('');
        var uid = [];

        for (var i = 0; i < 22; i++) {
            uid[i] = chars[0 | Math.random() * 64];
        }

        return uid.join('');
    },

    cloneObject : function(object) {
        return this.mergeObjects({}, object);
    },

    mergeObjects : function(object, extend) {
        for (var p in extend) {
            try {
                if (extend[p].constructor == Object) {
                    object[p] = this.mergeObjects(object[p], extend[p]);
                } else {
                    object[p] = extend[p];
                }
            } catch (e) {
                object[p] = extend[p];
            }
        }

        return object;
    }
};

