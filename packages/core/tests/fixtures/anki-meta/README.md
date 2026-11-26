# Anki package `meta` checks

`packages/core/tests/apkg-meta.test.ts` builds every archive it uses in the test itself
(tiny SQLite images and ZIPs with neutral placeholder text). No file produced by Anki is
committed here, and no Anki template, source or stub text is copied into the repo. This
directory holds only this note.

## What the committed tests cover (synthetic)

- `meta` version 1 reads `collection.anki2`; version 2 reads `collection.anki21` and ignores
  the `collection.anki2` placeholder beside it; version 3 is refused with re-export advice
  before any collection is read; a declared collection that is missing is refused, with no
  fallback to the other entry.
- Without `meta`, selection and the "both collections present is ambiguous" refusal are
  unchanged.
- Byte-level protobuf cases: unknown fields of each wire type skipped, repeated version (last
  wins), padded varint, missing/0/4+ version, truncation, length overrun, groups, reserved
  wire types, field 0, wrong wire type for the version.
- The 4 KiB `meta` cap (a local resource policy, not an Anki rule) is enforced from the
  declared size before inflating: a 4097-byte entry with a corrupt CRC is refused for size,
  not for the CRC.

## Separately run real-export checks (NOT committed, NOT run in CI)

Two archives were generated with upstream Anki 26.9.4 (PyPI wheel `anki` sha256
`67950105a13fe9894fe424eb799afe01b2a1762f402bf877aaa5b3cb879ec8cc`, release tag `26.09.4` =
commit `c06370ff4d87cb48d825f90cc83e02b9a4e84ecd`) from synthetic notes only. Reference
sources at that commit: `rslib/src/import_export/package/meta.rs`,
`.../package/colpkg/export.rs`, `.../package/apkg/export.rs`, `proto/anki/import_export.proto`.

| archive | sha256                                                             | meta    | entries                                                |
| ------- | ------------------------------------------------------------------ | ------- | ------------------------------------------------------ |
| modern  | `cf6935907812079ba242cef8710dec443edbec8aac6c7628c821be2694dd5208` | `08 03` | `collection.anki21b`, stub `collection.anki2`, `media` |
| legacy  | `68e70d0f340edb4901d55d70b44e5228946ed33b310c2bcc7dc33d2152478b31` | `08 02` | `collection.anki21`, stub `collection.anki2`, `media`  |

Actual contents (counted with Python `sqlite3`): the legacy `collection.anki21` holds 3 notes
and 3 cards (two Basic, one Cloze); its stub `collection.anki2` holds 1 note and 1 card.

`parseApkg` before this change: modern resolved with one card (the stub, Anki's "update to the
latest Anki" notice); legacy threw the ambiguity refusal. After: modern is refused with the
"support older Anki versions" advice and imports nothing; legacy imports exactly its 3 cards.

Reproduce: generate the two archives with that Anki release (modern export default; legacy
with "support older Anki versions"), confirm the sha256 values above (or accept that a new
export differs in ids and timestamps), then call `parseApkg` on their bytes.

## Licensing

Anki is AGPL-3.0-or-later. The real archives contain Anki's stock notetype definitions and
its stub notice besides the synthetic notes, so they are not committed; the committed tests
are written from scratch.
