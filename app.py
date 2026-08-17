#!/usr/bin/env python3
"""Local Flask server for generating ChatML datasets via Ollama (or Kobold.cpp)."""

import argparse
import json
import socket
import subprocess
import time
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)
BASE_DIR = Path(__file__).parent
ASSETS_DIR = BASE_DIR / "assets"
CONFIG_FILE = BASE_DIR / "config.json"
TEMPLATES_FILE = BASE_DIR / "templates.json"

OLLAMA_URL = "http://localhost:11434"
KOBOLD_URL = "http://localhost:5001"

# Ollama models that should never show up in the model selector (e.g.
# purpose-built tool-calling models you don't want mixed into dataset
# generation runs). Match on the exact "name:tag" string from `ollama list`.
HIDDEN_MODELS = [
    "tool_calling:latest",
]

# Preselected in the model dropdown on load, if present in the (filtered)
# model list. If it isn't found, the dropdown just falls back to whatever
# Ollama returns first — no error, no special handling.
DEFAULT_MODEL = "qwen35:latest"

DEFAULT_CONFIG = {
    "port": 8942,
    "model": DEFAULT_MODEL,
    "max_tokens": 450,
    "backend": "ollama",
    "temperature": 0.8,
    "top_p": 0.9,
    "openai_base_url": "https://openrouter.ai/api/v1",
    "openai_model": "",
}


# ============================================================
# Config / templates persistence
# ============================================================

def load_json_file(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return default


def save_json_file(path: Path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


@app.route("/api/config", methods=["GET"])
def api_config_get():
    cfg = {**DEFAULT_CONFIG, **load_json_file(CONFIG_FILE, {})}
    return jsonify(cfg)


@app.route("/api/config", methods=["POST"])
def api_config_set():
    data = request.get_json(force=True)
    cfg = {**DEFAULT_CONFIG, **load_json_file(CONFIG_FILE, {})}
    for key in DEFAULT_CONFIG:
        if key in data:
            cfg[key] = data[key]
    save_json_file(CONFIG_FILE, cfg)
    return jsonify(cfg)


@app.route("/api/templates", methods=["GET"])
def api_templates_get():
    return jsonify(load_json_file(TEMPLATES_FILE, []))


@app.route("/api/templates", methods=["POST"])
def api_templates_save():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "template name is required"}), 400
    templates = load_json_file(TEMPLATES_FILE, [])
    templates = [t for t in templates if t.get("name") != name]
    templates.append({
        "name": name,
        "prompt": data.get("prompt", ""),
        "system": data.get("system", ""),
        "variables": data.get("variables", ""),
    })
    save_json_file(TEMPLATES_FILE, templates)
    return jsonify({"ok": True, "templates": templates})


@app.route("/api/templates", methods=["DELETE"])
def api_templates_delete():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    templates = load_json_file(TEMPLATES_FILE, [])
    templates = [t for t in templates if t.get("name") != name]
    save_json_file(TEMPLATES_FILE, templates)
    return jsonify({"ok": True, "templates": templates})


# ============================================================
# Static / page routes
# ============================================================

@app.route("/")
def index():
    return send_from_directory(ASSETS_DIR / "html", "index.html")


@app.route("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(ASSETS_DIR, filename)


# ============================================================
# Ollama control
# ============================================================

def ollama_is_running():
    try:
        requests.get(f"{OLLAMA_URL}/api/tags", timeout=2)
        return True
    except requests.RequestException:
        return False


@app.route("/api/models")
def api_models():
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", []) if m["name"] not in HIDDEN_MODELS]
        default_model = DEFAULT_MODEL if DEFAULT_MODEL in models else ""
        return jsonify({"models": models, "running": True, "default_model": default_model})
    except requests.RequestException:
        return jsonify({"models": [], "running": False, "default_model": ""})


@app.route("/api/ollama/status")
def api_ollama_status():
    return jsonify({"running": ollama_is_running()})


def query_gpu_vram():
    """Run nvidia-smi and return per-GPU VRAM usage in MB, or None if unavailable."""
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None

    gpus = []
    for line in result.stdout.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) != 3:
            continue
        name, used, total = parts
        try:
            gpus.append({"name": name, "used_mb": int(used), "total_mb": int(total)})
        except ValueError:
            continue
    return gpus


