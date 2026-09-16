#!/usr/bin/env python3
"""5x5 crossword generator -> ipuz files."""

import argparse
import glob
import hashlib
import json
import os
import random
import re
import sys
import urllib.request
from collections import defaultdict

WORDLIST_URL = "https://raw.githubusercontent.com/Crossword-Nexus/collaborative-word-list/main/xwordlist.dict"
DEFAULT_WORDLIST_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "xwordlist.dict")

GRID_SIZE = 5
NUM_BLOCKS = 3
P_ADJ = 0.5  # probability of placing block 2/3 adjacent to the chosen corner
MAX_BACKTRACK_STEPS = 5000
MAX_FILL_ATTEMPTS = 200
MAX_BATCH_ATTEMPTS_PER_PUZZLE = 50  # includes uniqueness collisions

CORNERS = [(0, 0), (0, GRID_SIZE - 1), (GRID_SIZE - 1, 0), (GRID_SIZE - 1, GRID_SIZE - 1)]
CORNER_NAMES = {
    (0, 0): "NW",
    (0, GRID_SIZE - 1): "NE",
    (GRID_SIZE - 1, 0): "SW",
    (GRID_SIZE - 1, GRID_SIZE - 1): "SE",
}


def opposite_corner(corner):
    r, c = corner
    return (GRID_SIZE - 1 - r, GRID_SIZE - 1 - c)


def orthogonal_neighbors_of_corner(corner):
    """Return the two in-bounds orthogonal neighbors of a corner cell."""
    r, c = corner
    dr = 1 if r == 0 else -1
    dc = 1 if c == 0 else -1
    return (r + dr, c), (r, c + dc)


# ---------------------------------------------------------------------------
# Wordlist loading & filtering
# ---------------------------------------------------------------------------

def ensure_wordlist(path):
    if os.path.exists(path):
        return path
    print(f"Wordlist not found at {path}; downloading from {WORDLIST_URL} ...", file=sys.stderr)
    urllib.request.urlretrieve(WORDLIST_URL, path)
    return path


def load_wordlist(path, min_score):
    """Return dict: length -> list of words, plus the flat set of all words."""
    by_length = defaultdict(list)
    letters_only_re = re.compile(r"^[A-Z]+$")
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or ";" not in line:
                continue
            word, _, score_str = line.rpartition(";")
            try:
                score = int(score_str)
            except ValueError:
                continue
            if score < min_score:
                continue
            if not letters_only_re.match(word):
                continue
            length = len(word)
            if length not in (3, 4, 5):
                continue
            by_length[length].append(word)
    return by_length


def build_indexes(by_length):
    """Build pattern -> list[word] indexes for fast candidate lookup.

    Pattern format: for a word of length L, patterns are built lazily per query
    (see PatternIndex), but we precompute per-length word lists and a
    (length, position, letter) -> list[word] index for filtering.
    """
    pos_letter_index = {}  # (length, pos, letter) -> list of words
    for length, words in by_length.items():
        for pos in range(length):
            for word in words:
                key = (length, pos, word[pos])
                pos_letter_index.setdefault(key, []).append(word)
    return pos_letter_index


class WordSource:
    def __init__(self, by_length):
        self.by_length = by_length
        self.pos_letter_index = build_indexes(by_length)
        self._pattern_cache = {}

    def candidates(self, pattern):
        """pattern: string of length L with letters or '?' wildcards."""
        cached = self._pattern_cache.get(pattern)
        if cached is not None:
            return cached
        length = len(pattern)
        known = [(i, ch) for i, ch in enumerate(pattern) if ch != "?"]
        if not known:
            result = list(self.by_length.get(length, []))
        else:
            # Intersect index lists for each known position, starting from the
            # smallest to minimize work.
            lists = []
            for i, ch in known:
                lst = self.pos_letter_index.get((length, i, ch), [])
                lists.append(lst)
            lists.sort(key=len)
            result_set = set(lists[0])
            for lst in lists[1:]:
                result_set &= set(lst)
                if not result_set:
                    break
            # Sort for determinism: set iteration order depends on PYTHONHASHSEED,
            # which varies across process runs and would break --seed reproducibility.
            result = sorted(result_set)
        self._pattern_cache[pattern] = result
        return result


# ---------------------------------------------------------------------------
# Block placement
# ---------------------------------------------------------------------------

