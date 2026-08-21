let quarterlyTopContentInFlight = false;
let quarterlyTablesPromise;
let selectedQuarter = currentQuarterKey(new Date());

async function patchQuarterlyTopContent() {
  if (window.location.pathname !== "/top-performing-content") return;

  const root = document.querySelector("#page-root");
  if (!root || root.querySelector("#quarterly-top-content-view") || quarterlyTopContentInFlight) return;

  quarterlyTopContentInFlight = true;
  try {
    const tables = await loadQuarterlyTables();
    if (window.location.pathname !== "/top-performing-content") return;

    const range = quarterRange(selectedQuarter);
    const contentRecords = tables.contentPerformance ?? [];
    const bufferRecords = tables.bufferPostMetrics ?? [];

    const podcasts = buildPodcastItems(contentRecords, range).slice(0, 5);
    const newsletters = buildNewsletterItems(contentRecords, range).slice(0, 5);
    const facebook = buildSocialItems(bufferRecords, "facebook", range).slice(0, 5);
    const instagram = buildSocialItems(bufferRecords, "instagram", range).slice(0, 5);

    root.innerHTML = `
      <div id="quarterly-top-content-view">
        <section class="band toolbar">
          <div>
            <p class="eyebrow">Quarterly Top Content</p>
            <h3 class="section-title">Top 5 by platform</h3>
            <p class="section-note">Content qualifies by publish/send date. Performance uses the latest accumulated metrics available.</p>
          </div>
          <div class="filters">
            <label>Quarter
              <select id="quarterly-content-quarter">
                ${quarterOptions(new Date(), 8).map((quarter) =>
                  `<option value="${escapeQuarterlyHtml(quarter.value)}" ${quarter.value === selectedQuarter ? "selected" : ""}>${escapeQuarterlyHtml(quarter.label)}</option>`
                ).join("")}
              </select>
            </label>
          </div>
        </section>

        <section class="content-sections">
          ${renderQuarterlySection("Top Podcast Episodes", podcasts, "No podcast episodes published in this quarter.")}
          ${renderQuarterlySection("Top Newsletters", newsletters, "No newsletters sent in this quarter.")}
          ${renderQuarterlySection("Top Facebook Posts", facebook, "No Facebook posts published in this quarter.")}
          ${renderQuarterlySection("Top Instagram Posts", instagram, "No Instagram posts published in this quarter.")}
        </section>
      </div>
    `;

    document.querySelector("#quarterly-content-quarter")?.addEventListener("change", (event) => {
      selectedQuarter = event.target.value;
      quarterlyTablesPromise = undefined;
      document.querySelector("#quarterly-top-content-view")?.remove();
      void patchQuarterlyTopContent();
    });
  } catch (error) {
    console.error("Unable to render quarterly Top Content", error);
    root.innerHTML = `
      <section id="quarterly-top-content-view" class="band">
        <div class="empty-state">Quarterly Top Content is temporarily unavailable.</div>
      </section>
    `;
  } finally {
    quarterlyTopContentInFlight = false;
  }
}

async function loadQuarterlyTables() {
  if (!quarterlyTablesPromise) {
    quarterlyTablesPromise = fetch("/api/comms/tables", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Communications tables request failed");
        return response.json();
      })
      .then((data) => data.tables ?? {});
  }
  return quarterlyTablesPromise;
}

function buildPodcastItems(records, range) {
  const grouped = new Map();

  for (const record of records) {
    const fields = record.fields ?? {};
    const source = String(fields["Source Name"] ?? fields["Source Platform"] ?? fields.Source ?? "").toLowerCase();
    const metricLabel = String(fields["Metric Label"] ?? fields["Metric Type"] ?? "").toLowerCase();
    const contentType = String(fields["Content Type"] ?? "").toLowerCase();
    const publishDate = String(fields["Publish Date"] ?? fields.Date ?? "");

    if (source !== "castos") continue;
    if (!metricLabel.includes("listen")) continue;
    if (!(contentType.includes("episode") || contentType.includes("podcast"))) continue;
    if (!dateInRange(publishDate, range)) continue;

    const title = String(fields["Content Title"] ?? "Untitled podcast episode");
    const key = `${normalizeKey(title)}|${publishDate}`;
    const item = grouped.get(key) ?? {
      title,
      date: publishDate,
      listens: 0,
      score: 0,
      meta: ""
    };
    item.listens += numeric(fields["Metric Value"] ?? fields.Listens ?? fields.Listeners);
    grouped.set(key, item);
  }

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      score: item.listens,
      meta: `${formatQuarterlyNumber(item.listens)} listens · Published ${item.date}`
    }))
    .sort((left, right) => right.score - left.score || right.date.localeCompare(left.date));
}

function buildNewsletterItems(records, range) {
  return records
    .map((record) => record.fields ?? {})
    .filter((fields) => {
      const source = String(fields["Source Name"] ?? fields["Source Platform"] ?? fields.Source ?? "").toLowerCase();
      const contentType = String(fields["Content Type"] ?? "").toLowerCase();
      return source === "mailchimp" && contentType === "newsletter" && dateInRange(fields["Publish Date"], range);
    })
    .map((fields) => {
      const sent = numeric(fields["Emails Sent"]);
      const openRate = numeric(fields["Open Rate"]);
      const clicks = numeric(fields.Clicks);
      const clickRate = numeric(fields["Click Rate"]);
      const date = String(fields["Publish Date"] ?? "");
      return {
        title: String(fields["Content Title"] ?? "Untitled newsletter"),
        date,
        score: clicks,
        secondaryScore: clickRate,
        tertiaryScore: openRate,
        volume: sent,
        meta: `Sent ${formatQuarterlyNumber(sent)} · Open ${formatQuarterlyPercent(openRate)} · Clicks ${formatQuarterlyNumber(clicks)} · Click rate ${formatQuarterlyPercent(clickRate)}`,
        scoreDisplay: `${formatQuarterlyNumber(clicks)} clicks`
      };
    })
    .sort((left, right) =>
      right.score - left.score ||
      right.secondaryScore - left.secondaryScore ||
      right.tertiaryScore - left.tertiaryScore ||
      right.volume - left.volume
    );
}

