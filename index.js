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
    self.imap.on('end', function () {
        self.connected = false;
        self.emit('end');
    });
    self.imap.on('error', function (err) {
        self.emit('error', err);
    });
    self.cache = {
        uidlist: []
    };
    self.seqno2mid = {};
}
util.inherits(Notifier, EventEmitter);

module.exports = function (opts) {
    return new Notifier(opts);
};


Notifier.prototype.start = function () {
    var self = this;
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
    self.imap.connect();
    return this;
};

Notifier.prototype.scan = function (notifyNew) {
    var self = this;
    var cached = self.cache;
    self.imap.search(self.options.search || ['UNSEEN'], function (err, seachResults) {
        var deltaNew, deltaDeleted, batch;
        if (err) {
            self.emit('error', err);
        }
        // normalize the uidlist
        cached.uidlist = cached.uidlist || [];

        // determine deleted uids
        deltaDeleted = cached.uidlist.filter(function(i) {
            return seachResults.indexOf(i) < 0;
        });

        // notify about deleted messages
        if (deltaDeleted.length) {
            for (var i=0; i < deltaDeleted.length; i++) {
                var m = self.seqno2mid[deltaDeleted[i]];
                if (m) {
                    self.emit('deletedMail', m)
                }
            }
        }
        deltaNew = seachResults.filter(function(i) {
            return cached.uidlist.indexOf(i) < 0;
        }).sort(function(a, b) {
            return b - a;
        }));

         // notify about new messages in batches of options._maxUpdateSize size
        while (deltaNew.length) {
            batch = deltaNew.splice(0, (self.options._maxUpdateSize || deltaNew.length));
        }

        // update mailbox info
        cached.uidlist = seachResults;

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
            var newSeqNo = parseInt(seqno) + parseInt(batch) - 1;
            var mp = new MailParser();
            mp.once('end', function (mail) {
                self.seqno2mid[newSeqNo] = {
                    headers: {
                        'message-id': mail.headers['message-id'],
                        subject: mail.headers.subject,
                        from: mail.headers.from
                    }
                };
                if (notifyNew) {
                    self.emit('mail', mail);
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
