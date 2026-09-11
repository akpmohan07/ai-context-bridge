# Store listing copy

The actual submitted copy for each store's listing (name, description,
category, etc.), kept here so it survives between sessions instead of living
only in a scratchpad file that gets wiped. **None of this is touched by `wxt
submit` or `release.yml`** — every store's listing content is edited by hand
in that store's own dashboard, separately from a code release. Update these
files when you update a listing, so they stay a real record of what's live,
not just what was drafted once.

- [`chrome-edge.txt`](./chrome-edge.txt) — Chrome Web Store and Edge Add-ons
  share the same plain-text listing format (no Markdown rendering; emoji/star
  markers are used for visual structure instead of headers).
- [`firefox.md`](./firefox.md) — Firefox's own fields (Name, Summary,
  categories, license, reviewer notes) plus the Description, which actually
  ships the *same* plain-text/emoji copy as Chrome/Edge for consistency, even
  though AMO's field supports real Markdown. That's a reasonable thing to
  revisit later; it's just not what's live right now.

All three tell the same story (same features, same voice).
