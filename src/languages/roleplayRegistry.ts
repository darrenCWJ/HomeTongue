import type { RoleplayPack, RoleplayScenario } from "./roleplay";
import { YUE_HK_ROLEPLAY } from "./yue-HK/roleplay";
import { NAN_TW_ROLEPLAY } from "./nan-TW/roleplay";

/**
 * Scenario-provider registry, keyed by language code.
 *
 * A language pack opts into the roleplay trainer by authoring a
 * `src/languages/<code>/roleplay.ts` module and registering it here — packs
 * without an entry simply have no Roleplay card on the Learn page
 * (`hasRoleplayScenarios` gates it). Content is imported eagerly on purpose:
 * scenarios are a few KB of prose, the Learn surface is already a lazy route
 * chunk, and a static map keeps lookups synchronous for render-time gating.
 */
const ROLEPLAY_PACKS: Readonly<Record<string, RoleplayPack>> = {
  "yue-HK": YUE_HK_ROLEPLAY,
  // SAMPLE content pending native-speaker review — see nan-TW/roleplay.ts.
  "nan-TW": NAN_TW_ROLEPLAY,
};

const NO_SCENARIOS: ReadonlyArray<RoleplayScenario> = [];

/** The roleplay pack registered for a language code, or undefined. */
export function getRoleplayPack(languageCode: string): RoleplayPack | undefined {
  return ROLEPLAY_PACKS[languageCode];
}

/** Whether the language has authored roleplay scenarios (Learn-card gate). */
export function hasRoleplayScenarios(languageCode: string): boolean {
  return (ROLEPLAY_PACKS[languageCode]?.scenarios.length ?? 0) > 0;
}

/** The scenarios for a language, or an empty list when none are registered. */
export function getRoleplayScenarios(languageCode: string): ReadonlyArray<RoleplayScenario> {
  return ROLEPLAY_PACKS[languageCode]?.scenarios ?? NO_SCENARIOS;
}
