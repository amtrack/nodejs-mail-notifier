/*jslint node: true, vars: true, indent: 4 */
'use strict';

var Imap = require('imap'),
    MailParser = require('mailparser').MailParser,
    EventEmitter = require('events').EventEmitter;

function Notifier(opts) {
    EventEmitter.call(this);
    var self = this;
    self.options = opts;
    self.options.box = self.options.box || 'INBOX';
    self.options.emitOnStartup = self.options.emitOnStartup || false;
    self.options._maxUpdateSize = self.options._maxUpdateSize || 20;
    self.hideLogs = !!self.options.hideLogs;
    self.cache = {
        uidList: [],
        uid2Mail: {}
    };
}

Notifier.prototype.getImap = function() {
    var self = this;
    var imap = new Imap(self.options);

    imap.once('ready', function () {
        console.log("READY");
        imap.openBox(self.options.box, false, function () {
            console.log("BOX OPENED");
            // self.scan(self.options.emitOnStartup);
            imap.on('mail', function (id) {
                console.log("MAIL RECEIVED");
                self.scan(true);
            });
            imap.on('expunge', function (id) {
                self.scan(true);
            });
        });
    });

    imap.on('end', function () {
        self.emit('end');
    });
    imap.on('close', function() {
        self.emit('close');
    });
    imap.on('error', function (err) {
        self.emit('error', err);
    });
    return imap;
}

Notifier.prototype.__proto__ = EventEmitter.prototype;

module.exports = function (opts) {
    return new Notifier(opts);
};

Notifier.prototype.start = function(cb) {
    var self = this;
    self.imap = self.getImap();
    self.imap.connect();
    if (cb) {
        self.imap.once('ready', cb);
    }
    else {
        return self;
    }
};

Notifier.prototype.scan = function (notifyNew) {
    console.log("starting scan");
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
                console.log('no new mail in ' + self.options.box);
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
                console.log('Done fetching all messages!');
            }
        });
        fetch.on('error', function () {
            self.emit('error', err);
        });
    });
    return self;
};

Notifier.prototype.stop = function () {
    var self = this;
    self.imap.destroy();
    self.imap.end();
    return self;
};
