# Thunderbird Regex Filters

A Thunderbird MailExtension that filters incoming messages using JavaScript regular expressions. Match on **subject**, **From**, **recipients** (To/Cc/Bcc), or **body**, then **move**, **tag**, **archive**, **star**, **mark read**, or **delete** the message.

Targets Thunderbird 128+ (including rapid-release 149). Cross-platform — tested mental model covers Windows 11 and Zorin / Linux.

## Why this exists (and a trade-off worth knowing)

The obvious place for "regex matches" would be the built-in *Message Filters → Edit Filter* dialog, alongside "contains", "is", etc. Unfortunately, Thunderbird's WebExtension API does not let extensions register custom filter terms — the only way to add them to the native UI is a privileged *Experiment API*, which forces an install-time prompt demanding "full, unrestricted access to Thunderbird and your computer" and is brittle across Thunderbird updates. This extension instead runs its own regex engine on newly received mail via the supported `messages.onNewMailReceived` API. Rules live in the extension's own options page, not inside the native Filter Editor.

## Install (development)

You'll need [Node.js](https://nodejs.org) 20+ and Thunderbird 128+ on your path.

```sh
npm install
npm run run:tb            # launches Thunderbird with the extension hot-loaded
```

`web-ext-config.cjs` auto-detects Thunderbird on Windows, Linux, and macOS. If your install lives somewhere unusual, set `THUNDERBIRD_PATH`:

```sh
# Windows PowerShell
$env:THUNDERBIRD_PATH = 'D:\apps\Thunderbird\thunderbird.exe'; npm run run:tb
# Linux
THUNDERBIRD_PATH=/opt/thunderbird/thunderbird npm run run:tb
```

> Note on web-ext 10: the explicit `thunderbird` target was removed. Thunderbird is now launched as a `firefox-desktop` target pointed at the Thunderbird binary via `--firefox`, which is what `web-ext-config.cjs` wires up automatically.

### Using your real profile

By default `web-ext` creates a clean, empty temporary profile — no accounts, no settings. To test against your real Thunderbird profile, point at it with `THUNDERBIRD_PROFILE`:

```sh
# Windows PowerShell — copies your profile into a temp dir (safe, changes don't persist):
$env:THUNDERBIRD_PROFILE = "$env:APPDATA\Thunderbird\Profiles\sqrhf1ng.default-esr"; npm run run:tb

# Linux — usually ~/.thunderbird/<profile>.default
THUNDERBIRD_PROFILE=~/.thunderbird/xxxxxxxx.default-release npm run run:tb
```

**Important:** quit any running Thunderbird before launching — Thunderbird refuses to open a profile that's already in use. The copied profile will ask for IMAP/OAuth credentials again because password-store entries are keyed to the real profile directory.

To run directly against your real profile with persistent changes (⚠ extension bugs can delete real mail):

```sh
$env:THUNDERBIRD_PROFILE = "$env:APPDATA\Thunderbird\Profiles\sqrhf1ng.default-esr"
$env:THUNDERBIRD_KEEP_PROFILE_CHANGES = "1"
npm run run:tb
```

Find your profile folder at `%APPDATA%\Thunderbird\profiles.ini` (Windows) or `~/.thunderbird/profiles.ini` (Linux).

Alternatively, load the extension manually:

1. Open Thunderbird.
2. *Tools → Developer Tools → Debug Add-ons*.
3. *Load Temporary Add-on…* and pick the repo's `manifest.json`.

## Usage

After installing, open **Tools → Add-ons Manager**, find *Regex Filters*, click **Options**. The options page opens in a tab where you can:

- **Add rule**, give it a name, pick which accounts it applies to (default: all).
- Choose `match all` (AND) or `match any` (OR) across your conditions.
- Each condition is `[field] [regex matches / doesn't match] [pattern] [flags]`. A green ✓ or red ✗ shows live regex validity.
- Add actions (move / tag / mark read / star / archive / delete). For move and tag, a dropdown lets you pick the folder or tag.
- Tick **Stop processing further rules** if this rule should be the last one to run on matching messages.
- **Export JSON** / **Import JSON** to back up or share rule sets.

### Pattern notes

- Patterns are standard JavaScript `RegExp` source. Escape special characters the same as in any JS regex literal.
- Matching is **case-sensitive by default**. Put `i` in the flags field for case-insensitive matching, `m` for multi-line `^/$`, `s` to let `.` match newlines.
- Recipients are matched against `to`, `cc`, and `bcc` joined with `, `.
- Body matching is skipped (the condition evaluates to not-matched) if Thunderbird has not yet downloaded the body — primarily relevant for IMAP accounts configured to download headers only.

## Build a distributable .xpi

```sh
npm run build              # writes web-ext-artifacts/*.zip (valid .xpi)
```

Rename the output to `.xpi` for sideload via Thunderbird's *Install Add-on From File…* picker, or submit the same file to addons.thunderbird.net.

## Testing

Pure regex-evaluator tests run under Node without Thunderbird:

```sh
npm test
```

Covers subject / from / recipients / body matching, case sensitivity, AND vs OR joins, `not_matches` inversion, invalid regex handling, and the body-deferred behavior.

## Limitations

- Rules run via `messages.onNewMailReceived`, which fires *after* Thunderbird's built-in filters. This extension runs alongside the native filter system; it doesn't replace it.
- No retroactive run across existing messages in v1. A "run now on a folder" action is a candidate for v2.
- No native Filter Editor integration (see the trade-off note above). A future v2 could offer an optional Experiment API module for users who want it and accept the stronger permission prompt.

## Icons

This repo ships without icon files yet. Drop `icon-48.png` and `icon-96.png` into `icons/` and add an `icons` block to `manifest.json` before publishing to addons.thunderbird.net.

## License

Apache-2.0. See [LICENSE](LICENSE).
