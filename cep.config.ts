import type { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

// NOTE: this file is imported by both the panel bundle and the ExtendScript
// bundle (via src/shared/shared.ts) -- keep it to plain literals only, no
// Node built-ins (fs/path/etc.), or they'll get bundled into the ExtendScript
// output and crash it.
//
// The `zxp` block below is Bolt's own packaging config (`npm run zxp`), kept
// filled in for completeness, but on Windows it needs ZXPSignCmd inside
// node_modules/vite-cep-plugin/bin/, which isn't bundled -- actual packaging
// goes through Extensions/_tools/package-zxp.ps1 instead (run `npm run build`
// first), which reuses this project's persistent self-signed certificate. See
// the README's Packaging section.
const config: CEP_Config = {
  version,
  id: "com.brunoquintin.scriptslauncher",
  displayName: "Scripts Launcher",
  symlink: "local",
  port: 3000,
  servePort: 5000,
  startingDebugPort: 8860,
  extensionManifestVersion: 6.0,
  // Adobe checks PlayerDebugMode against the CSXS version declared here, not
  // against the host app's actual bundled CEP engine -- this machine only has
  // debug mode enabled for CSXS 12-15 (HKCU\Software\Adobe\CSXS.<n>), and the
  // pre-Bolt manifest already declared 12.0 and worked, so match that instead
  // of Bolt's scaffold default of 9.0.
  requiredRuntimeVersion: 12.0,
  hosts: [{ name: "AEFT", version: "[22.0,99.9]" }],

  type: "Panel",
  // A blank/missing icon path isn't just cosmetic -- CEP logs "IconPath is
  // not properly defined" and drops the whole extension as "incomplete"
  // (confirmed in project, 2026-08-10, via LogLevel=6 CEP12-AEFT.log). All
  // four variants must point at a real file that actually gets copied into
  // the build (see `copyAssets` below) -- placeholder for now, swap for a
  // real icon whenever one is designed.
  iconDarkNormal: "./assets/panel-icon.png",
  iconNormal: "./assets/panel-icon.png",
  iconDarkNormalRollOver: "./assets/panel-icon.png",
  iconNormalRollOver: "./assets/panel-icon.png",
  parameters: ["--v=0", "--enable-nodejs", "--mixed-context"],
  width: 350,
  height: 500,
  minWidth: 180,
  minHeight: 200,

  panels: [
    {
      mainPath: "./main/index.html",
      name: "main",
      panelDisplayName: "Scripts Launcher",
      autoVisible: true,
      width: 350,
      height: 500,
      minWidth: 180,
      minHeight: 200,
    },
  ],
  build: {
    jsxBin: "off",
    sourceMap: true,
  },
  zxp: {
    country: "FR",
    province: "IDF",
    org: "brunoquintin",
    password: "BQvibecoding",
    tsa: [
      "http://timestamp.digicert.com/", // Windows Only
      "http://timestamp.apple.com/ts01", // MacOS Only
    ],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "off",
  },
  installModules: [],
  copyAssets: ["assets/panel-icon.png"],
  copyZipAssets: [],
};
export default config;
