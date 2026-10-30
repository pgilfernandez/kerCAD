# Internationalization

- Every change that adds or modifies user-facing text must update the language
  catalogs in `apps/web/src/locales/` for **every installed language**. Currently:
  English (`en`), Spanish (`es`), French (`fr`), Italian (`it`) and German (`de`).
  Discover the installed languages from the JSON files; do not treat this list as
  a limit when more languages are added.
- Keep interface text out of components and other application code. Use catalog
  keys through the existing translation helpers. Structured tutorial,
  documentation and primitive content belongs in the catalogs too.
- Translate complete phrases, preserving interpolation variables, technical IDs,
  asset paths and stored CAD values. Preserve user-authored project/challenge
  content without translation.
- Run `npm run i18n` after changing text. It must pass with every installed catalog
  complete. Do not use `--allow-incomplete` to finish a change; that option is only
  for temporary translation drafts and fallback tests.
- Language menus are generated from catalog metadata. New languages must appear
  automatically, without adding per-language branches to components.

See `apps/web/src/locales/README.md` for the catalog workflow.

# Commits

- Create focused commits after each completed implementation, unless the user
  explicitly requests otherwise. Include only the related changes and preserve
  unrelated local work.
