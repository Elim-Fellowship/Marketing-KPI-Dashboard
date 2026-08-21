// Content Trend Analysis migration layer.
// The legacy Content Trends implementation remains in app.js for rollback.
// This file hides the legacy chart and renders the new executive channel-health module.

const CONTENT_TREND_PERIODS = {
  "90d": { label: "90 Days", days: 90 },
  "6m": { label: "6 Months", months: 6 },
  "1y": { label: "1 Year", years: 1 },
  all: { label: "All" }
};

const CONTENT_TREND_HEALTH_DEFINITIONS = {
  instagram: { label: "Likes", description: "Audience reactions to Instagram content" },
  facebook: { label: "Likes", description: "Audience reactions to Facebook content" },
  email: { label: "Clicks", description: "Link-click engagement with email campaigns" },
  spotify: { label: "Streams", description: "Podcast listening activity on Spotify" },
  castos: { label: "Downloads", description: "Podcast download activity through Castos" },
  youtube: { label: "Views / Streams", description: "Video viewing activity on YouTube" },
  website: { label: "Current backend engagement signal", description: "Website engagement signal returned by Channel Breakdown" },
  voiceOfElim: { label: "Current backend engagement signal", description: "Reader engagement with Voice of Elim content" },
  elimUpdates: { label: "Current backend engagement signal", description: "Reader engagement with Elim Updates content" }
};

const CONTENT_TREND_STABLE_THRESHOLD = 5;
let contentTrendPeriod = "90d";
let contentTrendRequestId = 0;

function hideLegacyContentTrends() {
  document.querySelectorAll("#page-root section").forEach((section) => {
    const title = section.querySelector("h3.section-title");
    if (title?.textContent?.trim() === "Content Trends") {
      section.hidden = true;
      section.setAttribute("aria-hidden", "true");
      section.dataset.featureState = "deprecated";
    }
  });
}

function escapeTrendHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isoTrendDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rollingTrendRange(periodKey) {
  const definition = CONTENT_TREND_PERIODS[periodKey];
  const end = new Date();
  const start = new Date(end);
  if (definition.days) {
    start.setDate(start.getDate() - (definition.days - 1));
  } else if (definition.months) {
    start.setMonth(start.getMonth() - definition.months);
    start.setDate(start.getDate() + 1);
  } else if (definition.years) {
    start.setFullYear(start.getFullYear() - definition.years);
    start.setDate(start.getDate() + 1);
  }
  return { startDate: isoTrendDate(start), endDate: isoTrendDate(end) };
}

function healthDefinition(channel) {
  const configured = CONTENT_TREND_HEALTH_DEFINITIONS[channel?.key];
  return {
    label: configured?.label === "Current backend engagement signal"
      ? (channel?.metricLabel ?? "Engagement")
      : (configured?.label ?? channel?.metricLabel ?? "Engagement"),
    description: configured?.description ?? "Normalized channel engagement"
  };
}

function trendStatus(channel) {
  if (!channel?.hasData) return { key: "unavailable", arrow: "—", label: "No data", value: "—" };
  if (channel.changePercent === undefined || channel.changePercent === null || !Number.isFinite(Number(channel.changePercent))) {
    return { key: "unavailable", arrow: "—", label: "Not enough history", value: "—" };
  }
  const change = Number(channel.changePercent);
  const value = `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(1)}%`;
  if (change > CONTENT_TREND_STABLE_THRESHOLD) return { key: "up", arrow: "↑", label: "Improving", value };
  if (change < -CONTENT_TREND_STABLE_THRESHOLD) return { key: "down", arrow: "↓", label: "Declining", value };
  return { key: "stable", arrow: "→", label: "Stable", value };
}

function trendStatusCounts(channels = []) {
  return channels.reduce((counts, channel) => {
    const status = trendStatus(channel);
    counts[status.key] = (counts[status.key] ?? 0) + 1;
    return counts;
  }, { up: 0, stable: 0, down: 0, unavailable: 0 });
}

