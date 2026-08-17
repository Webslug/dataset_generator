# Suggestions for a great local dataset generator

## Status: round 1 — all implemented ✅

Everything below was proposed in the original version of this document and has
now been built into the tool (`app.py`, `templates/index.html`,
`assets/js/generator.js`, `assets/css/generator.css`).

### Generation quality

- ✅ **System prompt field.** Advanced options has a "System prompt" textarea.
  Stored as a top-level `"system"` key on the entry, *not* inside `messages`,
  so it stays compatible with `make_gguf.py` (which reads only
  `example["messages"]` and would otherwise mis-treat a `role: system` message
  as assistant text).
- ✅ **Temperature / top_p controls.** Advanced options exposes both; sent
  through to Ollama's `options.temperature`/`options.top_p` (Kobold gets the
  equivalent fields). *(Originally these were also recorded on an entry-level
  `"meta"` block; that was removed — see "Round 3" note below — so the values
  affect generation but aren't persisted in the dataset file.)*
- ✅ **Multi-turn conversations.** A "Prior conversation turns (JSON)" box in
  Advanced options accepts `[{"role":"user","content":"..."}, ...]`; those
  turns are prepended before the new prompt/response pair and saved together
  as one multi-turn entry.
- ✅ **Prompt templates / variables.** Template save/load/delete (backed by
  `templates.json`) plus a "Template variables" box: one value per line,
  substituted into `{{value}}` in the prompt, producing one entry per line.
- ✅ **Seed / reproducibility.** A "Seed" field in Advanced options, passed
  through as `options.seed` (Ollama) / `sampler_seed` (Kobold). Same `"meta"`
  removal note as above applies — the seed is used, not persisted.

### Dataset management

- ✅ **Live entry count + preview.** The "Dataset info" card shows entry
  count, file size, format, last-modified time, and the last 5 entries
  (truncated), refreshed automatically after each generation.
- ✅ **Duplicate detection.** Before appending, the server checks whether the
  exact prompt already exists (matched against each entry's first user
  message) and returns `409` with `duplicate: true` instead of silently
  double-adding it. An "Allow duplicate prompts" checkbox bypasses the check
  when repetition is intentional.
- ✅ **Undo last entry.** "Undo last entry" button removes the most recently
  appended entry and rewrites the file.
- ✅ **JSONL export/alternate format.** `.jsonl` filenames are now handled
  natively (line-appended instead of read-modify-write on the whole array),
  and "Export other format" converts an existing `.json` array to `.jsonl` or
  vice versa.
- ⚠️ **Per-file stats dashboard** — implemented in a *narrower* form than
  originally suggested: the Dataset info card covers the single file currently
  entered in the Dataset file box, not a directory-wide dashboard across many
  files (that fuller version — `overview.py`/`overview.js` — existed briefly
  under a different, unrelated name and was intentionally removed as leftover
  scaffolding before this tool's UI was built; see round 2 below for a
  properly-scoped version of that idea).

### Workflow / batching

- ✅ **Prompt list mode.** A "List mode" toggle treats each line of the
  prompt box as its own prompt; each line becomes a separate dataset entry.
- ✅ **Background/async generation with progress.** Implemented as a
  sequential client-side loop with a live progress bar (`n/total`) rather than
  a true background job queue — appropriate for a single-user local tool
  where the browser tab stays open for the run anyway.
- ✅ **Cancel button.** Appears whenever a run has more than one prompt
  queued; stops before the next iteration starts (in-flight requests still
  complete).
- ❌ **Rate/quality flagging.** Implemented (👍/👎 buttons setting a
  `"rating"` key on the last entry) but removed after users reported it as
  unreliable and it wasn't worth the added surface area for a local
  single-user tool. If this comes back, it should target a specific entry by
  index/id from the preview list rather than always "whatever the file's last
  line is" — that assumption is fragile once undo/export/multiple browser
  tabs are in play, and is the most likely source of the bugginess.

### Robustness

- ✅ **Health check.** A navbar badge polls `/api/ollama/status` every 15s
  and shows Running/Stopped/unreachable.
- ✅ **Retry on transient failure.** Both backends get one automatic retry on
  timeout or connection error before the request is reported as failed.
- ✅ **Config file for defaults.** `config.json` at the project root stores
  server-side defaults (port, model, max tokens, backend, temperature,
  top_p); a "Save as default config" button in Advanced options writes the
  current form values to it, and the server applies `port` from it on
  startup if `--port` isn't passed.

### Nice-to-haves

- ✅ **Dark mode as a fourth theme**, added to the theme dropdown alongside
  Baby Pink / Aero Blue / Dark Green.
- ✅ **Keyboard shortcut.** Ctrl+Enter (Cmd+Enter on Mac) sends the prompt
  from the textarea.
- ✅ **Export/import settings** as a downloadable/uploadable JSON blob
  (prompt, filename, system prompt, context, variables, temperature, top_p,
  seed, theme).

---

## Round 3 — reliability cleanup (removed features)

After round 2 shipped, the `"meta"` block (model/backend/temperature/top_p/
seed recorded on every entry) turned out to be an unwanted side effect: users
generating datasets for `make_gguf.py`-style training didn't want that
bookkeeping mixed into their training data. **Removed** — entries are back to
`{"messages": [...]}`, optionally with `"system"`, and nothing else added
automatically.

The 👍/👎 rating feature was also removed as unreliable (see the "Rate/quality
flagging" entry above) rather than debugged further, since it added ongoing
surface area for a nice-to-have that wasn't earning its keep.

---

## Compatibility note (make_gguf.py)

`make_gguf.py` (`/home/kim/projects/my_ai_project/make_gguf.py`) loads the
dataset with `datasets.load_dataset("json", ...)` and only ever reads
`example["messages"]`; any other top-level key on an entry is ignored. That's
why `"system"` is added as a **sibling key next to `"messages"`**, never
inserted into the `messages` array itself — doing the latter would make
`make_gguf.py`'s `_build_chatml_text()` treat a `role: system` entry as
assistant text (it only special-cases `role == "user"`, everything else is
emitted as an assistant turn). This tool does not modify `make_gguf.py` and
current output remains directly usable by it.

---

## Status: round 2 — further suggestions (not yet implemented)

Ideas for what could come next, again roughly ordered by value for effort.

### Generation quality

- **Batch-vary sampling.** When Repeat > 1 on the *same* prompt (no
  variables), automatically jitter temperature/seed slightly per run so
  repeated entries aren't near-duplicates of each other in wording — right
  now identical repeats with a fixed seed will produce identical or
  near-identical text.
- **Two-model "generate + critique" mode.** Send the prompt to one model, then
  send the response to a second model with a rubric ("is this a good training
  example? fix or reject") before appending — a cheap automated quality gate
  on top of the manual 👍/👎.
- **Streaming display.** Use Ollama's `stream: true` and render tokens as
  they arrive in the status panel, so a 900-token generation isn't a silent
  wait — useful now that the default max tokens is higher than the original
  450.

### Dataset management

- **Directory-wide dashboard.** A proper multi-file view (revisiting the
  `overview.py`-style page mentioned above, but built for *this* tool's data
  model): pick a directory, list every `.json`/`.jsonl` file in it with entry
  counts, rating breakdowns (up/down/unrated), and last-modified time.
- **Search/filter within a dataset.** A search box over the current file's
  entries (by prompt text, model, or rating) instead of only seeing the last
  5 in the preview.
- **Bulk delete by rating.** "Remove all 👎 entries" as a one-click cleanup
  pass before training.
- **Train/validation split export.** Given a ratio, write two sibling files
  (`_train` / `_val`) from one dataset — useful directly ahead of a
  `make_gguf.py`-style training run.

### Workflow / batching

- **Scheduled/unattended batch runs.** Queue up a prompt list or variable
  list and let it run against a target count (e.g. "keep generating until
  there are 500 entries in this file"), checking `/api/dataset_info` between
  runs rather than a fixed repeat count.
- **Per-line variable sets (CSV-style), not just one `{{value}}`.** Support
  multiple placeholders (`{{name}}`, `{{topic}}`) driven by a small CSV/TSV
  pasted into the variables box, for templates that need more than one
  substitution.

### Robustness / ops

- **Structured request logging.** Append each generation call (prompt hash,
  model, backend, duration, success/failure) to a local log file, useful for
  debugging slow or flaky runs without needing to reproduce them.
- **Config profiles.** Multiple named config profiles (e.g. "fast-draft" vs
  "high-quality") instead of one global `config.json`, switchable from the
  UI.

### Nice-to-haves

- **Sound/visual notification on batch completion**, since a 99-repeat run
  against a slow model can take long enough that the tab isn't being watched.
- **Word/token count estimate on the prompt box** as you type, so it's easier
  to judge whether "Max tokens" is set sensibly for the response you expect.
