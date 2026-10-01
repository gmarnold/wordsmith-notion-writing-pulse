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
- Curly apostrophes are normalized: `don’t` is 1.
- Hyphenated compounds count as one word: `mother-in-law` is 1.
- Em dashes and en dashes split words: `hello--world` style dash text is treated as 2 when using typographic dashes.
- Numbers count as words when they appear as tokens.
- Multiple whitespace characters do not change the result.
- Empty strings count as 0.

The implementation is Unicode-aware and does not use a large NLP dependency.
