(() => {
  "use strict";

  if (document.getElementById("discordace-helper-root")) return;
  const rules = globalThis.DiscordACEGames;
  const GAMES = new Set(["KingVietnamese", "CountNum", "LinkingWord", "Wordle"]);
  const state = {
    enabled: true, channelGames: {}, displayName: "", autoTypeCount: false, channel: null, game: "",
    records: [], english: null, vietnamese: null, king: null, tried: new Set(), undo: [],
    observedWords: new Set(), linkResetId: null, manualRows: [], wordleResetId: null,
    lastAutoTypeKey: null, scanTimer: null, routeTimer: null, observer: null,
  };
  const host = document.createElement("div");
  host.id = "discordace-helper-root";
  host.hidden = true;
  const shadow = host.attachShadow({ mode: "open" });
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("panel.css");
  shadow.append(stylesheet);
  const panel = document.createElement("aside");
  panel.className = "panel";
  panel.innerHTML = `
    <header class="header"><div><strong data-role="title">DiscordACE</strong><div class="subtitle" data-role="subtitle"></div></div></header>
    <main class="body">
      <div class="status" data-role="status"></div>
      <div class="turn" data-role="turn"></div>
      <div class="summary" data-role="summary"></div>
      <div class="count" data-role="count"></div>
      <div class="candidates" data-role="candidates"></div>
      <div class="manual" data-role="manual"></div>
      <div class="controls" data-role="controls"></div>
      <div class="notice">Suggestions only. DiscordACE never sends a message.</div>
    </main>`;
  shadow.append(panel);
  const ui = Object.fromEntries(["title", "subtitle", "status", "turn", "summary", "count", "candidates", "manual", "controls"].map((role) => [role, panel.querySelector(`[data-role="${role}"]`)]));
  document.documentElement.append(host);

  function channelKey() {
    const match = /^\/channels\/([^/]+)\/([^/]+)/.exec(location.pathname);
    return match ? `${match[1]}/${match[2]}` : null;
  }

  function storageKey(prefix) { return `${prefix}:${state.channel}`; }
  function normalize(value) { return String(value || "").normalize("NFC").toLowerCase(); }
  function candidateKey(value) { return normalize(value).replace(/\s+/g, " ").trim(); }

  function puzzleSignature(puzzle) { return `${[...puzzle.letters].sort().join("")}:${puzzle.tiengCount}`; }

  async function loadWordList(file) {
    const response = await fetch(chrome.runtime.getURL(file));
    if (!response.ok) throw new Error(`Could not load ${file} (${response.status}).`);
    const seen = new Set();
    return (await response.text()).split(/\r?\n/).map((line) => line.trim()).filter((word) => {
      const key = candidateKey(word);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function ensureWords() {
    if (state.game === "KingVietnamese" && !state.vietnamese) state.vietnamese = await loadWordList("Viet74K.txt");
    if ((state.game === "LinkingWord" || state.game === "Wordle") && !state.english) {
      state.english = (await loadWordList("english-words.txt")).map((word) => word.toLowerCase()).filter((word) => /^[a-z]+$/.test(word));
    }
  }

  function textFromDom(root) {
    const output = [];
    const blocks = new Set(["DIV", "P", "BR", "LI", "H1", "H2", "H3", "SECTION"]);
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) { output.push(node.nodeValue); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName;
      if (["BUTTON", "TIME", "SCRIPT", "STYLE", "SVG"].includes(tag)) return;
      if (tag === "IMG") { output.push(node.getAttribute("alt") || ""); return; }
      if (tag === "BR") { output.push("\n"); return; }
      for (const child of node.childNodes) visit(child);
      if (blocks.has(tag)) output.push("\n");
    }
    visit(root);
    return output.join("").replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").trim();
  }

  function messageNodes() {
    const nodes = new Set([...document.querySelectorAll('[id^="chat-messages-"]'), ...document.querySelectorAll('[data-list-item-id^="chat-messages___"]')]);
    return [...nodes].filter((node) => node.isConnected && node.getClientRects().length > 0);
  }

  function kingCards() {
    const messages = messageNodes().map((node) => {
      // The challenge is in an embed, which may be outside message-content and
      // does not depend on Discord's author/header markup.
      return { id: node.id || node.getAttribute("data-list-item-id") || "visible-card", texts: [node.innerText || "", textFromDom(node)] };
    });
    return rules.findKingCards(messages);
  }

  function hasReaction(node, emoji) {
    const candidates = node.querySelectorAll('[class*="reaction"], [aria-label*="reaction"], [aria-label*="Reaction"]');
    for (const candidate of candidates) {
      if ((candidate.getAttribute("aria-label") || "").includes(emoji)) return true;
      if (candidate.querySelector(`img[alt="${emoji}"]`)) return true;
      if ((candidate.textContent || "").includes(emoji)) return true;
    }
    return false;
  }

  function readMessages() {
    let previousAuthor = null;
    let previousBot = false;
    return messageNodes().map((node) => {
      const header = node.querySelector("h3");
      const authorElement = node.querySelector('[id^="message-username-"]') || header?.querySelector("span");
      const fullText = textFromDom(node);
      const headerText = header?.textContent || "";
      const rawAuthor = authorElement?.textContent?.trim() || (header ? null : previousAuthor);
      const botBody = /(?:^|\n)Wordle\s*(?:\n|$)|từ này đã được nối|đếm lại từ\s*1/iu.test(fullText);
      const isBot = header ? rules.isSabiBot(rawAuthor, headerText, fullText) || botBody : previousBot || botBody;
      const author = isBot ? "Sabi" : rawAuthor;
      if (header) { previousAuthor = author; previousBot = isBot; }
      const content = node.querySelector('[id^="message-content-"]');
      const text = isBot ? fullText : textFromDom(content || node);
      return {
        id: node.id || node.getAttribute("data-list-item-id") || "",
        author, isBot, text,
        accepted: !isBot && hasReaction(node, "✅"),
        rejected: !isBot && hasReaction(node, "❌"),
      };
    });
  }

  function setTurn(lastAuthor, pending = false) {
    ui.turn.className = "turn";
    if (pending) { ui.turn.textContent = "Turn unknown — a move is awaiting bot confirmation."; return; }
    if (!state.displayName || !lastAuthor) { ui.turn.textContent = `Turn unknown${lastAuthor ? ` — last accepted: ${lastAuthor}` : ""}.`; return; }
    if (rules.cleanName(state.displayName) === rules.cleanName(lastAuthor)) {
      ui.turn.textContent = `Wait for another player. Last accepted: ${lastAuthor}.`;
      ui.turn.classList.add("wait");
    } else {
      ui.turn.textContent = `You may play. Last accepted: ${lastAuthor}.`;
      ui.turn.classList.add("ready");
    }
  }

  function button(label, action, word = "") {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = label;
    item.dataset.action = action;
    if (word) item.dataset.word = word;
    return item;
  }

  function showWords(words, limit = 50) {
    ui.candidates.replaceChildren();
    if (!words.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No matching candidates in the bundled list.";
      ui.candidates.append(empty);
      return;
    }
    const list = document.createElement("ol");
    list.className = "candidate-list";
    for (const word of words.slice(0, limit)) {
      const row = document.createElement("li");
      const label = document.createElement("span");
      label.className = "word";
      label.textContent = word;
      const actions = document.createElement("span");
      actions.className = "row-actions";
      actions.append(button("Copy", "copy", word));
      if (state.game === "KingVietnamese") actions.append(button("Tried", "king-tried", word));
      row.append(label, actions);
      list.append(row);
    }
    ui.candidates.append(list);
  }

  function clearBody() {
    ui.status.textContent = "";
    ui.turn.textContent = "";
    ui.turn.className = "turn";
    ui.summary.textContent = "";
    ui.count.textContent = "";
    ui.candidates.replaceChildren();
    ui.manual.replaceChildren();
    ui.controls.replaceChildren();
  }

  async function activateKing(round) {
    if (round?.key === state.king?.key) return;
    state.king = round;
    state.tried = new Set();
    state.undo = [];
    if (!round) return;
    const key = `tried:${round.key}`;
    const saved = await chrome.storage.local.get(key);
    if (state.king?.key === round.key) state.tried = new Set(saved[key] || []);
  }

  async function renderKing(useVisible = true) {
    const latest = useVisible ? kingCards().at(-1) : null;
    if (latest) {
      const { id, puzzle } = latest;
      await activateKing({ ...puzzle, key: `${state.channel}:${id}:${puzzleSignature(puzzle)}` });
    } else if (useVisible && state.king?.messageId !== "manual") {
      await activateKing(null);
    }
    ui.subtitle.textContent = "Vua Tiếng Việt";
    ui.turn.textContent = "Turn unknown — this helper does not track anagram turns.";
    const puzzle = state.king;
    if (puzzle) {
      const all = rules.findVietnamese(puzzle, state.vietnamese);
      const remaining = all.filter((word) => !state.tried.has(candidateKey(word)));
      ui.status.textContent = all.length ? `Found ${all.length} exact candidate(s).` : "No exact match in Viet74K.";
      ui.summary.textContent = `${puzzle.letters.join(" / ")} · ${puzzle.tiengCount} tiếng`;
      ui.count.textContent = `Remaining: ${remaining.length} / ${all.length}`;
      showWords(remaining, Infinity);
    } else {
      ui.status.textContent = "No Vua Tiếng Việt challenge found in the visible chat.";
    }
    const details = document.createElement("details");
    details.innerHTML = '<summary>Paste a prompt manually</summary><textarea data-role="king-input" rows="3" placeholder="Y / T / A / N / Ư / G / N / Ớ&#10;2 tiếng"></textarea>';
    details.append(button("Find candidates", "king-manual"));
    ui.manual.append(details);
    ui.controls.append(button("Undo", "king-undo"), button("Reset round", "king-reset"));
  }

  function tryTypeCount(result, records) {
    if (!state.autoTypeCount || !rules.canAutoTypeCount(result, state.displayName)) return;
    const confirmation = [...records].reverse().find((record) => !record.isBot && record.accepted && record.author === result.lastAuthor && record.text.trim() === String(result.next - 1));
    const key = `${state.channel}:${confirmation?.id || "unknown"}:${result.next}`;
    if (state.lastAutoTypeKey === key) return;
    const editor = [...document.querySelectorAll('[contenteditable="true"][data-slate-editor="true"], [contenteditable="true"][role="textbox"]')]
      .find((node) => node.isConnected && node.getClientRects().length > 0 && !host.contains(node) &&
        (node.getAttribute("data-slate-editor") === "true" || node.closest('[class*="channelTextArea"]')));
    if (!editor || (editor.innerText || editor.textContent || "").trim()) return;
    state.lastAutoTypeKey = key;
    editor.focus();
    document.execCommand("insertText", false, String(result.next));
    if ((editor.innerText || editor.textContent || "").trim() === String(result.next)) {
      ui.status.textContent = `Typed ${result.next} into the empty composer. Review it before sending.`;
    } else {
      ui.status.textContent = "Could not type into Discord's composer. Use Copy instead.";
    }
  }

  function renderCount(records) {
    const result = rules.countState(records);
    ui.subtitle.textContent = "CountNum";
    ui.status.textContent = result.pending ? "Latest number is not confirmed yet." : result.resetSeen ? "The bot reset the count." : "Using confirmed counts only.";
    ui.summary.textContent = result.next === null ? "Next number: unknown" : `Next number: ${result.next}`;
    setTurn(result.lastAuthor, result.pending);
    if (result.next !== null) ui.controls.append(button(`Copy ${result.next}`, "copy", String(result.next)));
    tryTypeCount(result, records);
  }

  async function renderLink(records) {
    const currentRound = records.filter((record) => rules.isAfterMessage(record, state.linkResetId));
    const result = rules.linkingState(currentRound);
    const before = state.observedWords.size;
    for (const word of result.used) state.observedWords.add(word);
    if (state.observedWords.size !== before) await chrome.storage.local.set({ [storageKey("usedWords")]: [...state.observedWords] });
    ui.subtitle.textContent = "LinkingWord";
    ui.status.textContent = `Candidates come from the bundled list; the bot may use a different dictionary.${state.linkResetId ? " Tracking from your last reset." : ""}`;
    ui.summary.textContent = result.lastWord ? `Last accepted: ${result.lastWord} → start with ${result.firstLetter.toUpperCase()}` : "No accepted linked word found in loaded chat.";
    setTurn(result.lastAuthor, result.pending);
    if (result.firstLetter) {
      const candidates = state.english.filter((word) => word.length >= 2 && word.startsWith(result.firstLetter) && !state.observedWords.has(word));
      candidates.sort((a, b) => a.length - b.length || a.localeCompare(b));
      ui.count.textContent = `${candidates.length} candidates not seen by this extension; showing up to 50.`;
      showWords(candidates);
    }
    ui.controls.append(button("Reset game words", "link-reset"));
  }

  async function renderWordle(records) {
    const result = rules.wordleState(records);
    if (result.newRound && result.resetId !== state.wordleResetId) {
      state.wordleResetId = result.resetId;
      state.manualRows = [];
      await saveManualRows();
    }
    const rows = state.manualRows.length ? state.manualRows : result.rows;
    ui.subtitle.textContent = "Wordle";
    ui.status.textContent = state.manualRows.length ? "Using manually entered clues." : result.rows.length ? "Clues read from Sabi’s latest grid." : "Waiting for a readable Wordle grid.";
    ui.summary.textContent = result.newRound ? "New round: no guesses yet." : rows.length ? rows.map((row) => `${row.guess.toUpperCase()} ${row.pattern}`).join(" · ") : "No clues available yet.";
    setTurn(result.lastAuthor, result.pending);
    const won = rows.at(-1)?.pattern === "GGGGG";
    const lost = rows.length >= 6 && !won;
    if (won || lost) {
      ui.count.textContent = won ? "Round solved." : "Six guesses used.";
    } else {
      const candidates = state.english.filter((word) => word.length === 5 && rules.matchesWordle(word, rows));
      const openers = ["arise", "slate", "crane", "stare", "raise", "later", "irate", "trace", "crate"];
      const rank = (word) => openers.indexOf(word) < 0 ? openers.length : openers.indexOf(word);
      candidates.sort((a, b) => rank(a) - rank(b) || new Set(b).size - new Set(a).size || a.localeCompare(b));
      ui.count.textContent = `${candidates.length} five-letter candidates; showing up to 50.`;
      showWords(candidates);
    }
    const form = document.createElement("form");
    form.dataset.action = "wordle-manual";
    form.innerHTML = '<label>Manual clue <input name="guess" maxlength="5" placeholder="GUESS" required pattern="[A-Za-z]{5}"></label><label>Colors <input name="pattern" maxlength="5" placeholder="BYGGB" required pattern="[BbYyGg]{5}"></label><button type="submit">Add</button>';
    ui.manual.append(form);
    ui.controls.append(button("Undo manual clue", "wordle-undo"), button("Clear manual clues", "wordle-clear"));
  }

  let renderSerial = 0;
  async function scan() {
    if (!state.enabled || !state.game || !state.channel) return;
    const serial = ++renderSerial;
    try {
      await ensureWords();
      if (serial !== renderSerial || !state.enabled || !state.game) return;
      const records = state.game === "KingVietnamese" ? [] : readMessages();
      state.records = records;
      const draft = {
        king: ui.manual.querySelector('[data-role="king-input"]')?.value || "",
        kingOpen: ui.manual.querySelector("details")?.open || false,
        guess: ui.manual.querySelector('[name="guess"]')?.value || "",
        pattern: ui.manual.querySelector('[name="pattern"]')?.value || "",
        focused: shadow.activeElement?.getAttribute("data-role") || shadow.activeElement?.getAttribute("name") || "",
      };
      clearBody();
      ui.title.textContent = "DiscordACE";
      if (state.game === "KingVietnamese") await renderKing();
      else if (state.game === "CountNum") renderCount(records);
      else if (state.game === "LinkingWord") await renderLink(records);
      else if (state.game === "Wordle") await renderWordle(records);
      const kingInput = ui.manual.querySelector('[data-role="king-input"]');
      if (kingInput) {
        kingInput.value = draft.king;
        ui.manual.querySelector("details").open = draft.kingOpen;
      }
      const guessInput = ui.manual.querySelector('[name="guess"]');
      const patternInput = ui.manual.querySelector('[name="pattern"]');
      if (guessInput) guessInput.value = draft.guess;
      if (patternInput) patternInput.value = draft.pattern;
      const focusTarget = draft.focused === "king-input" ? kingInput : draft.focused === "guess" ? guessInput : draft.focused === "pattern" ? patternInput : null;
      focusTarget?.focus();
    } catch (error) {
      ui.status.textContent = `Helper error: ${error.message}`;
      console.warn("DiscordACE helper error", error);
    }
  }

  function scheduleScan() {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(() => { void scan(); }, 250);
  }

  async function syncRoute() {
    const nextChannel = channelKey();
    const nextGame = GAMES.has(state.channelGames[nextChannel]) ? state.channelGames[nextChannel] : "";
    const changed = nextChannel !== state.channel || nextGame !== state.game;
    if (changed) {
      state.channel = nextChannel;
      state.game = nextGame;
      state.king = null;
      state.linkResetId = null;
      state.lastAutoTypeKey = null;
      state.manualRows = [];
      state.wordleResetId = null;
      state.observedWords = new Set();
      if (nextChannel) {
        const wordKey = storageKey("usedWords");
        const linkResetKey = storageKey("linkResetId");
        const manualKey = storageKey("wordleManual");
        const saved = await chrome.storage.local.get([wordKey, linkResetKey, manualKey]);
        if (state.channel === nextChannel) {
          state.observedWords = new Set(saved[wordKey] || []);
          state.linkResetId = saved[linkResetKey] || null;
          const manual = saved[manualKey];
          state.manualRows = Array.isArray(manual) ? manual : manual?.rows || [];
          state.wordleResetId = Array.isArray(manual) ? null : manual?.resetId || null;
        }
      }
    }
    host.hidden = !state.enabled || !state.game;
    if (!state.enabled || !state.game) {
      state.observer?.disconnect();
      state.observer = null;
      clearTimeout(state.scanTimer);
      return;
    }
    let connected = false;
    if (!state.observer) {
      state.observer = new MutationObserver(scheduleScan);
      state.observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "class"] });
      connected = true;
    }
    if (changed || connected) void scan();
  }

  async function persistKing() {
    if (state.king) await chrome.storage.local.set({ [`tried:${state.king.key}`]: [...state.tried] });
  }

  async function handleAction(event) {
    const item = event.target.closest("button[data-action]");
    if (!item) return;
    const { action, word } = item.dataset;
    if (action === "copy") {
      try { await navigator.clipboard.writeText(word); ui.status.textContent = `Copied “${word}”.`; }
      catch { ui.status.textContent = "Clipboard access failed; select the text manually."; }
    } else if (action === "king-tried" && state.king) {
      const key = candidateKey(word);
      if (!state.tried.has(key)) { state.tried.add(key); state.undo.push(key); await persistKing(); }
      await scan();
    } else if (action === "king-undo") {
      const key = state.undo.pop();
      if (key) { state.tried.delete(key); await persistKing(); await scan(); }
    } else if (action === "king-reset") {
      state.tried.clear(); state.undo = []; await persistKing(); await scan();
    } else if (action === "king-manual") {
      const puzzle = rules.parseVietnamesePuzzle(ui.manual.querySelector('[data-role="king-input"]')?.value);
      if (!puzzle) { ui.status.textContent = "Enter slash-separated letters and a count such as ‘2 tiếng’."; return; }
      await activateKing({ ...puzzle, messageId: "manual", key: `${state.channel}:manual:${puzzleSignature(puzzle)}` });
      clearBody(); await renderKing(false);
    } else if (action === "link-reset") {
      const boundary = [...state.records].reverse().map((record) => rules.messageSnowflake(record.id)).find(Boolean);
      if (!boundary) { ui.status.textContent = "Could not identify the latest Discord message. Reset after chat finishes loading."; return; }
      state.linkResetId = boundary;
      state.observedWords.clear();
      await chrome.storage.local.set({ [storageKey("usedWords")]: [], [storageKey("linkResetId")]: boundary });
      await scan();
    } else if (action === "wordle-undo") {
      state.manualRows.pop(); await saveManualRows(); await scan();
    } else if (action === "wordle-clear") {
      state.manualRows = []; await saveManualRows(); await scan();
    }
  }

  async function saveManualRows() {
    if (state.channel) await chrome.storage.local.set({ [storageKey("wordleManual")]: { rows: state.manualRows, resetId: state.wordleResetId } });
  }

  panel.addEventListener("click", (event) => { void handleAction(event); });
  panel.addEventListener("submit", (event) => {
    if (event.target.dataset.action !== "wordle-manual") return;
    event.preventDefault();
    const data = new FormData(event.target);
    const guess = String(data.get("guess") || "").toLowerCase();
    const pattern = String(data.get("pattern") || "").toUpperCase();
    if (!/^[a-z]{5}$/.test(guess) || !/^[BYG]{5}$/.test(pattern)) return;
    state.manualRows.push({ guess, pattern });
    void saveManualRows().then(scan);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.helperEnabled) state.enabled = changes.helperEnabled.newValue !== false;
    if (changes.displayName) state.displayName = changes.displayName.newValue || "";
    if (changes.autoTypeCount) state.autoTypeCount = changes.autoTypeCount.newValue === true;
    if (changes.channelGames) state.channelGames = changes.channelGames.newValue || {};
    if (changes.helperEnabled || changes.channelGames) void syncRoute();
    else if (changes.displayName || changes.autoTypeCount) scheduleScan();
  });

  async function start() {
    const saved = await chrome.storage.local.get({ helperEnabled: true, displayName: "", autoTypeCount: false, channelGames: {} });
    state.enabled = saved.helperEnabled !== false;
    state.displayName = saved.displayName;
    state.autoTypeCount = saved.autoTypeCount === true;
    state.channelGames = saved.channelGames;
    await syncRoute();
    state.routeTimer = setInterval(() => { void syncRoute(); }, 500);
  }
  void start();
})();