function buildSocialItems(records, channel, range) {
  const posts = new Map();

  for (const record of records) {
    const fields = record.fields ?? {};
    if (String(fields.Channel ?? "").toLowerCase() !== channel) continue;

    const date = String(fields["Metric Date"] ?? fields.Date ?? "");
    if (!dateInRange(date, range)) continue;

    const title = String(fields["Content Title"] ?? "Untitled social post");
    const key = `${normalizeKey(title)}|${date}`;
    const post = posts.get(key) ?? {
      title,
      date,
      metrics: new Map()
    };
    const metricName = normalizeMetricName(fields["Metric Name"] ?? fields.Metric);
    const value = numeric(fields["Metric Value"] ?? fields.Value);
    if (metricName) {
      post.metrics.set(metricName, Math.max(value, post.metrics.get(metricName) ?? 0));
    }
    posts.set(key, post);
  }

  return [...posts.values()]
    .map(toRankedSocialItem)
    .sort((left, right) => right.score - left.score || right.exposure - left.exposure || right.date.localeCompare(left.date));
}

function toRankedSocialItem(post) {
  const metrics = post.metrics;
  const engagementRate = firstMetric(metrics, ["engagement rate", "eng. rate", "engagementrate"]);
  const reactions = firstMetric(metrics, ["reactions", "reaction", "likes", "like"]);
  const comments = firstMetric(metrics, ["comments", "comment"]);
  const shares = firstMetric(metrics, ["shares", "share"]);
  const clicks = firstMetric(metrics, ["clicks", "click"]);
  const saves = firstMetric(metrics, ["saves", "save"]);
  const interactions = reactions + comments + shares + clicks + saves;
  const impressions = firstMetric(metrics, ["impressions", "impression"]);
  const views = firstMetric(metrics, ["views", "view"]);
  const reach = firstMetric(metrics, ["reach"]);
  const exposure = Math.max(impressions, views, reach);

  return {
    title: post.title,
    date: post.date,
    score: engagementRate,
    exposure,
    scoreDisplay: formatQuarterlyPercent(engagementRate),
    meta: `Engagement rate ${formatQuarterlyPercent(engagementRate)}${interactions ? ` · ${formatQuarterlyNumber(interactions)} interactions` : ""}${exposure ? ` · ${formatQuarterlyNumber(exposure)} reach/views` : ""}`
  };
}

function renderQuarterlySection(title, items, emptyMessage) {
  return `
    <section class="band">
      <div class="section-row">
        <h3 class="section-title">${escapeQuarterlyHtml(title)}</h3>
        <span class="section-note">Top ${Math.min(5, items.length)}</span>
      </div>
      <div class="rank-list">
        ${items.map((item, index) => renderQuarterlyCard(item, index)).join("") || `<div class="empty-state">${escapeQuarterlyHtml(emptyMessage)}</div>`}
      </div>
    </section>
  `;
}

function renderQuarterlyCard(item, index) {
  const scoreDisplay = item.scoreDisplay ?? formatQuarterlyNumber(item.score);
  return `
    <article class="content-card">
      <div class="rank-badge">${index + 1}</div>
      <div>
        <strong>${escapeQuarterlyHtml(item.title)}</strong>
        <div class="content-meta">${escapeQuarterlyHtml(item.meta)}${item.date && !item.meta.includes(item.date) ? ` · ${escapeQuarterlyHtml(item.date)}` : ""}</div>
      </div>
      <div class="score">${escapeQuarterlyHtml(scoreDisplay)}</div>
    </article>
  `;
}

function firstMetric(metrics, names) {
  for (const name of names) {
    const value = metrics.get(name);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeMetricName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dateInRange(value, range) {
  const date = new Date(`${String(value ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date >= range.start && date <= range.end;
}

function currentQuarterKey(date) {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
}

function quarterRange(key) {
  const match = /^(\d{4})-Q([1-4])$/.exec(key);
  const year = Number(match?.[1] ?? new Date().getFullYear());
  const quarter = Number(match?.[2] ?? Math.floor(new Date().getMonth() / 3) + 1);
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(Date.UTC(year, startMonth, 1)),
    end: new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999))
  };
}

function quarterOptions(now, count) {
  const options = [];
  let year = now.getFullYear();
  let quarter = Math.floor(now.getMonth() / 3) + 1;
  for (let index = 0; index < count; index += 1) {
    options.push({ value: `${year}-Q${quarter}`, label: `Q${quarter} ${year}` });
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return options;
}

function numeric(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatQuarterlyNumber(value) {
  return numeric(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatQuarterlyPercent(value) {
  return `${numeric(value).toFixed(1)}%`;
}

function escapeQuarterlyHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const quarterlyTopContentObserver = new MutationObserver(() => {
  void patchQuarterlyTopContent();
});

quarterlyTopContentObserver.observe(document.querySelector("#page-root"), {
  childList: true,
  subtree: true
});

void patchQuarterlyTopContent();
