"""Local KingVietnamese helper for Vua Tiếng Việt anagram prompts.

The app reads challenge text that the user copies from Discord Web. It never
connects to Discord, reads browser internals, or sends a Discord message.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, ttk


APP_NAME = "KingVietnamese"
WORDLIST_PATH = Path(__file__).with_name("Viet74K.txt")
STATE_PATH = Path.home() / "AppData" / "Local" / APP_NAME / "state.json"
COUNT_PATTERN = re.compile(r"(?iu)(?<!\w)(\d+)\s*(?:tiếng|tieng)(?!\w)")


def normalized(value: str) -> str:
    """Return canonical, case-insensitive text while keeping Vietnamese marks."""
    return unicodedata.normalize("NFC", value).casefold()


def graphemes(value: str) -> list[str]:
    """Split precomposed or decomposed letters into base-plus-mark groups."""
    result: list[str] = []
    for char in unicodedata.normalize("NFC", value):
        if unicodedata.combining(char) and result:
            result[-1] += char
        else:
            result.append(char)
    return result


def is_letter_group(value: str) -> bool:
    return bool(value) and unicodedata.category(value[0]).startswith("L") and all(
        unicodedata.category(char).startswith("M") for char in value[1:]
    )


def letters_only(value: str) -> str:
    """Keep Unicode letters for anagram comparison; ignore spaces/punctuation."""
    return "".join(
        char for char in normalized(value)
        if unicodedata.category(char).startswith("L")
    )


@dataclass(frozen=True)
class Puzzle:
    letters: tuple[str, ...]
    tieng_count: int

    @property
    def key(self) -> str:
        return f"{''.join(sorted(self.letters))}:{self.tieng_count}"

    @classmethod
    def parse(cls, text: str) -> "Puzzle":
        count_match = COUNT_PATTERN.search(text)
        if not count_match:
            raise ValueError("Could not find the syllable count (for example, '2 tiếng').")

        parsed_letters: list[str] | None = None
        for line in text.splitlines():
            parts = [part.strip() for part in line.split("/")]
            if len(parts) < 3:
                continue
            groups = [graphemes(part) for part in parts]
            if all(len(group) == 1 and is_letter_group(group[0]) for group in groups):
                parsed_letters = [normalized(group[0]) for group in groups]
                break

        if not parsed_letters:
            raise ValueError("Could not find slash-separated letters (for example, 'Y / T / A').")

        return cls(tuple(parsed_letters), int(count_match.group(1)))


class VietnameseLexicon:
    """Loads and filters the local Vietnamese word and phrase list."""

    def __init__(self, path: Path) -> None:
        if not path.is_file():
            raise FileNotFoundError(f"Word list not found: {path}")
        self.path = path
        self.entries = self._load(path)

    @staticmethod
    def _load(path: Path) -> list[str]:
        entries: list[str] = []
        seen: set[str] = set()
        with path.open("r", encoding="utf-8-sig") as source:
            for line in source:
                candidate = " ".join(line.strip().split())
                key = normalized(candidate)
                if candidate and key not in seen:
                    entries.append(candidate)
                    seen.add(key)
        return entries

    def matches(self, puzzle: Puzzle) -> list[str]:
        target = Counter(puzzle.letters)
        matches: list[str] = []
        for entry in self.entries:
            if len(entry.split()) != puzzle.tieng_count:
                continue
            if Counter(graphemes(letters_only(entry))) == target:
                matches.append(entry)
        return matches


class KingVietnameseApp:
    """Small Tk interface for candidate review and tried-word tracking."""

    def __init__(self, root: tk.Tk, lexicon: VietnameseLexicon) -> None:
        self.root = root
        self.lexicon = lexicon
        self.current_puzzle: Puzzle | None = None
        self.matches: list[str] = []
        self.tried: set[str] = set()
        self.undo_stack: list[str] = []
        self.round_key: str | None = None
        self.state = self._load_state()

        self.root.title("KingVietnamese — Vietnamese word helper")
        self.root.geometry("680x680")
        self.root.minsize(520, 500)
        self._build_ui()

    def _load_state(self) -> dict[str, list[str]]:
        try:
            data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_state(self) -> None:
        try:
            STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
            STATE_PATH.write_text(
                json.dumps(self.state, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except OSError as exc:
            self._set_status(f"Could not save tried words: {exc}")

    def _build_ui(self) -> None:
        outer = ttk.Frame(self.root, padding=12)
        outer.pack(fill="both", expand=True)

        ttk.Label(
            outer,
            text="Copy the challenge card text from Discord Web, then load it here.",
            wraplength=640,
        ).pack(anchor="w")

        self.prompt = tk.Text(outer, height=6, wrap="word", undo=True)
        self.prompt.pack(fill="x", pady=(8, 6))

        actions = ttk.Frame(outer)
        actions.pack(fill="x")
        ttk.Button(actions, text="Paste from clipboard", command=self.paste_clipboard).pack(side="left")
        ttk.Button(actions, text="Find candidates", command=self.find_candidates).pack(side="left", padx=6)
        ttk.Button(actions, text="Clear", command=self.clear_prompt).pack(side="left")

        self.puzzle_label = ttk.Label(outer, text="No puzzle loaded")
        self.puzzle_label.pack(anchor="w", pady=(12, 2))
        self.count_label = ttk.Label(outer, text="Remaining: 0")
        self.count_label.pack(anchor="w", pady=(0, 6))

        list_frame = ttk.Frame(outer)
        list_frame.pack(fill="both", expand=True)
        self.candidate_list = tk.Listbox(list_frame, selectmode="extended", activestyle="dotbox")
        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=self.candidate_list.yview)
        self.candidate_list.configure(yscrollcommand=scrollbar.set)
        self.candidate_list.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self.candidate_list.bind("<Double-Button-1>", lambda _event: self.copy_selected())

        list_actions = ttk.Frame(outer)
        list_actions.pack(fill="x", pady=(8, 0))
        ttk.Button(list_actions, text="Copy selected", command=self.copy_selected).pack(side="left")
        ttk.Button(list_actions, text="Mark tried", command=self.mark_tried).pack(side="left", padx=6)
        ttk.Button(list_actions, text="Undo", command=self.undo).pack(side="left")
        ttk.Button(list_actions, text="Reset round", command=self.reset_round).pack(side="right")

        self.status = ttk.Label(outer, text="Ready", anchor="w")
        self.status.pack(fill="x", pady=(10, 0))

    def _set_status(self, text: str) -> None:
        self.status.configure(text=text)

    def paste_clipboard(self) -> None:
        try:
            text = self.root.clipboard_get()
        except tk.TclError:
            self._set_status("Clipboard does not contain text.")
            return
        self.prompt.delete("1.0", "end")
        self.prompt.insert("1.0", text)
        self.find_candidates()

    def clear_prompt(self) -> None:
        self.prompt.delete("1.0", "end")

    def find_candidates(self) -> None:
        text = self.prompt.get("1.0", "end-1c")
        try:
            puzzle = Puzzle.parse(text)
        except ValueError as exc:
            self.current_puzzle = None
            self.matches = []
            self.round_key = None
            self.puzzle_label.configure(text="No puzzle loaded")
            self._refresh_candidates()
            self._set_status(str(exc))
            return

        self.current_puzzle = puzzle
        self.matches = self.lexicon.matches(puzzle)
        if self.round_key != puzzle.key:
            self.round_key = puzzle.key
            self.tried = set(self.state.get(puzzle.key, []))
            self.undo_stack.clear()
        self._refresh_candidates()

        displayed_letters = " / ".join(puzzle.letters)
        self.puzzle_label.configure(
            text=f"Letters: {displayed_letters}    •    Syllables: {puzzle.tieng_count}"
        )
        if not self.matches:
            self._set_status("No exact match in the local word list. You can still paste another prompt.")
        else:
            self._set_status(f"Found {len(self.matches)} exact candidate(s). Review before answering.")

    def _refresh_candidates(self) -> None:
        self.candidate_list.delete(0, "end")
        remaining = [word for word in self.matches if normalized(word) not in self.tried]
        for word in remaining:
            self.candidate_list.insert("end", word)
        self.count_label.configure(text=f"Remaining: {len(remaining)} / {len(self.matches)}")

    def _selected_words(self) -> list[str]:
        return [self.candidate_list.get(index) for index in self.candidate_list.curselection()]

    def copy_selected(self) -> None:
        selected = self._selected_words()
        if not selected:
            self._set_status("Select a candidate first.")
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(selected[0])
        self.root.update()
        self._set_status(f"Copied: {selected[0]} (not sent to Discord).")

    def mark_tried(self) -> None:
        selected = self._selected_words()
        if not selected:
            self._set_status("Select one or more candidates to mark tried.")
            return
        for word in selected:
            key = normalized(word)
            if key not in self.tried:
                self.tried.add(key)
                self.undo_stack.append(key)
        self._persist_tried()
        self._refresh_candidates()
        self._set_status(f"Marked {len(selected)} candidate(s) tried.")

    def undo(self) -> None:
        if not self.undo_stack:
            self._set_status("Nothing to undo for this round.")
            return
        key = self.undo_stack.pop()
        self.tried.discard(key)
        self._persist_tried()
        self._refresh_candidates()
        self._set_status("Restored the last marked candidate.")

    def reset_round(self) -> None:
        if self.current_puzzle is None:
            self._set_status("Load a puzzle before resetting its tried list.")
            return
        self.tried.clear()
        self.undo_stack.clear()
        self._persist_tried()
        self._refresh_candidates()
        self._set_status("Reset the tried list for this puzzle.")

    def _persist_tried(self) -> None:
        if self.current_puzzle is None:
            return
        self.state[self.current_puzzle.key] = sorted(self.tried)
        self._save_state()


def main() -> int:
    try:
        lexicon = VietnameseLexicon(WORDLIST_PATH)
    except (OSError, UnicodeError) as exc:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(APP_NAME, str(exc))
        root.destroy()
        return 1

    root = tk.Tk()
    KingVietnameseApp(root, lexicon)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
