//
// changelog
// v1.0
//  - base implementation, inbox of all accounts is monitored per default
//  - other folders can be enabled/disabled via the options page
//  - on newmail event, window is set to draw attention
// v1.2
//  - settings are automatically saved as they are changed

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
    browser.messages.onNewMailReceived.addListener((folder, msgList) => onNewMailReceived(folder, msgList));
  }, onError);

  // ---

  /*
  * Initialize urgentMail
  * populate settings with currently existing accounts/folders
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
            accountObj.folders.push(fol);

            // set default monitoring of inbox
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
  * Initialize settings
  * also update loacal storage if setting structure changed
  */
  function initSettings() {
    return new Promise((resolve) => {
      browser.storage.local.get(["accounts"])
      .then(function(pref) {

        var newPrefs = {
          accounts: useraccounts
        };

        if (pref.accounts == undefined) {
          logDebug("no previous settings found");
        } else if (settingsDiffer(pref.accounts, useraccounts) == 0) {
          logDebug("no changes detected");
          // set accounts from storage b/c those have the monitored folders set
          newPrefs.accounts = pref.accounts;
        } else {
          let update = updateSettings(pref.accounts, useraccounts);
          update.then(function(newaccs) {
            logDebug("new accounts:");
            logDebug(newaccs);
            newPrefs.accounts = newaccs;
          });
        }

        logDebug("active settings:");
        logDebug(newPrefs.accounts);
        useraccounts = newPrefs.accounts;
        browser.storage.local.set(newPrefs)
          .then( function() { resolve("yay"); });
      }, onError);
    });
  }


  /*
   *  Check if number of accounts or folders differs
   */
  function settingsDiffer(olds, news) {
    logDebug("checking if settings differ in length");
    if (olds.length != news.length) {
      // number of accounts has changed
      return 1;
    }


    for (let i = 0; i < olds.length; i++) {
      // per account
      if (foldersDiffer(olds[i].folders, news[i].folders) == 1) {
        return 1;
      }
    }

    return 0;
  }

  /*
   *  Recursively check if any subfolders differ between oldfol and newfol
  */
  function foldersDiffer(oldfol, newfol) {

    if (oldfol.length != newfol.length) {
      return 1;
    }

    for (let i = 0; i < oldfol.length; i++) {
      if (foldersDiffer(oldfol[i].subFolders, newfol[i].subFolders) == 1) {
        return 1;
      }
    }

    return 0;
  }

  /*
   * Update the stored settings with new live data
   * i.e. if any accounts or folders were added/removed
   */
  function updateSettings(oldSet, newSet) {
    logDebug("updating settings");
    return new Promise((resolve) => {
      var updated = oldSet;

      if (oldSet.length != newSet.length) {
        updated = updateAccounts(oldSet, newSet, updated);
      }

      // update folders always, b/c we would need to loop though all
      // accs anyway to check if anything changed there
      updated = updateFolders(oldSet, newSet, updated);

      // resolve with the updated settings
      resolve(updated);
    });
  }

  /*
   * Check if any accounts are not in both sets
   * and update 'updated' set
   */
  function updateAccounts(oldSet, newSet, updated) {
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
    }
    return updated;
  }

  /*
   * Check if any folders are not in both sets
   * and update 'updated' set
   */
  function updateFolders(oldSet, newSet, updated) {
    for (let i = 0; i < newSet.length; i++) {

      if (oldSet[i].folders.length == newSet[i].folders.length) {
        continue;
      }

      // folders differ
      logDebug("in account " + oldSet[i].id.name);
      if (oldSet[i].folders.length > newSet[i].folders.length) {
        logDebug("folder was removed");

        for (let j = 0; j < oldSet[i].folders.length; j++) {
          let idx = newSet[i].folders.indexOf(oldSet[i].folders[j]);
          if (idx == -1) {
            // folder oldSet[i].folders[j] is not in newSet : remove
            updated[i].folders.splice(j, 1);

            idx = oldSet[i].monitored.indexOf(oldSet[i].folders[j].path);
            if (idx != -1) {
              // remove from monitored
              updated[i].monitored.splice(idx, 1);
            }
          }
        }
      } else {
        logDebug("folder was added");

        for (let j = 0; j < newSet[i].folders.length; j++) {
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
    return updated;
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
  * Handler for new mail
  */
  function onNewMailReceived(folder, msglist) {
    logDebug("mail received event");

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
