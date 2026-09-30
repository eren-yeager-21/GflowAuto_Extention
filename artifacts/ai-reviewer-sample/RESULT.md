# Live DeepSeek reviewer sample

Conversation: https://chat.deepseek.com/a/chat/s/9faf39a2-bfa1-4055-9c49-e41129d419b1

Image: references/clean/anchor_infographic_map.png, 1920 × 1072. The same uploaded image was used throughout; no images were generated.

| Case | DeepSeek verdict | Score | Confidence | Actual module parser |
| --- | --- | --- | --- | --- |
| Cave and one red pin in southern Germany | Pass | 95 | 0.95 | Passed after a schema correction |
| Three distinct red pins required | Fail | 45 | 0.98 | Failed assessment accepted on first response |

The negative case identified the two missing red pins, supplied two major issues using the required fields, and returned a complete corrected prompt.

## Findings and changes

- The live composer reported a loaded thumbnail and enabled Send arrow while a generic .ds-loading element remained visible. The updated readiness gate accepted this state.
- The initial response used description/location issue fields instead of the parser's required category/region/evidence/correction fields. The output prompt now explicitly defines every required issue field. The corrected positive response and the subsequent negative response passed the actual contract parser.
- Completed response buttons were siblings of .ds-message. The old completion check found zero buttons; the corrected check found six buttons in the nearest single-response group.
- A retry before Send now rebuilds its prepared prompt using the current contract.

## Scope

Codex's browser file-picker events timed out. Upload succeeded using the browser clipboard's PNG API. The browser tool's Send click was not acknowledged; Enter submitted the request and opened the recorded chat. Long clipboard text was restored with DeepSeek's Paste original control after the site converted it to a text attachment.

This exercised the real validator prompt, provider response, module JSON parser, and read-only DOM readiness/completion checks. It did not run the installed Chrome extension's DataTransfer upload, automatic background click, job persistence, or Flow regeneration. Successful provider assessment does not establish accuracy on other kinds of images.

Artifacts: job.json, prompt.txt, initial-response.json, response.json, report.json, negative-job.json, negative-prompt.txt, negative-response.json, negative-report.json, readiness.json, completion.json, prepared.png, and result.png.
