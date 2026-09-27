/**
 * Registry of scenes MapLibreEngine can render. Adding a new scene
 * (a new scenario that should get the 3D/camera treatment instead of
 * the plain SVG MapView) means: create scenes/&lt;name&gt;Scene.js with the
 * same shape as the two below, then add it to SCENES here. Nothing in
 * MapLibreEngine.jsx or mapEngineCore.js needs to change.
 */
import { securityAttackScene } from './scenes/securityAttackScene';
import { tehriDamBreachScene } from './scenes/tehriDamBreachScene';

const SCENES = {
  [securityAttackScene.id]: securityAttackScene,
  [tehriDamBreachScene.id]: tehriDamBreachScene,
};

// Scenario ids that should render through MapLibreEngine's 3D/camera
// view instead of the plain SVG MapView — replaces the old
// `activeScenario.id === 'security-attack'` single-scenario check in
// CommandShell.jsx with membership in this set.
export const MAPLIBRE_SCENE_IDS = Object.keys(SCENES);

/**
 * @param {string} scenarioId
 * @returns {object} the matching scene config, or securityAttackScene
 *   as a safe default (matches the old code's implicit behavior, which
 *   only ever ran with that one scene's config).
 */
export function getSceneConfig(scenarioId) {
  return SCENES[scenarioId] || securityAttackScene;
}

export default getSceneConfig;