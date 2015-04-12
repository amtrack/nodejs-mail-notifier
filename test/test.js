var assert = require("assert");
var Notifier = require("../");
var Imap = require('imap');
var hoodiecrow = require("hoodiecrow");
var hoodiecrowOptions = {
    plugins: ["ID", "STARTTLS" /*, "LOGINDISABLED"*/ , "SASL-IR", "AUTH-PLAIN", "NAMESPACE", "IDLE", "ENABLE", "CONDSTORE", "XTOYBIRD", "LITERALPLUS", "UNSELECT", "SPECIAL-USE", "CREATE-SPECIAL-USE"],
    id: {
        name: "hoodiecrow",
        version: "0.1"
    },

    storage: {
        "INBOX": {
            messages: [{
                raw: "Subject: hello 1\r\n\r\nWorld 1!",
                internaldate: "14-Sep-2013 21:22:28 -0300"
            }, {
                raw: "Subject: hello 2\r\n\r\nWorld 2!",
                flags: ["\\Seen"]
            }, {
                raw: "Subject: hello 3\r\n\r\nWorld 3!"
            }, {
                raw: "From: sender name <sender@example.com>\r\n" +
                    "To: Receiver name <receiver@example.com>\r\n" +
                    "Subject: hello 4\r\n" +
                    "Message-Id: <abcde>\r\n" +
                    "Date: Fri, 13 Sep 2013 15:01:00 +0300\r\n" +
                    "\r\n" +
                    "World 4!"
            }, {
                raw: "Subject: hello 5\r\n\r\nWorld 5!"
            }, {
                raw: "Subject: hello 6\r\n\r\nWorld 6!"
            }]
        },
        "": {
            "separator": "/",
            "folders": {
                "[Gmail]": {
                    "flags": ["\\Noselect"],
                    "folders": {
                        "All Mail": {
                            "special-use": "\\All"
                        },
                        "Drafts": {
                            "special-use": "\\Drafts"
                        },
                        "Important": {
                            "special-use": "\\Important"
                        },
                        "Sent Mail": {
                            "special-use": "\\Sent"
                        },
                        "Spam": {
                            "special-use": "\\Junk"
                        },
                        "Starred": {
                            "special-use": "\\Flagged"
                        },
                        "Trash": {
                            "special-use": "\\Trash"
                        }
                    }
                }
            }
        }
    },
    debug: true
};
var server = hoodiecrow(hoodiecrowOptions);

const PORT = 1143;
var imapOptions = {
    user: "testuser",
    password: "testpass",
    host: "localhost",
    port: PORT,
    //debug: console.log,
    tls: false,
    box: "[Gmail]/Starred",
    search: ['ALL'],
    markSeen: false
};


describe('Array', function(){
    var imapClient = new Imap(imapOptions);
    beforeEach(function(){
        server.listen(PORT, function() {console.log("starting hoodiecrow");
            return imapClient.connect();
        });
    });
    describe('#indexOf()', function(){
        it('should return -1 when the value is not present', function(){
            var mailListener = new Notifier(imapOptions);
            mailListener.on("end", function() {
                console.log("imapDisconnected");
            });

            mailListener.on("error", function(err) {
                console.error(err);
                mailListener.stop();
                mailListener.start();
            });

            mailListener.on("mail", function(mail) {
                console.log('add:' + mail);
            });

            mailListener.on("deletedMail", function(mail) {
                console.log('remove:' + mail);
            });
            mailListener.start();
            assert.equal(-1, [1,2,3].indexOf(5));
            assert.equal(-1, [1,2,3].indexOf(0));
        });
    })
})
