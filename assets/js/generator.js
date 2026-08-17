// generator.js — dataset generator UI logic

const STORAGE_KEYS = {
  prompt: "gen.lastPrompt",
  filename: "gen.lastFilename",
  lastOutput: "gen.lastOutput",
  theme: "gen.theme",
  system: "gen.system",
  context: "gen.context",
  variables: "gen.variables",
  temperature: "gen.temperature",
  topP: "gen.topP",
  seed: "gen.seed",
  maxTokens: "gen.maxTokens",
  allowDuplicate: "gen.allowDuplicate",
  backend: "gen.backend",
  openaiBaseUrl: "gen.openaiBaseUrl",
  openaiModel: "gen.openaiModel",
};

// Never included in the Export settings blob — this key is a secret.
const OPENAI_API_KEY_STORAGE = "gen.openaiApiKey";

const els = {
  prompt: document.getElementById("prompt-box"),
  filename: document.getElementById("filename-box"),
  model: document.getElementById("model-select"),
  tokens: document.getElementById("token-count"),
  repeat: document.getElementById("repeat-count"),
  backendSelect: document.getElementById("backend-select"),
  ollamaModelRow: document.getElementById("ollama-model-row"),
  ollamaControlRow: document.getElementById("ollama-control-row"),
  openaiFields: document.getElementById("openai-fields"),
  openaiBaseUrl: document.getElementById("openai-base-url"),
  openaiApiKey: document.getElementById("openai-api-key"),
  openaiModel: document.getElementById("openai-model"),
  btnSend: document.getElementById("btn-send"),
  btnCancel: document.getElementById("btn-cancel"),
  btnStart: document.getElementById("btn-ollama-start"),
  btnStop: document.getElementById("btn-ollama-stop"),
  themeSelect: document.getElementById("theme-select"),
  status: document.getElementById("status-panel"),
  toastZone: document.getElementById("toast-zone"),
  healthBadge: document.getElementById("health-badge"),
  vramItem: document.getElementById("vram-item"),
  vramLabel: document.getElementById("vram-label"),
  vramText: document.getElementById("vram-text"),
  vramBar: document.getElementById("vram-bar"),
  listMode: document.getElementById("list-mode"),
  systemPrompt: document.getElementById("system-prompt"),
  contextBox: document.getElementById("context-box"),
  variablesBox: document.getElementById("variables-box"),
  temperature: document.getElementById("temperature"),
  topP: document.getElementById("top-p"),
  seed: document.getElementById("seed"),
  allowDuplicate: document.getElementById("allow-duplicate"),
  btnSaveDefault: document.getElementById("btn-save-default"),
  templateSelect: document.getElementById("template-select"),
  btnTemplateSave: document.getElementById("btn-template-save"),
  btnTemplateDelete: document.getElementById("btn-template-delete"),
  btnExportSettings: document.getElementById("btn-export-settings"),
  importSettingsFile: document.getElementById("import-settings-file"),
  progressWrap: document.getElementById("progress-wrap"),
  progressBar: document.getElementById("progress-bar"),
  btnRefreshInfo: document.getElementById("btn-refresh-info"),
  btnUndo: document.getElementById("btn-undo"),
  btnExportJsonl: document.getElementById("btn-export-jsonl"),
  datasetInfoBody: document.getElementById("dataset-info-body"),
  datasetPreview: document.getElementById("dataset-preview"),
};

let CANCELLED = false;
let TEMPLATES = [];

function toast(message, variant = "secondary") {
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${variant} border-0`;
  el.setAttribute("role", "alert");
  el.innerHTML = `<div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  els.toastZone.appendChild(el);
  const t = new bootstrap.Toast(el, { delay: 3500 });
  t.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  els.themeSelect.value = theme;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
}

function showStatus(text) {
  els.status.textContent = text;
  els.status.classList.remove("d-none");
}

function setProgress(current, total) {
  if (total <= 1) {
    els.progressWrap.classList.add("d-none");
    return;
  }
  els.progressWrap.classList.remove("d-none");
  const pct = Math.round((current / total) * 100);
  els.progressBar.style.width = `${pct}%`;
  els.progressBar.textContent = `${current}/${total}`;
}