def place_blocks(rng):
    """Return (set of 3 blocked cells, shape_name, corner_name) per the spec algorithm."""
    corner = CORNERS[rng.randrange(len(CORNERS))]
    corner_name = CORNER_NAMES[corner]
    neighbor_a, neighbor_b = orthogonal_neighbors_of_corner(corner)

    blocks = {corner}
    deferred = 0

    if rng.random() < P_ADJ:
        blocks.add(neighbor_a)
    else:
        deferred += 1

    if rng.random() < P_ADJ:
        blocks.add(neighbor_b)
    else:
        deferred += 1

    shape = None
    if deferred == 0:
        # corner + both neighbors: L-cluster
        shape = f"L-cluster @ {corner_name}"
    else:
        opp = opposite_corner(corner)
        blocks.add(opp)
        deferred -= 1
        if deferred == 0:
            # corner + one neighbor + opposite corner
            shape = f"corner+neighbor+opposite @ {corner_name}"
        else:
            opp_a, opp_b = orthogonal_neighbors_of_corner(opp)
            chosen = opp_a if rng.random() < 0.5 else opp_b
            blocks.add(chosen)
            shape = f"corner+opposite+opp-neighbor @ {corner_name}"

    assert len(blocks) == NUM_BLOCKS, f"expected {NUM_BLOCKS} blocks, got {len(blocks)}: {blocks}"
    return blocks, shape, corner_name


# ---------------------------------------------------------------------------
# Slot derivation
# ---------------------------------------------------------------------------

class Slot:
    __slots__ = ("cells", "direction", "number")

    def __init__(self, cells, direction, number=None):
        self.cells = cells  # list of (r, c) in order
        self.direction = direction  # 'A' or 'D'
        self.number = number

    def __len__(self):
        return len(self.cells)

    def __repr__(self):
        return f"Slot({self.direction},{self.number},{self.cells})"


def derive_slots(blocks):
    """Derive across/down slots (maximal open runs) from a set of blocked cells."""
    def is_open(r, c):
        return (r, c) not in blocks

    across_slots = []
    for r in range(GRID_SIZE):
        c = 0
        while c < GRID_SIZE:
            if is_open(r, c):
                start = c
                while c < GRID_SIZE and is_open(r, c):
                    c += 1
                run_len = c - start
                if run_len >= 2:
                    cells = [(r, cc) for cc in range(start, c)]
                    across_slots.append(Slot(cells, "A"))
                elif run_len == 1:
                    # A run of length 1 is not a valid slot but shouldn't happen per spec
                    pass
            else:
                c += 1

    down_slots = []
    for c in range(GRID_SIZE):
        r = 0
        while r < GRID_SIZE:
            if is_open(r, c):
                start = r
                while r < GRID_SIZE and is_open(r, c):
                    r += 1
                run_len = r - start
                if run_len >= 2:
                    cells = [(rr, c) for rr in range(start, r)]
                    down_slots.append(Slot(cells, "D"))
            else:
                r += 1

    return across_slots, down_slots


def assign_numbers(across_slots, down_slots, blocks):
    """Number cells per standard crossword rules; assign Slot.number in place."""
    starts = {}
    across_by_start = {s.cells[0]: s for s in across_slots}
    down_by_start = {s.cells[0]: s for s in down_slots}

    number = 0
    numbering_grid = [[None] * GRID_SIZE for _ in range(GRID_SIZE)]
    for r in range(GRID_SIZE):
        for c in range(GRID_SIZE):
            if (r, c) in blocks:
                continue
            starts_across = (r, c) in across_by_start
            starts_down = (r, c) in down_by_start
            if starts_across or starts_down:
                number += 1
                numbering_grid[r][c] = number
                if starts_across:
                    across_by_start[(r, c)].number = number
                if starts_down:
                    down_by_start[(r, c)].number = number
    return numbering_grid


def min_slot_length(across_slots, down_slots):
    lengths = [len(s) for s in across_slots] + [len(s) for s in down_slots]
    return min(lengths) if lengths else None


# ---------------------------------------------------------------------------
# Backtracking fill
# ---------------------------------------------------------------------------

class FillFailure(Exception):
    pass


