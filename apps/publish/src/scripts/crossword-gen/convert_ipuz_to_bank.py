#!/usr/bin/env python3
"""Convert mini-gen .ipuz files into Royko CrosswordEntry bank (with blacks as '.')."""
from __future__ import annotations

import json
import re
from calendar import isleap
from datetime import date, timedelta
from pathlib import Path

import wn

ROOT = Path(__file__).resolve().parent
IPUZ_DIR = ROOT / "ipuz-out"
OUT_TS = ROOT.parents[1] / "data" / "puzzles" / "crossword.ts"
CLUE_MAP_PATH = ROOT / "clue-map.json"
COUNT = 366  # leap-year coverage; pickByDate uses dateKey first

en = wn.Wordnet("oewn:2024")
open_clues: dict[str, str] = json.loads(CLUE_MAP_PATH.read_text())

# Short crossword-style overrides / fills for common crosswordese WordNet misses
CROSSWORDESE = {
    "ERA": "Historic period",
    "ORE": "Mine find",
    "ALE": "Pub pint",
    "EMU": "Flightless bird",
    "ELI": "Yale alum, informally",
    "OLE": "Bullring cheer",
    "OTO": "Plains tribe",
    "ETA": "When the plane's due, briefly",
    "ATE": "Had dinner",
    "IRE": "Wrath",
    "NEE": "Born as",
    "RIA": "Inlet",
    "SPA": "Relaxing resort",
    "APT": "Fitting",
    "ERR": "Make a mistake",
    "ODE": "Lyric poem",
    "UNO": "Card game cry",
    "ACE": "Top card",
    "AGO": "In the past",
    "ARK": "Noah's vessel",
    "ASH": "Fireplace residue",
    "EEL": "Slithery fish",
    "EGG": "Breakfast oval",
    "ELF": "Santa's helper",
    "EON": "Long stretch of time",
    "EPE": "Fencing sword",
    "EVA": "Perón of Argentina",
    "EVE": "Day before",
    "EYE": "Look closely",
    "ICE": "Rink cover",
    "ILL": "Unwell",
    "INK": "Pen fluid",
    "ION": "Charged particle",
    "IRA": "Nest-egg letters",
    "IVY": "Climbing plant",
    "OAR": "Rowing need",
    "OAT": "Granola bit",
    "ODD": "Peculiar",
    "OIL": "Fryer liquid",
    "ONE": "Solo number",
    "ORB": "Sphere",
    "OWL": "Hooter",
    "OWN": "Possess",
    "PEA": "Pod occupant",
    "PEN": "Writer's tool",
    "PIE": "Dessert with a crust",
    "PRO": "In favor",
    "RAM": "Butt heads",
    "RAT": "Ship deserter",
    "RAW": "Uncooked",
    "RAY": "Beam of light",
    "RED": "Stop-light color",
    "REF": "Whistle blower",
    "RIG": "Equip a ship",
    "ROD": "Fishing stick",
    "ROT": "Go bad",
    "ROW": "Argument; also a line",
    "RUE": "Regret",
    "RYE": "Sandwich bread",
    "SAC": "Anatomical pouch",
    "SAD": "Blue",
    "SAP": "Tree syrup",
    "SEA": "Ocean",
    "SET": "Collection",
    "SEW": "Use a needle",
    "SIN": "Moral slip",
    "SIR": "Polite address",
    "SIT": "Take a chair",
    "SKI": "Winter runner",
    "SKY": "Where clouds float",
    "SOB": "Cry hard",
    "SOD": "Lawn chunk",
    "SOY": "___ sauce",
    "SPY": "Secret agent",
    "STY": "Pig's pad",
    "SUN": "Daytime star",
    "TAB": "Bar bill",
    "TAD": "Tiny bit",
    "TAG": "Price sticker",
    "TAN": "Beach glow",
    "TAP": "Faucet",
    "TAR": "Road goo",
    "TEA": "Afternoon brew",
    "TEN": "Perfect score",
    "TIC": "Nervous twitch",
    "TIE": "Deadlock",
    "TIN": "Can metal",
    "TIP": "Gratuity",
    "TOE": "Sock tip",
    "TON": "Heavy weight",
    "TOP": "Highest point",
    "TOY": "Plaything",
    "TRY": "Attempt",
    "TUB": "Bath vessel",
    "TWO": "Pair",
    "URN": "Coffee vessel",
    "USE": "Employ",
    "VAN": "Moving vehicle",
    "VAT": "Large tub",
    "VET": "Animal doc",
    "VIA": "By way of",
    "VOW": "Solemn promise",
    "WAD": "Bundle of bills",
    "WAG": "Joke around",
    "WAR": "Armed conflict",
    "WAS": "Existed",
    "WAX": "Candle stuff",
    "WAY": "Path",
    "WEB": "Spider's home",
    "WEE": "Tiny",
    "WET": "Not dry",
    "WHO": "Question word",
    "WHY": "Reason seeker",
    "WIG": "Fake hair",
    "WIN": "Victory",
    "WIT": "Humor",
    "WOE": "Misery",
    "WOK": "Stir-fry pan",
    "WON": "Took the prize",
    "WOO": "Court romantically",
    "YAK": "Himalayan bovine",
    "YAM": "Thanksgiving side",
    "YAP": "Bark sharply",
    "YAW": "Veer off course",
    "YEA": "Affirmative vote",
    "YES": "Affirmative",
    "YET": "Still",
    "YEW": "Evergreen tree",
    "YON": "Over there, old-style",
    "YOU": "Second person",
    "ZAP": "Microwave, slangily",
    "ZED": "British Z",
    "ZEN": "Meditative state",
    "ZIP": "Postal code, briefly",
    "ZIT": "Blemish",
    "ZOO": "Animal park",
}

