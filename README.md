# Dataset Generator

A small local web app for building ChatML-format training datasets by
prompting models through [Ollama](https://ollama.com), a
[Kobold.cpp](https://github.com/LostRuins/koboldcpp) endpoint, or any
OpenAI-compatible chat-completions API (e.g. [OpenRouter](https://openrouter.ai)).
Every generated reply is appended to a local `.json` or `.jsonl` file in the
shape most local fine-tuning pipelines expect.

It's a single Flask server (`app.py`) plus a static Bootstrap front end — no
build step, no external services required beyond whichever backend you point
it at.

## What it's for

If you're fine-tuning a small local model and need a training corpus, this
tool gives you a fast loop for producing it by hand or in batches: write a
prompt, pick a model, hit Send, and the prompt/response pair is appended to
your dataset file as one ChatML entry:

```json
{
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

It is **not** a synthetic-data pipeline or an evaluation harness — it's the
generation front end you sit in front of while curating a dataset, with
enough batching/templating features to avoid one-entry-at-a-time tedium.

## Features

- **Three backends**: local Ollama, local Kobold.cpp, or any OpenAI-compatible
  endpoint (OpenRouter, LM Studio, text-generation-webui, etc.)
- **ChatML output**, appended to `.json` (array) or `.jsonl` (line-delimited) —
  pick by file extension
- **Batching**: repeat a prompt N times, one-prompt-per-line list mode, or
  `{{value}}` template variables driven by a list
- **Multi-turn entries** via a prior-conversation-turns box, plus an optional
  system prompt (stored as a sibling `"system"` key, never inside `messages`)
- **Duplicate detection** against existing entries in the target file
- **Saved prompt templates**, dataset live stats/preview, undo-last-entry,
  JSON↔JSONL export
- **GPU VRAM meter** (via `nvidia-smi`) and an Ollama running/stopped
  indicator in the navbar
- **Three light themes + one dark theme**, all settings/prompt/backend state
  persisted in the browser's local storage
- **Auto-incrementing port**: if the default port is taken, it tries the next
  ones automatically instead of failing to start

## Requirements

- Python 3.10+
- [Ollama](https://ollama.com) installed and on `PATH` if you're using the
  Ollama backend (the app can start/stop it for you from the UI)
- `nvidia-smi` on `PATH` if you want the VRAM meter (optional — the meter
  just hides itself if it's not available)

Install Python dependencies:

```bash
pip install -r requirements.txt
```

## Running it

```bash
python3 app.py
```

Then open `http://127.0.0.1:8942/` in a browser. Useful flags:

```bash
python3 app.py --port 9000      # use a specific port
python3 app.py --host 0.0.0.0   # listen on all interfaces
```

If the requested port is already in use, the server automatically tries the
next one (up to 10 attempts) and prints which port it landed on — you don't
need to hunt for a free port by hand.

## Project layout

```
app.py                          Flask server: generation, dataset I/O, config
assets/html/index.html          The single-page UI
assets/css/generator.css        All styling (themes, layout, bevel effects)
assets/js/generator.js          Front-end logic
assets/css/bootstrap*, assets/js/bootstrap*   Vendored Bootstrap — do not edit
config.json                     Server-side defaults (created on first save)
templates.json                  Saved prompt templates (created on first save)
docs/dataset-generator-suggestions.md   Running log of feature ideas/decisions
```

## Configuring which Ollama models appear

Two constants near the top of `app.py` control the model dropdown:

```python
# app.py

HIDDEN_MODELS = [
    "tool_calling:latest",
]

DEFAULT_MODEL = "qwen35:latest"
```

- **`HIDDEN_MODELS`** — a list of exact `name:tag` strings (matching what
  `ollama list` shows) that should never appear in the model selector.
  Useful for keeping purpose-built models (tool-calling models, embedding
  models, etc.) out of a dataset-generation dropdown where they don't belong.
  To hide more models, just add their exact tag to the list:

  ```python
  HIDDEN_MODELS = [
      "tool_calling:latest",
      "some-other-model:latest",
  ]
  ```

- **`DEFAULT_MODEL`** — the model preselected in the dropdown on page load,
  *if* it's present in the (filtered) list of models Ollama reports. If it
  isn't found — wrong name, not pulled yet, filtered out by `HIDDEN_MODELS`,
  whatever — the dropdown just falls back to showing the list with no
  special selection. No error, nothing breaks.

Restart the server after editing either constant.

## Configuration files

Two JSON files are created automatically the first time you use the
corresponding UI feature, and are safe to delete to reset to defaults:

- **`config.json`** — server-side defaults (port, model, max tokens, backend,
  temperature, top_p, OpenAI-compatible base URL/model). Written when you
  click "Save as default config" in Advanced Options.
- **`templates.json`** — saved prompt templates (name, prompt, system prompt,
  variables). Written when you save a template from the Generate tab.

Neither file stores API keys — the OpenAI-compatible backend's API key lives
only in the browser's local storage and is deliberately excluded from the
"Export settings" download, so it's never written to disk on the server side.

## Notes for anyone extending this

- All CSS lives in `assets/css/generator.css`; all JS in
  `assets/js/generator.js`. Never edit the vendored `bootstrap.min.css`,
  `bootstrap-icons.css`, or `bootstrap.bundle.min.js` — put overrides in
  `generator.css` instead.
- Dataset entries only ever get `"messages"` plus optional sibling keys
  (`"system"`, etc.) — nothing is ever nested inside `messages` beyond
  `role`/`content` pairs, so output stays compatible with training scripts
  that expect plain ChatML turns.
- `push.sh` in this folder is a human-only publishing script — it is not
  meant to be run by an AI agent, and this README does not document it
  further on purpose.
