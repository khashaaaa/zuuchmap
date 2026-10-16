/** A locale file: nested objects ending in string leaves (i18next's default shape). */
export interface TranslationTree {
  [key: string]: string | TranslationTree;
}
