var util = require('util');

var Router = require('./router.js');

var LongPollingTransport      = require('./transports/long_polling.js'),
	JSONPLongPollingTransport = require('./transports/jsonp_long_polling.js'),
	WebSocketTransport        = require('./transports/web_socket.js');

var utils = require('./utils.js');

module.exports = IO = function(server) {
	process.EventEmitter.call(this);

    this.server = server;

    this._transports = {};
    this._connections = {};

	//TODO: Add more protocols to handle
	this.server.router.get('/beseda/io/:transport/:time', this._handleConnect.bind(this), {
		protocol: ['ws', 'http']
	});
}

util.inherits(IO, process.EventEmitter);

IO.TRANSPORTS = {
	longPolling      : LongPollingTransport,
	JSONPLongPolling : JSONPLongPollingTransport,
	webSocket        : WebSocketTransport
};

IO.prototype.send = function(connectionId, message) {
	if (!this._connections[connectionId]) {
        throw new Error('Can\'t send to unavailble connection ' + connectionId)
    }
 
    this._connections[connectionId].write(message);
};

IO.prototype._getTransport = function(name) {
    if (this._transports[name] === undefined) {
        this._transports[name] = new IO.TRANSPORTS[name](this);

		this._transports[name].on('message', this._onMessage.bind(this));
		this._transports[name].on('disconnect', this._onDisconnect.bind(this));
    }

    return this._transports[name];
}

IO.prototype._handleConnect = function(request, response, params, head) {
	if (this.server.options.transports.indexOf(params.transport) !== -1) {
        var id = utils.uid();
        var transport = this._getTransport(params.transport);

        this._connections[id]
	        = transport.registerConnection(id, request, response, head);
	} else {
        Router.Utils.sendJSON(response, JSON.stringify({
            error               : 'Invalid transport',
            availableTransports : this.server.options.transports 
        }));
    }
}

IO.prototype._onMessage = function(connectionId, messages) {
    for (var i = 0; i < messages.length; i++) {
        this.emit('message', connectionId, messages[i]);
    }
}

IO.prototype._onDisconnect = function(connectionId) {
    this.emit('disconnect', connectionId);
    delete this._connections[connectionId];
}