@app.route("/api/gpu")
def api_gpu():
    gpus = query_gpu_vram()
    if gpus is None:
        return jsonify({"available": False, "gpus": []})
    return jsonify({"available": True, "gpus": gpus})


@app.route("/api/ollama/start", methods=["POST"])
def api_ollama_start():
    if ollama_is_running():
        return jsonify({"ok": True, "running": True})
    try:
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError as e:
        return jsonify({"ok": False, "error": str(e)}), 500

    for _ in range(20):
        if ollama_is_running():
            return jsonify({"ok": True, "running": True})
        time.sleep(0.5)
    return jsonify({"ok": False, "error": "ollama did not come up in time"}), 504


@app.route("/api/ollama/stop", methods=["POST"])
def api_ollama_stop():
    try:
        subprocess.run(["pkill", "-f", "ollama serve"], timeout=5)
    except (OSError, subprocess.TimeoutExpired) as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": True, "running": ollama_is_running()})


# ============================================================
# Generation backends (with one retry on transient failure)
# ============================================================

def _with_retry(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
        time.sleep(1)
        return fn(*args, **kwargs)


def query_ollama(model, prompt, max_tokens, temperature=None, top_p=None, seed=None):
    options = {"num_predict": max_tokens}
    if temperature is not None:
        options["temperature"] = temperature
    if top_p is not None:
        options["top_p"] = top_p
    if seed is not None:
        options["seed"] = seed

    def _do():
        r = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "think": False,
                "options": options,
            },
            timeout=300,
        )
        r.raise_for_status()
        data = r.json()
        return data.get("response", "") or data.get("thinking", "")

    return _with_retry(_do)


def query_kobold(prompt, max_tokens, temperature=None, top_p=None, seed=None):
    body = {"prompt": prompt, "max_length": max_tokens}
    if temperature is not None:
        body["temperature"] = temperature
    if top_p is not None:
        body["top_p"] = top_p
    if seed is not None:
        body["sampler_seed"] = seed

    def _do():
        r = requests.post(f"{KOBOLD_URL}/api/v1/generate", json=body, timeout=300)
        r.raise_for_status()
        results = r.json().get("results", [])
        return results[0]["text"] if results else ""

    return _with_retry(_do)


def query_openai_compatible(base_url, api_key, model, messages, max_tokens, temperature=None, top_p=None):
    """Chat-completions call against any OpenAI-compatible endpoint —
    OpenRouter, LM Studio, text-generation-webui, etc. Uses the structured
    messages list directly rather than a flattened prompt string, since that's
    the native format for this API shape."""
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    body = {"model": model, "messages": messages, "max_tokens": max_tokens}
    if temperature is not None:
        body["temperature"] = temperature
    if top_p is not None:
        body["top_p"] = top_p

    def _do():
        r = requests.post(url, headers=headers, json=body, timeout=300)
        r.raise_for_status()
        choices = r.json().get("choices", [])
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "")

    return _with_retry(_do)


# ============================================================
# Dataset file helpers (.json array or .jsonl, one entry per line)
# ============================================================

def is_jsonl(path: Path) -> bool:
    return path.suffix.lower() == ".jsonl"


def read_dataset(path: Path):
    """Return list of entries. Tolerant of missing/corrupt files."""
    if not path.exists():
        return []
    if is_jsonl(path):
        entries = []
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return entries
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def write_dataset(path: Path, entries):
    path.parent.mkdir(parents=True, exist_ok=True)
    if is_jsonl(path):
        path.write_text(
            "\n".join(json.dumps(e, ensure_ascii=False) for e in entries) + ("\n" if entries else "")
        )
    else:
        path.write_text(json.dumps(entries, indent=2, ensure_ascii=False))


