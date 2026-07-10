const pages = {
  overview: {
    title: "KPI Overview",
    path: "/",
    render: renderOverview
  },
  content: {
    title: "Top Performing Content",
    path: "/top-performing-content",
    render: renderTopContent
  },
  "channel-breakdown": {
    title: "Channel Breakdown",
    path: "/channel-breakdown",
    render: renderChannelBreakdown
  }
};

const state = {
  page: pageFromPath(window.location.pathname),
  timeframe: "90d",
  platform: "all",
  groupBy: "none",
  period: "month",
  overviewRange: defaultOverviewRange(),
  channelRange: defaultOverviewRange(),
  visibleChannels: {}
};

const root = document.querySelector("#page-root");
const pageTitle = document.querySelector("#page-title");
const apiStatus = document.querySelector("#api-status");
const sourcePanel = document.querySelector("#source-panel");

document.querySelectorAll(".nav-tab").forEach((button) => {
  button.addEventListener("click", () => {
    const nextPage = button.dataset.page;
    if (!nextPage || !pages[nextPage]) {
      return;
    }

    state.page = nextPage;
    window.history.pushState({ page: nextPage }, "", pages[nextPage].path);
    renderCurrentPage();
  });
});

window.addEventListener("popstate", () => {
  state.page = pageFromPath(window.location.pathname);
  renderCurrentPage();
});

await hydrateSourceStatus();
await renderCurrentPage();

async function renderCurrentPage() {
  const page = pages[state.page];
  setActiveNav(state.page);
  pageTitle.textContent = page.title;
  root.innerHTML = `<div class="empty-state">Loading ${escapeHtml(page.title)}...</div>`;
  apiStatus.textContent = "Loading";

  try {
    await page.render();
    apiStatus.textContent = "Live";
  } catch (error) {
    apiStatus.textContent = "Error";
    root.innerHTML = renderError(error);
  }
}

function pageFromPath(pathname) {
  if (pathname === "/top-performing-content") {
    return "content";
  }

  if (pathname === "/channel-breakdown" || pathname === "/comparative") {
    return "channel-breakdown";
  }

  return "overview";
}

function setActiveNav(pageKey) {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.page === pageKey);
  });
}

async function renderOverview() {
  const overview = await fetchJson(`/api/overview${overviewQueryString()}`);
  const growthRates = overview.growthRates ?? overview.growthIndicators ?? [];
  const series = overview.charts?.overviewTrendSeries ?? overview.charts?.spotifySeries ?? [];
  const growthCards = buildOverviewGrowthIndicators(overview);
  const channelCards = buildChannelOverviewCards(overview);

  root.innerHTML = `
    <section class="activity-summary-card">
      <div class="activity-summary-header">
        <div>
          <p class="eyebrow">Monthly Activity Summary</p>
          <h3 class="section-title">Communications output</h3>
        </div>
        ${renderOverviewDateSelector()}
      </div>
      <div class="activity-summary-grid">
        ${renderActivitySummaryItems(overview.monthlyActivitySummary)}
      </div>
    </section>

    <section>
      <div class="section-row">
        <h3 class="section-title">Channel Performance Overview</h3>
        <span class="section-note">Relative performance and growth by channel</span>
      </div>
      <div class="channel-overview-grid">
        ${channelCards.map(renderChannelOverviewCard).join("")}
      </div>
    </section>

    <section class="growth-trend-row">
      <div class="band">
        <div class="section-row">
          <h3 class="section-title">Growth Indicators</h3>
          <span class="section-note">${formatNumber(growthCards.length)} priority metrics</span>
        </div>
        <div class="growth-card-grid">
          ${growthCards.map(renderMetricCard).join("") || emptyCard("No data available")}
        </div>
      </div>
      <div class="band">
        <h3 class="section-title">Trend Chart</h3>
        ${renderLineChart(series, "Airtable performance trend")}
      </div>
    </section>

    <section class="band">
      <h3 class="section-title">Monthly Snapshot</h3>
      ${renderMonthlySnapshotTable(overview.monthlySnapshot)}
    </section>
  `;

  setupOverviewDateSelector();
}

