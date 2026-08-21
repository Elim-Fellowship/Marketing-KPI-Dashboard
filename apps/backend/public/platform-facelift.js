const helpTextByTitle = {
  "KPI Overview": "A snapshot of communications performance.",
  "Top Performing Content": "See what content is performing best.",
  "Channel Breakdown": "Compare performance across channels."
};

const pageTitle = document.querySelector("#page-title");
const pageHelp = document.querySelector("#page-help");
const sourcePanel = document.querySelector("#source-panel");

injectFaceliftStyles();
updatePageHelp();

if (pageTitle) {
  new MutationObserver(updatePageHelp).observe(pageTitle, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

await renderSourceFreshness();

function updatePageHelp() {
  if (!pageHelp || !pageTitle) return;
  pageHelp.textContent = helpTextByTitle[pageTitle.textContent?.trim()] ?? "";
}

async function renderSourceFreshness() {
  if (!sourcePanel) return;

  try {
    const response = await fetch("/api/comms/tables", {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Status request failed (${response.status})`);

    const data = await response.json();
    const rows = Array.isArray(data?.tables?.dataSourceStatus)
      ? data.tables.dataSourceStatus
      : [];

    const sources = rows
      .map(normalizeSourceRow)
      .filter((source) => source.name)
      .filter((source) => source.name !== "Google Analytics" || !rows.some((row) => String(row?.fields?.["Source Name"] ?? "").trim() === "Google Analytics 4"))
      .sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""))
      .slice(0, 6);

    sourcePanel.innerHTML = `
      <p class="eyebrow">Data Sources</p>
      ${sources.map((source) => `
        <div class="source-row source-freshness-row">
          <span>${escapeHtml(source.name)}</span>
          <strong>${escapeHtml(source.updatedAt ? `Updated ${formatFreshnessDate(source.updatedAt)}` : "No update date")}</strong>
        </div>
      `).join("") || `<div class="source-row"><span>No source updates available</span></div>`}
    `;
  } catch {
    sourcePanel.innerHTML = `<p class="eyebrow">Data Sources</p><div class="source-row"><span>Update dates unavailable</span></div>`;
  }
}

function normalizeSourceRow(row) {
  const fields = row?.fields ?? {};
  return {
    name: String(fields["Source Name"] ?? fields.Name ?? fields["Data Source"] ?? "").trim(),
    updatedAt: String(
      fields["Last Update Date"] ??
      fields["Last Updated"] ??
      fields["Last Sync Time"] ??
      fields["Last Successful Sync"] ??
      fields["Last Sync"] ??
      ""
    ).trim()
  };
}

function formatFreshnessDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(date);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function injectFaceliftStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .page-help {
      margin: 0.3rem 0 0;
      color: var(--muted, #667085);
      font-size: 0.92rem;
      line-height: 1.4;
    }

    .source-freshness-row {
      align-items: flex-start;
      gap: 0.75rem;
    }

    .source-freshness-row strong {
      font-size: 0.72rem;
      font-weight: 600;
      line-height: 1.25;
      text-align: right;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}