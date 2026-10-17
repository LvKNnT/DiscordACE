"use strict";

const toggle = document.getElementById("helper-enabled");
const status = document.getElementById("status");

function showState(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? "On — helper visible in Discord." : "Off — helper is hidden.";
}

chrome.storage.local.get({ helperEnabled: true }).then(({ helperEnabled }) => {
  showState(helperEnabled !== false);
});

toggle.addEventListener("change", async () => {
  const enabled = toggle.checked;
  await chrome.storage.local.set({ helperEnabled: enabled });
  showState(enabled);
});