function trendStyles() {
  if (document.querySelector("#content-trend-analysis-styles")) return;
  const style = document.createElement("style");
  style.id = "content-trend-analysis-styles";
  style.textContent = `
    .content-trend-analysis-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:18px}
    .content-trend-intro{margin:6px 0 0;color:#64748b;font-size:14px}
    .content-trend-periods{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .content-trend-period{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:999px;padding:8px 13px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
    .content-trend-period:hover{border-color:#94a3b8;background:#f8fafc}
    .content-trend-period.active{background:#0f172a;border-color:#0f172a;color:#fff}
    .content-trend-legend{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px;font-size:13px;font-weight:700}
    .content-trend-legend small{font-weight:500;color:#64748b;margin-left:auto}
    .content-trend-legend .legend-up{color:#16803c}.content-trend-legend .legend-stable{color:#2563eb}.content-trend-legend .legend-down{color:#c53030}
    .content-trend-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
    .content-trend-summary-item{border:1px solid #e2e8f0;border-radius:12px;padding:11px 13px;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:10px}
    .content-trend-summary-item span{font-size:12px;font-weight:700;color:#64748b}.content-trend-summary-item strong{font-size:18px;color:#0f172a}
    .content-trend-summary-up{border-left:4px solid #16803c}.content-trend-summary-stable{border-left:4px solid #2563eb}.content-trend-summary-down{border-left:4px solid #c53030}.content-trend-summary-unavailable{border-left:4px solid #94a3b8}
    .content-trend-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .content-trend-card{border:1px solid #e2e8f0;border-radius:14px;padding:18px;background:#fff;min-height:142px}
    .content-trend-card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
    .content-trend-card h4{margin:0;font-size:17px;color:#0f172a}.content-trend-card-header span{display:block;margin-top:4px;color:#64748b;font-size:12px}
    .content-trend-signal{margin-top:8px;color:#475569;font-size:12px;line-height:1.35}
    .content-trend-arrow{font-size:34px;font-weight:800;line-height:1}
    .content-trend-card-result{display:flex;align-items:baseline;gap:9px;margin-top:18px}.content-trend-card-result strong{font-size:24px;color:#0f172a}.content-trend-card-result span{font-size:13px;font-weight:700}
    .content-trend-card-context{margin-top:7px;color:#64748b;font-size:12px;font-weight:600}
    .content-trend-up{border-top:4px solid #16803c}.content-trend-up .content-trend-arrow,.content-trend-up .content-trend-card-result span{color:#16803c}
    .content-trend-stable{border-top:4px solid #2563eb}.content-trend-stable .content-trend-arrow,.content-trend-stable .content-trend-card-result span{color:#2563eb}
    .content-trend-down{border-top:4px solid #c53030}.content-trend-down .content-trend-arrow,.content-trend-down .content-trend-card-result span{color:#c53030}
    .content-trend-unavailable{border-top:4px solid #94a3b8}.content-trend-unavailable .content-trend-arrow,.content-trend-unavailable .content-trend-card-result span{color:#64748b}
    .content-trend-footnote{margin:15px 0 0;color:#64748b;font-size:12px}
    .content-trend-all-message{grid-column:1/-1;border:1px dashed #cbd5e1;border-radius:14px;padding:22px;background:#f8fafc;display:flex;flex-direction:column;gap:6px}.content-trend-all-message strong{color:#0f172a}.content-trend-all-message span{color:#64748b;font-size:14px}
    @media(max-width:1000px){.content-trend-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.content-trend-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:700px){.content-trend-analysis-header{flex-direction:column}.content-trend-periods{justify-content:flex-start}.content-trend-grid{grid-template-columns:1fr}.content-trend-summary{grid-template-columns:1fr}.content-trend-legend small{width:100%;margin-left:0}}
  `;
  document.head.appendChild(style);
}

