/**
 * Language scoping for user data (phrases, sessions, conversation lessons).
 *
 * Rows created before multi-language support have no languageCode; they are
 * legacy Cantonese data, so an absent code always means DEFAULT_LANGUAGE_CODE.
 * Standalone on purpose: no imports, safe to use from repositories, providers,
 * and features without cycle risk.
 */
export const DEFAULT_LANGUAGE_CODE = "yue-HK";

export interface LanguageScoped {
  languageCode?: string;
}

export function matchesLanguage(item: LanguageScoped, code: string): boolean {
  return (item.languageCode ?? DEFAULT_LANGUAGE_CODE) === code;
}

export function filterByLanguage<T extends LanguageScoped>(items: T[], code: string): T[] {
  return items.filter((item) => matchesLanguage(item, code));
}