async function renderTopContent() {
  const data = await fetchJson(`/api/top-content?timeframe=${encodeURIComponent(state.timeframe)}&platform=${encodeURIComponent(state.platform)}&groupBy=${encodeURIComponent(state.groupBy)}`);
  const sections = data.sections ?? {};
  const topOverall = data.topOverall ?? [];
  const platforms = ["all", ...(data.platforms ?? [])];

  root.innerHTML = `
    <section class="band toolbar">
      <div>
        <p class="eyebrow">Content_Performance</p>
        <h3 class="section-title">Ranked Content Performance</h3>
      </div>
      <div class="filters">
        <label>Timeframe
          <select id="timeframe-filter">
            ${option("30d", "30 days", state.timeframe)}
            ${option("90d", "90 days", state.timeframe)}
            ${option("365d", "12 months", state.timeframe)}
            ${option("all", "All time", state.timeframe)}
          </select>
        </label>
        <label>Platform
          <select id="platform-filter">
            ${platforms.map((platform) => option(platform, titleCase(platform), state.platform)).join("")}
          </select>
        </label>
        <label>Group by
          <select id="groupby-filter">
            ${option("none", "No grouping", state.groupBy)}
            ${option("campaign", "Campaign", state.groupBy)}
            ${option("episodeDrop", "Episode drop", state.groupBy)}
            ${option("marketingPush", "Marketing push", state.groupBy)}
          </select>
        </label>
      </div>
    </section>

    <section class="content-sections">
      ${renderContentSection("Top Podcast Episodes", sections.podcasts)}
      ${renderContentSection("Top Newsletters", sections.newsletters)}
      ${renderContentSection("Top Social Posts", sections.socialPosts)}
      ${renderContentSection("Top Videos", sections.videos)}
    </section>

    <section class="band">
      <div class="section-row">
        <h3 class="section-title">Overall Ranking Table</h3>
        <span class="section-note">${formatNumber(topOverall.length)} ranked records</span>
      </div>
      ${renderRankingTable(topOverall)}
    </section>

    ${renderCampaignGroups(data.groups ?? [], data.groupBy)}
  `;

  document.querySelector("#timeframe-filter").addEventListener("change", (event) => {
    state.timeframe = event.target.value;
    renderCurrentPage();
  });
  document.querySelector("#platform-filter").addEventListener("change", (event) => {
    state.platform = event.target.value;
    renderCurrentPage();
  });
  document.querySelector("#groupby-filter").addEventListener("change", (event) => {
    state.groupBy = event.target.value;
    renderCurrentPage();
  });
}

async function renderChannelBreakdown() {
  const data = await fetchJson(`/api/channel-breakdown${channelBreakdownQueryString()}`);
  const channels = data.channels ?? [];
  ensureVisibleChannels(channels);
  const selectedChannels = channels.filter((channel) => state.visibleChannels[channel.key] !== false);
  const summary = data.summary ?? {};
  const summaryHasData = summary.changePercent !== undefined && summary.changePercent !== null;
  const change = Number(summary.changePercent ?? 0);
  const direction = change < 0 ? "down" : "up";
  const arrow = change < 0 ? "↓" : "↑";

  root.innerHTML = `
    <section class="channel-breakdown-summary">
      <div>
        <p class="eyebrow">Communications Performance Change</p>
        <h3 class="section-title">Overall channel movement</h3>
        <p>Selected range compared with the previous equivalent period.</p>
      </div>
      <div class="channel-summary-right">
        ${renderChannelDateSelector()}
        <div class="summary-state channel-change-state">
          <span>${summaryHasData ? `${arrow} ${direction === "down" ? "Decrease" : "Increase"}` : "No data available"}</span>
          <strong>${summaryHasData ? formatPercent(Math.abs(change)) : "-"}</strong>
          <small>${formatNumber(summary.channelCount ?? channels.length)} channels</small>
        </div>
      </div>
    </section>

    <section class="breakdown-card-grid">
      ${channels.map(renderBreakdownChannelCard).join("") || emptyCard("No channel data available.")}
    </section>

    <section class="band">
      <div class="section-row">
        <h3 class="section-title">Content Trends</h3>
        <span class="section-note">${formatNumber(selectedChannels.length)} selected channels</span>
      </div>
      ${renderChannelSelector(channels)}
      ${renderMultiLineChannelChart(selectedChannels, "Content Trends")}
    </section>
  `;

  setupChannelDateSelector();
  setupChannelSelector();
}

async function hydrateSourceStatus() {
  try {
    const data = await fetchJson("/api/status");
    const sources = data.sources ?? [];
    sourcePanel.innerHTML = `
      <p class="eyebrow">Data Sources</p>
      ${sources.slice(0, 6).map((source) => `
        <div class="source-row">
          <span>${escapeHtml(source.source)}</span>
          <strong>${escapeHtml(source.status)}</strong>
        </div>
      `).join("") || `<div class="source-row"><span>No status rows</span></div>`}
    `;
  } catch {
    sourcePanel.innerHTML = `<p class="eyebrow">Data Sources</p><div class="source-row"><span>Unavailable</span></div>`;
  }
}

function renderActivitySummaryItems(summary = {}) {
  if (!summary.hasData) {
    return `<div class="empty-state">No data available</div>`;
  }

  const items = [
    ["Emails Sent", summary.emailsSent],
    ["Podcasts Published", summary.podcastsPublished],
    ["Social Posts Published", summary.socialPostsPublished],
    ["Website Articles Published", summary.websiteArticlesPublished],
    ["Newsletter Editions Published", summary.newsletterEditionsPublished]
  ];

  return items.map(([label, value]) => `
    <article class="activity-item">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(value)}</strong>
    </article>
  `).join("");
}