def append_entry(path: Path, entry, existing=None):
    """Append entry to the dataset. If the caller already loaded the dataset
    (e.g. for the duplicate-prompt check), pass it as `existing` so a large
    .json array file isn't parsed from disk twice per request."""
    if is_jsonl(path):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        if existing is not None:
            return len(existing) + 1
        return sum(1 for line in path.read_text().splitlines() if line.strip())
    entries = existing if existing is not None else read_dataset(path)
    entries.append(entry)
    write_dataset(path, entries)
    return len(entries)


def build_flat_prompt(system_prompt, context, prompt):
    """Flatten system + prior turns + new prompt into one text blob, for
    backends (Ollama, Kobold) that take a raw prompt string rather than a
    structured messages list."""
    parts = []
    if system_prompt:
        parts.append(system_prompt)
    for turn in context:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        parts.append(f"{role}: {content}")
    parts.append(prompt if not context and not system_prompt else f"user: {prompt}")
    return "\n\n".join(parts) if (context or system_prompt) else prompt


def first_user_content(entry):
    for m in entry.get("messages", []):
        if m.get("role") == "user":
            return m.get("content", "")
    return None


# ============================================================
# Generation endpoints
# ============================================================

def generate_response_text(
    backend, model, prompt, system_prompt, context, max_tokens,
    temperature, top_p, seed, openai_base_url, openai_api_key, openai_model,
):
    """Call the configured backend and return the generated text.

    Raises ValueError for a missing required field for the chosen backend
    (caller turns this into a 400), or requests.RequestException on a
    network/backend failure (caller turns this into a 502). Shared by the
    single-entry and bulk generation endpoints so there's one place that
    knows how each backend's request is shaped.
    """
    if backend == "openai":
        if not openai_base_url:
            raise ValueError("base URL is required for the OpenAI-compatible backend")
        if not openai_model:
            raise ValueError("model name is required for the OpenAI-compatible backend")
        chat_messages = []
        if system_prompt:
            chat_messages.append({"role": "system", "content": system_prompt})
        chat_messages.extend(context)
        chat_messages.append({"role": "user", "content": prompt})
        return query_openai_compatible(
            openai_base_url, openai_api_key, openai_model, chat_messages, max_tokens, temperature, top_p
        )
    if backend == "kobold":
        full_prompt = build_flat_prompt(system_prompt, context, prompt)
        return query_kobold(full_prompt, max_tokens, temperature, top_p, seed)
    if not model:
        raise ValueError("model is required for ollama")
    full_prompt = build_flat_prompt(system_prompt, context, prompt)
    return query_ollama(model, full_prompt, max_tokens, temperature, top_p, seed)


def build_entry(prompt, response_text, system_prompt, context):
    messages = list(context) + [
        {"role": "user", "content": prompt},
        {"role": "assistant", "content": response_text},
    ]
    entry = {"messages": messages}
    if system_prompt:
        entry["system"] = system_prompt
    return entry


@app.route("/api/generate", methods=["POST"])
def api_generate():
    data = request.get_json(force=True)
    prompt = (data.get("prompt") or "").strip()
    filename = (data.get("filename") or "").strip()
    model = data.get("model") or ""
    max_tokens = int(data.get("max_tokens") or 450)
    backend = data.get("backend") or "ollama"
    system_prompt = (data.get("system") or "").strip()
    temperature = data.get("temperature")
    top_p = data.get("top_p")
    seed = data.get("seed")
    context = data.get("context") or []  # prior turns: [{"role":..,"content":..}, ...]
    allow_duplicate = bool(data.get("allow_duplicate"))
    openai_base_url = (data.get("openai_base_url") or "").strip()
    openai_api_key = (data.get("openai_api_key") or "").strip()
    openai_model = (data.get("openai_model") or "").strip()

    if not prompt:
        return jsonify({"ok": False, "error": "prompt is required"}), 400
    if not filename:
        return jsonify({"ok": False, "error": "filename is required"}), 400
    if not isinstance(context, list):
        return jsonify({"ok": False, "error": "context must be a list of {role, content}"}), 400

    path = Path(filename).expanduser()

    existing = None
    if not allow_duplicate:
        existing = read_dataset(path)
        if any(first_user_content(e) == prompt for e in existing):
            return jsonify({"ok": False, "duplicate": True, "error": "This prompt already exists in the dataset."}), 409

    try:
        response_text = generate_response_text(
            backend, model, prompt, system_prompt, context, max_tokens,
            temperature, top_p, seed, openai_base_url, openai_api_key, openai_model,
        )
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except requests.RequestException as e:
        return jsonify({"ok": False, "error": f"backend request failed: {e}"}), 502

    entry = build_entry(prompt, response_text, system_prompt, context)
    total_entries = append_entry(path, entry, existing=existing)

    return jsonify({"ok": True, "entry": entry, "total_entries": total_entries})


