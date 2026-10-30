# Languages

Every `.json` file in this directory is a language catalog. English (`en.json`)
is the source and fallback language. Both the welcome dialog and the regular
language menu read the generated registry, including each language's native name.

To add a language:

```sh
npm run i18n:add -- pt "Português"
# For a right-to-left language:
npm run i18n:add -- ar "العربية" rtl
```

The command creates a catalog seeded with English text. Translate the string
values in `messages` and `content`, preserving keys, interpolation variables such
as `{count}`, array order, and technical `id` values. The language is automatically
available in every language chooser. No component, union type or menu needs editing.
Alternatively copy `en.json`, change `locale`, `name`, `direction`, and save it as
`<locale>.json` using a BCP 47 language tag (for example `pt-BR`).

Run `npm run i18n` to validate catalogs and regenerate the registry. Development,
builds, type checks and unit tests run this automatically. The development server
also watches this directory: adding, removing or editing a catalog refreshes the
registry and interface without restarting. Commit the catalog and `registry.generated.ts` together.

**Every text change must include translations for every installed language.**
Currently these are English, Spanish, French, Italian and German. Update both
`messages` and any affected `content` entries in all catalogs. Normal validation
fails if a message or structured content entry is missing in any language. Run
`npm run i18n` before considering the change complete. Keep technical IDs and
image filenames unchanged. The repository's `AGENTS.md` applies this rule to
future implementation work.

At runtime, missing messages and missing nested content use English as a safety
net. For temporary drafts only, `npm run i18n -- --allow-incomplete` permits an
unfinished catalog; normal development/build validation requires completeness.
An empty string is an
intentional translation, not a missing value. The validator rejects malformed
metadata, unknown message keys and altered interpolation variables. Language
preferences persist in the browser, synchronize across tabs and can be shared
using `?lang=fr`. The document's `lang` and `dir` follow the selected language.
The welcome dialog always starts in English until a language is explicitly chosen.
Its greeting carousel reads `welcome.greeting` from every installed catalog;
translate that message as a native greeting when adding a language.

## Interface text

Use `kercadTranslate(locale, "section.key", values)` when a component has a locale,
or `uiText("section.key", values)` for controls that use the application locale.
Add new source text to `en.json`; translations belong in catalogs, never in JSX
or `locale === "es"` branches. Use complete phrases with named variables. User
project names, annotations, challenge content and imported documents are not
translated.

Use `pluralMessage(locale, "section.key", count)` with `section.key.one` and
`section.key.other`. Add `.zero`, `.two`, `.few` or `.many` for languages needing
those categories. Categories are selected by `Intl.PluralRules`; unavailable
categories fall back to `.other`. Date and number presentation uses the selected
locale; stored CAD geometry and unit identifiers remain unchanged.

`content` holds structured tutorial cards, documentation, the about page and
primitive descriptions. `getLocaleContent()` merges missing entries with English.
`sourceAliases` in the English catalog maps legacy parameter labels to translation
keys; it is a compatibility lookup, not another locale list. Stored enum values
(`Off`, `Brick`, `Custom`), keyboard keys, units, font names, CSS classes, SVG paths
and protocol identifiers are technical values and are not translated. Their
visible labels can use `translateSourceText()`.

`interfaceTextCatalogs.test.ts` guards against new hardcoded JSX text, static
accessibility labels and references to missing catalog messages.