function renderOverviewDateSelector() {
  const range = currentOverviewDateRange();

  return `
    <details class="date-selector">
      <summary>${escapeHtml(range.label)}</summary>
      <div class="date-selector-panel">
        <label>Range
          <select id="overview-date-mode">
            ${option("last7", "Last 7 Days", range.mode)}
            ${option("last30", "Last 30 Days", range.mode)}
            ${option("last90", "Last 90 Days", range.mode)}
            ${option("lastMonth", "Last Calendar Month", range.mode)}
            ${option("lastQuarter", "Last Quarter", range.mode)}
            ${option("ytd", "Year To Date", range.mode)}
            ${option("custom", "Custom Range", range.mode)}
          </select>
        </label>
        <div class="custom-date-grid ${range.mode === "custom" ? "" : "is-hidden"}">
          <label>Start
            <input id="overview-start-date" type="date" value="${escapeHtml(range.startDate)}">
          </label>
          <label>End
            <input id="overview-end-date" type="date" value="${escapeHtml(range.endDate)}">
          </label>
        </div>
      </div>
    </details>
  `;
}

function setupOverviewDateSelector() {
  const mode = document.querySelector("#overview-date-mode");
  const startDate = document.querySelector("#overview-start-date");
  const endDate = document.querySelector("#overview-end-date");

  mode?.addEventListener("change", (event) => {
    state.overviewRange.mode = event.target.value;
    renderCurrentPage();
  });
  startDate?.addEventListener("change", (event) => {
    state.overviewRange.startDate = event.target.value;
    state.overviewRange.mode = "custom";
    renderCurrentPage();
  });
  endDate?.addEventListener("change", (event) => {
    state.overviewRange.endDate = event.target.value;
    state.overviewRange.mode = "custom";
    renderCurrentPage();
  });
}

function renderChannelDateSelector() {
  const range = currentChannelDateRange();
  const quarterOptions = quarterOptionsFromDate(new Date()).map((quarter) =>
    option(quarter.value, quarter.label, range.quarter)
  ).join("");

  return `
    <details class="date-selector channel-date-selector">
      <summary>${escapeHtml(range.label)}</summary>
      <div class="date-selector-panel">
        <label>Range
          <select id="channel-date-mode">
            ${option("lastMonth", "Last Calendar Month", range.mode)}
            ${option("month", "Month", range.mode)}
            ${option("quarter", "Quarter", range.mode)}
            ${option("custom", "Custom", range.mode)}
          </select>
        </label>
        <label class="${range.mode === "month" ? "" : "is-hidden"}">Month
          <input id="channel-month" type="month" value="${escapeHtml(range.month)}">
        </label>
        <label class="${range.mode === "quarter" ? "" : "is-hidden"}">Quarter
          <select id="channel-quarter">${quarterOptions}</select>
        </label>
        <div class="custom-date-grid ${range.mode === "custom" ? "" : "is-hidden"}">
          <label>Start
            <input id="channel-start-date" type="date" value="${escapeHtml(range.startDate)}">
          </label>
          <label>End
            <input id="channel-end-date" type="date" value="${escapeHtml(range.endDate)}">
          </label>
        </div>
      </div>
    </details>
  `;
}

function setupChannelDateSelector() {
  const mode = document.querySelector("#channel-date-mode");
  const month = document.querySelector("#channel-month");
  const quarter = document.querySelector("#channel-quarter");
  const startDate = document.querySelector("#channel-start-date");
  const endDate = document.querySelector("#channel-end-date");

  mode?.addEventListener("change", (event) => {
    state.channelRange.mode = event.target.value;
    renderCurrentPage();
  });
  month?.addEventListener("change", (event) => {
    state.channelRange.month = event.target.value;
    state.channelRange.mode = "month";
    renderCurrentPage();
  });
  quarter?.addEventListener("change", (event) => {
    state.channelRange.quarter = event.target.value;
    state.channelRange.mode = "quarter";
    renderCurrentPage();
  });
  startDate?.addEventListener("change", (event) => {
    state.channelRange.startDate = event.target.value;
    state.channelRange.mode = "custom";
    renderCurrentPage();
  });
  endDate?.addEventListener("change", (event) => {
    state.channelRange.endDate = event.target.value;
    state.channelRange.mode = "custom";
    renderCurrentPage();
  });
}

function renderBreakdownChannelCard(channel = {}) {
  if (!channel.hasData) {
    return `
      <article class="breakdown-card empty" style="--channel-color: ${escapeHtml(channel.color ?? "#2451b2")}">
        <div class="channel-label">${escapeHtml(channel.label)}</div>
        <div class="empty-state">No data available</div>
      </article>
    `;
  }

  const change = Number(channel.changePercent ?? 0);
  const direction = change < 0 ? "down" : "up";
  const arrow = change < 0 ? "↓" : "↑";

  return `
    <article class="breakdown-card ${direction}" style="--channel-color: ${escapeHtml(channel.color ?? "#2451b2")}">
      <div class="channel-label">${escapeHtml(channel.label)}</div>
      <div class="breakdown-volume">
        <span>Total activity volume</span>
        <strong>${formatNumber(channel.activityVolume)}</strong>
      </div>
      <div class="breakdown-metric">
        <span>${escapeHtml(channel.metricLabel ?? "Metric")}</span>
        <strong>${formatNumber(channel.metricValue)}</strong>
      </div>
      <div class="channel-change ${direction}">${arrow} ${formatPercent(Math.abs(change))}</div>
    </article>
  `;
}