def fill_grid(slots, word_source, rng):
    """Backtracking fill. slots: list of Slot (across+down, sharing cell refs).
    Returns dict cell->letter on success, or None on failure (dead end / step cap).
    """
    grid = {}
    used_words = set()
    steps = [0]

    # For each slot, precompute which other slots intersect it and at what cell index.
    intersections = defaultdict(list)  # slot_index -> list of (cell_index, other_slot_index, other_cell_index)
    cell_to_slots = defaultdict(list)
    for i, s in enumerate(slots):
        for idx, cell in enumerate(s.cells):
            cell_to_slots[cell].append((i, idx))
    for cell, entries in cell_to_slots.items():
        if len(entries) == 2:
            (i1, idx1), (i2, idx2) = entries
            intersections[i1].append((idx1, i2, idx2))
            intersections[i2].append((idx2, i1, idx1))

    def current_pattern(slot_idx):
        s = slots[slot_idx]
        return "".join(grid.get(cell, "?") for cell in s.cells)

    def candidates_for(slot_idx):
        pattern = current_pattern(slot_idx)
        words = word_source.candidates(pattern)
        return [w for w in words if w not in used_words]

    def backtrack(filled):
        if len(filled) == len(slots):
            return True
        if steps[0] >= MAX_BACKTRACK_STEPS:
            return False

        # choose unfilled slot with fewest remaining candidates
        best_idx = None
        best_candidates = None
        for i in range(len(slots)):
            if i in filled:
                continue
            cands = candidates_for(i)
            if best_candidates is None or len(cands) < len(best_candidates):
                best_idx = i
                best_candidates = cands
                if len(best_candidates) == 0:
                    break

        if best_idx is None:
            return True
        if not best_candidates:
            return False

        shuffled = best_candidates[:]
        rng.shuffle(shuffled)

        for word in shuffled:
            steps[0] += 1
            if steps[0] > MAX_BACKTRACK_STEPS:
                return False

            s = slots[best_idx]
            prev = {cell: grid.get(cell) for cell in s.cells}
            for cell, ch in zip(s.cells, word):
                grid[cell] = ch
            used_words.add(word)
            filled.add(best_idx)

            if backtrack(filled):
                return True

            # undo
            filled.discard(best_idx)
            used_words.discard(word)
            for cell in s.cells:
                if prev[cell] is None:
                    del grid[cell]
                else:
                    grid[cell] = prev[cell]

        return False

    success = backtrack(set())
    if not success:
        return None, steps[0]
    return dict(grid), steps[0]


# ---------------------------------------------------------------------------
# Puzzle generation
# ---------------------------------------------------------------------------

class Puzzle:
    def __init__(self, seed, blocks, shape, corner_name, grid, across_slots, down_slots, numbering_grid):
        self.seed = seed
        self.blocks = blocks
        self.shape = shape
        self.corner_name = corner_name
        self.grid = grid  # cell -> letter
        self.across_slots = across_slots
        self.down_slots = down_slots
        self.numbering_grid = numbering_grid

    def solution_hash(self):
        rows = []
        for r in range(GRID_SIZE):
            row = "".join("#" if (r, c) in self.blocks else self.grid[(r, c)] for c in range(GRID_SIZE))
            rows.append(row)
        return hashlib.sha256("|".join(rows).encode("utf-8")).hexdigest()

    def answers(self):
        """Return list of (direction, number, word)."""
        out = []
        for s in self.across_slots:
            out.append(("A", s.number, "".join(self.grid[c] for c in s.cells)))
        for s in self.down_slots:
            out.append(("D", s.number, "".join(self.grid[c] for c in s.cells)))
        return out


def derive_rng(master_seed, index):
    """Deterministically derive a per-puzzle RNG from (master_seed, index)."""
    h = hashlib.sha256(f"{master_seed}:{index}".encode("utf-8")).hexdigest()
    sub_seed = int(h[:16], 16)
    return random.Random(sub_seed)


