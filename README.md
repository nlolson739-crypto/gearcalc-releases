# GearCalc

A desktop gear calculator for Old School RuneScape: DPS comparison, defence reduction, freeze checks and a
best-setup finder. Every calculation runs through the OSRS Wiki's own DPS engine.

## Download

Get **GearCalc-vX.Y.zip** from the [latest release](https://github.com/nlolson739-crypto/gearcalc-releases/releases/latest),
unzip it anywhere and run `GearCalc.exe` (keep the `_internal` folder next to it). It updates itself: when a new
version is out it asks first, then downloads only the files that changed.

Windows 10/11 (it uses the Edge WebView2 component that ships with Windows). Internet is needed for item and
monster pictures and for fresh wiki data.

## Staying up to date with the wiki

- **Monster, gear and spell stats** update on their own. Once a day GearCalc asks the wiki's file server
  (tools.runescape.wiki) for the same data files the wiki's own DPS calculator uses. If nothing changed, the server only
  answers "not modified"; new files are checked before use, and the copy built into the app is the fallback. The
  top-right label shows the date of the data in use ("Wiki data from …"), and offers a reload when newer data arrives.
  These are three plain file requests a day, not wiki API calls, sent with a User-Agent that names GearCalc.
- **Calculator changes** (new boss mechanics and fixes in the wiki's engine) need a new GearCalc version. A daily
  GitHub check (`.github/workflows/wiki-update.yml`) updates to the newest engine, type-checks, tests and builds it, and
  prepares a draft release; publishing the draft (`finish-release.yml` does the rest) sends it to the app's updater.

## What it does

- **DPS:** compare up to 4 setups against any monster or boss phase. Includes prayers (Zeal included), potions, thralls,
  Slayer task, spells, Mark of Darkness, Sunfire runes, the Fractured Archive elemental fragments, and spec weapons.
- **Defence reduction:** elder maul, dragon warhammer, Arclight, Emberlight, Ralos, Bandos godsword, Seercull, Eye of Ayak,
  Vulnerability and Accursed sceptre, with each boss's drain floor. Raid presets for The Fractured Archive, Chambers of
  Xeric, Theatre of Blood and Tombs of Amascut.
- **Freeze check:** every freeze spell, with your prayer, Magic level, Void set and magic attack bonus, with and
  without the Salve amulet (ei).
- **Best setup:** finds the best build for each style (melee stab / slash / crush, ranged, magic) and ranks them, by
  highest DPS, fastest kill or best defence-drain spec. It searches all gear, or only the gear in a bank imported from
  RuneLite's Bank Memory plugin.

## Sources

- **Calculations:** the OSRS Wiki DPS calculator engine, [weirdgloop/osrs-dps-calc](https://github.com/weirdgloop/osrs-dps-calc)
  (GPL-3.0). It's included unchanged as a git submodule in `vendor/osrs-dps-calc`.
- **Data:** monster, item and spell data from the same repository, generated from the [OSRS Wiki](https://oldschool.runescape.wiki)
  (content under CC BY-NC-SA 3.0).
- **Extra rules** (`src/rules/wiki.ts`): only from OSRS Wiki pages, each with the page and revision it came from.
- **Icons:** OSRS Wiki images.

GearCalc is a fan-made, non-commercial tool. It isn't affiliated with Jagex or the OSRS Wiki. Old School RuneScape and
its images are © Jagex Ltd.

## Licence

GPL-3.0 (see `LICENSE`), because it includes the wiki's GPL-3.0 engine. Each release also has a
`GearCalc-vX.Y-source.zip` with the complete source, the engine included.

## Building from source

```
git clone --recurse-submodules https://github.com/nlolson739-crypto/gearcalc-releases.git
cd gearcalc-releases
deno install
deno task dev          # web version at http://localhost:5178
./build-app.sh         # desktop app (needs app/.venv with pywebview, pyinstaller and pillow)
```

`deno task update-data` pulls the latest wiki engine and data, and flags rules whose wiki pages have changed since
they were read. Releases: bump `VERSION`, then `./release.sh PREV "notes"` (it stops if GitHub's main has a published
wiki update this copy lacks: `git pull origin main` first).
