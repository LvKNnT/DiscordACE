# KingVietnamese

KingVietnamese helps solve the **Vua Tiếng Việt** letter scramble in Discord Web. It lists local dictionary entries that use exactly the displayed letters and match the requested number of tiếng. It never sends a Discord message.

## Chrome extension

Install the shared DiscordACE extension from the repository's `chrome` folder, then assign **KingVietnamese** to the relevant channel in its toolbar popup. The helper panel reads visible message text, tracks the latest Vua Tiếng Việt card, and updates when chat changes. Use **Copy** to copy a candidate, **Tried** to remove it from the remaining list, **Undo** to restore the last removed candidate, and **Reset round** to clear tried candidates for that card. If the card is not detected, use **Paste a prompt manually**. The popup on/off switch hides the panel completely when off.

The older unpacked extension under `KingVietnamese/chrome` has been replaced by the shared extension. Remove that installation before loading the new `chrome` folder. Tried-word data stored by the old installation cannot transfer automatically.

## Python desktop helper

The separate Tkinter helper works from copied challenge text:

```powershell
conda run -n base python .\KingVietnamese\kingvietnamese.py
```

## Dictionary data

`Viet74K.txt` is from [duyet/vietnamese-wordlist](https://github.com/duyet/vietnamese-wordlist). Its GPL-2.0 license and attribution are in `Viet74K-LICENSE.txt`.
