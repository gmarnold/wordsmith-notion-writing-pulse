# Notion-native architecture

I keep the current database inspection and counting adapter. Scene rows hold their own absolute Word Count, optionally Last Counted. The compact Wordsmith embed holds manuscript-wide progress. Setup and troubleshooting remain in the existing web app.

## Decision: scene properties plus an embed

| Approach                                                               | API requests per changed scene                                            | Feedback loop risk                                                       | Setup / database clutter                                    | Reliability and user experience                                                              | Public-product fit            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------- |
| Copy Today Net and goal progress to every scene                        | O(number of scenes) writes                                                | Many property events and partial writes                                  | Easy concept, several changing columns on every row         | Values may disagree while writes finish                                                      | Poor request efficiency       |
| Companion manuscript/status record with relations and rollups/formulas | One scene write plus one status-record write after setup                  | Bounded; still distinguish content and property events                   | More setup: companion database, relations, rollups/formulas | Native global values inside scene properties; permissions and broken relations need handling | Good later, with guided setup |
| Scene Word Count plus read-only embed (chosen)                         | One changed scene write, plus block retrieval; embed polls Wordsmith only | Low: content event subscription, changed-value writes and no-op recounts | Two optional scene columns and one embed                    | Clear global progress above Scenes; open the same widget in an individual scene if desired   | Smallest useful foundation    |

This iteration does not copy global metrics into every row. For global metrics while an individual scene is open, embed the same read-only dashboard there, or return to the project page. A status record with relations/rollups is the next option if native scene properties are more useful than widgets. Notion formulas cannot independently fetch Wordsmith's HTTP stats endpoint.

## Properties

Wordsmith reads the selected database/data-source schema and lists Number and Date properties. Mapping saves the stable property ID. Renaming a property works; deleting and recreating it creates a new ID and requires remapping. Only mapped fields are PATCHed; all other properties are left alone.

The current [data-source update API](https://developers.notion.com/reference/update-a-data-source) supports schema changes. I chose manual creation for this slice because safe creation needs an explicit schema preview, duplicate/collision handling and data-source/capability confirmation. No schema is silently modified. In Notion use Add property → Number → Word Count, optionally Add property → Date → Last Counted; reload Wordsmith and select them. These names are suggestions, not hard-coded requirements.

Last Counted is the successful count snapshot timestamp used for write-back. An unchanged automatic observation is deliberately a no-op and retains that timestamp; a manual recount records a fresh snapshot. Count failures leave it unchanged. If Notion write-back fails after a count was persisted, history remains intact and the retry repairs the mapped properties using that same snapshot.

## Period and baseline semantics

- Each included source's first observation is a baseline with zero writing delta, even if it is an old 40,000-word scene or is newly included after manuscript tracking began.
- For subsequent observations, delta = current observed count minus previous observed count for that source. Sum those deltas across scenes; do not subtract incomplete manuscript run totals.
- Assign the delta to the observation's timestamp in the configured IANA timezone. Days use local calendar dates; weeks begin Monday; months use local calendar months. No fixed 24-hour arithmetic defines local days, so DST days work.
- If there is no midnight snapshot, Wordsmith cannot know when an offline edit occurred. The next observed delta belongs to the observation period. Periods without observations contribute zero. First-sync baseline work contributes zero.
- A genuinely new Notion page also establishes a baseline in this conservative iteration. I do not infer pre-observation writing from page creation metadata. A later opt-in rule could count new pages only with reliable creation-time metadata and active-tracking evidence.
- Source membership is selected when the manuscript is created. New scenes are not automatically discovered by content events; review tracking by inspecting the database again. Editing existing saved source membership and membership history are later work. Recreating a manuscript establishes new baselines; do not treat that as continued history.
- DAILY/WEEKLY/MONTHLY goals use period net changes; TOTAL uses absolute current manuscript count. Targets are optional positive integers. Negative writing progress is preserved; bars clamp at zero while text remains signed. Changing timezone reinterprets observed history in that timezone. Changing a goal changes the current denominator; historical goal versions are not stored yet.

Counts cannot reveal every addition and removal between observations. Positive observed deltas are observed additions; negative observed deltas are observed removals. A net +50 snapshot does not prove +100 typed and -50 deleted. Raw prose remains ephemeral.

Official references: [update page properties](https://developers.notion.com/reference/patch-page), [webhooks](https://developers.notion.com/reference/webhooks), [relation and rollup properties](https://developers.notion.com/reference/page-property-values).