// ---------------------------------------------------------------
// Startup: restore local state, load server config + models + templates
// ---------------------------------------------------------------

function updateBackendVisibility() {
  const backend = els.backendSelect.value;
  els.ollamaModelRow.classList.toggle("d-none", backend !== "ollama");
  els.ollamaControlRow.classList.toggle("d-none", backend !== "ollama");
  els.openaiFields.classList.toggle("d-none", backend !== "openai");
  els.openaiFields.classList.toggle("d-flex", backend === "openai");
}

function restoreState() {
  const prompt = localStorage.getItem(STORAGE_KEYS.prompt);
  const filename = localStorage.getItem(STORAGE_KEYS.filename);
  const lastOutput = localStorage.getItem(STORAGE_KEYS.lastOutput);
  const theme = localStorage.getItem(STORAGE_KEYS.theme) || "pink";
  const system = localStorage.getItem(STORAGE_KEYS.system);
  const context = localStorage.getItem(STORAGE_KEYS.context);
  const variables = localStorage.getItem(STORAGE_KEYS.variables);
  const temperature = localStorage.getItem(STORAGE_KEYS.temperature);
  const topP = localStorage.getItem(STORAGE_KEYS.topP);
  const seed = localStorage.getItem(STORAGE_KEYS.seed);
  const maxTokens = localStorage.getItem(STORAGE_KEYS.maxTokens);
  const allowDuplicate = localStorage.getItem(STORAGE_KEYS.allowDuplicate);
  const backend = localStorage.getItem(STORAGE_KEYS.backend);
  const openaiBaseUrl = localStorage.getItem(STORAGE_KEYS.openaiBaseUrl);
  const openaiApiKey = localStorage.getItem(OPENAI_API_KEY_STORAGE);
  const openaiModel = localStorage.getItem(STORAGE_KEYS.openaiModel);

  if (prompt) els.prompt.value = prompt;
  if (filename) els.filename.value = filename;
  if (lastOutput) showStatus(lastOutput);
  if (system) els.systemPrompt.value = system;
  if (context) els.contextBox.value = context;
  if (variables) els.variablesBox.value = variables;
  if (temperature) els.temperature.value = temperature;
  if (topP) els.topP.value = topP;
  if (seed) els.seed.value = seed;
  if (maxTokens) els.tokens.value = maxTokens;
  if (allowDuplicate !== null) els.allowDuplicate.checked = allowDuplicate === "true";
  if (backend) els.backendSelect.value = backend;
  if (openaiBaseUrl) els.openaiBaseUrl.value = openaiBaseUrl;
  if (openaiApiKey) els.openaiApiKey.value = openaiApiKey;
  if (openaiModel) els.openaiModel.value = openaiModel;
  applyTheme(theme);
  updateBackendVisibility();

  if (filename) loadDatasetInfo();
}

async function loadServerConfig() {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    if (!localStorage.getItem(STORAGE_KEYS.temperature) && cfg.temperature != null) {
      els.temperature.value = cfg.temperature;
    }
    if (!localStorage.getItem(STORAGE_KEYS.topP) && cfg.top_p != null) {
      els.topP.value = cfg.top_p;
    }
    if (!localStorage.getItem(STORAGE_KEYS.maxTokens) && cfg.max_tokens) {
      els.tokens.value = cfg.max_tokens;
    }
    if (!localStorage.getItem(STORAGE_KEYS.backend) && cfg.backend) {
      els.backendSelect.value = cfg.backend;
    }
    if (!localStorage.getItem(STORAGE_KEYS.openaiBaseUrl) && cfg.openai_base_url) {
      els.openaiBaseUrl.value = cfg.openai_base_url;
    }
    if (!localStorage.getItem(STORAGE_KEYS.openaiModel) && cfg.openai_model) {
      els.openaiModel.value = cfg.openai_model;
    }
    updateBackendVisibility();
    window.__serverDefaultModel = cfg.model || "";
  } catch (e) {
    // non-fatal
  }
}