def generate_one_puzzle(rng, word_source, stats=None):
    """Attempt to build a single filled puzzle. Returns Puzzle or raises FillFailure
    after MAX_FILL_ATTEMPTS attempts."""
    for attempt in range(MAX_FILL_ATTEMPTS):
        blocks, shape, corner_name = place_blocks(rng)
        across_slots, down_slots = derive_slots(blocks)

        min_len = min_slot_length(across_slots, down_slots)
        assert min_len is not None and min_len >= 3, (
            f"block placement produced a slot shorter than 3: blocks={blocks}, "
            f"min_len={min_len}"
        )

        all_slots = across_slots + down_slots
        grid, steps = fill_grid(all_slots, word_source, rng)
        if stats is not None:
            stats["attempts"] += 1
            stats["total_steps"] += steps
        if grid is not None:
            numbering_grid = assign_numbers(across_slots, down_slots, blocks)
            if stats is not None:
                stats["retries"] += attempt
            return Puzzle(None, blocks, shape, corner_name, grid, across_slots, down_slots, numbering_grid)
    raise FillFailure(f"failed to fill puzzle after {MAX_FILL_ATTEMPTS} attempts")


# ---------------------------------------------------------------------------
# ipuz output
# ---------------------------------------------------------------------------

def puzzle_to_ipuz(puzzle, title="", author=""):
    puzzle_grid = []
    solution_grid = []
    for r in range(GRID_SIZE):
        prow = []
        srow = []
        for c in range(GRID_SIZE):
            if (r, c) in puzzle.blocks:
                prow.append("#")
                srow.append("#")
            else:
                num = puzzle.numbering_grid[r][c]
                prow.append(num if num is not None else 0)
                srow.append(puzzle.grid[(r, c)])
        puzzle_grid.append(prow)
        solution_grid.append(srow)

    across_clues = [[s.number, ""] for s in sorted(puzzle.across_slots, key=lambda s: s.number)]
    down_clues = [[s.number, ""] for s in sorted(puzzle.down_slots, key=lambda s: s.number)]

    return {
        "version": "http://ipuz.org/v2",
        "kind": ["http://ipuz.org/crossword#1"],
        "dimensions": {"width": GRID_SIZE, "height": GRID_SIZE},
        "title": title,
        "author": author,
        "origin": "xwgen.py 5x5 crossword generator",
        "puzzle": puzzle_grid,
        "solution": solution_grid,
        "clues": {
            "Across": across_clues,
            "Down": down_clues,
        },
    }


# ---------------------------------------------------------------------------
# Preview rendering
# ---------------------------------------------------------------------------

