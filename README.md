# DiscordACE

DiscordACE provides read-only helpers for four Sabi Discord minigames. Its Chrome extension reads the messages already rendered in Discord Web and shows suggestions in an in-page panel. It does not use a Discord token, call Discord's API, or send chat messages.

## Install the shared Chrome extension

1. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
2. Remove the older **KingVietnamese helper** extension if it is installed. Its local tried-word history cannot automatically transfer to this new extension package.
3. Choose **Load unpacked** and select this repository's `chrome` folder.
4. Open a Discord channel in `https://discord.com/channels/`, click the DiscordACE toolbar button, and assign that channel's game.
5. Enter your exact displayed Discord name for turn warnings. Assign each game channel separately.

The toolbar button also turns the helper on or off. Off hides the panel and pauses chat scanning. Settings persist in Chrome extension storage. The panel appears only in channels assigned a game.

## Game helpers

| Game | What the panel shows |
| --- | --- |
| KingVietnamese | Exact anagram candidates from the bundled Viet74K list, with Copy, Tried, Undo, Reset, and manual prompt entry. |
| CountNum | The next number after bot-confirmed counts or a bot reset. An optional popup setting types it into an empty Discord composer when another player's move confirms your turn; it never sends. |
| LinkingWord | The required starting letter and bundled English words not seen as accepted or rejected as already linked. **Reset game words** starts tracking after the latest visible message when the bot resets the game. |
| Wordle | Five-letter candidates matching the bot's colored-square grid, including the first guess after a new-round message. Enter the round's guesses and five-character `B/Y/G` clues manually if the grid cannot be read. Manual clues take precedence until cleared. |

Turn warnings compare the latest accepted player's displayed name with your configured name. A missing author, pending move, or incomplete visible history is reported as uncertain. Discord often unloads older chat messages, so CountNum and LinkingWord may need earlier messages scrolled into view before their state can be reconstructed. The bundled English list may differ from the bot's accepted dictionary; candidates are suggestions, not guarantees.

## Source and tests

The existing Python desktop helper remains in `KingVietnamese/`. Run it in the Conda `base` environment:

```powershell
conda run -n base python .\KingVietnamese\kingvietnamese.py
```

The extension rules have fixture tests:

```powershell
node --test .\tests\games.test.js
```

The English list is [dwyl/english-words `words_alpha.txt`](https://github.com/dwyl/english-words/blob/master/words_alpha.txt), distributed under its [Unlicense](https://github.com/dwyl/english-words/blob/master/LICENSE.md); copies are bundled in `chrome/`. The Vietnamese list and its license are bundled there as well, with further details in `KingVietnamese/README.md`. Both lists are loaded locally; the extension makes no runtime network request.
