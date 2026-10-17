"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const games = require("../chrome/games.js");

const bot = (text, id = "bot") => ({ id, isBot: true, text });
const player = (author, text, accepted = false, rejected = false) => ({ author, isBot: false, text, accepted, rejected });

test("KingVietnamese still matches exact accented letters and tiếng count", () => {
  const puzzle = games.parseVietnamesePuzzle("Vua Tiếng Việt\nSắp xếp các chữ cái\nY / T / A / N / Ư / G / N / Ớ\n2 tiếng");
  assert.deepEqual(puzzle, { letters: ["y", "t", "a", "n", "ư", "g", "n", "ớ"], tiengCount: 2 });
  assert.deepEqual(games.findVietnamese(puzzle, ["ngớ ngẩn", "ngư tớn ay", "tớ ngây", "wrong"]), []);
  const simple = games.parseVietnamesePuzzle("A / B / C\n2 tiếng");
  assert.deepEqual(games.findVietnamese(simple, ["ab c", "a bc", "abc", "ab d"]), ["ab c", "a bc"]);
});

test("KingVietnamese scans the whole message embed even when message content is empty", () => {
  const card = "Sabi APP\nVua Tiếng Việt\nSắp xếp các chữ cái thành một từ có nghĩa\nY / T / A / N / Ư / G / N / Ớ\n2 tiếng";
  const matches = games.findKingCards([{ id: "card-1", texts: ["", card] }]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "card-1");
  assert.equal(matches[0].puzzle.tiengCount, 2);
});

test("CountNum follows confirmed counts and bot resets from the supplied example", () => {
  const before = [player("en ghét Ai", "23", true), player("Dunggoitenanh", "24", true)];
  assert.deepEqual(games.countState(before), { next: 25, lastAuthor: "Dunggoitenanh", resetSeen: false, pending: false });
  assert.equal(games.countState([...before, player("TestBlue", "24", false, true)]).next, 25);
  assert.deepEqual(games.countState([...before, player("TestBlue", "24", false, true), bot("Sai rồi, số tiếp theo phải là 25. Đếm lại từ 1 nhé! Kỷ lục: 56")]), { next: 1, lastAuthor: null, resetSeen: true, pending: false });
});

test("CountNum rejects consecutive accepted moves by one author and ignores pending numbers", () => {
  assert.equal(games.countState([player("A", "1", true), player("A", "2", true)]).next, 1);
  assert.deepEqual(games.countState([player("A", "1", true), player("B", "2")]), { next: 2, lastAuthor: "A", resetSeen: false, pending: true });
  assert.equal(games.countState([player("B", "2")]).next, null);
});

test("CountNum auto-type is limited to a confirmed other player's move", () => {
  const ready = games.countState([player("Another player", "24", true)]);
  assert.equal(games.canAutoTypeCount(ready, "Me"), true);
  assert.equal(games.canAutoTypeCount(ready, "Another player"), false);
  assert.equal(games.canAutoTypeCount({ ...ready, pending: true }, "Me"), false);
  assert.equal(games.canAutoTypeCount({ ...ready, lastAuthor: null }, "Me"), false);
});

test("LinkingWord chains final to first letter and ignores rejected words", () => {
  const state = games.linkingState([player("A", "yeuked", true), player("B", "wrong", false, true), player("B", "daily", true)]);
  assert.equal(state.firstLetter, "y");
  assert.equal(state.lastAuthor, "B");
  assert.deepEqual([...state.used], ["yeuked", "daily"]);
  assert.equal(state.pending, false);
  assert.equal(games.linkingState([player("A", "yeuked", true), player("B", "daily")]).pending, true);
});

test("LinkingWord excludes a word rejected as already linked and reset ignores old messages", () => {
  const records = [
    { ...player("A", "yeuked", true), id: "chat-messages-12345678901234567-12345678901234568" },
    { ...player("B", "daily", true), id: "chat-messages-12345678901234567-12345678901234569" },
    { ...player("Me", "ya", false, true), id: "chat-messages-12345678901234567-12345678901234570" },
    { ...bot("Sabi APP\n@Me ya\nTừ này đã được nối"), id: "chat-messages-12345678901234567-12345678901234571" },
  ];
  const state = games.linkingState(records);
  assert.equal(state.lastWord, "daily");
  assert.equal(state.used.has("ya"), true);
  assert.equal(state.pending, false);
  const boundary = games.messageSnowflake(records.at(-1).id);
  assert.deepEqual(records.filter((record) => games.isAfterMessage(record, boundary)), []);
  assert.equal(games.isAfterMessage({ id: "chat-messages-12345678901234567-12345678901234572" }, boundary), true);
});

