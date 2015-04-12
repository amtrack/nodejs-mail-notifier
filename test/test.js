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
            messages: []
            // {
            //     raw: "Subject: existing mail 1",
            //     internaldate: "14-Sep-2013 21:22:28 -0300"
            // }, {
            //     raw: "Subject: existing mail 2\r\n\r\nFlagged",
            //     flags: ["\\Flagged"]
            // }]
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
    tls: false
};

var notifyImapOptions = {
    user: "testuser",
    password: "testpass",
    host: "localhost",
    port: PORT,
    box: "[Gmail]/Starred",
    tls: false,
    search: ['ALL'],
    markSeen: false
};

describe('Notifier', function(){
    var imapClient = new Imap(imapOptions);
    beforeEach(function(done){
        server.listen(PORT, function() {
            console.log("starting hoodiecrow");
            imapClient.once("ready", function(){
                console.log("imapClient connected");
                done();
            });
            imapClient.connect();
        });
    });
    describe('#emit(mail)', function(){
        it('should emit mail event when new mail has been flagged', function(done){
            var mailListener = new Notifier(imapOptions);
            mailListener.on("mail", function(mail) {
                console.log("foo");
                assert(true);
                done();
            });
            console.log("starting mailListener");
            mailListener.start(function(){
                console.log("mailListener started");
                console.log("appending message");
                imapClient.append("From: sender <sender@example.com>\r\nTo: receiver@example.com\r\nSubject: new starred mail", {mailbox: "INBOX", flags: ['Flagged']}, function() {
                    console.log("message appended");
                });
            });
        });
    })
})
