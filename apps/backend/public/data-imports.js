const fileInput = document.querySelector("#spotify-file");
const dropZone = document.querySelector("#drop-zone");
const selectedFile = document.querySelector("#selected-file");
const importKey = document.querySelector("#import-key");
const importButton = document.querySelector("#import-button");
const importResult = document.querySelector("#import-result");
const importStatus = document.querySelector("#import-status");
const historyRoot = document.querySelector("#import-history");
const refreshHistory = document.querySelector("#refresh-history");

let currentFile;
const storedPin = window.sessionStorage.getItem("spotifyImportPin");
if (storedPin) importKey.value = storedPin;

fileInput.addEventListener("change", () => setFile(fileInput.files?.[0]));
importKey.addEventListener("input", () => {
  const value = importKey.value.replace(/\D/g, "").slice(0, 6);
  importKey.value = value;
  if (value) window.sessionStorage.setItem("spotifyImportPin", value);
  else window.sessionStorage.removeItem("spotifyImportPin");
  updateButtonState();
});

dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("dragging"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => { event.preventDefault(); dropZone.classList.remove("dragging"); setFile(event.dataTransfer?.files?.[0]); });

importButton.addEventListener("click", importSpotifyCsv);
refreshHistory.addEventListener("click", loadHistory);

await loadHistory();
updateButtonState();

function setFile(file) {
  if (!file) { currentFile = undefined; selectedFile.textContent = "No file selected"; updateButtonState(); return; }
  if (!file.name.toLowerCase().endsWith(".csv")) { showResult("error", "Please select a CSV file exported from Spotify for Creators."); currentFile = undefined; selectedFile.textContent = "No file selected"; updateButtonState(); return; }
  currentFile = file;
  selectedFile.textContent = `${file.name} · ${formatBytes(file.size)}`;
  importResult.hidden = true;
  updateButtonState();
}

function updateButtonState() { importButton.disabled = !currentFile || !/^\d{6}$/.test(importKey.value); }

async function importSpotifyCsv() {
  if (!currentFile) return;
  const pin = importKey.value.trim();
  if (!/^\d{6}$/.test(pin)) { showResult("error", "Enter the 6-digit staff PIN."); return; }
  importButton.disabled = true;
  importButton.textContent = "Importing...";
  importStatus.textContent = "Importing";
  importResult.hidden = true;

  try {
    const csv = await currentFile.text();
    const response = await fetch("/api/data-imports/spotify", {
      method: "POST",
      headers: { "X-Staff-Pin": pin, "Content-Type": "application/json" },
      body: JSON.stringify({ csv })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message ?? body?.error?.code ?? `Import failed (${response.status})`);
    const result = body?.result?.results?.[0];
    if (!result || result.status !== "Success") throw new Error(result?.errorMessage ?? "Spotify import did not complete successfully.");
    const write = result.writeResult ?? {};
    showResult("success", `<strong>Spotify analytics imported successfully.</strong><div class="result-metrics"><span>${number(write.created)} new</span><span>${number(write.updated)} updated</span><span>${number(write.skipped)} unchanged</span><span>${number(result.recordsPrepared)} processed</span></div><p>Channel Breakdown will use the imported episode records the next time it loads.</p>`);
    importStatus.textContent = "Success";
    currentFile = undefined;
    fileInput.value = "";
    selectedFile.textContent = "No file selected";
    await loadHistory();
  } catch (error) {
    importStatus.textContent = "Error";
    showResult("error", escapeHtml(error instanceof Error ? error.message : String(error)));
  } finally {
    importButton.textContent = "Import Spotify Data";
    updateButtonState();
  }
}

async function loadHistory() {
  try {
    const response = await fetch("/api/ingestion/status", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Could not load import history (${response.status})`);
    const body = await response.json();
    const history = (body.history ?? []).filter((item) => item.connectorId === "spotify").slice(0, 10);
    if (!history.length) { historyRoot.innerHTML = '<div class="empty-state">No Spotify imports have run in this server session yet.</div>'; return; }
    historyRoot.innerHTML = `<div class="history-table-wrap"><table class="history-table"><thead><tr><th>Time</th><th>Status</th><th>Processed</th><th>New</th><th>Updated</th><th>Unchanged</th></tr></thead><tbody>${history.map(renderHistoryRow).join("")}</tbody></table></div>`;
  } catch (error) {
    historyRoot.innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
  }
}

function renderHistoryRow(item) {
  const write = item.writeResult ?? {};
  return `<tr><td>${escapeHtml(formatDateTime(item.finishedAt))}</td><td><span class="history-status ${item.status === "Success" ? "ok" : "bad"}">${escapeHtml(item.status ?? "Unknown")}</span></td><td>${number(item.recordsPrepared)}</td><td>${number(write.created)}</td><td>${number(write.updated)}</td><td>${number(write.skipped)}</td></tr>`;
}
function showResult(kind, html) { importResult.className = `import-result ${kind}`; importResult.innerHTML = html; importResult.hidden = false; }
function formatDateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toLocaleString(); }
function number(value) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed.toLocaleString() : "0"; }
function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
