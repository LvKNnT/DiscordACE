# DiscordACE Python helper

This local helper finds Vietnamese anagram candidates from challenge text copied from Discord Web. It does not connect to Discord or send messages.

## Run

Keep `discordace.py`, `Viet74K.txt`, and `Viet74K-LICENSE.txt` together. From this folder, run:

```powershell
conda run -n base python .\discordace.py
```

In Discord Web, select and copy the challenge card text. In DiscordACE, choose **Paste from clipboard** or paste into the text box, then choose **Find candidates**. Select a candidate to copy it, or mark it tried to remove it from the remaining list. **Undo** restores the last marked candidate. **Reset round** clears tried state for the current letter set and syllable count.

Tried candidates persist in `%LOCALAPPDATA%\DiscordACE\state.json`. If an identical puzzle appears in a later round, choose **Reset round** to start over.

## Limits and data

This Python version uses the clipboard as the bridge from Discord Web. The browser extension described in the project plan can later detect cards from the page DOM directly. OCR, automatic Discord posting, and network lookups are not used.

The included Vietnamese word list is from [duyet/vietnamese-wordlist](https://github.com/duyet/vietnamese-wordlist), distributed under GPL-2.0; its license text is included in `Viet74K-LICENSE.txt`.
