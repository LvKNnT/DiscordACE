# DiscordACE implementation plan

## Goal

Build a **read-only answer helper** for the **Vua Tiếng Việt** scramble shown in Discord web. It reads the currently visible challenge card, generates Vietnamese words or phrases using exactly the displayed letters and the required `N tiếng`, and shows the remaining candidates. The user chooses and sends an answer manually. Selecting or marking a candidate as tried removes it from the remaining list for that round. The helper never sends Discord messages, uses a Discord token, or calls Discord's private API.

## Browser integration and UI

- Implement a local, unpacked Manifest V3 extension for Microsoft Edge, which is installed on this machine. Restrict its content script to `https://discord.com/channels/*`. Read only the rendered DOM of the signed-in Discord web tab; use a `MutationObserver` to notice visible message changes. Do not intercept network traffic or depend on Discord's internal JavaScript objects.
- Find the latest visible `Vua Tiếng Việt` card in the current channel. Extract its slash-separated letters and `N tiếng` count from rendered text; ignore adjacent success/meaning messages. Identify a round by the card's visible element plus normalized puzzle text, and reset the candidate state when a different card becomes current. If the card is not visible or the DOM format changes, show a clear “no puzzle detected” state and allow the user to paste the prompt manually.
- Show a small in-page panel with the parsed letters, tiếng count, remaining candidate count, and ranked candidate list. Each row has **Copy** and **Mark tried** actions; neither action posts to Discord. Provide **Undo** and **Reset round** controls. Keep the panel readable without covering the chat composer. Persist tried candidates locally per puzzle so reopening the tab does not restore eliminated entries.

## Candidate generation

- Package a local Vietnamese word-and-phrase list with the extension, starting from the [Viet74K list](https://github.com/duyet/vietnamese-wordlist). Include source attribution and comply with its GPL-2.0 license when distributing the extension. No cloud model or runtime network request is required for solving.
- Normalize input and dictionary entries to Unicode NFC, casefold, and ignore spaces/punctuation only for multiset comparison. Preserve Vietnamese vowel and tone distinctions and `đ` versus `d`. Keep candidates only when their letters match the puzzle exactly and their whitespace-separated syllable count equals `N tiếng`.
- Rank matches with a local frequency table when available; otherwise use dictionary order. Display all matching candidates rather than hiding low-confidence ones. Track the tried set separately and calculate `remaining = exact matches − tried`. Handle repeated letters and duplicate dictionary entries correctly.

## Implementation and tests

- Organize the project into the extension manifest, DOM parser/content script, candidate engine and local data, panel styles, and a README covering Edge's “Load unpacked” workflow. No Python runtime is required for the extension; if Python is used for one-time data preparation, run it in the Conda `base` environment.
- Test the parser against the supplied screenshot's manually transcribed card text and captured DOM fixtures from real Discord web cards. Test cards in different embed layouts, unrelated messages, channel changes, and DOM rerenders. The parser must not mistake success/meaning text for a new puzzle.
- Unit-test exact letter matching, accents, repeated letters, tiếng count, ranking, duplicate removal, Mark tried, Undo, Reset, and round persistence. Manually verify that the panel updates on a new card and that Copy places only the chosen answer on the clipboard without sending it.
- Acceptance: when a card is visible in Discord web, the panel shows the parsed puzzle and every local exact-match candidate not marked tried; marking and undoing a candidate updates the count immediately; a new card starts a fresh list; no Discord message is sent by the helper.

## Assumptions and limits

- “Remaining available words” means dictionary words/phrases that exactly use the current card's letters and have not been marked tried in the helper. Tried status is user-controlled; the extension does not infer failed attempts from chat messages.
- Discord web must render the challenge text as selectable DOM text in the open channel. If a future card is an image or Discord changes its markup, manual prompt paste remains available without OCR.
- Candidate coverage is limited by the local dictionary; the panel states when no match is found instead of inventing an answer.
