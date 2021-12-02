//
// changelog
// v1.0
//  - base implementation, inbox of all accounts is monitored per default
//  - other folders can be enabled/disabled via the options page
//  - on newmail event, window is set to draw attention
// v1.2
//  - settings are automatically saved as they are changed
// v1.4
//  - add account wide checkbox to select and deselect all folders at once
// v1.5
//  - major overhaul of the settings handling
// v1.6
//  - unlimitedStorage permission and hidden debug

(function() {

  var um_debug = false;
  var log = console.log;
  var logDebug;

  var useraccounts = [];
  setDebug(um_debug);

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
      browser.storage.local.get(["accounts","debug"])
      .then(function(pref) {
        if (pref.debug != undefined) {
          setDebug(pref.debug);
        }

        logDebug("old settings:");
        logDebug(JSON.stringify(pref.accounts));

        var newPrefs = {
          accounts: useraccounts,
          debug:    um_debug
        };

        logDebug("new accounts:");
        logDebug(JSON.stringify(newPrefs.accounts));

        if (pref.accounts == undefined) {
          logDebug("no previous settings found");
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
   * Check if a folder with given path exists in an account.
   * this traverses the folder structure from top to bottom
   * and stops if a folder in the hierarchy does not exist.
   */
  function folderExists(a, path) {
    var chunks = path.split(/\//).filter(e => e); /* split at '/' and remove empty chunks */
    logDebug(`folder path split into chunks: ${chunks}`);

    var i = 0;
    var path = `/${chunks[i]}`;
    var folders = a.folders;
    var found = false;

    while (!found) {
      logDebug(`testing ${path} in:`);
      logDebug(folders);

      let f = folders.find(el => el.path == path);
      logDebug(f);

      if (f == undefined) {
        // this chunk does not exist, no need to probe further
        logDebug("folder not found");
        break;
      }

      // so far all chunks have been found
      if (chunks[++i] == null) {
        // no more chunks; folder found
        logDebug("no more chunks");
        found = true;
      } else if (f.subFolders.length == 0) {
        // no more subfolders, but apparently more chunks
        logDebug("no more subfolders");
        break;
      } else {
        // traverse deeper
        path += `/${chunks[i]}`
        folders = f.subFolders;
      }
    }
    return found;
  }

  /*
   * update settings:
   * start with current account/folder structure,
   * then check for each monitored path in the old set
   * wether that path still exists in the new set: if yes -> add to new monitored
   */
  function updateSettings(oldSet, newSet) {
    logDebug("updating settings");
    return new Promise((resolve) => {

      var updated = newSet;
      for (let acc of updated) {
        logDebug(`Updating account ${acc.id.accountId}`);

        var old = oldSet.find(el => el.id.accountId == acc.id.accountId);
        if (old == undefined) {
          // account is not in old set, no settings to transfer
        } else {
          // reset defaults since we only want to apply existing settings
          acc.monitored = [];

          // for each monitored path in old, check if this folder exists in account
          for (let folder of old.monitored) {
            if (folderExists(acc, folder)) {
              logDebug(`monitored folder ${folder} exists. keep monitoring`);
              acc.monitored.push(folder);
            } else {
              logDebug(`monitored folder ${folder} does not exist anymore`);
            }
          }
        }
      }

      // resolve with the updated settings
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
    console.error(e);
  }

  function setDebug(debug) {
    um_debug = debug;
    if (um_debug == true) {
      logDebug = console.debug;
    } else {
      logDebug = function () { };
    }
  }

})();
