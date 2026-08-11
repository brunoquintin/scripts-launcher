# Scripts Launcher

A dockable CEP panel for Adobe After Effects that lists every installed script (both plain `Scripts/` files and `ScriptUI Panels/`), lets you launch them with one click, reorder them by drag-and-drop, and hide ("shy") the ones you don't want cluttering the list — without touching the actual installed files.

Built with [Bolt CEP](https://github.com/hyperbrew/bolt-cep) (React + TypeScript + Vite), by Bruno Quintin.

This is a personal project, released into the public domain (see [License](#license) below) — use it, modify it, redistribute it, and contributions/PRs are welcome.

## Features

- Lists scripts from both the application-level and user-level `Scripts` and `Scripts/ScriptUI Panels` folders (Windows and macOS paths both handled), for the currently running After Effects version.
- Filter toolbar: show ScriptUI panels only, non-UI scripts only, or both.
- Per-script "shy" toggle plus a global "hide all shy scripts" master toggle.
- Drag-and-drop reordering, persisted across sessions.
- "Reset" button clears all of the above back to defaults (alphabetical order, nothing hidden).
- Follows the host application's light/dark theme automatically (`com.adobe.csxs.events.ThemeColorChanged`).

## Installing a `.zxp`

Grab the latest signed build from [Releases](../../releases), then install it with the free ZXP/UXP Installer (Mac/Windows) — drag the `.zxp` onto it, restart After Effects, then Window > Extensions > Scripts Launcher.

- [aescripts.com](https://aescripts.com/learn/post/zxp-installer)
- [zxpinstaller.com](https://zxpinstaller.com/)

## Development

```
npm install
npm run build   # compiles and symlinks the extension into Adobe's CEP extensions folder
npm run dev      # HMR dev server -- edit src/js or src/jsx and see changes live in the panel
```

`npm ci` (instead of `npm install`) will reproduce the exact dependency versions this project was built and released with, using the committed `package-lock.json`.

Requires debug mode enabled for CSXS 9+ (see Adobe's CEP documentation) — `npm run build`/`npm run dev` load an unsigned extension. Restart After Effects after the first `npm run build`, then Window > Extensions > Scripts Launcher.

## Packaging a `.zxp`

Bolt's own `npm run zxp` needs `ZXPSignCmd`, Adobe's official signing tool, which isn't bundled with this repo (Windows binary, must be obtained separately from Adobe). Once you have it:

```
npm run build
npm run zxp
```

This generates a self-signed certificate on first use and outputs a signed `.zxp` under `dist/zxp/`.

## How it stores state

- Reordering and per-script hidden state: `app.settings` (`ScriptsLauncher` section), read/written from the ExtendScript side (`src/jsx/aeft/aeft.ts`) — persists with the After Effects preferences, per machine.
- Shy-master toggle and the panel/script/both filter: `localStorage` on the panel side (`src/js/main/main.tsx`) — persists per browser profile the CEP panel uses, independent of AE preferences.

## Notable implementation details

- `src/jsx/aeft/aeft.ts`'s `getScriptFolders()` resolves both the Windows and macOS locations of the app-level and user-level Scripts folders, keyed off the running AE version (`app.version`).
- `runAETask()` launches a ScriptUI panel via `app.findMenuCommandId()` + `app.executeCommand()` (the same mechanism as clicking it in the Window menu); `runScript()` launches a plain script directly via `$.evalFile()`.
- Host functions are called from the panel via Bolt's typed `evalTS()` (see `src/js/lib/utils/bolt.ts`) instead of hand-built `evalScript()` strings — arguments and return values are serialized automatically, and thrown `Error`s on the ExtendScript side reject the promise on the panel side.
- Drag-and-drop reordering manipulates DOM refs directly during the drag gesture (for a smooth live-shifting animation), then commits the final order to React state and persists it via `updateFullOrder()` on drop.

## Known limitations

- Only scans the Scripts / ScriptUI Panels folders for the After Effects version that's currently running — a script installed only under a different AE version's folder won't show up until run from that version.

## License

[CC0 1.0 Universal](LICENSE) — public domain. No attribution required, though it's appreciated. No warranty of any kind; use at your own risk.

## Author

Bruno Quintin — version 1.1.

This extension is "Vibe Coded" and provided without warranty; use at your own risk.
