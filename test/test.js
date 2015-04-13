var assert = require("assert");
var Notifier = require("../");
var Imap = require('imap');
var hoodiecrow = require("hoodiecrow");

var specialFolders = {
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
};
var hoodiecrowOptions = {
    plugins: ["ID", "STARTTLS", "SASL-IR", "AUTH-PLAIN", "NAMESPACE", "IDLE", "ENABLE", "CONDSTORE", "XTOYBIRD", "LITERALPLUS", "UNSELECT", "SPECIAL-USE", "CREATE-SPECIAL-USE"], // "X-GM-EXT-1" currently not fully supported
    id: {
        name: "hoodiecrow",
        version: "0.1"
    },
    storage: {
        "INBOX": {
            messages: []
        },
        "": specialFolders
    },
    debug: false
};

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

describe('Notifier', function() {
    var server, imapClient, mailListener;

    beforeEach(function(done){
        imapClient = new Imap(imapOptions);
        mailListener = new Notifier(imapOptions);
        server = hoodiecrow(hoodiecrowOptions);
        server.listen(PORT, function() {
            imapClient.once("ready", done);
            imapClient.connect();
        });
    });

    afterEach(function(done) {
        mailListener.stop(function(){
            imapClient.end();
            server.close(done);
        });
    });

    describe('#emit(mail)', function(){
        it('should emit mail event when new mail has been flagged', function(done){
            mailListener.on("mail", function(mail) {
                assert("new starred mail", mail.headers.subject);
                done();
            });
            mailListener.start(function(){
                imapClient.append("From: sender <sender@example.com>\r\nTo: receiver@example.com\r\nSubject: new starred mail", {mailbox: "INBOX", flags: ['Flagged']}, function(err, uid) {
                });
            });
        });
    });

    describe('#emit(deletedMail)', function(){
        it('should emit deletedMail event when mail has been unflagged', function(done){
            var mailListener = new Notifier(imapOptions);
            mailListener.on("deletedMail", function(mail) {
                assert("new starred mail", mail.headers.subject);
                done();
            });
            mailListener.start(function(){
                imapClient.append("From: sender <sender@example.com>\r\nTo: receiver@example.com\r\nSubject: new starred mail", {mailbox: "INBOX", flags: ['Flagged']}, function(err, uid) {
                    imapClient.openBox("INBOX", false, function(err, box){
                        imapClient.search(['ALL', ['SUBJECT', "new starred mail"]], function(err, results){
                            imapClient.setFlags(results, ['Deleted'], function(err){
                                // imapClient.expunge(function(err){
                                //     if (err) {console.error(err);}
                                // });
                                imapClient.closeBox(true, function(err) {
                                    if (err) {console.error(err);}
                                });
                            });
                        });
                    });
                });
            });
        });
    });
})
