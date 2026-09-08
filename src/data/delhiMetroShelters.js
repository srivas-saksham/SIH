/**
 * Real-world coordinates + geometry/metadata for metro-station and
 * underground-refuge "safe zones" used by MapLibreView's Task 9
 * shelter/metro-station safe-zone overlay.
 *
 * Same baseline shape convention as delhiLandmarks.js: one query point
 * (lat/lng) per entry, plus a per-entry confidence note, since these
 * are manually-sourced approximate values, not survey data. Extended
 * beyond delhiLandmarks.js's shape with two more pieces MapLibreView
 * now needs per-shelter:
 *
 * - `footprint` — sizes/orients buildShelterFootprint's turf.ellipse-
 *   based polygon (see MapLibreView.jsx). NOT survey-accurate geometry;
 *   each entry's size/shape is a deliberately-labeled approximation of
 *   "what this kind of structure plausibly looks like at this scene's
 *   zoom level", not a traced footprint.
 * - `metadata` — the feasibility/security "how good a shelter is"
 *   fields the person explicitly asked for, kept deliberately small
 *   (see each field's comment below) rather than an over-engineered
 *   scoring system. Runtime numbers that depend on the current
 *   scenario/timeline (distance from impact, occupancy level) are
 *   deliberately NOT stored here — MapLibreView computes those live off
 *   `lat`/`lng` every time scenario/timelineIndex changes (see
 *   updateShelterStates) — this file only holds the static traits that
 *   don't change scenario-to-scenario.
 *
 * Unlike delhiLandmarks.js, MapLibreView does NOT use these coordinates
 * to look up a real building footprint via queryRenderedFeatures/
 * queryable feature-state — most of these are substantially
 * underground, so their real surface footprint (if any) is the wrong
 * visual metaphor for "this is a safe shelter." Instead MapLibreView
 * draws a static, non-animated GeoJSON polygon per entry (see
 * buildShelterFootprint / SAFE_ZONE_FILL_HEIGHT in MapLibreView.jsx).
 *
 * ---------------------------------------------------------------------
 * Roster (5 entries, per the person's explicit request for "a total of
 * five shelters nearby with variations... in every direction"):
 * ---------------------------------------------------------------------
 * All five coordinates below were (re-)verified via fresh web search
 * for this pass rather than trusted from any prior session's tool
 * trace. Distances/bearings from the security-attack scenario's impact
 * point (28.6139, 77.209, near Central Vista/the New Parliament House)
 * were computed with a plain haversine/bearing calculation, not
 * eyeballed:
 *
 *   rajiv-chowk:            2.34 km @  26° (NNE)
 *   patel-chowk:             1.07 km @  15° (N)
 *   central-secretariat:     0.30 km @  66° (ENE) — right next to the impact point
 *   palika-bazaar:           2.12 km @  26° (NNE)
 *   pragati-maidan-tunnel:   3.04 km @  86° (E)
 *
 * HONEST CAVEAT on "every direction": real, well-documented, plausible
 * shelter candidates near Central Vista cluster N/NNE/ENE/E of the
 * impact point (this is simply where Delhi's metro stations, markets,
 * and named landmarks actually sit relative to the Central
 * Vista/Kartavya Path corridor) — there is no comparably well-verified
 * candidate immediately south or west without going considerably
 * farther out or picking something on much weaker evidence. Five
 * well-sourced entries clustered in the directions where real
 * candidates actually exist beats padding the roster with a guessed
 * S/W entry just to claim full compass coverage.
 */

export const METRO_SHELTER_IDS = [
  'rajiv-chowk',
  'patel-chowk',
  'central-secretariat',
  'palika-bazaar',
  'pragati-maidan-tunnel',
];

// The single shelter that goes inaccessible once the Kartavya Path
// forced-jam override activates (resolveKartavyaOverrideActive's T+15
// gate in MapLibreView.jsx — see resolveShelterAccessible). Central
// Secretariat is the deliberate, geography-backed pick, not an
// arbitrary one: its own official address is literally "Kidwai Marg,
// Kartavya Path, Central Secretariat" (Wikipedia infobox, verified this
// pass) — it sits directly on/beside the exact boulevard the override
// targets, and at 0.30km from the impact point it's also the closest
// shelter to the blast itself, so "this one becomes unreachable first"
// is the most defensible real-world choice among the five, not a coin
// flip.
export const INACCESSIBLE_AFTER_KARTAVYA_JAM_SHELTER_ID = 'central-secretariat';