async function saveDefaultConfig() {
  const payload = {
    model: els.model.value,
    max_tokens: parseInt(els.tokens.value, 10) || 450,
    backend: els.backendSelect.value,
    temperature: els.temperature.value ? parseFloat(els.temperature.value) : null,
    top_p: els.topP.value ? parseFloat(els.topP.value) : null,
    openai_base_url: els.openaiBaseUrl.value.trim(),
    openai_model: els.openaiModel.value.trim(),
  };
  try {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    toast("Saved as default config", "success");
  } catch (e) {
    toast(`Could not save config: ${e}`, "danger");
  }
}

async function loadModels() {
  try {
    const res = await fetch("/api/models");
    const data = await res.json();
    els.model.innerHTML = "";
    if (!data.running) {
      els.model.innerHTML = `<option value="">(ollama not running)</option>`;
      return;
    }
    if (!data.models.length) {
      els.model.innerHTML = `<option value="">(no models found)</option>`;
      return;
    }
    data.models.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      els.model.appendChild(opt);
    });
    if (window.__serverDefaultModel && data.models.includes(window.__serverDefaultModel)) {
      els.model.value = window.__serverDefaultModel;
    } else if (data.default_model && data.models.includes(data.default_model)) {
      els.model.value = data.default_model;
    }
  } catch (e) {
    els.model.innerHTML = `<option value="">(error)</option>`;
  }
}

function setHealthBadge(cls, icon, title) {
  els.healthBadge.classList.remove("is-up", "is-down");
  if (cls) els.healthBadge.classList.add(cls);
  els.healthBadge.innerHTML = `<i class="bi ${icon}"></i>`;
  els.healthBadge.setAttribute("title", title);
  els.healthBadge.setAttribute("data-bs-original-title", title);
  const tooltip = bootstrap.Tooltip.getInstance(els.healthBadge);
  if (tooltip) tooltip.setContent({ ".tooltip-inner": title });
}

async function refreshHealth() {
  try {
    const res = await fetch("/api/ollama/status");
    const data = await res.json();
    if (data.running) {
      setHealthBadge("is-up", "bi-check-circle", "Ollama running");
    } else {
      setHealthBadge("is-down", "bi-x-circle", "Ollama stopped");
    }
  } catch (e) {
    setHealthBadge("is-down", "bi-exclamation-triangle", "Ollama status unreachable");
  }
}

async function refreshVram() {
  try {
    const res = await fetch("/api/gpu");
    const data = await res.json();
    if (!data.available || !data.gpus.length) {
      els.vramItem.classList.add("d-none");
      return;
    }
    els.vramItem.classList.remove("d-none");
    // Multiple GPUs: show the first, sum usage into the tooltip title for the rest.
    const gpu = data.gpus[0];
    const pct = Math.round((gpu.used_mb / gpu.total_mb) * 100);
    const usedGb = (gpu.used_mb / 1024).toFixed(1);
    const totalGb = (gpu.total_mb / 1024).toFixed(1);
    els.vramText.textContent = `${usedGb} / ${totalGb} GB`;
    els.vramBar.style.width = `${pct}%`;
    els.vramBar.classList.remove("is-warn", "is-hot");
    if (pct >= 90) els.vramBar.classList.add("is-hot");
    else if (pct >= 70) els.vramBar.classList.add("is-warn");

    const namesTitle = data.gpus
      .map((g) => `${g.name}: ${(g.used_mb / 1024).toFixed(1)} / ${(g.total_mb / 1024).toFixed(1)} GB`)
      .join("\n");
    els.vramItem.querySelector(".gen-vram").setAttribute("title", namesTitle);
    const tooltip = bootstrap.Tooltip.getInstance(els.vramItem.querySelector(".gen-vram"));
    if (tooltip) tooltip.setContent({ ".tooltip-inner": namesTitle });
  } catch (e) {
    els.vramItem.classList.add("d-none");
  }
}

// ---------------------------------------------------------------
// Templates
// ---------------------------------------------------------------

async function loadTemplates() {
  try {
    const res = await fetch("/api/templates");
    TEMPLATES = await res.json();
    els.templateSelect.innerHTML = `<option value="">(none)</option>`;
    TEMPLATES.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = t.name;
      els.templateSelect.appendChild(opt);
    });
  } catch (e) {
    // non-fatal
  }
}