@app.route("/api/generate/bulk", methods=["POST"])
def api_generate_bulk():
    """Append many entries to a dataset file in one request.

    Body:
      filename: target .json/.jsonl file (required)
      entries: non-empty list, each item either:
        - a plain string, treated as a prompt to generate a response for, or
        - an object {"prompt": ..., "response": ...?, "system": ...?,
          "context": [...]?, "model"/"backend"/"max_tokens"/"temperature"/
          "top_p"/"seed"/"openai_*": ...?} — any field here overrides the
          request-level default of the same name for this entry only.
          If "response" is present, no backend is called for that entry —
          it's appended as-is (useful for importing already-written pairs).
      Any of model/backend/max_tokens/system/temperature/top_p/seed/
      openai_base_url/openai_api_key/openai_model/allow_duplicate at the
      top level act as defaults for entries that don't override them.
      stop_on_error: if true, stop processing on the first failed entry
      instead of continuing with the rest (default false).

    The whole batch is written to disk in a single write, and the
    duplicate-prompt check (when enabled) is done against one in-memory
    copy of the dataset shared across the batch, rather than re-reading
    the file per entry.
    """
    data = request.get_json(force=True)
    filename = (data.get("filename") or "").strip()
    entries_in = data.get("entries")

    if not filename:
        return jsonify({"ok": False, "error": "filename is required"}), 400
    if not isinstance(entries_in, list) or not entries_in:
        return jsonify({"ok": False, "error": "entries must be a non-empty list"}), 400

    default_model = data.get("model") or ""
    default_backend = data.get("backend") or "ollama"
    default_max_tokens = int(data.get("max_tokens") or 450)
    default_system = (data.get("system") or "").strip()
    default_temperature = data.get("temperature")
    default_top_p = data.get("top_p")
    default_seed = data.get("seed")
    default_openai_base_url = (data.get("openai_base_url") or "").strip()
    default_openai_api_key = (data.get("openai_api_key") or "").strip()
    default_openai_model = (data.get("openai_model") or "").strip()
    allow_duplicate = bool(data.get("allow_duplicate"))
    stop_on_error = bool(data.get("stop_on_error"))

    path = Path(filename).expanduser()
    existing = read_dataset(path)
    seen_prompts = None if allow_duplicate else {first_user_content(e) for e in existing}

    results = []
    appended = 0
    skipped_duplicates = 0
    failed = 0

    for raw in entries_in:
        if isinstance(raw, str):
            item = {"prompt": raw}
        elif isinstance(raw, dict):
            item = raw
        else:
            results.append({"ok": False, "error": "each entry must be a string or an object"})
            failed += 1
            if stop_on_error:
                break
            continue

        prompt = (item.get("prompt") or "").strip()
        if not prompt:
            results.append({"ok": False, "error": "prompt is required"})
            failed += 1
            if stop_on_error:
                break
            continue

        if seen_prompts is not None and prompt in seen_prompts:
            results.append({"ok": False, "duplicate": True, "error": "duplicate prompt"})
            skipped_duplicates += 1
            continue

        context = item.get("context") or []
        system_prompt = item.get("system", default_system) or ""
        response_text = item.get("response")

        if response_text is None:
            try:
                response_text = generate_response_text(
                    item.get("backend") or default_backend,
                    item.get("model") or default_model,
                    prompt, system_prompt, context,
                    int(item.get("max_tokens") or default_max_tokens),
                    item.get("temperature", default_temperature),
                    item.get("top_p", default_top_p),
                    item.get("seed", default_seed),
                    item.get("openai_base_url") or default_openai_base_url,
                    item.get("openai_api_key") or default_openai_api_key,
                    item.get("openai_model") or default_openai_model,
                )
            except ValueError as e:
                results.append({"ok": False, "error": str(e)})
                failed += 1
                if stop_on_error:
                    break
                continue
            except requests.RequestException as e:
                results.append({"ok": False, "error": f"backend request failed: {e}"})
                failed += 1
                if stop_on_error:
                    break
                continue

        entry = build_entry(prompt, response_text, system_prompt, context)
        existing.append(entry)
        if seen_prompts is not None:
            seen_prompts.add(prompt)
        appended += 1
        results.append({"ok": True, "entry": entry})

    if appended:
        write_dataset(path, existing)

    return jsonify({
        "ok": True,
        "results": results,
        "appended": appended,
        "skipped_duplicates": skipped_duplicates,
        "failed": failed,
        "total_entries": len(existing),
    })


