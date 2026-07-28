// main.jsx — Scripts Launcher (ExtendScript host)
// Lists, launches, reorders, and hides installed scripts/panels for the CEP panel.
// Author: Bruno Quintin
// Version: 1.1
//
// This extension is "Vibe Coded" and provided without warranty; the user
// therefore assumes full responsibility for its implementation.

var brunoScriptLauncher = (function () {

    var SETTINGS_SECTION = "ScriptsLauncher";
    var KEY_HIDDEN = "hidden-";
    var KEY_ORDER = "scripts-order";

    function getAEVersionShort() {
        var m = app.version.match(/^\d+\.\d+/);
        return m ? m[0] : app.version;
    }

    function getScriptFolders(subPath) {
        var v = getAEVersionShort();
        var isMac = ($.os.toLowerCase().indexOf("mac") !== -1);
        var appBase, userBase;
        if (isMac) {
            appBase  = Folder.appPackage.parent.fsName + "/Scripts" + subPath;
            userBase = Folder.userData.parent.fsName + "/Preferences/Adobe/After Effects/" + v + "/Scripts" + subPath;
        } else {
            appBase  = Folder.appPackage.fsName + "/Scripts" + subPath;
            userBase = Folder.userData.fsName + "/Adobe/After Effects/" + v + "/Scripts" + subPath;
        }
        var result = [];
        var appFolder  = new Folder(appBase);
        var userFolder = new Folder(userBase);
        if (appFolder.exists)  result.push(appFolder);
        if (userFolder.exists) result.push(userFolder);
        return result;
    }

    function getOrderedScripts() {
        var allKnown = {};

        // ScriptUI dockable panels
        var panelFolders = getScriptFolders("/ScriptUI Panels");
        for (var pf = 0; pf < panelFolders.length; pf++) {
            if (!panelFolders[pf].exists) continue;
            var pFiles = panelFolders[pf].getFiles(/\.(jsx|jsxbin)$/i) || [];
            for (var pi = 0; pi < pFiles.length; pi++) {
                var pName = pFiles[pi].name.replace(/%20/g, " ");
                var pId = "panel:" + pName.toLowerCase();
                if (!allKnown[pId]) {
                    allKnown[pId] = { id: pId, name: pName, fullPath: "", type: "panel" };
                }
            }
        }

        // Non-UI scripts (Scripts folder root, no subfolders)
        var rootFolders = getScriptFolders("");
        for (var rf = 0; rf < rootFolders.length; rf++) {
            if (!rootFolders[rf].exists) continue;
            var rFiles = rootFolders[rf].getFiles(/\.(jsx|jsxbin)$/i) || [];
            for (var ri = 0; ri < rFiles.length; ri++) {
                var rName = rFiles[ri].name.replace(/%20/g, " ");
                var rId = "script:" + rName.toLowerCase();
                if (!allKnown[rId]) {
                    var rPath = rFiles[ri].fsName.replace(/\\/g, "/");
                    allKnown[rId] = { id: rId, name: rName, fullPath: rPath, type: "script" };
                }
            }
        }

        // Restore saved order (migration: token without ":" → panel:)
        var savedStr = app.settings.haveSetting(SETTINGS_SECTION, KEY_ORDER)
            ? app.settings.getSetting(SETTINGS_SECTION, KEY_ORDER) : "";
        var rawParts = savedStr === "" ? [] : savedStr.split("|");
        var orderedIds = [];
        for (var oi = 0; oi < rawParts.length; oi++) {
            var tok = rawParts[oi].replace(/%7C/g, "|");
            if (tok.indexOf(":") === -1) tok = "panel:" + tok;
            orderedIds.push(tok.toLowerCase());
        }

        var finalOrder = [];
        var seen = {};
        for (var fi = 0; fi < orderedIds.length; fi++) {
            var oid = orderedIds[fi];
            if (allKnown[oid] && !seen[oid]) {
                finalOrder.push(allKnown[oid]);
                seen[oid] = true;
            }
        }

        var newItems = [];
        for (var key in allKnown) {
            if (!seen[key]) newItems.push(allKnown[key]);
        }
        newItems.sort(function(a, b) {
            var la = a.name.toLowerCase(), lb = b.name.toLowerCase();
            return la < lb ? -1 : la > lb ? 1 : 0;
        });

        return finalOrder.concat(newItems);
    }

    function isHidden(scriptId) {
        var key = KEY_HIDDEN + scriptId;
        return app.settings.haveSetting(SETTINGS_SECTION, key)
            ? (app.settings.getSetting(SETTINGS_SECTION, key) === "true")
            : false;
    }

    var obj = {};

    obj.getOrderedScriptsJSON = function () {
        var allScripts = getOrderedScripts();
        var jsonParts = [];

        for (var i = 0; i < allScripts.length; i++) {
            var s = allScripts[i];
            var safeId          = s.id.replace(/"/g, '\\"');
            var safeName        = s.name.replace(/"/g, '\\"');
            var safePath        = s.fullPath.replace(/"/g, '\\"');
            var safeDisplayName = s.name.replace(/\.(jsx|jsxbin)$/i, "").replace(/"/g, '\\"');

            var item = '{"id":"' + safeId + '"' +
                ',"file":"' + safeName + '"' +
                ',"fullPath":"' + safePath + '"' +
                ',"type":"' + s.type + '"' +
                ',"displayName":"' + safeDisplayName + '"' +
                ',"hidden":' + isHidden(s.id) + '}';
            jsonParts.push(item);
        }
        return "[" + jsonParts.join(",") + "]";
    };

    obj.updateFullOrder = function (newOrderStr) {
        app.settings.saveSetting(SETTINGS_SECTION, KEY_ORDER, newOrderStr);
    };

    obj.runAETask = function (fileName) {
        var id = app.findMenuCommandId(fileName);
        if (id !== 0) {
            app.executeCommand(id);
        } else {
            alert("Script not found: " + fileName);
        }
    };

    obj.runScript = function (fullPath) {
        var f = new File(fullPath);
        if (f.exists) {
            $.evalFile(f);
        } else {
            alert("File not found: " + fullPath);
        }
    };

    obj.setScriptHidden = function (scriptId, shouldHide) {
        var key = KEY_HIDDEN + scriptId;
        app.settings.saveSetting(SETTINGS_SECTION, key, shouldHide ? "true" : "false");
    };

    obj.resetAllPreferences = function () {
        // Clear saved order so scripts revert to default alphabetical ordering
        app.settings.saveSetting(SETTINGS_SECTION, KEY_ORDER, "");

        // Set every known script's hidden state to false
        var allScripts = getOrderedScripts();
        for (var i = 0; i < allScripts.length; i++) {
            var key = KEY_HIDDEN + allScripts[i].id;
            app.settings.saveSetting(SETTINGS_SECTION, key, "false");
        }
    };

    return obj;

})();