export const METRO_SHELTERS = [
  {
    id: 'rajiv-chowk',
    name: 'Rajiv Chowk Metro Station',
    lat: 28.6328,
    lng: 77.2196,
    // Major Blue/Yellow Line interchange beneath Connaught Place's
    // inner circle — sized as the largest/most robust metro footprint
    // in this roster, oriented along the inner-circle ring rather than
    // a straight platform axis (an interchange concourse is roughly
    // radial, not a simple line).
    footprint: { xSemiAxisKm: 0.13, ySemiAxisKm: 0.075, bearingDeg: 45, jitterFraction: 0.14 },
    metadata: {
      // Static structural/security trait, NOT distance- or time-
      // dependent (those are computed live — see file header). A deep,
      // dual-line underground interchange is inherently more
      // structurally solid and better-equipped (multiple independent
      // gates, larger concourse, staffed) than a single-line station or
      // a shallow market, hence 'very-high' here vs 'high'/'moderate'
      // elsewhere in this file.
      structuralRating: 'very-high',
      feasibilityNote:
        'Major Blue/Yellow Line interchange with a large underground concourse and multiple independent gates onto Connaught Place\u2019s inner and outer circles — high real-world capacity and redundant egress.',
    },
  },
  {
    id: 'patel-chowk',
    name: 'Patel Chowk Metro Station',
    lat: 28.6232,
    lng: 77.2118,
    // Single-line (Yellow Line only) station on Sansad Marg — smaller
    // and more linear than an interchange, so a tighter, more
    // platform-shaped footprint than Rajiv Chowk's.
    footprint: { xSemiAxisKm: 0.09, ySemiAxisKm: 0.05, bearingDeg: 10, jitterFraction: 0.12 },
    metadata: {
      structuralRating: 'high',
      feasibilityNote:
        'Single-line Yellow Line station — solid underground construction, but a smaller concourse and fewer independent gates than an interchange station like Rajiv Chowk or Central Secretariat.',
    },
  },
  {
    id: 'central-secretariat',
    name: 'Central Secretariat Metro Station',
    lat: 28.615,
    lng: 77.2118,
    // Yellow/Violet Line interchange (soon Magenta too) directly under
    // Kidwai Marg/Kartavya Path — the biggest interchange in this
    // roster after Rajiv Chowk, oriented roughly east-west along that
    // corridor.
    footprint: { xSemiAxisKm: 0.12, ySemiAxisKm: 0.08, bearingDeg: 90, jitterFraction: 0.14 },
    metadata: {
      structuralRating: 'very-high',
      feasibilityNote:
        'Yellow/Violet Line interchange directly beneath Kartavya Path/Kidwai Marg. Structurally strong and high-capacity, but this exact proximity to Kartavya Path is why it is the one shelter this scenario marks inaccessible once that boulevard force-jams (see INACCESSIBLE_AFTER_KARTAVYA_JAM_SHELTER_ID above) — being the best-built shelter doesn\u2019t help if the road to reach it is blocked.',
    },
  },
  {
    id: 'palika-bazaar',
    name: 'Palika Bazaar',
    lat: 28.631,
    lng: 77.2186,
    // Underground shopping arcade under Connaught Place's Central Park
    // (not a metro-grade structure) — roughly circular/oval given its
    // real layout (a ring of shops), with more jitter than the metro
    // stations to read as a less regular, more market-like shape.
    footprint: { xSemiAxisKm: 0.11, ySemiAxisKm: 0.09, bearingDeg: 0, jitterFraction: 0.2 },
    metadata: {
      // Deliberately lower than the metro stations: a shallow
      // underground market predates metro-grade construction/fire and
      // crowd-safety standards, and (per its own Wikipedia article) has
      // real, documented safety/maintenance concerns — a materially
      // different structural class from a modern metro interchange,
      // not just a smaller version of one.
      structuralRating: 'moderate',
      feasibilityNote:
        'Shallow underground market (5 gates around Connaught Place\u2019s Central Park), not built to metro-station structural/fire-safety standards, and independently documented as being in a state of disrepair. Centrally located and close to Rajiv Chowk, but the weakest structural pick in this roster.',
    },
  },
  {
    id: 'pragati-maidan-tunnel',
    name: 'Pragati Maidan Tunnel Area',
    lat: 28.616,
    lng: 77.24,
    // Deliberately the largest, most elongated footprint here — "that
    // whole area" per the person's own framing, not a single portal
    // point. Representative point is the rough midpoint between the
    // tunnel's two real, documented ends (Purana Qila Road near the
    // National Sports Club of India, ~28.6154/77.2368, and the Ring
    // Road end near Pragati Power Station, ~28.617/77.244); bearingDeg
    // is that same midpoint-to-midpoint alignment (~76\u00b0, computed via
    // haversine bearing, not eyeballed). xSemiAxisKm is roughly half
    // the tunnel's real ~1.2\u20131.3km reported length so the drawn
    // ellipse's long axis approximates portal-to-portal span; this is
    // an honest approximation, not surveyed tunnel centerline geometry
    // — same disclosure standard as this file's other footprint notes.
    footprint: { xSemiAxisKm: 0.65, ySemiAxisKm: 0.07, bearingDeg: 76, jitterFraction: 0.1 },
    metadata: {
      // Lower than the metro stations: it's a road tunnel with vehicle
      // traffic and known real-world water-seepage/closure incidents
      // (independently reported), not a structure built or staffed as
      // a public refuge, even though it is a substantial underground
      // space that could plausibly function as one in an emergency.
      structuralRating: 'moderate',
      feasibilityNote:
        'A real six-lane, ~1.2\u20131.3km underground road tunnel connecting Ring Road to India Gate via Purana Qila Road beneath Pragati Maidan \u2014 large and genuinely underground, but a vehicle corridor rather than a purpose-built shelter, with documented water-seepage/closure history. Farthest of the five from the impact point.',
    },
  },
];