function formatTrendMetricValue(value) {
  if (value === undefined || value === null || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(number);
}

function renderTrendCard(channel) {
  const status = backendTrendStatus(channel);
  const health = {
    label: channel.signalLabel ?? channel.metricLabel ?? "Engagement",
    description: channel.rationale ?? "Normalized channel engagement"
  };
  const currentValue = formatTrendMetricValue(channel.currentValue);
  const previousValue = formatTrendMetricValue(channel.previousValue);
  const hasComparisonContext = currentValue !== "—" || previousValue !== "—";
  return `
    <article class="content-trend-card content-trend-${status.key}">
      <div class="content-trend-card-header">
        <div>
          <h4>${escapeTrendHtml(channel.label ?? channel.key ?? "Channel")}</h4>
          <span>Health signal: ${escapeTrendHtml(health.label)}</span>
          <div class="content-trend-signal">${escapeTrendHtml(health.description)}</div>
        </div>
        <div class="content-trend-arrow" aria-hidden="true">${status.arrow}</div>
      </div>
      <div class="content-trend-card-result"><strong>${status.value}</strong><span>${status.label}</span></div>
      ${hasComparisonContext ? `<div class="content-trend-card-context">Current: ${escapeTrendHtml(currentValue)} · Previous: ${escapeTrendHtml(previousValue)}</div>` : ""}
    </article>
  `;
}

function backendTrendStatus(channel) {
  const status = channel?.status;
  if (status === "improving") {
    return { key: "up", arrow: channel.arrow ?? "↑", label: "Improving", value: Number.isFinite(Number(channel.changePercent)) ? `+${Math.abs(Number(channel.changePercent)).toFixed(1)}%` : "—" };
  }
  if (status === "declining") {
    return { key: "down", arrow: channel.arrow ?? "↓", label: "Declining", value: Number.isFinite(Number(channel.changePercent)) ? `−${Math.abs(Number(channel.changePercent)).toFixed(1)}%` : "—" };
  }
  if (status === "stable") {
    const change = Number(channel.changePercent);
    return { key: "stable", arrow: channel.arrow ?? "→", label: "Stable", value: Number.isFinite(change) ? `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(1)}%` : "—" };
  }
  return { key: "unavailable", arrow: channel?.arrow ?? "—", label: status === "no_data" ? "No data" : "Not enough history", value: "—" };
}

function renderTrendSummary(channels = []) {
  const counts = trendStatusCounts(channels);
  return `
    <div class="content-trend-summary-item content-trend-summary-up"><span>Improving</span><strong>${counts.up}</strong></div>
    <div class="content-trend-summary-item content-trend-summary-stable"><span>Stable</span><strong>${counts.stable}</strong></div>
    <div class="content-trend-summary-item content-trend-summary-down"><span>Declining</span><strong>${counts.down}</strong></div>
    <div class="content-trend-summary-item content-trend-summary-unavailable"><span>Insufficient history</span><strong>${counts.unavailable}</strong></div>
  `;
}

function renderBackendTrendSummary(summary = {}) {
  return `
    <div class="content-trend-summary-item content-trend-summary-up"><span>Improving</span><strong>${summary.improving ?? 0}</strong></div>
    <div class="content-trend-summary-item content-trend-summary-stable"><span>Stable</span><strong>${summary.stable ?? 0}</strong></div>
    <div class="content-trend-summary-item content-trend-summary-down"><span>Declining</span><strong>${summary.declining ?? 0}</strong></div>
    <div class="content-trend-summary-item content-trend-summary-unavailable"><span>Insufficient history</span><strong>${(summary.insufficient_history ?? 0) + (summary.no_data ?? 0)}</strong></div>
  `;
}

function trendAnalysisShell() {
  return `
    <section class="band content-trend-analysis" id="content-trend-analysis">
      <div class="content-trend-analysis-header">
        <div>
          <p class="eyebrow">Channel Health Over Time</p>
          <h3 class="section-title">Content Trend Analysis</h3>
          <p class="content-trend-intro">Engagement movement by channel, independent of publishing volume.</p>
        </div>
        <div class="content-trend-periods" role="group" aria-label="Content trend timeframe">
          ${Object.entries(CONTENT_TREND_PERIODS).map(([key, period]) => `<button type="button" data-content-trend-period="${key}" class="content-trend-period ${key === contentTrendPeriod ? "active" : ""}">${period.label}</button>`).join("")}
        </div>
      </div>
      <div class="content-trend-legend"><span class="legend-up">↑ Improving</span><span class="legend-stable">→ Stable</span><span class="legend-down">↓ Declining</span><small>Stable zone: within ±${CONTENT_TREND_STABLE_THRESHOLD}%</small></div>
      <div class="content-trend-summary" id="content-trend-summary" aria-label="Channel health summary"></div>
      <div class="content-trend-grid" id="content-trend-grid"><div class="empty-state">Loading channel health...</div></div>
      <p class="content-trend-footnote" id="content-trend-footnote">Compared with the immediately preceding equivalent period.</p>
    </section>
  `;
}

function legacyTrendSection() {
  return [...document.querySelectorAll("#page-root section")].find((section) => section.querySelector("h3.section-title")?.textContent?.trim() === "Content Trends");
}

function ensureContentTrendAnalysis() {
  hideLegacyContentTrends();
  const isChannelPage = window.location.pathname === "/channel-breakdown" || window.location.pathname === "/comparative";
  if (!isChannelPage) {
    document.querySelector("#content-trend-analysis")?.remove();
    return;
  }
  const legacy = legacyTrendSection();
  if (!legacy || document.querySelector("#content-trend-analysis")) return;
  trendStyles();
  legacy.insertAdjacentHTML("beforebegin", trendAnalysisShell());
  document.querySelectorAll("[data-content-trend-period]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.contentTrendPeriod;
      if (!CONTENT_TREND_PERIODS[next] || next === contentTrendPeriod) return;
      contentTrendPeriod = next;
      document.querySelectorAll("[data-content-trend-period]").forEach((item) => item.classList.toggle("active", item.dataset.contentTrendPeriod === contentTrendPeriod));
      loadContentTrendAnalysis();
    });
  });
  loadContentTrendAnalysis();
}

