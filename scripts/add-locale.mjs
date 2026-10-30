import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [requestedCode, name, requestedDirection] = process.argv.slice(2);
if (!requestedCode || !name) throw new Error('Usage: npm run i18n:add -- fr "Français" [ltr|rtl]');
const [locale] = Intl.getCanonicalLocales(requestedCode);
const localeInfo = new Intl.Locale(locale);
const direction = requestedDirection ?? (localeInfo.getTextInfo?.() ?? localeInfo.textInfo)?.direction ?? "ltr";
if (!["ltr", "rtl"].includes(direction)) throw new Error("Direction must be ltr or rtl");
const english = JSON.parse(await readFile(path.join(root, "apps/web/src/locales/en.json"), "utf8"));
const catalog = { locale, name, direction, messages: english.messages, content: english.content };
const target = path.join(root, "apps/web/src/locales", `${locale}.json`);
await writeFile(target, `${JSON.stringify(catalog, null, 2)}\n`, { flag: "wx" });
execFileSync(process.execPath, [path.join(root, "scripts/i18n.mjs")], { stdio: "inherit" });
console.log(`Created ${target}. Translate its English seed text; it is already listed in the language menus.`);