# ============================================================
# Dataset management endpoints
# ============================================================

@app.route("/api/dataset_info")
def api_dataset_info():
    filename = (request.args.get("filename") or "").strip()
    if not filename:
        return jsonify({"ok": False, "error": "filename is required"}), 400
    path = Path(filename).expanduser()
    if not path.exists():
        return jsonify({"ok": True, "exists": False, "count": 0, "preview": []})

    entries = read_dataset(path)
    preview = []
    for e in entries[-5:]:
        u = first_user_content(e) or ""
        a = ""
        for m in e.get("messages", []):
            if m.get("role") == "assistant":
                a = m.get("content", "")
        preview.append({
            "user": u[:160],
            "assistant": a[:160],
        })

    stat = path.stat()
    return jsonify({
        "ok": True,
        "exists": True,
        "count": len(entries),
        "size_bytes": stat.st_size,
        "modified": stat.st_mtime,
        "format": "jsonl" if is_jsonl(path) else "json",
        "preview": preview,
    })


@app.route("/api/dataset/undo", methods=["POST"])
def api_dataset_undo():
    data = request.get_json(force=True)
    filename = (data.get("filename") or "").strip()
    if not filename:
        return jsonify({"ok": False, "error": "filename is required"}), 400
    path = Path(filename).expanduser()
    entries = read_dataset(path)
    if not entries:
        return jsonify({"ok": False, "error": "dataset is empty"}), 400
    removed = entries.pop()
    write_dataset(path, entries)
    return jsonify({"ok": True, "removed": removed, "total_entries": len(entries)})


@app.route("/api/dataset/export", methods=["POST"])
def api_dataset_export():
    """Write a sibling file in the other format (.json <-> .jsonl)."""
    data = request.get_json(force=True)
    filename = (data.get("filename") or "").strip()
    if not filename:
        return jsonify({"ok": False, "error": "filename is required"}), 400
    path = Path(filename).expanduser()
    entries = read_dataset(path)
    if is_jsonl(path):
        out_path = path.with_suffix(".json")
    else:
        out_path = path.with_suffix(".jsonl")
    write_dataset(out_path, entries)
    return jsonify({"ok": True, "output": str(out_path), "total_entries": len(entries)})


def parse_args():
    p = argparse.ArgumentParser(description="Dataset generator server")
    cfg = {**DEFAULT_CONFIG, **load_json_file(CONFIG_FILE, {})}
    p.add_argument("--port", type=int, default=cfg.get("port", 8942))
    p.add_argument("--host", default="127.0.0.1")
    return p.parse_args()


def find_open_port(host: str, start_port: int, max_attempts: int = 10) -> int:
    """Return start_port if free, otherwise probe start_port+1, +2, ... up to
    max_attempts total ports before giving up."""
    for offset in range(max_attempts):
        port = start_port + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, port))
            except OSError:
                continue
            return port
    raise SystemExit(
        f"Could not find a free port after checking {start_port}..{start_port + max_attempts - 1}"
    )


if __name__ == "__main__":
    args = parse_args()
    port = find_open_port(args.host, args.port)
    if port != args.port:
        print(f"  Port {args.port} is already in use — using {port} instead.")
    app.run(host=args.host, port=port, debug=False)