function renderChannelSelector(channels = []) {
  return `
    <div class="channel-selector" aria-label="Channel selector">
      ${channels.map((channel) => `
        <label style="--channel-color: ${escapeHtml(channel.color ?? "#2451b2")}">
          <input type="checkbox" data-channel-key="${escapeHtml(channel.key)}" ${state.visibleChannels[channel.key] === false ? "" : "checked"}>
          <span>${escapeHtml(channel.label)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function setupChannelSelector() {
  document.querySelectorAll("[data-channel-key]").forEach((input) => {
    input.addEventListener("change", (event) => {
      state.visibleChannels[event.target.dataset.channelKey] = event.target.checked;
      renderCurrentPage();
    });
  });
}

function ensureVisibleChannels(channels = []) {
  for (const channel of channels) {
    if (state.visibleChannels[channel.key] === undefined) {
      state.visibleChannels[channel.key] = true;
    }
  }
}

function renderMultiLineChannelChart(channels = [], label = "Content trends") {
  const allPoints = channels.flatMap((channel) =>
    (channel.series ?? []).map((point) => ({
      ...point,
      channel
    }))
  );

  if (!allPoints.length) {
    return `<div class="empty-state">No data available</div>`;
  }

  const dates = [...new Set(allPoints.map((point) => point.date).filter(Boolean))].sort();
  const values = allPoints.map((point) => Number(point.value)).filter((value) => Number.isFinite(value));
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 1);
  const spread = max - min || 1;
  const width = 900;
  const height = 300;
  const xForDate = (date) => {
    const index = dates.indexOf(date);
    return dates.length === 1 ? width / 2 : (index / (dates.length - 1)) * width;
  };
  const yForValue = (value) => height - ((value - min) / spread) * (height - 52) - 26;
  const lines = channels.map((channel) => {
    const coords = (channel.series ?? [])
      .filter((point) => dates.includes(point.date))
      .map((point) => ({
        x: xForDate(point.date),
        y: yForValue(Number(point.value)),
        point
      }));
    const path = coords.map((coord) => `${coord.x},${coord.y}`).join(" ");

    return `
      <g>
        <polyline points="${path}" fill="none" stroke="${escapeHtml(channel.color ?? "#2451b2")}" stroke-width="3"></polyline>
        ${coords.map(({ x, y, point }) => `
          <circle cx="${x}" cy="${y}" r="4" fill="${escapeHtml(channel.color ?? "#2451b2")}">
            <title>${escapeHtml(channel.label)} - ${escapeHtml(point.date)}: ${formatNumber(point.value)} ${escapeHtml(channel.metricLabel ?? "")}</title>
          </circle>
        `).join("")}
      </g>
    `;
  }).join("");

  return `
    <svg class="chart multi-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      <line x1="0" y1="${height - 24}" x2="${width}" y2="${height - 24}" stroke="#d9dee8"></line>
      ${lines}
    </svg>
  `;
}

function buildOverviewGrowthIndicators(overview = {}) {
  if (Array.isArray(overview.growthIndicators) && overview.growthIndicators.length > 0) {
    return overview.growthIndicators;
  }

  return [];
}

function metricForGrowthCard(metrics = [], label, terms, fallback = {}) {
  const metric = findMetricByTerms(metrics, terms);
  return {
    label,
    value: metric?.value ?? fallback.value ?? 0,
    previousValue: metric?.previousValue,
    growthPercent: metric?.growthPercent ?? 0,
    unit: metric?.unit ?? fallback.unit ?? "",
    date: metric?.date,
    definition: metric?.definition ?? "Priority growth indicator for the selected KPI Overview date range."
  };
}

function buildChannelOverviewCards(overview = {}) {
  const growthRates = overview.growthRates ?? overview.growthIndicators ?? [];
  const communicationsScore = overview.communicationsPerformanceScore ?? overview.productHealthScore ?? {};
  const emailMetric = findMetricByTerms(growthRates, ["email", "newsletter", "open rate", "click rate"]);
  const socialMetric = findMetricByTerms(growthRates, ["social", "linkedin", "instagram", "x "]);
  const podcastMetric = findMetricByTerms(growthRates, ["podcast", "spotify", "listener", "download"]);
  const websiteMetric = findMetricByTerms(growthRates, [
    "website",
    "web traffic",
    "website ctr",
    "website click-through",
    "click-through rate",
    "ctr"
  ]);
  const emailScore = findChannelScore(communicationsScore, "emailPerformanceScore");
  const socialScore = findChannelScore(communicationsScore, "socialMediaPerformanceScore");
  const podcastScore = findChannelScore(communicationsScore, "podcastPerformanceScore");
  const websiteScore = findChannelScore(communicationsScore, "websitePerformanceScore");
  const aggregateChange = averageFinite([
    emailMetric?.growthPercent,
    socialMetric?.growthPercent,
    podcastMetric?.growthPercent,
    websiteMetric?.growthPercent
  ]);

  return [
    {
      label: "Communications Performance Score",
      change: aggregateChange,
      note: "Weighted aggregate",
      score: communicationsScore.score ?? 0,
      scoreAvailable: hasAvailableScore(communicationsScore),
      aggregate: true,
      info: communicationsScore
    },
    {
      label: "Email Performance Score",
      score: emailScore.score ?? 0,
      scoreAvailable: hasAvailableScore(emailScore),
      change: scoreGrowth(emailScore, emailMetric?.growthPercent),
      note: emailMetric?.label ?? "Email engagement",
      info: emailScore
    },
    {
      label: "Social Media Performance Score",
      score: socialScore.score ?? 0,
      scoreAvailable: hasAvailableScore(socialScore),
      change: scoreGrowth(socialScore, socialMetric?.growthPercent),
      note: socialMetric?.label ?? "Social content",
      info: socialScore
    },
    {
      label: "Podcast Performance Score",
      score: podcastScore.score ?? 0,
      scoreAvailable: hasAvailableScore(podcastScore),
      change: scoreGrowth(podcastScore, podcastMetric?.growthPercent),
      note: podcastMetric?.label ?? "Podcast growth",
      info: podcastScore
    },
    {
      label: "Website Performance Score",
      score: websiteScore.score ?? 0,
      scoreAvailable: hasAvailableScore(websiteScore),
      change: scoreGrowth(websiteScore, websiteMetric?.growthPercent),
      note: websiteMetric?.label ?? "Website CTR",
      info: websiteScore
    }
  ];
}

function hasAvailableScore(score = {}) {
  if (!score || typeof score !== "object") {
    return false;
  }

  if (Array.isArray(score.channelScores) && score.channelScores.some(hasAvailableScore)) {
    return true;
  }

  return (score.components ?? []).some((component) => component.isAvailable || component.sourceMetric);
}

function renderChannelOverviewCard(card) {
  const change = Number(card.change ?? 0);
  const direction = change < 0 ? "down" : "up";
  const arrow = change < 0 ? "↓" : "↑";

  return `
    <article class="channel-card ${direction} ${card.aggregate ? "aggregate" : ""}" title="${escapeHtml(card.formula ?? card.definition ?? "")}">
      <div class="channel-label">${escapeHtml(card.label)}</div>
      <div class="channel-score">${card.scoreAvailable ? formatNumber(card.score) : "No data"} ${renderInfoIcon(card.info)}</div>
      <div class="channel-change ${direction}">${arrow} ${formatPercent(Math.abs(change))}</div>
    </article>
  `;
}

function findChannelScore(communicationsScore = {}, key) {
  return (communicationsScore.channelScores ?? []).find((score) => score.key === key) ?? {};
}

function averageFinite(values = []) {
  const finiteValues = values.map(Number).filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return 0;
  }

  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function scoreGrowth(score = {}, fallback = 0) {
  const componentGrowth = (score.components ?? [])
    .map((component) => Number(component.growthPercent))
    .filter((value) => Number.isFinite(value));

  return componentGrowth.length ? averageFinite(componentGrowth) : Number(fallback ?? 0);
}

function overallPerformanceState(growthRates = []) {
  const values = growthRates
    .map((metric) => Number(metric.growthPercent))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return "Monitoring";
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average > 2) {
    return "Improving";
  }

  if (average < -2) {
    return "Needs attention";
  }

  return "Stable";
}

