# KingVietnamese project plan

## Goal

Provide a local answer helper for the **Vua Tiếng Việt** scramble minigame in Discord Web. Read rendered challenge text, find all Vietnamese dictionary phrases that use exactly its letters and requested tiếng count, and show the remaining candidates. The user chooses and posts an answer manually.

## Project components

- Name the app, Python helper, README, and browser extension **KingVietnamese**.
- Keep the Python Tkinter helper for prompts copied from Discord Web. It offers candidate review, tried state, undo, reset, and copy.
- Add a Chrome Manifest V3 extension that reads visible rendered Discord chat DOM on `discord.com/channels/*`, detects the newest Vua Tiếng Việt challenge, and displays the same candidate helper in an isolated in-page panel. If detection fails, accept a manually pasted prompt.
- Add an extension popup switch that persists the helper's on/off setting. Off hides the panel and pauses DOM scanning; on restores both.
- Share the local Viet74K dictionary file between the project and extension package, including its GPL-2.0 license and attribution. Make no network requests at runtime.

## Candidate behavior

- Parse slash-separated letters and the `N tiếng` count from a challenge card. Ignore unrelated and answer-feedback messages.
- Normalize with Unicode NFC and casefold while preserving Vietnamese tone and `đ` distinctions. Keep only candidates with an exact letter multiset and exactly N whitespace-separated tiếng.
- Display all candidates in dictionary order. Let the user copy a candidate, mark it tried, undo, or reset the current card. Persist tried state locally by Discord message identity and puzzle signature.
- Never read or store Discord credentials, intercept API traffic, or send messages.

## Verification criteria

- The extension loads unpacked in Chrome and shows its panel on Discord channel pages only.
- A visible challenge card is parsed from rendered DOM; a new card refreshes the list and starts fresh tried state. Manual prompt entry works if DOM detection fails.
- Candidate matching preserves accents, handles repeated letters, filters by tiếng count, removes duplicate entries, and updates remaining count after mark/undo/reset.
- Copy sends only text to the clipboard. No action posts to Discord.

## Assumptions

- Discord Web renders the card text in selectable DOM nodes. DOM structure can change, so manual paste remains available.
- “Remaining candidates” are exact dictionary matches minus items the user marks tried. The extension does not infer failed guesses from chat.
- The dictionary may not contain every answer; empty results are shown without inventing candidates.
