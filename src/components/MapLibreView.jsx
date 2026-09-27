import { MapLibreEngine } from './maplibre/MapLibreEngine';
import { getSceneConfig } from './maplibre/sceneRegistry';

/**
 * MapLibreView — thin, backward-compatible wrapper. This used to BE the
 * whole 3,722-line monolithic component (hardcoded to the
 * security-attack scenario only); it now just resolves the active
 * scene's config (see sceneRegistry.js) from `scenario.id` and hands
 * off to the real engine (MapLibreEngine.jsx, shared across every
 * registered scene). Kept at this exact file path/export name so
 * CommandShell.jsx's existing `import { MapLibreView } from
 * './MapLibreView'` — and any other existing consumer — needs zero
 * changes.
 *
 * Prop contract is unchanged from before: a single `scenario` object
 * shaped like a scenario JSON entry, with `baseline` already swapped
 * for whichever timeline-merged / intervention state the caller wants
 * rendered (see CommandShell's `mapViewScenario`).
 */
export function MapLibreView(props) {
  const sceneConfig = getSceneConfig(props.scenario?.id);
  return <MapLibreEngine {...props} sceneConfig={sceneConfig} />;
}

export default MapLibreView;