//
// changelog
// v1.0
//  - base implementation, inbox of all accounts is monitored
//  - on newmail event, window is set to draw attention
//
// todo
//  - setting page that is populated from useraccounts
//  - option to enable/disable accouts and single folders within accounts

const DEBUG = true;
var log = console.log;
var logDebug;
if (DEBUG) {
  logDebug = console.log;
} else {
  logDebug = function () { };
}

var useraccounts = [];

init()
  .then(initSettings, onError)
  .then(function start() {
    log("urgentMail initialized");
    logDebug(useraccounts);
    browser.messages.onNewMailReceived.addListener((folder, msgList) => onNewMailReceivedHdl(folder, msgList));
  }, onError);

function onError(e) {
  log('error: ' + e);
}

function initSettings() {
  browser.storage.local.get(["accounts"])
    .then(function(pref) {
      var newPrefs = {
        accounts: pref.accounts || useraccounts
      };
      logDebug(newPrefs.accounts);
      useraccounts = newPrefs.accounts;
      browser.storage.local.set(newPrefs);
    }, onError);
}

function init() {
  return new Promise((resolve) => {
    browser.accounts.list()
      .then(function(acc) {
        for (a of acc) {
          logDebug (a);
          if (a.type == "none") continue;

          let accountObj = {
            id: {
                  accountId: null,
                  name:      null
            },
            folders: [],
            monitored: []
          };

          accountObj.id.accountId = a.id;
          accountObj.id.name      = a.name;

          for (fol of a.folders) {
            accountObj.folders.push(fol);
            if (fol.type == "inbox") {
              accountObj.monitored.push(fol.path);
              break;
            }
          }

          useraccounts.push(accountObj);
        }
        resolve("success");
      }, onError);
    });
}

function onNewMailReceivedHdl(folder, msglist) {
  logDebug("mail received event");
  acc = folder.accountId;
  fol = folder.type;

  for (acc of useraccounts) {
    if (acc.id.accountId != folder.accountId) continue;

    logDebug("for " + acc.id.name + " in folder " + folder.name);
    if (acc.monitored.includes(folder.path)) {
      log("Hey " + acc.id.name + "! You got mail!");
      notify();
    }
  }
}

function notify() {
  browser.windows.getLastFocused({ populate: false }).then(win => {
    browser.windows.update(win.id, {drawAttention: true});
  });
}
