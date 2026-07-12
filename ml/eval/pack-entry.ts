// esbuild entry used by build-normalization.mjs to extract the language
// pack's scoring data into plain JSON for the Node eval scripts (which
// can't import the app's extensionless-TS modules directly).
import { CANTONESE_PACK } from "../../src/languages/yue-HK";

export const normalization = {
  language: CANTONESE_PACK.code,
  charEquivalents: CANTONESE_PACK.scoring.charEquivalents,
  particleGroups: CANTONESE_PACK.scoring.particleGroups,
  sttPrompt: CANTONESE_PACK.stt.prompt,
};