// Confidence notes (all re-verified this pass, not carried over from
// any prior session's unconfirmed trace):
// - Rajiv Chowk: 28.6328, 77.2196 \u2014 high confidence, Wikipedia infobox
//   coordinate (28\u00b037'58"N 77\u00b013'11"E), Central Delhi's major
//   Blue/Yellow Line interchange beneath Connaught Place.
// - Patel Chowk: 28.6232, 77.2118 \u2014 consistent with the coordinate
//   found in the prior session's trace; a single-line Yellow Line
//   station on Sansad Marg.
// - Central Secretariat: 28.615, 77.2118 \u2014 high confidence, Wikipedia
//   infobox coordinate (28\u00b036'54"N 77\u00b012'42"E), matching Wikidata's
//   independently-listed 28\u00b036'54.0"N/77\u00b012'42.5"E. Its own address
//   field names Kartavya Path directly, which is what makes it the
//   INACCESSIBLE_AFTER_KARTAVYA_JAM_SHELTER_ID pick above.
// - Palika Bazaar: 28.6310, 77.2186 \u2014 high confidence, Wikipedia's own
//   listed coordinate (28\u00b037'52"N 77\u00b013'07"E) for the underground
//   market between Connaught Place's inner and outer circles.
// - Pragati Maidan Tunnel Area: 28.616, 77.240 \u2014 MODERATE confidence
//   only, and explicitly a representative midpoint, not a single
//   sourced coordinate the way the other four are: built from two
//   separately-sourced real reference points (Purana Qila Road ~28.6154
//   /77.2368, and the Pragati Maidan/Ring Road vicinity ~28.617/77.244,
//   both cross-referenced against multiple sources describing the
//   tunnel's real Ring-Road\u2194Purana-Qila-Road alignment and ~1.2\u20131.3km
//   length), not a single scraped POI coordinate for "the tunnel"
//   itself (no such single point exists in public sources reviewed).