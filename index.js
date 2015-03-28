/*jslint node: true, vars: true, indent: 4 */
'use strict';

var ImapClient = require('imap-client');
var EventEmitter = require('events');
var util = require('util');

var SYNC_TYPE_NEW = 'new';
var SYNC_TYPE_DELETED = 'deleted';
var SYNC_TYPE_MSGS = 'messages';

function Notifier (opts) {
    var self = this;
    EventEmitter.call(self);
    self.options = opts;
    opts.auth = { user: opts.user, pass: opts.password};
    opts.secure = true;
    self.options.box = self.options.box || 'INBOX';
    self.options.emitOnStartup = self.options.emitOnStartup || false;
    self.options._maxUpdateSize = self.options._maxUpdateSize || 20;
    self.hideLogs = !!self.options.hideLogs;
    self.cache = {
        uid2Mail: {}
    };
    self.imap = new ImapClient(opts);
}

util.inherits(Notifier, EventEmitter);

module.exports = function (opts) {
    return new Notifier(opts);
};

Notifier.prototype.start = function () {
    var self = this;
    self.imap.login().then(function () {
        self.scan(true);
        // TODO: make this work
        // self.scan(self.options.emitOnStartup);
    });
    return self;
};

Notifier.prototype.scan = function (notifyNew) {
    var self = this;
    var cache = self.cache;
    self.imap.onSyncUpdate = function (options) {
        var updatedMesages = options.list;
        var updatesMailbox = options.path;
        if (options.type === SYNC_TYPE_NEW) {
            console.log('new: ' + updatedMesages);
            updatedMesages.forEach(function(updatedMessage){
                self.imap.listMessages({path: self.options.box, firstUid: updatedMessage, lastUid: updatedMessage}).then(function(messages){
                    messages.forEach(function(message){
                        var m = browserbox2bipio(message);
                        if (notifyNew && !cache.uid2Mail[message.uid]) {
                            self.emit('mail', m);
                        }
                        cache.uid2Mail[message.uid] = m;
                    });
                });
            });
        }
        else if (options.type === SYNC_TYPE_DELETED) {
            console.log('deleted: ' + updatedMesages);
            updatedMesages.forEach(function(updatedMessage){
                var m = cache.uid2Mail[updatedMessage];
                if (m) {
                    self.emit('deletedMail', m);
                }
            });
        }
    };
    self.imap.listWellKnownFolders(function(folders){
        console.log('folders: '+folders);
    });
    self.imap.listenForChanges({path: self.options.box}, function() {
        console.log('listening for changes');
    });
    return self;
};

Notifier.prototype.stop = function () {
    var self = this;
    self.imap.stopListeningForChanges();
    return self;
};

var browserbox2bipio = function (mail) {
    return {
        "Message-ID": mail.id,
        "Subject": mail.subject,
        "From": mail.from
    };
};
