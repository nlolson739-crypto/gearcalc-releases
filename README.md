# GearCalc

A personal OSRS gear calculator: DPS comparison, defence reduction, freeze checks and a best-setup finder.

## Sources

- **Calculations:** the OSRS Wiki's own DPS engine, [weirdgloop/osrs-dps-calc](https://github.com/weirdgloop/osrs-dps-calc),
  vendored in `vendor/osrs-dps-calc` (GPL-3.0, see its `LICENSE`). GearCalc imports it unchanged.
- **Data:** the same repository's `cdn/json` files (monsters, equipment, spells), generated from the OSRS Wiki.
- **Special rules** (`src/rules/`): only from OSRS Wiki pages, each with the page and revision it came from.
- **Icons:** OSRS Wiki item and spell images, downloaded through the wiki's API.

No other sources (forums, Reddit, other calculators) are used.

Requests to the wiki use the User-Agent `osrs-combat-cache (personal use)`, as the wiki's API policy asks.

## Running

```
deno install
deno task dev
```

Then open http://localhost:5178.

`deno task update-data` pulls the latest wiki engine and data, and re-checks the wiki pages the special rules cite.

GearCalc is for personal use. If it's ever shared, it must stay under GPL-3.0 because it includes the wiki engine.
