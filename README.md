# ForeSeen

**Type a disaster. Watch a city's response play out in 3D, from T+0 to T+30.**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-6-396CB2)
![Turf.js](https://img.shields.io/badge/Turf.js-7-3BB2D0)
![License](https://img.shields.io/badge/License-TODO-lightgrey)

---

## What is ForeSeen?

ForeSeen is a **disaster management simulation platform** concept: a command-center interface where an operator describes an emergency in plain language and sees a 3D digital twin of the affected area respond. Emergency planners rarely get to see how population, roads and shelters interact until it is too late, and existing tools are slow to set up and hard to explain to decision makers.

ForeSeen shows the whole picture in one screen. Describe a scenario, and the twin colors buildings by risk, jams the roads that would jam, flags shelters that become unreachable, and lets you scrub a timeline from T+0 to T+30. A causal breakdown explains why the situation is bad, and a baseline vs intervention comparison shows what a response would change.

> **Honest scope:** this is a hackathon demo built for the Smart India Hackathon (SIH). Scenarios are pre-modelled and every figure is illustrative. That is a deliberate design choice: it lets the interface, the 3D twin and the decision workflow be shown end to end without needing live data feeds or a real simulation engine. See [How it works](#how-it-works-honest).

---

## Demo

<!-- TODO: replace with real assets. Do not commit placeholder URLs. -->

| | |
|---|---|
| Screenshot | `TODO: add screenshot, for example docs/screenshot-tehri.png` |
| GIF | `TODO: add short GIF of the T+0 to T+30 flood walkthrough` |
| Video | `TODO: add YouTube link` |
| Live site | `TODO: add deployment URL, if any` |

---

## Key features

- **Natural-language scenario input:** type what happened; a keyword matcher selects the pre-modelled scenario
- **3D digital twin:** MapLibre GL map with extruded buildings, tilt and rotate (Hostile Attack and Dam Breach scenes)
- **Impact zones:** red, yellow and green concentric bands that grow across the timeline
- **Timeline T+0 to T+30:** five keyframes (T+0, T+5, T+10, T+15, T+30) with a scrubber and chat commands
- **Road jam detection:** nearby named roads are classified as clear, congested or jammed from the impact geometry
- **Shelter cards and accessibility:** floating cards with occupancy, distance and an accessible / blocked status
- **Capacity what-if:** ask "what if shelter capacity increased by 40%" and the shelters update live
- **Causal breakdown:** shelter deficit, population density, road access and infrastructure factors
- **Baseline vs intervention:** side-by-side evacuation time, overload and risk-zone counts
- **Tehri Dam flood corridor:** a flood ribbon that follows a river path from Tehri Dam toward Meerut, with wider pooling at Devprayag and Rishikesh
- **Population-entrapment pillars:** 3D bars per area showing people trapped and a severity score (Tehri scene only)
- **Clickable labels:** click a shelter, landmark, road or pillar label and the camera flies to it
- **Chat commands:** `next`, `T+15`, road queries such as `list all blocked roads`, `shelters in range`, `reset`, `cls`, and the what-if / intervention phrasings

---

## Scenarios

| Scenario | id | Trigger examples | Renderer |
|---|---|---|---|
| Hostile Attack, Central Delhi | `security-attack` | attack, hostile, terror, bomb, blast | **3D engine** |
| Earthquake, Central Delhi zone | `earthquake` | earthquake, tremor, seismic, aftershock | 2D SVG map |
| Flood, Yamuna floodplain | `flood` | flood, yamuna, monsoon, heavy rain | 2D SVG map |
| Dam Breach, Tehri Dam | `tehri-dam-breach` | tehri, dam breach, dam failure, ganga flood | **3D engine** |
| Generic fallback | `generic-fallback` | (no keywords; used when nothing matches) | 2D SVG map |

Two of the five scenarios (Hostile Attack and Dam Breach) run on the 3D engine. The others use the earlier 2D map and do not have 3D buildings, camera choreography or population pillars.

---

## Tech stack

Versions are the ranges declared in `package.json`.

| Technology | Version | Used for |
|---|---|---|
| React / React DOM | ^19.2.8 | UI and state |
| Vite | ^8.2.2 | Dev server and build |
| `@vitejs/plugin-react` | ^6.1.0 | JSX transform |
| Tailwind CSS | ^3.4.13 | Styling |
| PostCSS | ^8.5.28 | CSS pipeline |
| Autoprefixer | ^10.5.5 | Vendor prefixes |
| MapLibre GL JS | ^6.7.0 | 3D map, symbol layers, extrusions |
| Turf.js (`@turf/turf`) | ^7.4.0 | Distances, buffers, line geometry |
| oxlint | ^1.79.0 | Linting |

Basemap tiles come from OpenFreeMap (dark and light styles) and Esri World Imagery (satellite). No API key is needed, but an internet connection is.

---

## Architecture

One map engine, many scenes. `MapLibreEngine.jsx` contains no scenario-specific constants. Each scene is a plain config object that supplies its own geography and data:

- center and default impact radii
- landmarks and shelters
- the named road corridor that jams
- optional extras: a pinned impact-zone center, a flood path with hotspots, per-keyframe camera moves, and population pillars

`sceneRegistry.js` maps a scenario id to its scene config and exports the list of ids that should use the 3D engine. Any scenario not in that list falls back to the 2D map.

```
src/
  components/
    CommandShell.jsx          layout, state, chat intent dispatch
    ChatPanel.jsx, ChatMessage.jsx, TimelineScrubber.jsx
    CausalBreakdown.jsx, ComparisonPanel.jsx, PopulationPanel.jsx
    MapToolbar.jsx, MapView.jsx (2D), MapLibreView.jsx (wrapper)
    maplibre/
      MapLibreEngine.jsx      scene-agnostic 3D engine
      mapEngineCore.js        shared constants and helpers
      populationPillars.js    pillar sizing, placement, severity model
      sceneRegistry.js        scenario id -> scene config
      scenes/
        securityAttackScene.js
        tehriDamBreachScene.js
  data/                       landmarks, shelters, flood pillars
  scenarios/                  one JSON per scenario, plus presets
  utils/                      matcher, intent parsers, analyst text
```

---

## Getting started

**Prerequisites:** Node.js `20.19+` or `22.12+` (the range Vite 8 declares) and npm.

```bash
npm install
npm run dev        # start the dev server
npm run build      # production build
npm run preview    # serve the production build locally
npm run lint       # oxlint
```

### Example prompts

Type these into the chat box (each was checked against the keyword matcher):

| Scenario | Try typing |
|---|---|
| Hostile Attack | `high-severity hostile attack in Central Delhi` |
| Earthquake | `earthquake near this zone` |
| Flood | `heavy rain and Yamuna flood in Delhi` |
| Dam Breach | `Tehri Dam breach` or `dam failure at Tehri` |
| Fallback | any unrelated text, or the **Reset / Baseline** preset chip |

Once a scenario is active, try: `next`, `T+15`, `list all blocked roads`, `shelters in range`, `what if shelter capacity increased by 40%`, `reset`, `cls`. In the Dam Breach scene, `show population` (or `pillars`) opens the entrapment view.

The preset chips at the bottom of the screen jump straight to each scenario without typing.

---

## How it works (honest)

ForeSeen does **not** run a simulation. Each scenario is a hand-authored JSON file that contains the baseline state, five timeline keyframes, an intervention state and the comparison numbers. When you type a description:

1. The text is normalized and scored against each scenario's keyword list (multi-word keywords count for more).
2. The best match is loaded; if nothing matches, a generic fallback or a clarify prompt is shown.
3. A short artificial "thinking" delay plays, then the map, panels and timeline animate to that pre-baked state.

The geometry you see (impact circles, road classification, flood ribbon, pillar placement) is computed live with Turf.js from authored points and radii, but the underlying numbers are illustrative. The Tehri flood path is a schematic corridor, not a surveyed river channel. Populations, trapped counts, flood depths, arrival times and shelter capacities are invented for the demo and are not census or hydrology data. This should not be used for real emergency decisions.

---

## Customization

**Add a new 3D scenario**

1. Create `src/scenarios/<your-scenario>.json` with `id`, `name`, `keywords`, `baseline`, `intervention`, a five-entry `timeline`, `causalFactors` and `comparisonStats` (copy an existing file as a template).
2. Register it in `src/utils/scenarioMatcher.js` by importing the JSON and adding it to the `scenarios` array. Optionally add a preset chip in `src/scenarios/scenarioPresets.js`.
3. Create `src/components/maplibre/scenes/<yourScenario>Scene.js` using `securityAttackScene.js` as the template, plus data files under `src/data/` for its landmarks and shelters.
4. Add the scene to the `SCENES` map in `src/components/maplibre/sceneRegistry.js`. That step is what adds its id to `MAPLIBRE_SCENE_IDS` and switches it onto the 3D engine.

Scenarios you do not register as a scene still work; they render on the 2D map.

**Where the tuning knobs live**

| To change | Edit |
|---|---|
| Label sizes and zoom behavior | `LABEL_HOLD_ZOOM`, `SHELTER_CARD_FAR_SIZE`, `LABEL_PILL_FAR_SIZE` in `mapEngineCore.js` |
| Landmark vs shelter label spacing | `LANDMARK_SHELTER_CLUSTER_KM`, `LANDMARK_STACK_GAP_PX` in `mapEngineCore.js` |
| Population pillar size, height and spacing | constants at the top of `populationPillars.js` |
| Tehri camera moves per keyframe | `cameraKeyframes` in `scenes/tehriDamBreachScene.js` |
| Which shelter the first "shelters in range" query flies to | `firstFocusShelterId` in each scene file |

---

## Known limitations and roadmap

**Current limitations**

- Scenarios are pre-modelled; there is no real simulation behind them
- Only two of five scenarios have the 3D treatment
- Needs an internet connection for basemap tiles
- Some road-name matching (the "named corridor" jam) is best-effort and unverified against live map data for the Dam Breach scene
- Some chat text is still Delhi-specific in the Dam Breach scene
- The bundle is large (about 1.65 MB main chunk before gzip)

**Roadmap ideas**

- Live sensor, weather and census feeds in place of authored numbers
- Real hydrological and crowd-movement models
- LLM-based scenario understanding instead of keyword matching
- More scenarios on the 3D engine (cyclone, fire, industrial accident), and migrating earthquake and flood to it

---

## Project status and verification

This is a hackathon build. The code compiles: in the last check `npm run build` succeeded and `npm run lint` reported 0 errors and 26 warnings. **The 3D visuals have not been verified in a live browser by the person who wrote this documentation**, so expect a round of visual tuning (pillar sizes, label positions, camera framing). If something looks off, the tuning table above is the place to start.

---

## Team

- TODO: team name
- TODO: member names and roles
- TODO: mentor / institution

## Acknowledgements

- Basemap data: OpenFreeMap and OpenStreetMap contributors; satellite imagery: Esri, Maxar, Earthstar Geographics
- Built with React, Vite, Tailwind CSS, MapLibre GL JS and Turf.js
- TODO: any additional credits

## License

TODO: choose a license and add a `LICENSE` file.