els.templateSelect.addEventListener("change", () => {
  const name = els.templateSelect.value;
  if (!name) return;
  const t = TEMPLATES.find((x) => x.name === name);
  if (!t) return;
  els.prompt.value = t.prompt || "";
  els.systemPrompt.value = t.system || "";
  els.variablesBox.value = t.variables || "";
  toast(`Loaded template "${name}"`, "success");
});

els.btnTemplateSave.addEventListener("click", async () => {
  const name = prompt("Template name:");
  if (!name) return;
  try {
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        prompt: els.prompt.value,
        system: els.systemPrompt.value,
        variables: els.variablesBox.value,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      toast(`Template "${name}" saved`, "success");
      loadTemplates();
    }
  } catch (e) {
    toast(`Could not save template: ${e}`, "danger");
  }
});

els.btnTemplateDelete.addEventListener("click", async () => {
  const name = els.templateSelect.value;
  if (!name) {
    toast("Select a template to delete first", "warning");
    return;
  }
  try {
    await fetch("/api/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    toast(`Template "${name}" deleted`, "success");
    loadTemplates();
  } catch (e) {
    toast(`Could not delete template: ${e}`, "danger");
  }
});

// ---------------------------------------------------------------
// Dataset info / undo / export
// ---------------------------------------------------------------

async function loadDatasetInfo() {
  const filename = els.filename.value.trim();
  if (!filename) {
    els.datasetInfoBody.textContent = "No dataset file loaded yet.";
    els.datasetPreview.innerHTML = "";
    return;
  }
  try {
    const res = await fetch(`/api/dataset_info?filename=${encodeURIComponent(filename)}`);
    const data = await res.json();
    if (!data.ok) {
      els.datasetInfoBody.textContent = data.error || "Could not load dataset info.";
      return;
    }
    if (!data.exists) {
      els.datasetInfoBody.textContent = "File does not exist yet — it will be created on first send.";
      els.datasetPreview.innerHTML = "";
      return;
    }
    const kb = (data.size_bytes / 1024).toFixed(1);
    const when = new Date(data.modified * 1000).toLocaleString();
    els.datasetInfoBody.innerHTML =
      `<strong>${data.count}</strong> entries &middot; ${kb} KB &middot; ${data.format} &middot; modified ${when}`;
    els.datasetPreview.innerHTML = data.preview
      .map((p) => `<li><strong>U:</strong> ${escapeHtml(p.user)}<br><strong>A:</strong> ${escapeHtml(p.assistant)}</li>`)
      .join("");
  } catch (e) {
    els.datasetInfoBody.textContent = `Could not load dataset info: ${e}`;
  }
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

els.filename.addEventListener("change", loadDatasetInfo);
els.btnRefreshInfo.addEventListener("click", loadDatasetInfo);

els.btnUndo.addEventListener("click", async () => {
  const filename = els.filename.value.trim();
  if (!filename) {
    toast("Specify a dataset file first", "warning");
    return;
  }
  if (!confirm("Remove the last entry from this dataset file?")) return;
  try {
    const res = await fetch("/api/dataset/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    const data = await res.json();
    if (data.ok) {
      toast("Last entry removed", "success");
      loadDatasetInfo();
    } else {
      toast(data.error || "Could not undo", "danger");
    }
  } catch (e) {
    toast(`Request failed: ${e}`, "danger");
  }
});

els.btnExportJsonl.addEventListener("click", async () => {
  const filename = els.filename.value.trim();
  if (!filename) {
    toast("Specify a dataset file first", "warning");
    return;
  }
  try {
    const res = await fetch("/api/dataset/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    const data = await res.json();
    if (data.ok) {
      toast(`Exported to ${data.output}`, "success");
    } else {
      toast(data.error || "Export failed", "danger");
    }
  } catch (e) {
    toast(`Request failed: ${e}`, "danger");
  }
});


// ---------------------------------------------------------------
// Generation
// ---------------------------------------------------------------

function parseContext() {
  const raw = els.contextBox.value.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("context must be a JSON array");
    return parsed;
  } catch (e) {
    throw new Error(`Prior conversation turns must be valid JSON: ${e.message}`);
  }
}

function buildPromptQueue() {
  const rawPrompt = els.prompt.value.trim();
  if (els.listMode.checked) {
    const lines = els.prompt.value.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.length ? lines : [rawPrompt];
  }
  const variableLines = els.variablesBox.value.split("\n").map((l) => l.trim()).filter(Boolean);
  if (variableLines.length) {
    return variableLines.map((v) => rawPrompt.replaceAll("{{value}}", v));
  }
  let repeat = parseInt(els.repeat.value, 10) || 1;
  repeat = Math.min(99, Math.max(1, repeat));
  els.repeat.value = repeat;
  return Array(repeat).fill(rawPrompt);
}

async function generateOnce(promptText, filename, model, maxTokens, backend, extra) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: promptText,
      filename,
      model,
      max_tokens: maxTokens,
      backend,
      ...extra,
    }),
  });
  return { status: res.status, data: await res.json() };
}