CROSSWORDESE.update({'DMS': 'Messages from the boss, briefly', 'SMS': 'Text message letters', 'GPS': 'Nav system letters', 'USB': 'Computer port letters', 'DVD': 'Disc for movies', 'CD': 'Music disc, briefly', 'TV': 'Boob tube', 'AM': 'Morning letters', 'PM': 'Afternoon letters', 'NBA': 'Hoops org.', 'NFL': 'Gridiron org.', 'MLB': 'Bases org.', 'NHL': 'Puck org.', 'CEO': 'Top exec', 'CPA': 'Tax pro, briefly', 'FBI': 'Quantico org.', 'CIA': 'Langley org.', 'EPA': 'Green org.', 'IRS': 'Tax org.', 'ATM': 'Cash machine', 'AOL': 'Early ISP', 'IBM': 'Big Blue', 'BMW': 'German auto', 'NPR': 'Public radio org.', 'PBS': 'Public TV org.', 'CNN': 'Cable news channel', 'ABC': 'Alphabet network', 'NBC': 'Peacock network', 'CBS': 'Tiffany network', 'ESPN': 'Sports cable channel', 'HBO': 'Premium cable channel', 'IKEA': 'Swedish furniture chain', 'IKE': 'Eisenhower nickname', 'NASA': 'Space agcy.', 'NATO': 'Alliance since 1949', 'OPEC': 'Oil cartel', 'UNESCO': 'UN culture org.'})


