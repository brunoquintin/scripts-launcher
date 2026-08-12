// aeft.ts — Scripts Launcher (ExtendScript host, After Effects)
// Lists, launches, reorders, and hides installed scripts/panels for the CEP panel.
// Author: Bruno Quintin
// Version: 1.2
//
// This extension is "Vibe Coded" and provided without warranty; the user
// therefore assumes full responsibility for its implementation.

const SETTINGS_SECTION = "ScriptsLauncher";
const KEY_HIDDEN = "hidden-";
const KEY_ORDER = "scripts-order";

type ScriptType = "panel" | "script";

interface ScriptEntry {
  id: string;
  file: string;
  fullPath: string;
  type: ScriptType;
  displayName: string;
  hidden: boolean;
}

interface KnownEntry {
  id: string;
  name: string;
  fullPath: string;
  type: ScriptType;
}

const getAEVersionShort = (): string => {
  const m = app.version.match(/^\d+\.\d+/);
  return m ? m[0] : app.version;
};

const getScriptFolders = (subPath: string): Folder[] => {
  const v = getAEVersionShort();
  const isMac = $.os.toLowerCase().indexOf("mac") !== -1;
  let appBase: string, userBase: string;
  if (isMac) {
    appBase = Folder.appPackage.parent.fsName + "/Scripts" + subPath;
    userBase =
      Folder.userData.parent.fsName +
      "/Preferences/Adobe/After Effects/" +
      v +
      "/Scripts" +
      subPath;
  } else {
    appBase = Folder.appPackage.fsName + "/Scripts" + subPath;
    userBase =
      Folder.userData.fsName +
      "/Adobe/After Effects/" +
      v +
      "/Scripts" +
      subPath;
  }
  const result: Folder[] = [];
  const appFolder = new Folder(appBase);
  const userFolder = new Folder(userBase);
  if (appFolder.exists) result.push(appFolder);
  if (userFolder.exists) result.push(userFolder);
  return result;
};

const getOrderedScripts = (): KnownEntry[] => {
  const allKnown: { [id: string]: KnownEntry } = {};

  // ScriptUI dockable panels
  const panelFolders = getScriptFolders("/ScriptUI Panels");
  for (let pf = 0; pf < panelFolders.length; pf++) {
    const pFiles = (panelFolders[pf].getFiles(/\.(jsx|jsxbin)$/i) ||
      []) as File[];
    for (let pi = 0; pi < pFiles.length; pi++) {
      const pName = pFiles[pi].name.replace(/%20/g, " ");
      const pId = "panel:" + pName.toLowerCase();
      if (!allKnown[pId]) {
        allKnown[pId] = { id: pId, name: pName, fullPath: "", type: "panel" };
      }
    }
  }

  // Non-UI scripts (Scripts folder root, no subfolders)
  const rootFolders = getScriptFolders("");
  for (let rf = 0; rf < rootFolders.length; rf++) {
    const rFiles = (rootFolders[rf].getFiles(/\.(jsx|jsxbin)$/i) ||
      []) as File[];
    for (let ri = 0; ri < rFiles.length; ri++) {
      const rName = rFiles[ri].name.replace(/%20/g, " ");
      const rId = "script:" + rName.toLowerCase();
      if (!allKnown[rId]) {
        const rPath = rFiles[ri].fsName.replace(/\\/g, "/");
        allKnown[rId] = {
          id: rId,
          name: rName,
          fullPath: rPath,
          type: "script",
        };
      }
    }
  }

  // Restore saved order. Understands both the current JSON-array format and
  // the pipe-delimited format used before the Bolt CEP migration, so an
  // already-saved order isn't lost on upgrade.
  const savedStr = app.settings.haveSetting(SETTINGS_SECTION, KEY_ORDER)
    ? app.settings.getSetting(SETTINGS_SECTION, KEY_ORDER)
    : "";
  let orderedIds: string[] = [];
  if (savedStr.charAt(0) === "[") {
    try {
      orderedIds = JSON.parse(savedStr) as string[];
    } catch (e) {
      orderedIds = [];
    }
  } else if (savedStr !== "") {
    const rawParts = savedStr.split("|");
    for (let oi = 0; oi < rawParts.length; oi++) {
      let tok = rawParts[oi].replace(/%7C/g, "|");
      if (tok.indexOf(":") === -1) tok = "panel:" + tok;
      orderedIds.push(tok.toLowerCase());
    }
  }

  const finalOrder: KnownEntry[] = [];
  const seen: { [id: string]: boolean } = {};
  for (let fi = 0; fi < orderedIds.length; fi++) {
    const oid = orderedIds[fi];
    if (allKnown[oid] && !seen[oid]) {
      finalOrder.push(allKnown[oid]);
      seen[oid] = true;
    }
  }

  const newItems: KnownEntry[] = [];
  for (const key in allKnown) {
    if (!seen[key]) newItems.push(allKnown[key]);
  }
  newItems.sort((a, b) => {
    const la = a.name.toLowerCase();
    const lb = b.name.toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  });

  return finalOrder.concat(newItems);
};

const isHidden = (scriptId: string): boolean => {
  const key = KEY_HIDDEN + scriptId;
  return app.settings.haveSetting(SETTINGS_SECTION, key)
    ? app.settings.getSetting(SETTINGS_SECTION, key) === "true"
    : false;
};

export const getOrderedScriptsList = (): ScriptEntry[] => {
  const allScripts = getOrderedScripts();
  const result: ScriptEntry[] = [];
  for (let i = 0; i < allScripts.length; i++) {
    const s = allScripts[i];
    result.push({
      id: s.id,
      file: s.name,
      fullPath: s.fullPath,
      type: s.type,
      displayName: s.name.replace(/\.(jsx|jsxbin)$/i, ""),
      hidden: isHidden(s.id),
    });
  }
  return result;
};

export const updateFullOrder = (orderedIds: string[]): void => {
  app.settings.saveSetting(
    SETTINGS_SECTION,
    KEY_ORDER,
    JSON.stringify(orderedIds)
  );
};

export const runAETask = (fileName: string): void => {
  const id = app.findMenuCommandId(fileName);
  if (id !== 0) {
    app.executeCommand(id);
  } else {
    throw new Error("Script not found: " + fileName);
  }
};

export const runScript = (fullPath: string): void => {
  const f = new File(fullPath);
  if (f.exists) {
    $.evalFile(f);
  } else {
    throw new Error("File not found: " + fullPath);
  }
};

export const setScriptHidden = (
  scriptId: string,
  shouldHide: boolean
): void => {
  const key = KEY_HIDDEN + scriptId;
  app.settings.saveSetting(SETTINGS_SECTION, key, shouldHide ? "true" : "false");
};

export const resetAllPreferences = (): void => {
  app.settings.saveSetting(SETTINGS_SECTION, KEY_ORDER, "");
  const allScripts = getOrderedScripts();
  for (let i = 0; i < allScripts.length; i++) {
    const key = KEY_HIDDEN + allScripts[i].id;
    app.settings.saveSetting(SETTINGS_SECTION, key, "false");
  }
};