async function loadContentTrendAnalysis() {
  const grid = document.querySelector("#content-trend-grid");
  const summary = document.querySelector("#content-trend-summary");
  const footnote = document.querySelector("#content-trend-footnote");
  if (!grid || !summary || !footnote) return;
  if (contentTrendPeriod === "all") {
    summary.innerHTML = "";
    grid.innerHTML = `<div class="content-trend-all-message"><strong>Long-term health needs a dedicated baseline.</strong><span>The All view is reserved until enough historical coverage exists for a defensible long-term comparison.</span></div>`;
    footnote.textContent = "All-time classification is intentionally withheld rather than treating incomplete history as a stable trend.";
    return;
  }
  const requestId = ++contentTrendRequestId;
  summary.innerHTML = "";
  grid.innerHTML = `<div class="empty-state">Loading channel health...</div>`;
  footnote.textContent = `Selected ${CONTENT_TREND_PERIODS[contentTrendPeriod].label.toLowerCase()} compared with the immediately preceding equivalent period.`;
  try {
    const response = await fetch(`/api/content-trend-analysis?period=${encodeURIComponent(contentTrendPeriod)}`);
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const data = await response.json();
    if (requestId !== contentTrendRequestId) return;
    const channels = data.channels ?? [];
    summary.innerHTML = channels.length ? renderBackendTrendSummary(data.summary) : "";
    grid.innerHTML = channels.length ? channels.map(renderTrendCard).join("") : `<div class="empty-state">No channel analytics are available for this timeframe.</div>`;
  } catch (error) {
    if (requestId !== contentTrendRequestId) return;
    summary.innerHTML = "";
    grid.innerHTML = `<div class="empty-state">Unable to load channel health right now.</div>`;
    console.error("Content Trend Analysis:", error);
  }
}

function installContentTrendAnalysis() {
  const pageRoot = document.querySelector("#page-root");
  if (!pageRoot) return;
  const observer = new MutationObserver(() => ensureContentTrendAnalysis());
  observer.observe(pageRoot, { childList: true, subtree: true });
  ensureContentTrendAnalysis();
  window.addEventListener("load", ensureContentTrendAnalysis, { once: true });
  window.addEventListener("popstate", () => setTimeout(ensureContentTrendAnalysis, 0));
}

installContentTrendAnalysis();