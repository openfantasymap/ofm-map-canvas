![](https://img.shields.io/badge/Foundry-v11--v13-informational)
![Latest Release Download Count](https://img.shields.io/github/downloads/openfantasymaps/ofm-map-canvas/latest/module.zip)
![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fofm-map-canvas&colorB=4aa94a)

# FantasyMaps Map Canvas

OFM Map Canvas is loosely based on https://github.com/mspellecacy/map-canvas.

It provides a dialog window containing a FantasyMaps / OpenStreetMap / OpenHistoryMap viewport, and turns the visible extent into a Foundry scene — background image, walls, lights and tiles are generated from the vectors served by the chosen world.

![Map view](Map%20view.png)

## Installing

Foundry module page: https://foundryvtt.com/packages/ofm-map-canvas

Or paste the manifest URL into Foundry's *Install Module* dialog:

```
https://raw.githubusercontent.com/openfantasymaps/ofm-map-canvas/main/module.json
```

## Using it

1. Open the scene controls and pick the **OFM Map Canvas** layer.
2. Click **Open Map Dialog** — pan/zoom to the area you want.
3. Hit **Generate Scene** to create a new scene, or re-run with the same name to update in place.
4. At zoom ≥ 18.5 the button label flips to *with walls* — below that only the background image and tiles are fetched.

The generated background image is uploaded under `Data/ofm-map-canvas/` via Foundry's `FilePicker.upload`.

## Settings (world scope)

| Setting | Purpose |
| --- | --- |
| Default Scene Name | Base name for generated/updated scenes (timestamp suffix on *Generate*) |
| License Key | Key for the `vectors.fantasymaps.org` endpoint — needed for non-free worlds |
| Map to load | `toril`, `barovia`, `rock_of_bral_upper`/`-openworld`/`_lower`, `osm` |
| Render Mode | `default`, `photo` (aerial), `draw` |
| Width / Height | Generated scene dimensions in pixels (doubled automatically for OSM) |

## Compatibility

- Foundry **v11 – v13** (verified on v13).
- MapLibre GL JS 4.7.1 is vendored under `modules/vendor/` — no runtime CDN calls.
- Integrates with [`ofm-shared-world`](https://github.com/openfantasymaps/ofm-shared-world) via the `ofmSharedWorldUpdateScene` hook.

## Sponsor

Help us grow by sponsoring on [Patreon](https://www.patreon.com/openfantasymap).
