var util = require('util');

SubscriptionRequest = module.exports = function(session, requestMessage, channels) {
    this.session  = session;
    this.channels = channels;
    this.requestMessage = requestMessage;

    this.isApproved = false;

    this._timeout = setTimeout(this.decline.bind(this), 1000);
                               //this.session.server.options.subscriptionTimeout);

    util.log('Session ' + this.session.connectionID + ' subscription request to channel "' + this._getChannelNames() + '" started');
};

SubscriptionRequest.prototype.approve = function() {
    clearTimeout(this._timeout);

    this.isApproved = true;

    for (var i = 0; i < this.channels.length; i++) {
        this.channels[i].subscribe(this.session);
    }

    this._sendResponse(true);

    util.log('Session ' + this.session.connectionID + ' subscription request to channel "' + this._getChannelNames() + '" APPROVED');

    //this.session.server.monitor.increment('subscription');
};

SubscriptionRequest.prototype.decline = function(error) {
    clearTimeout(this._timeout);

    if (this.isApproved) {
        throw new Error('Session ' + this.session.connectionID + ' subscription request to channel "' + this._getChannelNames() + '" already approved');
    }

    this._sendResponse(false, error || 'Subscription declined');

    util.log('Session ' + this.session.connectionID + ' subscription request to channel "' + this._getChannelNames() + '" DECLINED' + (error ? ': ' + error : ''));

    //this.session.server.monitor.increment('declinedSubscription');
};

SubscriptionRequest.prototype._sendResponse = function(successful, error) {
    return this.session.send({
        id           : this.requestMessage.id,
        channel      : '/meta/subscribe',
        clientId     : this.session.connectionID,
        successful   : successful,
        error        : error,
        subscription : this.requestMessage.subscription
    });
};

SubscriptionRequest.prototype._getChannelNames = function() {
    return this.channels.map(function(channel){
        return channel.name;
    }).join(', ');
};
