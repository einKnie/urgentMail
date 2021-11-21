// options script
(function() {

  var um_description = "Select folders to monitor for new mail";
  var um_version = "v0.0";

  const DEBUG = false;
  var logDebug;
  if (DEBUG) {
    logDebug = console.log;
  } else {
    logDebug = function () { };
  }

  // add listeners.
  // need to manually 'disable' the default action of form-submit -> reloads page, which is unnecessary.
  document.addEventListener("DOMContentLoaded", restoreOptions);
  document.querySelector("form").addEventListener('submit', function(e) {e.preventDefault();});

  getVersion();

  /*
  * Helper to store new settings
  * takes stored settings as argument,
  * updates local settings from settings page,
  * then returns promise for updated settings
  */
  function fetchSettings(result) {
    logDebug("in fetchSettings");
    return new Promise((resolve, reject) => {
      logDebug(result);
      var newPrefs = result; // local storage
      try {
        for (a of newPrefs.accounts) {
          logDebug("checking account: ");
          logDebug(a);
          checkAccount(a);
        }
      } catch(e) {
        reject(`error fetching settings: ${e}`);
      }
      resolve(newPrefs);
    });
  }

  function checkAccount(a) {
    a.monitored = [];
    for (let folder of a.folders) {
      checkFolder(a, folder);
    }
  }

  /*
  * Recursively check all folder- and subfolder checkboxes
  * by calling checkChkbox for each
  * note: thunderbird currently only supports two levels of subfolders,
  * but this is futureproof
  */
  function checkFolder(a, folder) {
    //logDebug(`Checking ${folder.path}`);
    if (checkChkbox(a, folder)) {
      a.monitored.push(folder.path);
    }

    for(let f of folder.subFolders) {
      checkFolder(a, f)
    }
  }

  /*
  * Check if the checkbox for the given folder is checked
  * and update account a accordingly
  */
  function checkChkbox(a, folder) {
    let chkbox = document.getElementById(`${a.id.accountId}${folder.path}`);
    return (chkbox.checked && !chkbox.undetermined);
  }

  /*
  * Get current addon version from manifest.json
  */
  function getVersion() {
    var man = browser.runtime.getManifest();
    if (man.hasOwnProperty("version")) {
      um_version = `v${man.version}`;
    }
  }

  /*
  * Store options from settings page
  */
  function saveOptions() {
    var oldPrefs = browser.storage.local.get(["accounts"]);
    oldPrefs.then(fetchSettings, onError).then(function(result) {
      logDebug("storing new data");
      return new Promise((resolve, reject) => {
        logDebug(result);
        var newPrefs = {
          accounts: result.accounts
        };
        logDebug(newPrefs);
        browser.storage.local.set(newPrefs)
          .then(function() { setSavedText(true); resolve("yay"); },
                function() { reject("Failed to store data"); });});
      }, onError);
    }

    /*
     * toggle the display of as "Saved" info text
     */
    function setSavedText(on) {
      var text = document.getElementById("saved_text");
      if (text == null) {
        onError("Did not find saved text element");
        return;
      }
      if (on && (text.style.display != "block")) {
        text.style.display = "block";
        document.defaultView.setTimeout(setSavedText, 1000, false);
      } else if (!on) {
        text.style.display = "none";
      }
    }

    /*
    * Apply current options to settings page
    */
    function restoreOptions() {
      function setupSettingsPage(result) {
        var accs = document.getElementById("accounts");
        if (accs == null) {
          onError("failed to get accout container from html");
          return;
        }

        for (a of result.accounts) {
          logDebug("setup account html: ");
          logDebug(a);

          if (document.getElementById(`${a.id.accountId}/con`) != null) {
            // just update values in case the checkbox already exists
            // .. does this ever actually happen?
            logDebug("updating existing html");

            var content = document.getElementById(`${a.id.accountId}/con`);
            logDebug(content);

            for (folder of a.folders) {
              var chkbox = document.getElementById(`${a.id.accountId}${folder.path}`);
              if (chkbox == null) {
                content.appendChild(createCheckbox(a, folder));
                chkbox = document.getElementById(`${a.id.accountId}${folder.path}`);
              }

              if (a.monitored.includes(folder.path)) {
                chkbox.checked = true;
              } else {
                chkbox.checked = false;
              }
            }
          } else {
            // add account
            var account = document.createElement("div");
            account.id  = a.id.accountId;

            var accChkbox = document.createElement("input");
            accChkbox.type = "checkbox";
            accChkbox.id = `${a.id.accountId}/chk`;
            accChkbox.checked = false;
            accChkbox.addEventListener('change', onAccountCheckboxToggle);

            var button = document.createElement("button");
            button.id         = `${a.id.accountId}/btn`;
            button.classname  = "collapsible";
            button.innerHTML  = a.id.name;
            button.addEventListener("click", onButtonToggle);

            var content = document.createElement("div");
            content.classname = "content";
            content.id        = `${a.id.accountId}/con`;
            content.style.display = "none";
            appendFolderCheckboxes(a, a.folders, content);

            account.appendChild(accChkbox);
            account.appendChild(button);
            account.appendChild(content);
            accs.appendChild(account);

            updateTopBox(a.id.accountId);
          }
        }

        document.getElementById("apptext").textContent    = um_description;
        document.getElementById("appversion").textContent = um_version;
      }

      browser.storage.local.get(["accounts"])
      .then(setupSettingsPage, onError);
    }

    /*
     * create checkboxes for all folders and subfolders of an account
     * and add to parent element
     */
    function appendFolderCheckboxes(a, folders, parent) {
      for (let folder of folders) {
        var chkbox = createCheckbox(a, folder);
        appendFolderCheckboxes(a, folder.subFolders, chkbox);
        parent.appendChild(chkbox);
      }
    }

    /*
     * Create a checkbox on the settings page
     */
    function createCheckbox(a, fol, parent = null) {
      var innerdiv = document.createElement("div");
      innerdiv.id = "chkboxcontainer";
      var chkbox = document.createElement("input");
      chkbox.type = "checkbox";
      chkbox.id = `${a.id.accountId}${fol.path}`;
      chkbox.checked = (a.monitored.includes(fol.path));

      var label = document.createElement("label");
      label.htmlFor = chkbox.id;
      label.appendChild(document.createTextNode(`Monitor ${fol.name}`));

      chkbox.addEventListener('change', onCheckboxToggle);

      innerdiv.appendChild(chkbox);
      innerdiv.appendChild(label);
      return innerdiv;
    }

    /*
     * Update an account's topbox state depending on folder checkboxes
     */
    function updateTopBox(a) {
      var topbox = document.getElementById(`${a}/chk`);
      if (topbox == null) {
        console.error(`failed to find toplevel checkbox for account ${a}`);
      } else {
        let state = queryChkboxState(a);
        switch(state) {
          case 0:
            topbox.indeterminate = false;
            topbox.checked = false;
            break;
          case 1:
            topbox.indeterminate = false;
            topbox.checked = true;
            break;
          case 2:
            topbox.indeterminate = true;
            break;
          default: console.error(`indeterminate state of checkboxes for account ${a}`); break;
        }
      }
    }

    /*
     * Fetch current state of folder checkboxes for an account
     */
    function queryChkboxState(a) {
      logDebug(`checking checkbox state for account ${a}`);
      var boxes = document.getElementById(`${a}/con`).querySelectorAll('input[type=checkbox]');
      var checked_boxes = document.getElementById(`${a}/con`).querySelectorAll('input[type=checkbox]:checked');

      logDebug(boxes);
      logDebug(checked_boxes);

      if (checked_boxes.length == 0) return 0;
      if (checked_boxes.length == boxes.length) return 1;
      else return 2;
    }

    /*
     * handler for expand button
     */
    function onButtonToggle(e) {
      let content = e.target.nextElementSibling;
      if (content.style.display === "block") {
        content.style.display = "none";
      } else {
        content.style.display = "block";
      }
    }

    /*
     * handler for checkbox changed
     */
    function onCheckboxToggle(e) {
      let split = e.target.id.split(/\//).filter(e => e);
      let account = split[0];
      let folder = split[1];
      logDebug(`checkbox was clicked! (${account} - ${folder})`);
      updateTopBox(account);      
      saveOptions();
    }

     /*
     * handler for toplevel checkbox changed
     * set all child-checkboxes to the new value
     */
     function onAccountCheckboxToggle(e) {
      let split = e.target.id.split(/\//).filter(e => e);
      let account = split[0];
      logDebug(`account checkbox was clicked! (${account})`);
      // now toggle all folder checkboxes of this account
      var content = document.getElementById(`${account}/con`);
      const boxes = content.querySelectorAll('input');
      for (let box of boxes) {
        logDebug(`Toggle box ${box.id}`);
        box.checked = e.target.checked;
      }

      saveOptions();
    }

    function onError(error) {
      console.log(`Error: ${error}`);
    }

  })();