def shorten_def(text: str, max_len: int = 56) -> str:
    text = re.sub(r"\s+", " ", text.strip())
    # Drop leading articles for punchier clues
    text = re.sub(r"^(a|an|the)\s+", "", text, flags=re.I)
    if len(text) <= max_len:
        return text[0].upper() + text[1:] if text else text
    cut = text[: max_len - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut[0].upper() + cut[1:] + "…"


def clue_for(word: str) -> str:
    w = word.upper()
    if w in CROSSWORDESE:
        return CROSSWORDESE[w]
    if w in open_clues:
        return shorten_def(open_clues[w], 64)
    synsets = list(en.synsets(w.lower()))
    if not synsets and w.endswith("S") and len(w) > 3:
        synsets = list(en.synsets(w[:-1].lower()))
    if synsets:
        defs = [s.definition() for s in synsets if s.definition()]
        defs.sort(key=len)
        return shorten_def(defs[0], 64)
    raise ValueError(f"No clue available for {w}")


def mmdd_list(count: int = 366) -> list[tuple[int, str]]:
    """(dayOfYear, MM-DD) for Jan 1 .. including Feb 29 in a leap year."""
    # Use 2024 (leap) so we get 366 days with 02-29
    start = date(2024, 1, 1)
    out = []
    for i in range(count):
        d = start + timedelta(days=i)
        out.append((i + 1, d.strftime("%m-%d")))
    return out


def ipuz_to_entry(path: Path, day_of_year: int, date_key: str) -> dict:
    data = json.loads(path.read_text())
    height = data["dimensions"]["height"]
    width = data["dimensions"]["width"]
    assert height == width == 5
    size = 5
    solution_grid = data["solution"]
    puzzle_nums = data["puzzle"]

    solution: list[str] = []
    for r in range(size):
        for c in range(size):
            cell = solution_grid[r][c]
            if cell == "#":
                solution.append(".")
            else:
                solution.append(str(cell).upper())

    # Extract slots from grid with American numbering (reuse ipuz numbers)
    clues: list[dict] = []
    seen_starts: set[tuple[int, int, str]] = set()

    def is_block(r: int, c: int) -> bool:
        return not (0 <= r < size and 0 <= c < size) or solution[r * size + c] == "."

    def read_word(r: int, c: int, dr: int, dc: int) -> str:
        letters = []
        rr, cc = r, c
        while not is_block(rr, cc):
            letters.append(solution[rr * size + cc])
            rr += dr
            cc += dc
        return "".join(letters)

    for r in range(size):
        for c in range(size):
            if is_block(r, c):
                continue
            num_cell = puzzle_nums[r][c]
            starts_across = is_block(r, c - 1) and not is_block(r, c + 1)
            starts_down = is_block(r - 1, c) and not is_block(r + 1, c)
            # Also allow length-1? Mini-gen uses 3+ letter answers typically
            if starts_across:
                ans = read_word(r, c, 0, 1)
                if len(ans) >= 3:
                    key = (r, c, "across")
                    if key not in seen_starts:
                        seen_starts.add(key)
                        num = int(num_cell) if isinstance(num_cell, int) and num_cell > 0 else 0
                        clues.append(
                            {
                                "num": num,
                                "clue": clue_for(ans),
                                "answer": ans,
                                "row": r,
                                "col": c,
                                "dir": "across",
                            }
                        )
            if starts_down:
                ans = read_word(r, c, 1, 0)
                if len(ans) >= 3:
                    key = (r, c, "down")
                    if key not in seen_starts:
                        seen_starts.add(key)
                        num = int(num_cell) if isinstance(num_cell, int) and num_cell > 0 else 0
                        clues.append(
                            {
                                "num": num,
                                "clue": clue_for(ans),
                                "answer": ans,
                                "row": r,
                                "col": c,
                                "dir": "down",
                            }
                        )

    # Fix any zero nums from missing ipuz numbering
    if any(c["num"] <= 0 for c in clues):
        n = 0
        assigned: dict[tuple[int, int], int] = {}
        for r in range(size):
            for c in range(size):
                if is_block(r, c):
                    continue
                sa = is_block(r, c - 1) and not is_block(r, c + 1) and len(read_word(r, c, 0, 1)) >= 3
                sd = is_block(r - 1, c) and not is_block(r + 1, c) and len(read_word(r, c, 1, 0)) >= 3
                if sa or sd:
                    n += 1
                    assigned[(r, c)] = n
        for clue in clues:
            clue["num"] = assigned[(clue["row"], clue["col"])]

    blacks = sum(1 for x in solution if x == ".")
    if blacks != 3:
        raise ValueError(f"{path.name}: expected 3 blacks, got {blacks}")

    validate(solution, size, clues, path.name)

    return {
        "dayOfYear": day_of_year,
        "dateKey": date_key,
        "title": f"Daily Mini · {date_key}",
        "size": size,
        "solution": solution,
        "clues": clues,
    }


def validate(solution: list[str], size: int, clues: list[dict], label: str) -> None:
    def is_block(r, c):
        return not (0 <= r < size and 0 <= c < size) or solution[r * size + c] == "."

    def read_slot(r, c, dir_):
        letters = []
        dr, dc = (0, 1) if dir_ == "across" else (1, 0)
        rr, cc = r, c
        while not is_block(rr, cc):
            letters.append(solution[rr * size + cc])
            rr += dr
            cc += dc
        return "".join(letters)

    for clue in clues:
        grid = read_slot(clue["row"], clue["col"], clue["dir"])
        if grid != clue["answer"]:
            raise ValueError(f"{label}: {clue['num']}{clue['dir'][0]} {clue['answer']} != {grid}")
        if is_block(clue["row"], clue["col"]):
            raise ValueError(f"{label}: starts on block")

    # Every >=3 letter slot must be clued
    for r in range(size):
        for c in range(size):
            if is_block(r, c):
                continue
            for dir_, dr, dc in (("across", 0, 1), ("down", 1, 0)):
                starts = is_block(r - dr, c - dc) and not is_block(r + dr, c + dc)
                if not starts:
                    continue
                ans = read_slot(r, c, dir_)
                if len(ans) < 3:
                    continue
                match = next((x for x in clues if x["row"] == r and x["col"] == c and x["dir"] == dir_), None)
                if not match:
                    raise ValueError(f"{label}: missing clue for {ans} {dir_} at {r},{c}")


def main() -> None:
    files = sorted(IPUZ_DIR.glob("*.ipuz"), key=lambda p: int(p.stem))
    if len(files) < COUNT:
        raise SystemExit(f"Need {COUNT} ipuz files, found {len(files)}")

    days = mmdd_list(COUNT)
    entries = []
    signatures: set[str] = set()
    clue_stats = {"open": 0, "wn": 0, "crosse": 0, "fallback": 0}

    file_i = 0
    for doy, dkey in days:
        entry = None
        while file_i < len(files):
            try:
                entry = ipuz_to_entry(files[file_i], doy, dkey)
                file_i += 1
                break
            except ValueError as e:
                print(f"skip {files[file_i].name}: {e}")
                file_i += 1
        if entry is None:
            raise SystemExit(f"Ran out of ipuz files before filling day {doy}")
        sig = "".join(entry["solution"])
        if sig in signatures:
            # try next
            print(f"skip duplicate grid for {dkey}")
            # put day back by continuing with next file - rare
            while file_i < len(files):
                try:
                    entry = ipuz_to_entry(files[file_i], doy, dkey)
                    file_i += 1
                    sig = "".join(entry["solution"])
                    if sig not in signatures:
                        break
                except ValueError as e:
                    print(f"skip {files[file_i].name}: {e}")
                    file_i += 1
            else:
                raise SystemExit(f"Could not find unique grid for {dkey}")
        signatures.add(sig)
        for c in entry["clues"]:
            w = c["answer"]
            if w in CROSSWORDESE:
                clue_stats["crosse"] += 1
            elif w in open_clues:
                clue_stats["open"] += 1
            elif en.synsets(w.lower()):
                clue_stats["wn"] += 1
            else:
                clue_stats["fallback"] += 1
        entries.append(entry)

    header = f"""/**
 * Static crossword bank — {len(entries)} unique 5×5 minis (exactly 3 blacks each).
 * Indexed by dayOfYear (1–{len(entries)}) and dateKey (MM-DD); pickByDate prefers dateKey.
 * Generated from mini-gen (.ipuz) + open-crossword-bank / WordNet clues.
 * Regenerate: src/scripts/crossword-gen/convert_ipuz_to_bank.py
 */
import type {{ CrosswordEntry }} from '../types';

export const crosswordBank: CrosswordEntry[] = """

    OUT_TS.write_text(header + json.dumps(entries, indent=2) + ";\n")
    print(f"Wrote {OUT_TS} ({len(entries)} entries)")
    print("clue sources:", clue_stats)
    print("unique grids:", len(signatures))
    # sample first puzzle
    e0 = entries[0]
    print("sample", e0["dateKey"], "blacks", e0["solution"].count("."), "clues", len(e0["clues"]))
    for c in e0["clues"][:4]:
        print(f"  {c['num']}{c['dir'][0].upper()} {c['answer']}: {c['clue']}")


if __name__ == "__main__":
    main()
