# Live DeepSeek context sample

Run on 2026-09-28 in the user's current Codex in-app browser tab. A new chat was opened within that tab to avoid earlier schema-2 instructions.

Chat: https://chat.deepseek.com/a/chat/s/bc555305-d71c-4e45-a9b6-0b26040ed660

The sample generated its prompts using the current extension's `contextPrompt()` and `prompt()` functions. It uploaded all 15 bundled contact sheets and sent the user's complete timestamped transcript and validator instructions once. DeepSeek returned the expected context acknowledgement, which `parseContext()` accepted.

Two subsequent compact frame requests reused that same conversation without repeating the validator, transcript, or sheets:

| Request | Image and requirements | Actual response | Extension parser |
| --- | --- | --- | --- |
| Independent frame | Map with one red pin and cave; prompt/narration require that scene | `regenerate_image: false`, `corrected_prompt: null` | Passed |
| Dependent frame | Candidate plus labeled previous frame; prompt/narration require three red pins, candidate has one | `regenerate_image: true`, complete corrected prompt requiring three pins | Failed assessment, as expected |

Both frame responses used exactly seven schema-3 fields, correct review/frame/attempt/hash identities, and strict JSON accepted by the current `parseReport()` function without formatting repairs. Received text and parsed results are saved beside this file. `result.png` shows the final correction response.

## Scope and limits

Browser interaction used the supported file chooser and keyboard Send controls. DeepSeek converted pasted text longer than 2,000 characters into an attachment in this browser; the sample used Paste original and removed duplicate unsent text attachments before submitting. The extension adapter assigns composer text directly instead of using clipboard paste.

This validates live website attachments, context acknowledgement, shared-chat behavior, compact requests, image decisions, DOM JSON retrieval, and the extension's actual prompt generators and parsers. It does not run the installed Chrome extension's background worker, sequential DataTransfer uploads, automatic click handler, persistent review queue, pause/resume, or Flow regeneration. No Flow generation was requested or performed. Reusing the same image as previous-frame evidence checks the two-image transport and labeling, but does not establish accuracy for character/action continuity across distinct frames.
