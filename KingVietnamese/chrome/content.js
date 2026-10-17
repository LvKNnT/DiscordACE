(() => {
  "use strict";

  const HOST_ID = "kingvietnamese-helper-root";
  const TITLE_PATTERN = /vua\s+tiếng\s+việt/i;
  const COUNT_PATTERN = /(?:^|\W)(\d+)\s*(?:tiếng|tieng)(?=$|\W)/iu;
  const LETTER_PATTERN = /^\p{L}\p{M}*$/u;
  const SEGMENTER = new Intl.Segmenter("vi", { granularity: "grapheme" });

  let lexicon = [];
  let host;
  let ui;
  let activeRound = null;
  let tried = new Set();
  let undoStack = [];
  let matches = [];
  let scanTimer;
  let observer;
  let routeTimer;
  let helperEnabled = true;
  let previousPath = location.pathname;

  const normalize = (value) => value.normalize("NFC").toLowerCase();
  const segments = (value) => Array.from(SEGMENTER.segment(normalize(value)), (item) => item.segment);
  const lettersOnly = (value) => Array.from(normalize(value)).filter((char) => /\p{L}/u.test(char)).join("");
  const candidateKey = (value) => normalize(value).replace(/\s+/g, " ").trim();

  function parsePuzzle(text) {
    const count = text.match(COUNT_PATTERN);
    if (!count) return null;

    for (const line of text.normalize("NFC").split(/\r?\n/)) {
      const parts = line.split("/").map((part) => part.trim());
      if (parts.length < 3) continue;
      const letters = parts.map((part) => segments(part));
      if (letters.every((part) => part.length === 1 && LETTER_PATTERN.test(part[0]))) {
        return { letters: letters.map((part) => normalize(part[0])), tiengCount: Number(count[1]) };
      }
    }
    return null;
  }

  function puzzleSignature(puzzle) {
    return `${[...puzzle.letters].sort().join("")}:${puzzle.tiengCount}`;
  }

  function findCandidates(puzzle) {
    const target = [...puzzle.letters].sort().join("");
    return lexicon.filter((entry) => {
      if (entry.split(/\s+/).length !== puzzle.tiengCount) return false;
      return segments(lettersOnly(entry)).sort().join("") === target;
    });
  }

  async function loadLexicon() {
    const response = await fetch(chrome.runtime.getURL("Viet74K.txt"));
    if (!response.ok) throw new Error(`Could not load Viet74K.txt (${response.status}).`);
    const seen = new Set();
    lexicon = (await response.text())
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter((word) => {
        const key = candidateKey(word);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function createPanel() {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.hidden = true;
    const shadow = host.attachShadow({ mode: "open" });
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = chrome.runtime.getURL("panel.css");
    shadow.append(stylesheet);

    const panel = document.createElement("aside");
    panel.className = "panel";
    panel.innerHTML = `
      <header class="header">
        <div><strong>KingVietnamese</strong><div class="subtitle">Vua Tiếng Việt helper</div></div>
      </header>
      <main class="body">
        <div class="status" data-role="status">Looking for a visible challenge…</div>
        <div class="puzzle" data-role="puzzle"></div>
        <div class="count" data-role="count"></div>
        <div class="candidates" data-role="candidates"></div>
        <details class="manual">
          <summary>Paste a prompt manually</summary>
          <textarea data-role="manual-input" rows="3" placeholder="Y / T / A / N / Ư / G / N / Ớ&#10;2 tiếng"></textarea>
          <button data-action="use-manual">Find candidates</button>
        </details>
        <footer class="controls">
          <button data-action="undo">Undo</button>
          <button data-action="reset">Reset round</button>
        </footer>
        <div class="notice">Copy only. Answers are never sent to Discord.</div>
      </main>`;
    shadow.append(panel);
    document.body.append(host);
    ui = {
      panel,
      status: panel.querySelector('[data-role="status"]'),
      puzzle: panel.querySelector('[data-role="puzzle"]'),
      count: panel.querySelector('[data-role="count"]'),
      candidates: panel.querySelector('[data-role="candidates"]'),
      manualInput: panel.querySelector('[data-role="manual-input"]'),
    };
    panel.addEventListener("click", handleAction);
  }

  function messageNodes() {
    const nodes = new Set([
      ...document.querySelectorAll('li[id^="chat-messages-"]'),
      ...document.querySelectorAll('[data-list-item-id^="chat-messages___"]'),
    ]);
    return [...nodes].filter((node) => node.isConnected && node.getClientRects().length > 0);
  }

  async function scanMessages() {
    const found = [];
    for (const node of messageNodes()) {
      const text = node.innerText || "";
      if (!TITLE_PATTERN.test(text)) continue;
      const puzzle = parsePuzzle(text);
      if (!puzzle) continue;
      found.push({ node, puzzle });
    }

    const latest = found.at(-1);
    if (!latest) {
      if (activeRound?.messageId === "manual") return;
      await activateRound(null);
      return;
    }

    const messageId = latest.node.id || latest.node.getAttribute("data-list-item-id") || "visible-card";
    await activateRound({
      ...latest.puzzle,
      messageId,
      key: `${location.pathname}:${messageId}:${puzzleSignature(latest.puzzle)}`,
    });
  }

  async function activateRound(round) {
    if (round && round.key === activeRound?.key) return;
    if (!round && !activeRound) {
      render("No Vua Tiếng Việt challenge found in the visible chat.");
      return;
    }
    activeRound = round;
    undoStack = [];
    tried = new Set();
    matches = round ? findCandidates(round) : [];

    if (!round) {
      render("No Vua Tiếng Việt challenge found in the visible chat.");
      return;
    }

    const storageKey = `tried:${round.key}`;
    try {
      const saved = await chrome.storage.local.get(storageKey);
      if (activeRound?.key !== round.key) return;
      tried = new Set(saved[storageKey] || []);
    } catch (error) {
      console.warn("KingVietnamese could not load local tried words.", error);
    }
    render(matches.length ? `Found ${matches.length} exact candidate(s).` : "No exact match in Viet74K.");
  }

  function render(statusText) {
    if (!ui) return;
    ui.status.textContent = statusText;
    ui.puzzle.textContent = activeRound
      ? `${activeRound.letters.join(" / ")}   ·   ${activeRound.tiengCount} tiếng`
      : "";
    ui.candidates.replaceChildren();
    if (!activeRound) {
      ui.count.textContent = "";
      return;
    }

    const remaining = matches.filter((word) => !tried.has(candidateKey(word)));
    ui.count.textContent = `Remaining: ${remaining.length} / ${matches.length}`;
    if (!remaining.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No remaining candidates. Try another prompt or reset this round.";
      ui.candidates.append(empty);
      return;
    }

    const list = document.createElement("ol");
    list.className = "candidate-list";
    for (const word of remaining) {
      const row = document.createElement("li");
      const label = document.createElement("span");
      label.className = "word";
      label.textContent = word;
      const buttons = document.createElement("span");
      buttons.className = "row-actions";
      buttons.append(actionButton("Copy", "copy", word), actionButton("Tried", "tried", word));
      row.append(label, buttons);
      list.append(row);
    }
    ui.candidates.append(list);
  }

  function actionButton(label, action, word = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;
    if (word) button.dataset.word = word;
    return button;
  }

  async function persistTried() {
    if (!activeRound) return;
    await chrome.storage.local.set({ [`tried:${activeRound.key}`]: [...tried] });
  }

  async function handleAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, word } = button.dataset;

    if (action === "copy" && word) {
      try {
        await navigator.clipboard.writeText(word);
        ui.status.textContent = `Copied “${word}” to the clipboard.`;
      } catch {
        ui.status.textContent = "Clipboard access failed. Select and copy the candidate manually.";
      }
    } else if (action === "tried" && word) {
      const key = candidateKey(word);
      if (!tried.has(key)) {
        tried.add(key);
        undoStack.push(key);
        await persistTried();
      }
      render(`Marked “${word}” as tried.`);
    } else if (action === "undo") {
      const key = undoStack.pop();
      if (!key) {
        ui.status.textContent = "Nothing to undo in this round.";
        return;
      }
      tried.delete(key);
      await persistTried();
      render("Restored the last candidate marked tried.");
    } else if (action === "reset") {
      if (!activeRound) return;
      tried.clear();
      undoStack = [];
      await persistTried();
      render("Reset tried candidates for this card.");
    } else if (action === "use-manual") {
      const puzzle = parsePuzzle(ui.manualInput.value);
      if (!puzzle) {
        ui.status.textContent = "Enter slash-separated letters and a count such as ‘2 tiếng’.";
        return;
      }
      const key = `${location.pathname}:manual:${puzzleSignature(puzzle)}`;
      await activateRound({ ...puzzle, messageId: "manual", key });
      render(matches.length ? `Found ${matches.length} exact candidate(s).` : "No exact match in Viet74K.");
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      if (helperEnabled) void scanMessages();
    }, 250);
  }

  function setHelperEnabled(enabled) {
    helperEnabled = enabled;
    host.hidden = !enabled;
    if (!enabled) {
      observer?.disconnect();
      observer = null;
      clearInterval(routeTimer);
      routeTimer = null;
      clearTimeout(scanTimer);
      return;
    }
    if (!lexicon.length || observer) return;

    void scanMessages();
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    routeTimer = setInterval(() => {
      if (location.pathname !== previousPath) {
        previousPath = location.pathname;
        void scanMessages();
      }
    }, 500);
  }

  async function start() {
    createPanel();
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.helperEnabled) {
        setHelperEnabled(changes.helperEnabled.newValue !== false);
      }
    });
    try {
      await loadLexicon();
    } catch (error) {
      ui.status.textContent = `Word list error: ${error.message}`;
      return;
    }

    const settings = await chrome.storage.local.get({ helperEnabled: true });
    setHelperEnabled(settings.helperEnabled !== false);
  }

  if (!document.getElementById(HOST_ID)) void start();
})();
