/*jslint node: true, vars: true, indent: 4 */
'use strict';

var util = require('util'),
    Imap = require('imap'),
    MailParser = require('mailparser').MailParser,
    EventEmitter = require('events').EventEmitter;


function Notifier(opts) {
    EventEmitter.call(this);
    var self = this;
    self.options = opts;
    if (self.options.username) { //backward compat
        self.options.user = self.options.username;
    }
    self.options.box = self.options.box || 'INBOX';
    self.options.emitOnStartup = self.options.emitOnStartup || false;
    self.options._maxUpdateSize = self.options._maxUpdateSize || 20;
    self.hideLogs = !!self.options.hideLogs;
    self.connected = false;
    self.imap = new Imap(opts);

    self.imap.once('ready', function () {
        self.connected = true;
        self.imap.openBox(self.options.box, false, function () {
            self.scan(self.options.emitOnStartup);
            self.imap.on('mail', function (id) {
                self.scan(true);
            });
            self.imap.on('expunge', function (id) {
                self.scan(true);
            });
        });
    });

    self.imap.on('end', function () {
        self.connected = false;
        self.emit('end');
    });
    self.imap.on('close', function() {
        self.connected = false;
        self.imap.connect();
    });
    self.imap.on('error', function (err) {
        self.connected = false;
        self.emit('error', err);
    });
    self.cache = {
        uidList: [],
        uid2Mail: {}
    };
}
util.inherits(Notifier, EventEmitter);

module.exports = function (opts) {
    return new Notifier(opts);
};


Notifier.prototype.start = function () {
    var self = this;
    self.imap.connect();
    return this;
};

Notifier.prototype.scan = function (notifyNew) {
    var self = this;
    var cache = self.cache;
    self.imap.search(self.options.search || ['UNSEEN'], function (err, seachResults) {
        var deltaNew, deltaDeleted, batch;
        if (err) {
            self.emit('error', err);
        }
        // caching from https://github.com/whiteout-io/imap-client/blob/master/src/imap-client.js
        cache.uidList = cache.uidList || [];
        // determine deleted uids
        deltaDeleted = cache.uidList.filter(function(i) {
            return seachResults.indexOf(i) < 0;
        });
        // notify about deleted messages
        if (deltaDeleted.length) {
            for (var i=0; i < deltaDeleted.length; i++) {
                var m = cache.uid2Mail[deltaDeleted[i]];
                if (m) {
                    self.emit('deletedMail', m);
                }
            }
        }
        deltaNew = seachResults.filter(function(i) {
            return cache.uidList.indexOf(i) < 0;
        }).sort(function(a, b) {
            return b - a;
        });
         // notify about new messages in batches of options._maxUpdateSize size
        while (deltaNew.length) {
            batch = deltaNew.splice(0, (self.options._maxUpdateSize || deltaNew.length));
        }
        // update mailbox info
        cache.uidList = seachResults;

        if (!seachResults || seachResults.length === 0) {
            if(!self.options.hideLogs) {
                util.log('no new mail in ' + self.options.box);
            }
            return;
        }
        var fetch = self.imap.fetch(seachResults, {
            markSeen: self.options.markSeen !== false,
            bodies: ''
        });
        fetch.on('message', function (msg, seqno) {
            var index = seqno - 1;
            var uid = seachResults[index];
            var mp = new MailParser();
            mp.once('end', function (mail) {
                if (uid !== undefined) {
                    if (notifyNew && cache.uid2Mail[uid] === undefined) {
                        self.emit('mail', mail);
                    }
                    cache.uid2Mail[uid] = {
                        headers: {
                            'message-id': mail.headers['message-id'],
                            subject: mail.headers.subject,
                            from: mail.headers.from
                        }
                    };
                }
            });
            msg.once('body', function (stream, info) {
                stream.pipe(mp);
            });
        });
        fetch.once('end', function () {
            if(!self.options.hideLogs) {
                util.log('Done fetching all messages!');
            }
        });
        fetch.on('error', function () {
            self.emit('error', err);
        });
    });
    return this;
};

Notifier.prototype.stop = function () {
    if (this.connected) {
        this.imap.end();
    }
    return this;
};
