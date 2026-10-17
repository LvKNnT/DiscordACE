# KingVietnamese

KingVietnamese helps solve the **Vua Tiếng Việt** letter scramble in Discord Web. It lists local dictionary entries that use exactly the displayed letters and match the requested number of tiếng. It never sends a Discord message.

## Chrome extension

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select this project's `chrome` folder.
3. Open or refresh Discord Web at `https://discord.com/channels/`.

The helper panel appears at the lower right. It reads visible message text from the rendered page, tracks the latest card whose text includes “Vua Tiếng Việt,” and updates when the chat changes. Use **Copy** to copy a candidate, **Tried** to remove it from the remaining list, **Undo** to restore the last removed candidate, and **Reset round** to clear the tried list for that card. If the message layout is not detected, open **Paste a prompt manually** and paste the card text. No OCR, Discord token, private API, or message sending is used.

Use the KingVietnamese toolbar button to turn the helper on or off. When off, the in-page panel is hidden and chat scanning is paused. The setting persists across Discord tabs and browser restarts.

The extension uses a packaged local word list. It needs no runtime network access. The content script only runs on Discord channel pages and stores tried candidates in Chrome's extension storage.

## Python desktop helper

The separate Tkinter helper works from copied challenge text:

```powershell
conda run -n base python .\kingvietnamese.py
```

Copy a challenge card from Discord Web, then use **Paste from clipboard**. Candidate matching and tried-word controls work the same way as in the extension.

## Dictionary data

`Viet74K.txt` is from [duyet/vietnamese-wordlist](https://github.com/duyet/vietnamese-wordlist). Its GPL-2.0 license and attribution are in `Viet74K-LICENSE.txt`.
