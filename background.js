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
  .then(storeSettings, onError)
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
  * Initialize  or update settings
  */
  function initSettings() {
    return new Promise((resolve) => {
      browser.storage.local.get(["accounts"])
      .then(function(pref) {
        logDebug("old settings:");
        logDebug(JSON.stringify(pref.accounts));

        var newPrefs = {
          accounts: useraccounts
        };
        logDebug("new accounts:");
        logDebug(JSON.stringify(newPrefs.accounts));

        if (pref.accounts == undefined) {
          logDebug("no previous settings found");
        } else if (settingsDiffer(pref.accounts, useraccounts) == 0) {
          logDebug("no changes detected");
          // set accounts from storage b/c those have the monitored folders set
          newPrefs.accounts = pref.accounts;
        } else {
          let update = updateSettings(pref.accounts, useraccounts);
          update.then(function(newaccs) {
            newPrefs.accounts = newaccs;
            resolve(newPrefs);
          });
        }
        resolve(newPrefs);
      }, onError);
    });
  }

  /*
   * Store new settings
   */
  function storeSettings(prefs) {
    return new Promise((resolve) => {
      logDebug("active settings:");
      logDebug(prefs.accounts);
      useraccounts = prefs.accounts;
      browser.storage.local.set(prefs)
        .then( function() { resolve("yay"); });
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
        logDebug("updating accounts");
        updated = updateAccounts(oldSet, newSet, updated);
      }

      // use account and folder structure from new settings && monitored folders from old
      // but need to remove any monitored folders that don't exist anymore
      for (let i = 0; i < updated.length; i++) {
        // for each account
        if (foldersDiffer(oldSet[i].folders, newSet[i].folders) == 1) {
          logDebug(`folders differ in ${updated[i].id.accountId}`);
          updateFolders(oldSet[i].folders, newSet[i].folders, updated[i]);
          updated[i].folders = newSet[i].folders;
        }
      }

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
   * Update folders of a single account
   */
  function updateFolders(oldfol, newfol, acc) {
    // todo: deal w/ toplevel folder change
    for (let i = 0; i < oldfol.length; i++) {
      logDebug(`updating folder ${oldfol[i].name}`);
      updateSubfolders(oldfol[i], newfol[i], acc);
    }
  }

  /*
   * Check if any folders are not in both sets
   * and update 'updated' set.
   * (this is basically for cleanup: remove stale monitored folders)
   */
  function updateSubfolders(oldfol, newfol, acc) {
    logDebug(`comparing ${oldfol.name} with ${newfol.name} of ${acc.id.accountId}`);

    if (oldfol.subFolders.length == newfol.subFolders.length) {
      // traverse deeper
      logDebug("no changes");
      for (let i = 0; i < oldfol.subFolders.length; i++) {
        updateSubfolders(oldfol.subFolders[i], newfol.subFolders[i], acc);
      }
    } else if (oldfol.subFolders.length > newfol.subFolders.length) {
      // subfolder was removed
      logDebug("subfolder was removed");

      for (let i = 0; i < oldfol.subFolders.length; i++) {
        let idx = newfol.subFolders.indexOf(oldfol.subFolders[i]);
        if (idx == -1) {
          // folder is not in newSet : remove
          idx = acc.monitored.indexOf(oldfol.subFolders[i].path);
          if (idx != -1) {
            // remove from monitored
            acc.monitored.splice(idx, 1);
          }
        }
      }
    } else {
      logDebug("folder was added");
    }
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