async function sendPrompt() {
  const filename = els.filename.value.trim();
  const model = els.model.value;
  const maxTokens = parseInt(els.tokens.value, 10) || 450;
  const backend = els.backendSelect.value;

  if (!filename) {
    toast("Specify a dataset file first", "warning");
    return;
  }
  if (backend === "ollama" && !model) {
    toast("Select a model first", "warning");
    return;
  }
  if (backend === "openai" && (!els.openaiBaseUrl.value.trim() || !els.openaiModel.value.trim())) {
    toast("Set a base URL and model name for the OpenAI-compatible backend first", "warning");
    return;
  }

  let context;
  try {
    context = parseContext();
  } catch (e) {
    toast(e.message, "danger");
    return;
  }

  let queue;
  try {
    queue = buildPromptQueue();
  } catch (e) {
    toast(e.message, "danger");
    return;
  }
  if (!queue.length || !queue[0]) {
    toast("Enter a prompt first", "warning");
    return;
  }

  localStorage.setItem(STORAGE_KEYS.prompt, els.prompt.value);
  localStorage.setItem(STORAGE_KEYS.filename, filename);
  localStorage.setItem(STORAGE_KEYS.system, els.systemPrompt.value);
  localStorage.setItem(STORAGE_KEYS.context, els.contextBox.value);
  localStorage.setItem(STORAGE_KEYS.variables, els.variablesBox.value);
  localStorage.setItem(STORAGE_KEYS.temperature, els.temperature.value);
  localStorage.setItem(STORAGE_KEYS.topP, els.topP.value);
  localStorage.setItem(STORAGE_KEYS.seed, els.seed.value);
  localStorage.setItem(STORAGE_KEYS.backend, backend);
  localStorage.setItem(STORAGE_KEYS.openaiBaseUrl, els.openaiBaseUrl.value);
  localStorage.setItem(STORAGE_KEYS.openaiModel, els.openaiModel.value);
  localStorage.setItem(OPENAI_API_KEY_STORAGE, els.openaiApiKey.value);

  const extra = {
    system: els.systemPrompt.value.trim(),
    context,
    allow_duplicate: els.allowDuplicate.checked,
  };
  if (els.temperature.value) extra.temperature = parseFloat(els.temperature.value);
  if (els.topP.value) extra.top_p = parseFloat(els.topP.value);
  if (els.seed.value) extra.seed = parseInt(els.seed.value, 10);
  if (backend === "openai") {
    extra.openai_base_url = els.openaiBaseUrl.value.trim();
    extra.openai_api_key = els.openaiApiKey.value.trim();
    extra.openai_model = els.openaiModel.value.trim();
  }

  CANCELLED = false;
  els.btnSend.disabled = true;
  els.btnCancel.classList.toggle("d-none", queue.length <= 1);

  let appended = 0;
  let skippedDuplicates = 0;

  for (let i = 0; i < queue.length; i++) {
    if (CANCELLED) {
      showStatus(`Cancelled after ${appended} of ${queue.length} run(s).`);
      break;
    }
    setProgress(i, queue.length);
    showStatus(queue.length > 1 ? `Generating ${i + 1} of ${queue.length}…` : "Generating…");
    try {
      const { data } = await generateOnce(queue[i], filename, model, maxTokens, backend, extra);
      if (data.ok) {
        appended++;
        const out = `Assistant:\n${data.entry.messages[data.entry.messages.length - 1].content}\n\n(${data.total_entries} entries in ${filename})`;
        showStatus(out);
        localStorage.setItem(STORAGE_KEYS.lastOutput, out);
      } else if (data.duplicate) {
        skippedDuplicates++;
        showStatus(`Skipped duplicate prompt (${i + 1}/${queue.length}): "${queue[i].slice(0, 80)}"`);
      } else {
        showStatus(`Error on run ${i + 1}/${queue.length}: ${data.error}`);
        toast(data.error, "danger");
        break;
      }
    } catch (e) {
      showStatus(`Request failed on run ${i + 1}/${queue.length}: ${e}`);
      toast(`Request failed: ${e}`, "danger");
      break;
    }
  }

  setProgress(queue.length, queue.length);
  els.progressWrap.classList.add("d-none");
  els.btnCancel.classList.add("d-none");

  if (appended > 0) {
    toast(
      appended === 1 ? "Entry appended to dataset" : `${appended} entries appended to dataset`,
      "success"
    );
  }
  if (skippedDuplicates > 0) {
    toast(`${skippedDuplicates} duplicate prompt(s) skipped (tick "Allow duplicate prompts" to force)`, "warning");
  }

  els.btnSend.disabled = false;
  loadDatasetInfo();
}

