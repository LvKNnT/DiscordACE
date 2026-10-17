# DiscordACE multi-game helper plan

## Summary

Build one read-only Chrome extension for KingVietnamese, CountNum, LinkingWord, and Wordle. Assign one game to each Discord channel in the popup. The extension reads rendered chat messages, shows playable suggestions, and never sends messages.

## Implementation

- Move the Chrome extension into a shared `chrome/` folder. Preserve KingVietnamese candidates, tried state controls, manual prompt entry, and the on/off setting. Replace the old unpacked extension installation with the shared one.
- Save per-channel game assignments and the user's displayed Discord name. Show the last accepted player and a wait warning when that name matches the user's; show an uncertain turn when the author or game state is unknown.
- CountNum tracks bot-confirmed numbers and resets. A failed count or consecutive move restarts at 1; an unconfirmed number does not advance the displayed state.
- LinkingWord uses the previous accepted English word's final letter and offers unused candidates from a bundled list. The user waits until another player has an accepted move.
- Wordle parses five colored squares beside each guess from the rendered bot output, filters five-letter candidates with repeated-letter rules, accepts manual clues as a fallback, and clears a round when the bot starts a new one.
- Bundle the offline English list from dwyl/english-words with its license and attribution.

## Verification

Test the supplied count reset, word link, and Wordle examples; rejected and pending moves; consecutive players; repeated letters; round resets; incomplete visible history; channel changes; on/off; and KingVietnamese behavior. Confirm no helper action posts to Discord.

## Assumptions

A turn becomes available after one accepted move by another player. LinkingWord joins last letter to first letter. Bot confirmation takes precedence over pending player messages. The helper reports uncertainty when visible chat lacks enough evidence.
