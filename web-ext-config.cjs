const fs = require("node:fs");
const path = require("node:path");

// Auto-detect Thunderbird so `npm run run:tb` works cross-platform.
// Override with env var THUNDERBIRD_PATH if needed.
const candidates = [
  process.env.THUNDERBIRD_PATH,
  "C:\\Program Files\\Mozilla Thunderbird\\thunderbird.exe",
  "C:\\Program Files (x86)\\Mozilla Thunderbird\\thunderbird.exe",
  "/usr/bin/thunderbird",
  "/usr/local/bin/thunderbird",
  "/snap/bin/thunderbird",
  "/var/lib/flatpak/exports/bin/org.mozilla.Thunderbird",
  "/Applications/Thunderbird.app/Contents/MacOS/thunderbird",
].filter(Boolean);

const firefox = candidates.find((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});

const run = {};
if (firefox) run.firefox = firefox;
if (process.env.THUNDERBIRD_PROFILE) {
  run.firefoxProfile = process.env.THUNDERBIRD_PROFILE;
  run.profileCreateIfMissing = true;
}
if (process.env.THUNDERBIRD_KEEP_PROFILE_CHANGES === "1") {
  run.keepProfileChanges = true;
}

module.exports = {
  sourceDir: __dirname,
  artifactsDir: path.join(__dirname, "web-ext-artifacts"),
  ignoreFiles: [
    "package.json",
    "package-lock.json",
    "node_modules",
    "test",
    "web-ext-artifacts",
    "README.md",
    ".gitignore",
    ".git",
    "web-ext-config.cjs",
  ],
  run,
};
