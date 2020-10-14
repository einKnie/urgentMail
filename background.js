//
// changelog
// v1.0
//  - base implementation, inbox of all accounts is monitored per default
//  - other folders can be enabled/disabled via the options page
//  - on newmail event, window is set to draw attention
//
// TODO: - on init: if new accounts/folders found -> add to settings

(function() {

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
    browser.storage.onChanged.addListener(onSettingsChanged);
    browser.messages.onNewMailReceived.addListener((folder, msgList) => onNewMailReceivedHdl(folder, msgList));
  }, onError);

  // ---

  /*
  * Initialize settings
  */
  function initSettings() {
    browser.storage.local.get(["accounts"])
    .then(function(pref) {
      logDebug("got local prefs:");
      logDebug(pref);
      var newPrefs = {
        accounts: useraccounts
      };

      if (pref.accounts == undefined) {
        logDebug("no previous settings found");
        // newPrefs.accounts = useraccounts;
      } else if (settingsLenChange(pref.accounts, useraccounts) == 1) {
        logDebug("updating");
        let update = updateSettings(pref.accounts, useraccounts);
        update.then(function(newaccs) {
          logDebug("new accounts:");
          logDebug(newaccs);
          newPrefs.accounts = newaccs;
          // browser.storage.local.set(newPrefs);
        });
      } else {
        logDebug("no changes detected");
        logDebug("local prefs:");
        logDebug(pref);
      }

      logDebug("new settings:");
      logDebug(newPrefs.accounts);
      useraccounts = newPrefs.accounts;
      browser.storage.local.set(newPrefs);
    }, onError);
  }

  function settingsLenChange(olds, news) {
    logDebug("checking if settings differ in length");
    if (olds.length != news.length) {
      return 1;
    }

    for (let i = 0; i < olds.length; i++) {
      if (olds[i].folders.length != news[i].folders.length) {
        return 1;
      }
    }

    return 0;
  }

  // this is the most disgusting abomination humanity has ever seen
  function updateSettings(oldSet, newSet) {
    logDebug("updating settings");
    return new Promise((resolve) => {
      var updated = oldSet;

      // loop through accounts and folders
      // and update accordingly

      if (oldSet.length > newSet.length) {
        // account removed: find and remove
        logDebug("an account was removed");
        for (let i = 0; i < oldSet.length; i++) {
          if (newSet.find(el => el.id.accountId == oldSet[i].id.accountId) == undefined) {
            // account oldSet[i] is not in newSet
            logDebug("removing account " + oldSet[i].id.name);
            updated.splice(i, 1);
          }
        }
      } else if (oldSet.length < newSet.length) {
        // account added: find and add
        logDebug("an account was added");
        for (let i = 0; i < newSet.length; i++) {
          if (oldSet.find(el => el.id.accountId == newSet[i].id.accountId) == undefined) {
            // account newSet[i] is not in oldSet
            logDebug("adding account " + newSet[i].id.name);
            updated.push(newSet[i]);
          }
        }
      } else {
        // folders changed. find out which and update
        logDebug("change in folders detected");
        for (let i = 0; i < newSet.length; i++) {
          if (oldSet[i].folders.length == newSet[i].folders.length) {
            continue;
          }
          // check which folders to add/remove
          logDebug("in account " + oldSet[i].id.name);
          if (oldSet[i].folders.length > newSet[i].folders.length) {
            // folder removed: find and remove
            logDebug("folder was removed");
            for (let j = 0; i < oldSet[i].folders.length; j++) {
              let idx = newSet[i].folders.indexOf(oldSet[i].folders[j]);
              if (idx == -1) {
                // folder oldSet[i].folders[j] is not in newSet : remove
                updated[i].folders.remove(j, 1);
                idx = oldSet[i].monitored.indexOf(oldSet[i].folders[j].path);
                if (idx != -1) {
                  // remove from monitored
                  updated[i].monitored.splice(idx, 1);
                }
              }
            }
          } else {
            // folder added: find and add
            logDebug("folder was added");
            for (let j = 0; i < newSet[i].folders.length; j++) {
              let idx = oldSet[i].folders.indexOf(newSet[i].folders[j]);
              if (idx == -1) {
                // folder newSet[i].folders[j] is not in oldSet: add
                updated[i].folders.push(newSet[i].folders[j]);
                if (newSet[i].monitored.includes(newSet[i].folders[j].path)) {
                  // add to monitored
                  updated[i].monitored.push(newSet[i].folders[j].path);
                }
              }
            }
          }
        }
      }

      resolve(updated);
    });
  }

  /*
   * Handler for changed settings
   */
  function onSettingsChanged() {
    logDebug("settings changed!");
    browser.storage.local.get(["accounts"])
    .then(function(pref) {
      useraccounts = pref.accounts;
    }, onError);
  }

  /*
  * Initialize urgentMail
  */
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
            logDebug(`adding folder ${fol.name} to account ${a.name}`);
            accountObj.folders.push(fol);
            if (fol.type == "inbox") {
              accountObj.monitored.push(fol.path);
            }
          }

          useraccounts.push(accountObj);
        }
        resolve("success");
      }, onError);
    });
  }

  /*
  * Handler for new mail
  */
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

  /*
  * Set window to draw attention
  */
  function notify() {
    browser.windows.getLastFocused({ populate: false }).then(win => {
      browser.windows.update(win.id, {drawAttention: true});
    });
  }

  function onError(e) {
    log('error: ' + e);
  }

})();
