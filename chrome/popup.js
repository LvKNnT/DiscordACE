"use strict";

const toggle = document.getElementById("helper-enabled");
const nameInput = document.getElementById("display-name");
const gameSelect = document.getElementById("channel-game");
const autoTypeToggle = document.getElementById("auto-type-count");
const autoTypeRow = document.getElementById("auto-type-row");
const autoTypeHint = document.getElementById("auto-type-hint");
const channelLabel = document.getElementById("channel-label");
const status = document.getElementById("status");
let channelKey = null;

function showStatus() {
  status.textContent = !toggle.checked ? "Helper is off and hidden." : channelKey && !gameSelect.value ? "Choose a game for this channel to show its helper." : "Helper is on.";
}

function showGameOptions() {
  const count = gameSelect.value === "CountNum";
  autoTypeRow.hidden = !count;
  autoTypeHint.hidden = !count;
}

function channelFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "discord.com") return null;
    const match = /^\/channels\/([^/]+)\/([^/]+)/.exec(parsed.pathname);
    return match ? `${match[1]}/${match[2]}` : null;
  } catch {
    return null;
  }
}

async function start() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  channelKey = channelFromUrl(tab?.url);
  gameSelect.disabled = !channelKey;
  channelLabel.textContent = channelKey ? `Channel: ${channelKey}` : "Open a Discord channel to assign its game.";
  const settings = await chrome.storage.local.get({ helperEnabled: true, displayName: "", autoTypeCount: false, channelGames: {} });
  toggle.checked = settings.helperEnabled !== false;
  nameInput.value = settings.displayName;
  gameSelect.value = settings.channelGames[channelKey] || "";
  autoTypeToggle.checked = settings.autoTypeCount === true;
  showGameOptions();
  showStatus();
}

toggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ helperEnabled: toggle.checked });
  showStatus();
});

let nameTimer;
nameInput.addEventListener("input", () => {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(async () => {
    await chrome.storage.local.set({ displayName: nameInput.value.trim() });
    status.textContent = "Display name saved.";
  }, 200);
});

gameSelect.addEventListener("change", async () => {
  showGameOptions();
  if (!channelKey) return;
  const { channelGames = {} } = await chrome.storage.local.get({ channelGames: {} });
  const updated = { ...channelGames };
  if (gameSelect.value) updated[channelKey] = gameSelect.value;
  else delete updated[channelKey];
  await chrome.storage.local.set({ channelGames: updated });
  status.textContent = gameSelect.value ? `${gameSelect.value} assigned to this channel.` : "Channel assignment removed.";
});

autoTypeToggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ autoTypeCount: autoTypeToggle.checked });
  status.textContent = autoTypeToggle.checked ? "Auto-type is on for CountNum." : "Auto-type is off.";
});

void start().catch((error) => { status.textContent = `Could not load settings: ${error.message}`; });
