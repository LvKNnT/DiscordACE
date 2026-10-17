/* Pure game rules shared by the content script and fixture tests. */
(() => {
  "use strict";

  const SQUARES = { "⬛": "B", "⬜": "B", "🟨": "Y", "🟩": "G" };
  const VI_SEGMENTER = new Intl.Segmenter("vi", { granularity: "grapheme" });
  const cleanWord = (value) => String(value || "").trim().toLowerCase();
  const cleanName = (value) => String(value || "").normalize("NFC").trim().toLocaleLowerCase();

  function isSabiBot(author, headerText, fullText) {
    return /^sabi(?:\s+app)?$/iu.test(String(author || "").trim()) ||
      /^\s*sabi\b/iu.test(String(headerText || "")) ||
      /^\s*sabi\s+app\b/iu.test(String(fullText || ""));
  }

  function messageSnowflake(id) {
    return String(id || "").match(/(\d{15,22})(?:\D*)$/u)?.[1] || null;
  }

  function isAfterMessage(record, boundary) {
    if (!boundary) return true;
    const id = messageSnowflake(record.id);
    return id ? BigInt(id) > BigInt(boundary) : false;
  }

  function parseVietnamesePuzzle(value) {
    const text = String(value || "").normalize("NFC");
    const count = text.match(/(?:^|\W)(\d+)\s*(?:tiếng|tieng)(?=$|\W)/iu);
    if (!count) return null;
    for (const line of text.split(/\r?\n/)) {
      const parts = line.split("/").map((part) => part.trim());
      if (parts.length < 3) continue;
      const letters = parts.map((part) => [...VI_SEGMENTER.segment(part.toLowerCase())].map((item) => item.segment));
      if (letters.every((part) => part.length === 1 && /^\p{L}\p{M}*$/u.test(part[0]))) {
        return { letters: letters.map((part) => part[0]), tiengCount: Number(count[1]) };
      }
    }
    return null;
  }

  function findVietnamese(puzzle, lexicon) {
    const target = [...puzzle.letters].sort().join("");
    return lexicon.filter((entry) => {
      if (entry.split(/\s+/).length !== puzzle.tiengCount) return false;
      const letters = [...entry.normalize("NFC").toLowerCase()].filter((char) => /\p{L}/u.test(char)).join("");
      return [...VI_SEGMENTER.segment(letters)].map((item) => item.segment).sort().join("") === target;
    });
  }

  function findKingCards(messages) {
    const found = [];
    for (const message of messages) {
      for (const text of message.texts) {
        if (!/vua\s+tiếng\s+việt/iu.test(text)) continue;
        const puzzle = parseVietnamesePuzzle(text);
        if (!puzzle) continue;
        found.push({ id: message.id, puzzle });
        break;
      }
    }
    return found;
  }

  function parseWordleRows(value) {
    const text = String(value || "").replace(/\[([⬛⬜🟨🟩]+)\]\([^)]*\)/gu, "$1");
    const rows = [];
    const pattern = /((?:[⬛⬜🟨🟩]\s*){5})\s*([a-zA-Z]{5})(?![a-zA-Z])/gu;
    for (const match of text.matchAll(pattern)) {
      const tiles = [...match[1]].filter((char) => SQUARES[char]);
      if (tiles.length === 5) rows.push({ guess: match[2].toLowerCase(), pattern: tiles.map((tile) => SQUARES[tile]).join("") });
    }
    return rows;
  }

  function scoreGuess(guess, answer) {
    guess = cleanWord(guess);
    answer = cleanWord(answer);
    if (!/^[a-z]{5}$/.test(guess) || !/^[a-z]{5}$/.test(answer)) return null;
    const colors = Array(5).fill("B");
    const remaining = new Map();
    for (let i = 0; i < 5; i++) {
      if (guess[i] === answer[i]) colors[i] = "G";
      else remaining.set(answer[i], (remaining.get(answer[i]) || 0) + 1);
    }
    for (let i = 0; i < 5; i++) {
      if (colors[i] === "G") continue;
      const amount = remaining.get(guess[i]) || 0;
      if (amount > 0) {
        colors[i] = "Y";
        remaining.set(guess[i], amount - 1);
      }
    }
    return colors.join("");
  }

  const matchesWordle = (candidate, rows) => rows.every((row) => scoreGuess(row.guess, candidate) === row.pattern);

  function countState(records) {
    let current = null;
    let lastAuthor = null;
    let resetSeen = false;
    let pending = false;
    for (const record of records) {
      if (record.isBot && /đếm lại từ\s*1|dem lai tu\s*1|count again from\s*1/iu.test(record.text)) {
        current = 0;
        lastAuthor = null;
        resetSeen = true;
        pending = false;
      } else if (!record.isBot && /^\d+$/.test(record.text.trim())) {
        if (record.accepted) {
          if (lastAuthor && record.author && cleanName(lastAuthor) === cleanName(record.author)) {
            current = 0;
            lastAuthor = null;
            resetSeen = true;
          } else {
            current = Number(record.text.trim());
            lastAuthor = record.author || null;
            resetSeen = false;
          }
          pending = false;
        } else {
          pending = !record.rejected;
        }
      }
    }
    return { next: current === null ? null : current + 1, lastAuthor, resetSeen, pending };
  }

  function canAutoTypeCount(result, displayName) {
    return result.next !== null && !result.pending && !!result.lastAuthor && !!displayName && cleanName(result.lastAuthor) !== cleanName(displayName);
  }

  function linkingState(records) {
    const used = new Set();
    let lastWord = null;
    let lastAuthor = null;
    let pending = false;
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.isBot) {
        if (/từ này đã được nối|tu nay da duoc noi|already (?:been )?(?:linked|used)/iu.test(record.text)) {
          for (let j = i - 1; j >= 0; j--) {
            if (records[j].isBot) break;
            const duplicate = cleanWord(records[j].text);
            if (/^[a-z]+$/.test(duplicate)) {
              used.add(duplicate);
              pending = false;
              break;
            }
          }
        }
        continue;
      }
      const word = cleanWord(record.text);
      if (!/^[a-z]+$/.test(word)) continue;
      if (!record.accepted) {
        pending = !record.rejected;
        continue;
      }
      used.add(word);
      lastWord = word;
      lastAuthor = record.author || null;
      pending = false;
    }
    return { lastWord, lastAuthor, firstLetter: lastWord?.at(-1) || null, used, pending };
  }

  function wordleState(records) {
    let rows = [];
    let lastAuthor = null;
    let roundKnown = false;
    let newRound = false;
    let resetId = null;
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (!record.isBot) continue;
      const parsed = parseWordleRows(record.text);
      const resetMatch = /(?:ô chữ\s+wordle\s+mới|new\s+wordle\s+(?:round|game))/iu.exec(record.text);
      if (parsed.length) {
        rows = parsed;
        roundKnown = true;
        newRound = false;
        const latestGuess = rows.at(-1).guess;
        lastAuthor = null;
        for (let j = i - 1; j >= 0; j--) {
          if (records[j].isBot && parseWordleRows(records[j].text).length) break;
          if (records[j].isBot) continue;
          if (cleanWord(records[j].text) === latestGuess) {
            lastAuthor = records[j].author || null;
            break;
          }
        }
      }
      if (resetMatch && (!parsed.length || resetMatch.index > record.text.toLowerCase().lastIndexOf(parsed.at(-1).guess))) {
        rows = [];
        lastAuthor = null;
        roundKnown = true;
        newRound = true;
        resetId = record.id || `${i}:${resetMatch.index}`;
      }
    }
    let pending = false;
    const latestBot = records.findLastIndex((record) => record.isBot && (parseWordleRows(record.text).length || /(?:ô chữ\s+wordle\s+mới|new\s+wordle\s+(?:round|game))/iu.test(record.text)));
    for (const record of records.slice(latestBot + 1)) {
      if (!record.isBot && /^[a-z]{5}$/i.test(record.text.trim()) && !record.accepted && !record.rejected) pending = true;
    }
    return { rows, lastAuthor, roundKnown, newRound, resetId, pending, won: rows.at(-1)?.pattern === "GGGGG", lost: rows.length >= 6 && rows.at(-1)?.pattern !== "GGGGG" };
  }

  const api = { cleanName, cleanWord, isSabiBot, messageSnowflake, isAfterMessage, canAutoTypeCount, parseVietnamesePuzzle, findVietnamese, findKingCards, parseWordleRows, scoreGuess, matchesWordle, countState, linkingState, wordleState };
  globalThis.DiscordACEGames = api;
  if (typeof module !== "undefined") module.exports = api;
})();