test("Sabi APP header is recognized even when its username markup differs", () => {
  assert.equal(games.isSabiBot("Sabi APP", "Sabi APP 4:22 PM", "Wordle"), true);
  assert.equal(games.isSabiBot(null, "Sabi APP 4:22 PM", "Wordle"), true);
  assert.equal(games.isSabiBot("Player", "Player 4:22 PM", "adieu"), false);
});

test("Wordle parses Discord's copied square markup and filters repeated letters", () => {
  const copy = "[⬛⬛](https://discord.com/assets/a.svg)[🟨](https://discord.com/assets/b.svg)[🟩](https://discord.com/assets/c.svg)[⬛](https://discord.com/assets/a.svg) ADIEU " +
    "[⬛⬛⬛](https://discord.com/assets/a.svg)[🟨](https://discord.com/assets/b.svg)[⬛](https://discord.com/assets/a.svg) STONK " +
    "[🟨🟨](https://discord.com/assets/b.svg)[⬛](https://discord.com/assets/a.svg)[🟩🟩](https://discord.com/assets/c.svg) NICER " +
    "[🟩🟩🟩🟩🟩](https://discord.com/assets/c.svg) INNER";
  const rows = games.parseWordleRows(copy);
  assert.deepEqual(rows, [
    { guess: "adieu", pattern: "BBYGB" },
    { guess: "stonk", pattern: "BBBYB" },
    { guess: "nicer", pattern: "YYBGG" },
    { guess: "inner", pattern: "GGGGG" },
  ]);
  assert.equal(games.matchesWordle("inner", rows), true);
  assert.equal(games.matchesWordle("inert", rows), false);
  assert.equal(games.scoreGuess("allee", "apple"), "GYBBG");
});

test("Wordle derives the accepted player from the bot grid and starts a new round", () => {
  const records = [player("TestBlue", "nicer"), bot("Wordle\n🟨🟨⬛🟩🟩 NICER", "grid"), player("LvKhang_NnT", "inner"), bot("Wordle\n🟨🟨⬛🟩🟩 NICER\n🟩🟩🟩🟩🟩 INNER", "win")];
  const solved = games.wordleState(records);
  assert.equal(solved.lastAuthor, "LvKhang_NnT");
  assert.equal(solved.won, true);
  assert.equal(games.wordleState([...records, player("Someone", "other")]).pending, true);
  const reset = games.wordleState([...records, bot("Ô chữ Wordle mới! Đoán một từ tiếng Anh 5 chữ cái, cả kênh có 6 lượt", "new")]);
  assert.equal(reset.newRound, true);
  assert.equal(reset.resetId, "new");
  assert.deepEqual(reset.rows, []);
});

test("Wordle recognizes the first guess after a new-round announcement", () => {
  const records = [
    bot("Ô chữ Wordle mới! Đoán một từ tiếng Anh 5 chữ cái, cả kênh có 6 lượt", "new"),
    player("TestBlue", "adieu"),
    bot("Wordle\n⬛⬛🟨🟩⬛ ADIEU\nLượt 1/6", "first-grid"),
  ];
  const state = games.wordleState(records);
  assert.equal(state.newRound, false);
  assert.equal(state.lastAuthor, "TestBlue");
  assert.deepEqual(state.rows, [{ guess: "adieu", pattern: "BBYGB" }]);
});

test("A missing accepted author stays unknown", () => {
  assert.equal(games.countState([player(null, "3", true)]).lastAuthor, null);
  assert.equal(games.linkingState([player(null, "daily", true)]).lastAuthor, null);
  assert.equal(games.wordleState([bot("🟩🟩🟩🟩🟩 INNER")]).lastAuthor, null);
});