function renderMetricCard(metric) {
  const growth = Number(metric.growthPercent ?? 0);
  const arrow = growth < 0 ? "↓" : "↑";
  return `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(metric.label)}</div>
      <div class="metric-value">${formatNumber(metric.value)}${metric.unit ? ` <span class="metric-label">${escapeHtml(metric.unit)}</span>` : ""}</div>
      <span class="growth ${growth < 0 ? "down" : ""}">${arrow} ${formatPercent(Math.abs(growth))}</span>
      <div class="content-meta">Growth Rate - ${escapeHtml(metric.date ?? "No date")}</div>
    </article>
  `;
}

function renderContentSection(title, items = []) {
  return `
    <section class="band">
      <h3 class="section-title">${escapeHtml(title)}</h3>
      <div class="rank-list">
        ${items.slice(0, 5).map(renderContentCard).join("") || `<div class="empty-state">No data available</div>`}
      </div>
    </section>
  `;
}

function findMetricByTerms(metrics = [], terms = []) {
  return metrics.find((metric) => {
    const label = String(metric.label ?? "").toLowerCase();
    return terms.some((term) => label.includes(term.toLowerCase()));
  });
}

function renderContentCard(item, index = 0) {
  return `
    <article class="content-card">
      <div class="rank-badge">${formatNumber(item.rank ?? index + 1)}</div>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <div class="content-meta">${escapeHtml(item.platform)} - ${escapeHtml(item.metricLabel ?? "Content Score")} - ${escapeHtml(item.date ?? "No date")}</div>
      </div>
      <div class="score">${item.scoreAvailable ? formatNumber(item.contentScore ?? item.metricValue) : "No data"}</div>
    </article>
  `;
}