def render_puzzle(puzzle, seed_display):
    lines = []
    lines.append(f"Puzzle (seed {seed_display}, blocks: {puzzle.shape})")
    for r in range(GRID_SIZE):
        row_cells = []
        for c in range(GRID_SIZE):
            if (r, c) in puzzle.blocks:
                row_cells.append("#")
            else:
                row_cells.append(puzzle.grid[(r, c)])
        lines.append("  " + " ".join(row_cells))

    across = sorted(puzzle.across_slots, key=lambda s: s.number)
    down = sorted(puzzle.down_slots, key=lambda s: s.number)
    across_str = ", ".join(f"{s.number} {''.join(puzzle.grid[c] for c in s.cells)}" for s in across)
    down_str = ", ".join(f"{s.number} {''.join(puzzle.grid[c] for c in s.cells)}" for s in down)
    lines.append(f"Across: {across_str}   Down: {down_str}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI commands
# ---------------------------------------------------------------------------

def load_existing_solution_hashes(output_dir):
    """Scan output_dir for existing N.ipuz files and return {solution_hash: N},
    so a later batch (e.g. via --start-num) won't duplicate an earlier puzzle's
    solution under a different number."""
    seen = {}
    if not os.path.isdir(output_dir):
        return seen
    for path in glob.glob(os.path.join(output_dir, "*.ipuz")):
        name = os.path.splitext(os.path.basename(path))[0]
        if not name.isdigit():
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            sol_rows = ["".join(row) for row in data["solution"]]
            h = hashlib.sha256("|".join(sol_rows).encode("utf-8")).hexdigest()
            seen[h] = int(name)
        except (json.JSONDecodeError, KeyError, OSError):
            continue
    return seen


def cmd_generate(args):
    wordlist_path = args.wordlist or ensure_wordlist(DEFAULT_WORDLIST_PATH)
    by_length = load_wordlist(wordlist_path, args.min_score)
    for length in (3, 4, 5):
        if not by_length.get(length):
            print(f"ERROR: no words of length {length} pass min_score={args.min_score}. Cannot proceed.", file=sys.stderr)
            sys.exit(1)
    word_source = WordSource(by_length)

    master_seed = args.seed if args.seed is not None else random.randrange(2**31)

    os.makedirs(args.output_dir, exist_ok=True)

    seen_hashes = load_existing_solution_hashes(args.output_dir)
    preexisting_count = len(seen_hashes)

    start_num = args.start_num
    end_num = start_num + args.count - 1
    overlapping = [n for n in range(start_num, end_num + 1)
                   if os.path.exists(os.path.join(args.output_dir, f"{n}.ipuz"))]
    if overlapping:
        print(f"WARNING: {len(overlapping)} existing file(s) in {args.output_dir} will be overwritten "
              f"(numbers {min(overlapping)}-{max(overlapping)} among others).", file=sys.stderr)

    stats = {"attempts": 0, "total_steps": 0, "retries": 0}
    collisions = 0
    written = 0

    for i in range(start_num, end_num + 1):
        rng = derive_rng(master_seed, i)
        collision_attempts = 0
        while True:
            puzzle = generate_one_puzzle(rng, word_source, stats=stats)
            h = puzzle.solution_hash()
            if h not in seen_hashes:
                seen_hashes[h] = i
                break
            collisions += 1
            collision_attempts += 1
            if collision_attempts > MAX_BATCH_ATTEMPTS_PER_PUZZLE:
                print(f"ERROR: puzzle {i} kept colliding with existing solutions; giving up.", file=sys.stderr)
                sys.exit(1)
            # regenerate with a fresh derived rng for another shot
            rng = derive_rng(master_seed, i * 1_000_003 + collision_attempts)

        ipuz = puzzle_to_ipuz(puzzle)
        out_path = os.path.join(args.output_dir, f"{i}.ipuz")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(ipuz, f, indent=2, sort_keys=True)
            f.write("\n")
        written += 1

    print(f"Wrote {written} puzzles ({start_num}-{end_num}) to {args.output_dir}")
    print(f"Master seed: {master_seed}")
    print(f"Fill attempts total: {stats['attempts']}, extra retries beyond first try: {stats['retries']}, "
          f"backtrack steps total: {stats['total_steps']}")
    print(f"Uniqueness collisions: {collisions} (checked against {preexisting_count} pre-existing puzzle(s) "
          f"in {args.output_dir} plus this batch)")
    print("Wordlist sizes after filtering (min_score={}):".format(args.min_score))
    for length in (3, 4, 5):
        print(f"  length {length}: {len(by_length.get(length, []))}")


def cmd_preview(args):
    wordlist_path = args.wordlist or ensure_wordlist(DEFAULT_WORDLIST_PATH)
    by_length = load_wordlist(wordlist_path, args.min_score)
    word_source = WordSource(by_length)

    master_seed = args.seed if args.seed is not None else random.randrange(2**31)
    print(f"(preview master seed: {master_seed}; nothing is written to disk)\n")

    for i in range(1, args.count + 1):
        rng = derive_rng(master_seed, i)
        puzzle = generate_one_puzzle(rng, word_source)
        print(render_puzzle(puzzle, seed_display=f"{master_seed}:{i}"))
        print()


def build_arg_parser():
    parser = argparse.ArgumentParser(description="5x5 crossword generator -> ipuz")
    sub = parser.add_subparsers(dest="command", required=True)

    gen = sub.add_parser("generate", help="Generate puzzles and write ipuz files")
    gen.add_argument("--count", type=int, default=300)
    gen.add_argument("--min-score", type=int, default=80)
    gen.add_argument("--seed", type=int, default=None)
    gen.add_argument("--output-dir", type=str, default="./puzzles")
    gen.add_argument("--wordlist", type=str, default=None)
    gen.add_argument("--start-num", type=int, default=1,
                      help="First file number to write (e.g. 301 to append 300 more after an "
                           "existing 1..300 batch). Files are named <start-num>.ipuz .. "
                           "<start-num + count - 1>.ipuz. Default: 1.")
    gen.set_defaults(func=cmd_generate)

    prev = sub.add_parser("preview", help="Render sample puzzles to console; writes nothing")
    prev.add_argument("--count", type=int, default=3)
    prev.add_argument("--min-score", type=int, default=80)
    prev.add_argument("--seed", type=int, default=None)
    prev.add_argument("--wordlist", type=str, default=None)
    prev.set_defaults(func=cmd_preview)

    return parser


def main():
    parser = build_arg_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
