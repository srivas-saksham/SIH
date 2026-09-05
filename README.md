# PROJECT CONTEXT — SIH Disaster/Security Resilience Digital Twin (DEMO BUILD)

> This file is the single source of truth. Claude Code must read this fully before starting any task. Update the STATUS section after every completed task.

---

## 1. WHAT WE ARE BUILDING (and what we are NOT)

We are building a **scripted, fully-fake demo** of an AI-driven 3D disaster/security resilience digital twin — for an SIH hackathon presentation. This is NOT a functional product.

- NO real geospatial computation
- NO real LLM inference calls
- NO real physics/simulation
- Everything is **pre-baked JSON state, triggered by simple keyword matching**, animated to LOOK real
- Judges/viewers must not be able to tell it's scripted during a live scripted walkthrough

**Tech stack:** React + Tailwind, single static site (Vite). Map layer: Mapbox GL / deck.gl or react-three-fiber if time allows (fallback: styled 2D map with 3D-style building blocks). No backend, no DB — all data is local JSON files.

---

## 2. CORE CONCEPT (real project, for framing/story only)

User types a natural-language scenario (e.g. "high-severity hostile attack in Central Delhi" or "earthquake near this zone") → system interprets it → simulates impact on population, infrastructure, roads, shelters → live 3D twin updates colors/routes/zones → shows causal breakdown → shows baseline vs intervention comparison → timeline playback of T+0 to T+30.

**Priority framing:** Security/counter-threat scenarios are the PRIMARY use case. Same framework extends to earthquakes, floods, cyclones, fires — mention this as a secondary capability, not the headline.

---

## 3. DEMO FEATURE LIST (build targets)

1. **3D/map twin** — terrain/city view with buildings, roads, hospitals, shelters, population zones
2. **Scenario input box** — natural language text → keyword-matched to pre-built scenario
3. **Fake "AI thinking" delay** — 1-2s loading animation before response, for realism
4. **Color-coded risk visualization** — buildings/zones shift 🟢→🟡→🟠→🔴 based on scenario JSON
5. **Route/evacuation animation** — animated flow lines change per scenario
6. **Timeline scrubber** — T+0 → T+5 → T+10 → T+15 → T+30, interpolates between keyframe states
7. **Causal breakdown panel** — bar chart of contributing factors (shelter deficit %, density %, road access %, infra %) — swaps per scenario
8. **Baseline vs Intervention comparison panel** — side-by-side stat cards (evac time, overload %, high-risk zone count)
9. **Intervention placement** — user can "add" a shelter/resource, triggers pre-scripted improved-state JSON

---

## 4. DATA MODEL (all fake, all local JSON)

Each scenario = one JSON object containing:
- `id`, `name`, `keywords[]` (for matching user input)
- `baseline`: building risk colors, road states, shelter occupancy, stats
- `intervention`: same shape, improved values
- `timeline`: array of 5 keyframe states (T+0..T+30), each a partial diff of baseline→final
- `causalFactors`: {shelterDeficit, populationDensity, roadAccessibility, infrastructure} (%)
- `comparisonStats`: {evacTimeBefore, evacTimeAfter, overloadBefore, overloadAfter, riskZonesBefore, riskZonesAfter}

Need minimum 3-4 scenarios: 1 security/attack, 1 earthquake, 1 flood, 1 generic/custom fallback.

---

## 4.5 EXECUTION WORKFLOW (IMPORTANT)

- We are using **Claude chat (this same interface, in a fresh session per task)** with **GitHub repo access** — NOT Claude Code CLI.
- Claude reads/evaluates existing repo files relevant to the task.
- Claude edits/creates files, copies them to outputs folder, and **presents the full modified/new files** to the user.
- User manually pastes these files into VS Code — no auto-execution, no auto-commit.
- **Critical constraint: never break/remove existing functionality.** Every task must reason about what already exists before editing, and preserve it unless explicitly told to replace it.
- Each task prompt sent to Claude must explicitly instruct: read repo → identify affected files → edit with minimal-diff logic → present complete files.

---

## 5. BUILD SEQUENCE (TASK-BASED, not day-based — compress as fast as possible)

- [ ] **TASK 1** — Scaffold project (Vite+React+Tailwind), routing, layout shell, design system (colors/fonts per risk levels)
- [ ] **TASK 2** — Build scenario JSON datasets (4 scenarios, full data model above)
- [ ] **TASK 3** — Map/3D visualization layer rendering static base city (buildings/roads/shelters) from JSON, color-driven
- [ ] **TASK 4** — Scenario input box + keyword matcher + fake AI delay + state injection
- [ ] **TASK 5** — Timeline scrubber component + keyframe interpolation/animation
- [ ] **TASK 6** — Causal breakdown panel (animated bar chart)
- [ ] **TASK 7** — Baseline vs Intervention comparison panel + intervention trigger button
- [ ] **TASK 8** — Polish: transitions, loading states, responsive layout, demo script/talking points overlay (optional presenter notes mode)
- [ ] **TASK 9** — Bug fixes, rehearsal pass, deploy (Vercel/Netlify static)

---

## 6. STATUS (UPDATE AFTER EVERY TASK)

**Current stage:** Not started — Task 1 pending
**Completed:** None yet
**In progress:** None
**Blocked/issues:** None
**Next task to send to Claude Code:** TASK 1

---

## 7. AGENT NOTES / DECISIONS LOG

- (decisions, pivots, and reasoning get logged here as we go)