els.btnCancel.addEventListener("click", () => {
  CANCELLED = true;
});

async function toggleOllama(action) {
  const btn = action === "start" ? els.btnStart : els.btnStop;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/ollama/${action}`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      toast(`Ollama ${data.running ? "running" : "stopped"}`, "success");
      loadModels();
      refreshHealth();
    } else {
      toast(data.error || "Request failed", "danger");
    }
  } catch (e) {
    toast(`Request failed: ${e}`, "danger");
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------
// Settings export / import
// ---------------------------------------------------------------

els.btnExportSettings.addEventListener("click", () => {
  const blob = {};
  Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
    const v = localStorage.getItem(storageKey);
    if (v !== null) blob[key] = v;
  });
  const dataStr = JSON.stringify(blob, null, 2);
  const url = URL.createObjectURL(new Blob([dataStr], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "dataset-generator-settings.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Settings exported", "success");
});

els.importSettingsFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const blob = JSON.parse(text);
    Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
      if (blob[key] !== undefined) localStorage.setItem(storageKey, blob[key]);
    });
    toast("Settings imported — reloading…", "success");
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    toast(`Could not import settings: ${err}`, "danger");
  } finally {
    e.target.value = "";
  }
});

// ---------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------

els.btnSend.addEventListener("click", sendPrompt);
els.btnStart.addEventListener("click", () => toggleOllama("start"));
els.btnStop.addEventListener("click", () => toggleOllama("stop"));
els.btnSaveDefault.addEventListener("click", saveDefaultConfig);
els.themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));
els.backendSelect.addEventListener("change", updateBackendVisibility);

// Live-persist fields as soon as they're edited, not only when Send is
// clicked — otherwise a value tweaked without immediately sending is lost
// on reload.
function persistOnInput(el, storageKey, eventType = "input") {
  el.addEventListener(eventType, () => localStorage.setItem(storageKey, el.value));
}

persistOnInput(els.systemPrompt, STORAGE_KEYS.system);
persistOnInput(els.contextBox, STORAGE_KEYS.context);
persistOnInput(els.temperature, STORAGE_KEYS.temperature);
persistOnInput(els.topP, STORAGE_KEYS.topP);
persistOnInput(els.seed, STORAGE_KEYS.seed);
persistOnInput(els.tokens, STORAGE_KEYS.maxTokens);
els.allowDuplicate.addEventListener("change", () => {
  localStorage.setItem(STORAGE_KEYS.allowDuplicate, els.allowDuplicate.checked);
});

els.prompt.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    sendPrompt();
  }
});

document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));

restoreState();
loadServerConfig().then(loadModels);
loadTemplates();
refreshHealth();
refreshVram();
setInterval(refreshHealth, 15000);
setInterval(refreshVram, 15000);
