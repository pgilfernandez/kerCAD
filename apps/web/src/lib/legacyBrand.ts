// Read-only compatibility identifiers for files and browser data created before
// the kerCAD rename. New exports and storage always use the current brand.
export const LEGACY_BRAND = "educad";
export const LEGACY_PROJECT_SCHEMA = `org.${LEGACY_BRAND}.project`;
export const LEGACY_CHALLENGE_FORMAT = `${LEGACY_BRAND}-challenge`;
export const LEGACY_DEMO_CHALLENGE_ID = `${LEGACY_BRAND}-demo-key-tag@1`;
export const PROJECT_FILE_PATTERN = new RegExp(`\\.(?:kercad|${LEGACY_BRAND})$`, "i");
export const LEGACY_PROJECT_ACCEPT = `.${LEGACY_BRAND},.${LEGACY_BRAND}.json,application/vnd.${LEGACY_BRAND}.project+zip`;

export function isLegacyProjectSchema(value: unknown) { return value === LEGACY_PROJECT_SCHEMA; }
export function isLegacyChallengeFormat(value: unknown) { return value === LEGACY_CHALLENGE_FORMAT; }

export function legacyParametricVersion(schema: unknown): 1 | 2 | null {
  if (schema === `${LEGACY_BRAND}-parametric/v1`) return 1;
  if (schema === `${LEGACY_BRAND}-parametric/v2`) return 2;
  return null;
}

// Copy rather than delete old preferences, so an older installation can still
// be opened. Never overwrite a preference already saved by kerCAD.
export const BRAND_STORAGE_INITIAL_SCRIPT = `(function(){try{var marker="kercad.brand-storage-migrated";if(localStorage.getItem(marker)==="1")return;var keys=Object.keys(localStorage);for(var i=0;i<keys.length;i++){var key=keys[i];if(key.indexOf("${LEGACY_BRAND}.")!==0)continue;var next="kercad."+key.slice(${LEGACY_BRAND.length + 1});if(localStorage.getItem(next)===null)localStorage.setItem(next,localStorage.getItem(key));}localStorage.setItem(marker,"1");}catch(e){}})();`;