function renderCampaignGroups(groups = [], groupBy = "none") {
  if (groupBy === "none") {
    return "";
  }

  if (!groups.length) {
    return `
      <section class="band">
        <h3 class="section-title">Campaign-Level Grouping</h3>
        <div class="empty-state">No ${escapeHtml(titleCase(groupBy))} grouping fields were found in the current results.</div>
      </section>
    `;
  }

  return `
    <section class="band">
      <div class="section-row">
        <h3 class="section-title">Campaign-Level Grouping</h3>
        <span class="section-note">Grouped by ${escapeHtml(titleCase(groupBy))}</span>
      </div>
      <div class="campaign-groups">
        ${groups.map((group) => `
          <article class="group-card">
            <div class="section-row">
              <strong>${escapeHtml(group.groupName)}</strong>
              <span class="score">${formatNumber(group.averageScore)}</span>
            </div>
            <div class="content-meta">${formatNumber(group.itemCount)} items - top item: ${escapeHtml(group.topItem?.title ?? "None")}</div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSourceStatusTable(sources = []) {
  if (!sources.length) {
    return `<div class="empty-state">No source status records available.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Source</th><th>Status</th><th>Last Updated</th></tr>
        </thead>
        <tbody>
          ${sources.slice(0, 8).map((source) => `
            <tr>
              <td>${escapeHtml(source.source)}</td>
              <td><span class="status-chip ${statusClass(source.status)}">${escapeHtml(source.status)}</span></td>
              <td>${escapeHtml(source.lastUpdated || "Unknown")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderKpiTable(metrics = []) {
  if (!metrics.length) {
    return `<div class="empty-state">No data available</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>KPI</th><th>Current</th><th>Previous</th><th>Growth Rate</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${metrics.map((metric) => `
            <tr>
              <td>${escapeHtml(metric.label)}</td>
              <td>${formatNumber(metric.value)} ${escapeHtml(metric.unit ?? "")}</td>
              <td>${metric.previousValue === undefined ? "-" : formatNumber(metric.previousValue)}</td>
              <td>${renderGrowthBadge(metric.growthPercent)}</td>
              <td>${escapeHtml(metric.date ?? "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMonthlySnapshotTable(rows = []) {
  if (!rows.length) {
    return `<div class="empty-state">No data available</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>KPI</th><th>Week 1</th><th>Week 2</th><th>Week 3</th><th>Week 4</th></tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.kpi)}</td>
              ${[0, 1, 2, 3].map((index) => `
                <td>${row.weeks?.[index] === undefined ? "-" : `${formatNumber(row.weeks[index])} ${escapeHtml(row.unit ?? "")}`}</td>
              `).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRankingTable(items = []) {
  if (!items.length) {
    return `<div class="empty-state">No data available</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Rank</th><th>Title</th><th>Platform</th><th>Type</th><th>Score</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${items.map((item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.title)}</td>
              <td>${escapeHtml(item.platform)}</td>
              <td>${escapeHtml(titleCase(item.type))}</td>
              <td>${item.scoreAvailable ? formatNumber(item.contentScore ?? item.metricValue) : "No data available"}</td>
              <td>${escapeHtml(item.date ?? "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderComparisonSummaryCard(label, comparisons = []) {
  const average = averageGrowth(comparisons);
  return `
    <article class="comparison-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${formatPercent(average)}</div>
      <span class="growth ${average < 0 ? "down" : ""}">${average >= 0 ? "+" : ""}${formatPercent(average)} average</span>
    </article>
  `;
}

function renderComparisonTable(comparisons = []) {
  if (!comparisons.length) {
    return `<div class="empty-state">No comparison data available.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>KPI</th><th>Current</th><th>Previous</th><th>Growth Rate</th></tr>
        </thead>
        <tbody>
          ${comparisons.map((item) => `
            <tr>
              <td>${escapeHtml(item.name)}</td>
              <td>${formatNumber(item.current?.value ?? 0)}</td>
              <td>${item.previous ? formatNumber(item.previous.value) : "-"}</td>
              <td>${renderGrowthBadge(item.growthPercent)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTrendList(entries = []) {
  if (!entries.length) {
    return `<div class="empty-state">No historical trend records available.</div>`;
  }

  return `
    <div class="rank-list">
      ${entries.slice(0, 8).map(([name, points], index) => {
        const latest = points.at(-1);
        return `
          <article class="content-card">
            <div class="rank-badge">${index + 1}</div>
            <div>
              <strong>${escapeHtml(name)}</strong>
              <div class="content-meta">${formatNumber(points.length)} historical points</div>
            </div>
            <div class="score">${formatNumber(latest?.value ?? 0)}</div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderLineChart(points = [], label = "Trend chart") {
  const chartPoints = points
    .map((point) => ({
      date: point.date ?? "",
      value: Number(point.value)
    }))
    .filter((point) => Number.isFinite(point.value));

  if (!chartPoints.length) {
    return `<div class="empty-state">No data available</div>`;
  }

  const values = chartPoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const width = 900;
  const height = 260;
  const coords = chartPoints.map((point, index) => {
    const x = chartPoints.length === 1 ? width / 2 : (index / (chartPoints.length - 1)) * width;
    const y = height - ((point.value - min) / spread) * (height - 42) - 21;
    return { x, y, point };
  });
  const path = coords.map((coord) => `${coord.x},${coord.y}`).join(" ");

  return `
    <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      <line x1="0" y1="${height - 22}" x2="${width}" y2="${height - 22}" stroke="#d9dee8"></line>
      <polyline points="${path}" fill="none" stroke="#2451b2" stroke-width="4"></polyline>
      ${coords.map(({ x, y, point }) => `<circle cx="${x}" cy="${y}" r="5" fill="#087e8b"><title>${escapeHtml(point.date ?? "")}: ${formatNumber(point.value)}</title></circle>`).join("")}
    </svg>
  `;
}

function renderInfoIcon(info) {
  const lines = scoreInfoLines(info);
  if (!lines.length) {
    return "";
  }

  return `
    <span class="info-wrap" tabindex="0" role="button" aria-label="Score calculation details" title="${escapeHtml(lines.join("\n"))}">
      <span class="info-icon">ℹ️</span>
      <span class="info-tooltip">${lines.map(escapeHtml).join("<br>")}</span>
    </span>
  `;
}

function scoreInfoLines(info = {}) {
  if (!info || typeof info !== "object") {
    return [];
  }

  const hasDetails =
    info.label ||
    info.metricLabel ||
    info.definition ||
    info.formula ||
    info.components?.length ||
    info.score !== undefined ||
    info.contentScore !== undefined ||
    info.metricValue !== undefined ||
    info.value !== undefined;

  if (!hasDetails) {
    return [];
  }

  const lines = [];
  const score = info.score ?? info.contentScore ?? info.metricValue ?? info.value;
  lines.push(info.label ?? info.metricLabel ?? "Score");

  if (info.definition) {
    lines.push(info.definition);
  }

  if (info.formula) {
    lines.push(`Formula: ${info.formula}`);
  }

  if (info.components?.length) {
    for (const component of info.components) {
      const weight = Number(component.weight);
      const weightText = Number.isFinite(weight) ? `${formatPercent(weight * 100)} ` : "";
      const valueText = component.value !== undefined ? ` - current ${formatNumber(component.value)}` : "";
      const growthText = component.growthPercent !== undefined ? `, growth ${formatPercent(component.growthPercent)}` : "";
      const scoreText = component.score !== undefined ? `, component score ${formatNumber(component.score)}` : "";
      const sourceText = component.sourceMetric ? ` (${component.sourceMetric})` : "";
      lines.push(`${weightText}${component.label}${valueText}${growthText}${scoreText}${sourceText}`);
    }
  }

  if (score !== undefined) {
    lines.push(`Current Score: ${formatNumber(score)}`);
  }

  return lines;
}

function overviewQueryString() {
  const range = currentOverviewDateRange();
  const params = new URLSearchParams({
    startDate: range.startDate,
    endDate: range.endDate,
    dateMode: range.mode
  });

  return `?${params.toString()}`;
}

function channelBreakdownQueryString() {
  const range = currentChannelDateRange();
  const params = new URLSearchParams({
    startDate: range.startDate,
    endDate: range.endDate,
    dateMode: range.mode
  });

  return `?${params.toString()}`;
}

function defaultOverviewRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0));

  return {
    mode: "lastMonth",
    month: formatMonthInput(start),
    quarter: quarterValueFromDate(start),
    startDate: formatDateInput(start),
    endDate: formatDateInput(end)
  };
}

function currentChannelDateRange() {
  return currentDateRangeFromState(state.channelRange);
}

function currentOverviewDateRange() {
  return currentDateRangeFromState(state.overviewRange);
}

function currentDateRangeFromState(rangeState) {
  const fallback = defaultOverviewRange();
  const range = rangeState ?? fallback;

  if (range.mode === "last7" || range.mode === "last30" || range.mode === "last90") {
    const days = Number(range.mode.replace("last", ""));
    const rolling = rollingDayRange(days);
    return {
      ...range,
      ...rolling,
      month: range.month || fallback.month,
      quarter: range.quarter || fallback.quarter,
      label: formatRangeLabel(`Last ${days} Days`, rolling.startDate, rolling.endDate)
    };
  }

  if (range.mode === "lastQuarter") {
    const lastQuarter = lastQuarterRange();
    return {
      ...range,
      ...lastQuarter,
      month: range.month || fallback.month,
      quarter: range.quarter || lastQuarter.quarter,
      label: formatRangeLabel("Last Quarter", lastQuarter.startDate, lastQuarter.endDate)
    };
  }

  if (range.mode === "ytd") {
    const yearToDate = yearToDateRange();
    return {
      ...range,
      ...yearToDate,
      month: range.month || fallback.month,
      quarter: range.quarter || fallback.quarter,
      label: formatRangeLabel("Year To Date", yearToDate.startDate, yearToDate.endDate)
    };
  }

  if (range.mode === "month") {
    const month = monthRange(range.month || fallback.month);
    return {
      ...range,
      ...month,
      label: formatRangeLabel("Month", month.startDate, month.endDate),
      month: range.month || fallback.month
    };
  }

  if (range.mode === "quarter") {
    const quarter = quarterRange(range.quarter || fallback.quarter);
    return {
      ...range,
      ...quarter,
      label: formatRangeLabel(quarter.label, quarter.startDate, quarter.endDate),
      quarter: range.quarter || fallback.quarter
    };
  }

  if (range.mode === "custom") {
    const startDate = range.startDate || fallback.startDate;
    const endDate = range.endDate || fallback.endDate;
    return {
      ...range,
      startDate,
      endDate,
      month: range.month || fallback.month,
      quarter: range.quarter || fallback.quarter,
      label: formatRangeLabel("Custom", startDate, endDate)
    };
  }

  return {
    ...fallback,
    label: formatRangeLabel("Last Calendar Month", fallback.startDate, fallback.endDate)
  };
}

function rollingDayRange(days) {
  const end = startOfUtcDay(new Date());
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(end)
  };
}

function lastQuarterRange() {
  const now = new Date();
  const currentQuarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), currentQuarterStartMonth - 3, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), currentQuarterStartMonth, 0));

  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(end),
    quarter: quarterValueFromDate(start)
  };
}

function yearToDateRange() {
  const now = startOfUtcDay(new Date());
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(now)
  };
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function monthRange(monthValue) {
  const [year, month] = String(monthValue).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(end)
  };
}

function quarterRange(quarterValue) {
  const [yearText, quarterText] = String(quarterValue).split("-Q");
  const year = Number(yearText);
  const quarter = Number(quarterText);
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));

  return {
    label: `Q${quarter} ${year}`,
    startDate: formatDateInput(start),
    endDate: formatDateInput(end)
  };
}

function quarterOptionsFromDate(date) {
  const options = [];
  const currentQuarterStart = Math.floor(date.getMonth() / 3) * 3;
  const cursor = new Date(Date.UTC(date.getFullYear(), currentQuarterStart, 1));

  for (let index = 0; index < 8; index += 1) {
    const quarterDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - index * 3, 1));
    const value = quarterValueFromDate(quarterDate);
    options.push({
      value,
      label: quarterRange(value).label
    });
  }

  return options;
}

function quarterValueFromDate(date) {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function formatRangeLabel(prefix, startDate, endDate) {
  return `${prefix}: ${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;
}

function formatDisplayDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatMonthInput(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Request failed: ${response.status}`);
  }

  return data;
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function periodButton(value, label) {
  return `<button type="button" data-period="${escapeHtml(value)}" class="${state.period === value ? "active" : ""}">${escapeHtml(label)}</button>`;
}

function emptyCard(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderError(error) {
  return `<div class="error-state">${escapeHtml(error.message ?? String(error))}</div>`;
}

function renderGrowthBadge(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return `<span class="growth muted">No comparison</span>`;
  }

  const growth = Number(value);
  return `<span class="growth ${growth < 0 ? "down" : ""}">${growth >= 0 ? "+" : ""}${formatPercent(growth)}</span>`;
}

function averageGrowth(comparisons = []) {
  const values = comparisons
    .map((item) => Number(item.growthPercent))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function snapshotMetricValue(snapshot) {
  return snapshot?.Streams ?? snapshot?.Downloads ?? snapshot?.Listeners ?? snapshot?.Plays ?? snapshot?.Value ?? 0;
}

function snapshotMetricLabel(snapshot) {
  if (!snapshot) {
    return "latest snapshot";
  }

  if (snapshot.Streams !== undefined) return "streams";
  if (snapshot.Downloads !== undefined) return "downloads";
  if (snapshot.Listeners !== undefined) return "listeners";
  if (snapshot.Plays !== undefined) return "plays";
  return "latest snapshot";
}

function statusClass(status) {
  const value = String(status ?? "").toLowerCase();
  if (value.includes("fail") || value.includes("error") || value.includes("down")) return "bad";
  if (value.includes("stale") || value.includes("warn") || value.includes("delay")) return "warn";
  return "good";
}

function formatNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "0";
}

function formatPercent(value) {
  const number = Number(value ?? 0);
  return `${Number.isFinite(number) ? number.toFixed(1) : "0.0"}%`;
}

function titleCase(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
