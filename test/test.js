var assert = require("assert");
var Notifier = require("../");
var Imap = require('imap');
var hoodiecrow = require("hoodiecrow-imap");

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
const BOX = "[Gmail]/Starred";

var imapOptions = {
    user: "testuser",
    password: "testpass",
    host: "localhost",
    port: PORT,
    tls: false
};

var notifyImapOptions = JSON.parse(JSON.stringify(imapOptions));
notifyImapOptions.box = BOX;
notifyImapOptions.search = ['ALL'];
notifyImapOptions.markSeen = false;

describe('Notifier Basics', function() {
    var server, mailListener;

    beforeEach(function(done){
        server = hoodiecrow(hoodiecrowOptions);
        server.listen(PORT);
        done();
    });

    afterEach(function(done) {
        server.close(done);
    });

    describe('#start() and stop()', function(){
        it('should start and gracefully stop server', function(done){
            mailListener = new Notifier(notifyImapOptions);
            mailListener.start(function() {
                mailListener.stop(function(){
                    assert(true);
                    done();
                });
            });
        });
    });
});

describe('Notifier Events', function() {
    var server, imapClient, mailListener;

    beforeEach(function(done){
        imapClient = new Imap(imapOptions);
        mailListener = new Notifier(notifyImapOptions);
        mailListener.on('error', console.error);
        server = hoodiecrow(hoodiecrowOptions);
        server.listen(PORT);
        imapClient.once("ready", done);
        imapClient.connect();
    });

    afterEach(function(done) {
        mailListener.stop(function(){
            imapClient.once('end', function() {
                server.close(done);
            });
            imapClient.end();
        });
    });

    describe('#emit(mail)', function(){
        it('should emit mail event when new mail has been flagged', function(done){
            mailListener.on("mail", function(mail) {
                assert("new starred mail", mail.headers.subject);
                done();
            });
            mailListener.start(function(){
                imapClient.append("From: sender <sender@example.com>\r\nTo: receiver@example.com\r\nSubject: new starred mail", {mailbox: BOX, flags: ['Flagged']}, function(err, uid) {
                });
            });
        });
    });

    describe('#emit(deletedMail)', function(){
        it('should emit deletedMail event when mail has been unflagged', function(done){
            mailListener.on("deletedMail", function(mail) {
                assert("new starred mail2", mail.headers.subject);
                done();
            });
            mailListener.start(function(){
                imapClient.openBox(BOX, false, function(err, box){
                    imapClient.append("From: sender <sender@example.com>\r\nTo: receiver@example.com\r\nSubject: new starred mail2", {flags: ['Flagged']}, function(err, uid) {
                        imapClient.search(['ALL', ['SUBJECT', "new starred mail2"]], function(err, results){
                            imapClient.setFlags(results, ['Deleted'], function(err){
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
});
