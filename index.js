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
    self.connected = false;
};


Notifier.prototype.__proto__ = EventEmitter.prototype;

module.exports = function (opts) {
    return new Notifier(opts);
};

Notifier.prototype.createConnection = function() {
    var self = this;
    self.imap = new Imap(self.options);
    self.imap.once('ready', function () {
        self.imap.openBox(self.options.box, false, function () {
            self.imap.on('mail', function (id) {
                self.scan(true, function(){
                    console.log('scanning for starred mail done');
                });
            });
            self.imap.on('expunge', function (id) {
                self.scan(true, function(){
                    console.log('scanning for unstarred mail done');
                });
            });
            self.scan(self.options.emitOnStartup, function() {
                console.log('first scan done');
                self.emit('firstScanDone');
            });
        });
    });
    self.imap.once('end', function () {
        console.log('imap end, connected: ' + self.connected);
        if (self.connected) {
            console.log('restarting');
            self.start();
        }
    });
    self.imap.once('error', function (err) {
        console.error('error: ' + err + ', connected:' + self.connected);
        if (self.connected) {
            console.log('restarting in 5');
            setTimeout(function() {
                self.start();
            }, 5000);
        }
    });
};

Notifier.prototype.start = function(cb) {
    var self = this;
    self.createConnection();
    self.imap.connect();
    self.on('firstScanDone', function() {
    // self.imap.once('ready', function() {
        console.log('firstScanDone');
        self.connected = true;
        if (cb) { cb(); } else { return; }
    });
};

Notifier.prototype.getImapClient = function () {
    return self.imap;
};

Notifier.prototype.scan = function (notifyNew, cb) {
    var self = this;
    var cache = self.cache;
    self.imap.search(self.options.search || ['UNSEEN'], function (err, searchResults) {
        var deltaNew, deltaDeleted, batch;
        if (err) {
            self.emit('error', err);
            if (cb) { cb(); } else { return; }
        }
        // caching from https://github.com/whiteout-io/imap-client/blob/master/src/imap-client.js
        cache.uidList = cache.uidList || [];
        // determine deleted uids
        deltaDeleted = cache.uidList.filter(function(i) {
            return searchResults.indexOf(i) < 0;
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
        deltaNew = searchResults.filter(function(i) {
            return cache.uidList.indexOf(i) < 0;
        }).sort(function(a, b) {
            return b - a;
        });
         // notify about new messages in batches of options._maxUpdateSize size
        while (deltaNew.length) {
            batch = deltaNew.splice(0, (self.options._maxUpdateSize || deltaNew.length));
        }
        // update mailbox info
        cache.uidList = searchResults;

        if (searchResults instanceof Array && searchResults.length > 0) {
            var fetch = self.imap.fetch(searchResults, {
                markSeen: self.options.markSeen !== false,
                bodies: ''
            });
            var collectedMessages = 0;
            fetch.on('message', function (msg, seqno) {
                var index = seqno - 1;
                var uid = searchResults[index];
                var mp = new MailParser();
                mp.once('end', function (mail) {
                    if (uid !== undefined) {
                        collectedMessages++;
                        if (mail.headers['message-id'] === undefined) {
                            mail.headers['message-id'] = mail.headers.from + mail.headers.subject;
                        }
                        var emit = false;
                        if (notifyNew && cache.uid2Mail[uid] === undefined) {
                            emit = true;
                        }
                        cache.uid2Mail[uid] = {
                            headers: {
                                'message-id': mail.headers['message-id'],
                                subject: mail.headers.subject,
                                from: mail.headers.from
                            }
                        };
                        if (emit) {
                            self.emit('mail', mail);
                        }
                        if (collectedMessages >= searchResults.length) {
                            console.log('all messages parsed');
                            if (cb) { cb(); } else { return; }
                        }
                    }
                });
                msg.once('body', function (stream, info) {
                    stream.pipe(mp);
                });
            });
        }
        else {
            console.log('no new mail');
            if (cb) { cb(); } else { return; }
        }
    });
};

Notifier.prototype.stop = function (cb) {
    var self = this;
    if (self.connected) {
        self.connected = false;
        self.imap.once('end', function () {
            if (cb) { cb(); } else { return; }
        });
        self.imap.end();
    }
    else {
        if (cb) { cb(); } else { return; }
    }
};
