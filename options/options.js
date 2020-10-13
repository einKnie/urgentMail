// options script
(function() {

var vd_description = "Select folders to monitor for new mail";
var vd_version = "v0.0";

// add listsners.
// need three listeners instead of one, because i don't want the button inside the form.
// need to manually 'disalke' the default action of form-submit -> reloads page, which is unnecessary.
document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("applybutton").addEventListener("click", saveOptions);
document.querySelector("form").addEventListener('submit', function(e) {e.preventDefault();});

getVersion();

/*
* Helper to store new settings
*/
function fetchSettings(result) {
  return new Promise((resolve,reject) => {
    console.log(result);
    var newprefs = result.accounts; // local storage
    try {
      for (a of newprefs) {
         // for each account
         console.log(a);
         for (folder of a.folders) {
            // for each folder
            let chkbox = document.getElementById(`${a.id.accountId}/${folder.path}`);
            if (chkbox.checked) {
              // check if folder in monitored and add
              if (!a.monitored.includes(folder.path)) {
                a.monitored.push(folder.path);
              }
            } else {
              // check if folder in monitores, and remove
              if (a.monitored.includes(folder.path)) {
                for (let i = 0; i < a.monitored.length; i++) {
                  if (a.monitored[i] == folder.path) {
                    a.monitored.splice(i, 1);
                  }
                }
              }
            }
          }
        }
    } catch(e) {
      reject(`error fetching values: ${e}`);
   }
   resolve(newprefs);
 });
}

/*
* Get current addon version from manifest.json
*/
function getVersion() {
 var man = browser.runtime.getManifest();
 if (man.hasOwnProperty("version")) {
   vd_version = `v${man.version}`;
 }
}

/*
* Store options from settings page
*/
function saveOptions(e) {
 e.preventDefault();

 var newSites = browser.storage.local.get(["accounts"]);
 newSites.then(fetchSettings, onError).then(function(result) {
   console.log("storing data");
     return new Promise((resolve, reject) => {
       var newprefs = {
         accounts: result.accounts
       };
       console.log(newprefs.accounts);
       browser.storage.local.set(newprefs)
        .then(function(){resolve("yay");}, function(){reject("Failed to store data");});});
   }, onError);
}

/*
* Apply current options to settings page
*/
function restoreOptions() {

 function setupSettingsPage(result) {
   var accs = document.getElementById("accounts");
   console.log(accs);
   console.log(result);
   for (a of result.accounts) {
      console.log(a);
      if (accs.querySelector(`div[id="${a.id.accountId}"]`) != null) {
       // just update value in case the checkbox already exists
       console.log("TODO: update values if html stuff exists");

       var account = document.getElementById(`${a.id.accountId}`);
       console.log(account);
       var content = document.getElementById(`${a.id.accountId}/con`);
       console.log(content);

       for (folder of a.folders) {
         var chkbox = document.getElementById(`${a.id.accountId}/${folder.path}`);
         if (chkbox == null) {
           // new folder? create (TODO: make function out of this)
           console.log("creating new folder")
           var innerdiv = document.createElement("div");
           var chkbox = document.createElement("input");
           chkbox.type = "checkbox";
           chkbox.id = `${a.id.accountId}/${fol.path}`;
           chkbox.checked = (a.monitored.includes(fol.path));
           var label = document.createElement("label");
           label.htmlFor = chkbox;
           label.appendChild(document.createTextNode(`Monitor ${fol.name}`));
           innerdiv.appendChild(chkbox);
           innerdiv.appendChild(label);
           content.appendChild(innerdiv);
         } else {
           if (a.monitored.includes(folder.path)) {
             chkbox.checked = true;
           } else {
             chkbox.checked = false;
           }
         }
       }

       console.log(a);
      } else {
       // add accounts
       var elem = document.createElement("div");
       elem.id = a.id.accountId;
       var button = document.createElement("button");
       console.log(button);
       button.id = `${a.id.accountId}/btn`;
       button.classname = "collapsible";
       button.innerHTML = a.id.name;
       button.addEventListener("click", onButtonToggle);
       var content = document.createElement("div");
       content.classname = "content";
       content.id = `${a.id.accountId}/con`;
       content.style.display = "none";

       for (fol of a.folders) {
         var innerdiv = document.createElement("div");
         var chkbox = document.createElement("input");
         chkbox.type = "checkbox";
         chkbox.id = `${a.id.accountId}/${fol.path}`;
         chkbox.checked = (a.monitored.includes(fol.path));
         var label = document.createElement("label");
         label.htmlFor = chkbox.id;
         label.appendChild(document.createTextNode(`Monitor ${fol.name}`));
         innerdiv.appendChild(chkbox);
         innerdiv.appendChild(label);
         content.appendChild(innerdiv);
       }

       elem.appendChild(button);
       elem.appendChild(content);
       accs.appendChild(elem);
      }
    }

   document.getElementById("apptext").textContent    = vd_description;
   document.getElementById("appversion").textContent = vd_version;
 }

 browser.storage.local.get(["accounts"])
  .then(setupSettingsPage, onError);
}

function onButtonToggle(e) {
  // console.log(e);
  let content = e.target.nextElementSibling;
  if (content.style.display === "block") {
    content.style.display = "none";
  } else {
    content.style.display = "block";
  }
}

function onError(error) {
 console.log(`Error: ${error}`);
}

})();
