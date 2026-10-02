# Word-count rules

Wordsmith counts prose in a deterministic way so totals are explainable even when they differ from Notion, Reedsy, or another writing tool.

## Included blocks

- paragraph
- heading_1
- heading_2
- heading_3
- quote
- bulleted_list_item
- numbered_list_item
- callout

Callouts count because writers often use them as prose notes or epigraph-style text. This can be revisited when per-source configuration exists.

## Excluded blocks

- code
- equation
- bookmark
- embed
- image, file, pdf, video, audio captions
- link_preview
- child_page titles
- child_database metadata
- table and table_row
- synced_block and template
- breadcrumb, divider, columns, table of contents, link_to_page

Page titles and child page titles are not counted as manuscript prose.

## Token convention

- Contractions count as one word: `don't` is 1.
- Curly apostrophes are normalized: `don�t` is 1.
- Hyphenated compounds count as one word: `mother-in-law` is 1.
- Em dashes and en dashes split words: `hello--world` style dash text is treated as 2 when using typographic dashes.
- Numbers count as words when they appear as tokens.
- Multiple whitespace characters do not change the result.
- Empty strings count as 0.

The implementation is Unicode-aware and does not use a large NLP dependency.

## Progress semantics

Absolute page counts and manuscript period writing progress are separate. First observation of each source establishes a zero-delta baseline. Later observations store current counts and derive previous count, observed delta, observed additions and observed removals. Daily/weekly/monthly values sum deltas by observation timestamp in the writer's IANA timezone; weeks start Monday. TOTAL goal progress uses absolute manuscript count.

Edits between observations are sampled: +100 then -50 before the next count can appear only as +50. Wordsmith cannot claim exact gross additions/removals or assign an unobserved edit to its actual writing time. Newly created pages also establish baselines in this iteration. See [the complete baseline rules](NOTION_NATIVE_ARCHITECTURE.md).

Future word/phrase frequency analysis can use the same ephemeral extracted block text. It is not implemented here. Stop-word lists, case/punctuation normalization, stemming, n-gram lengths and whether any derived frequencies should persist remain explicit future decisions; raw prose persistence is not a prerequisite.
