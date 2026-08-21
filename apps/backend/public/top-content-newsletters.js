let newsletterPatchInFlight = false;
let newsletterCache;

async function patchTopNewsletters() {
  const container = document.querySelector("#page-root .content-sections");
  if (!container || newsletterPatchInFlight) return;

  const band = [...container.querySelectorAll(":scope > .band")].find((item) =>
    item.querySelector(".section-title")?.textContent?.trim() === "Top Newsletters"
  );
  if (!band) return;

  const timeframe = document.querySelector("#timeframe-filter")?.value ?? "90d";
  const platform = String(document.querySelector("#platform-filter")?.value ?? "all").toLowerCase();
  const patchKey = `${timeframe}:${platform}`;
  if (band.dataset.newsletterPatchKey === patchKey) return;

  newsletterPatchInFlight = true;
  try {
    const records = await loadNewsletterRecords();
    if (!band.isConnected) return;

    const visibleForPlatform = platform === "all" || platform === "newsletter" || platform === "mailchimp";
    const items = visibleForPlatform
      ? records
          .filter((record) => inTimeframe(record.fields?.["Publish Date"], timeframe))
          .sort(compareNewsletterRecords)
          .slice(0, 5)
      : [];

    const rankList = band.querySelector(".rank-list");
    if (rankList) {
      rankList.innerHTML = items.map(renderNewsletterCard).join("") ||
        `<div class="empty-state">No data available</div>`;
    }
    band.dataset.newsletterPatchKey = patchKey;
  } catch (error) {
    console.error("Unable to render Mailchimp Top Newsletters", error);
  } finally {
    newsletterPatchInFlight = false;
    queueMicrotask(() => void patchTopNewsletters());
  }
}

async function loadNewsletterRecords() {
  if (newsletterCache) return newsletterCache;
  const response = await fetch("/api/airtable/content-performance");
  if (!response.ok) throw new Error("Content_Performance request failed");
  const data = await response.json();
  newsletterCache = (data.records ?? []).filter((record) => {
    const fields = record.fields ?? {};
    return String(fields["Source Name"] ?? fields["Source Platform"] ?? "").toLowerCase() === "mailchimp" &&
      String(fields["Content Type"] ?? "").toLowerCase() === "newsletter";
  });
  return newsletterCache;
}

function compareNewsletterRecords(left, right) {
  const rightClickRate = numeric(right.fields?.["Click Rate"]);
  const leftClickRate = numeric(left.fields?.["Click Rate"]);
  if (rightClickRate !== leftClickRate) return rightClickRate - leftClickRate;

  const rightOpenRate = numeric(right.fields?.["Open Rate"]);
  const leftOpenRate = numeric(left.fields?.["Open Rate"]);
  if (rightOpenRate !== leftOpenRate) return rightOpenRate - leftOpenRate;

  return numeric(right.fields?.["Emails Sent"]) - numeric(left.fields?.["Emails Sent"]);
}

function renderNewsletterCard(record, index) {
  const fields = record.fields ?? {};
  const title = fields["Content Title"] ?? "Untitled newsletter";
  const sent = numeric(fields["Emails Sent"]);
  const openRate = numeric(fields["Open Rate"]);
  const clicks = numeric(fields.Clicks);
  const clickRate = numeric(fields["Click Rate"]);
  const date = fields["Publish Date"] ?? "No date";

  return `
    <article class="content-card">
      <div class="rank-badge">${index + 1}</div>
      <div>
        <strong>${escapeNewsletterHtml(title)}</strong>
        <div class="content-meta">Sent ${formatNewsletterNumber(sent)} · Open ${formatNewsletterPercent(openRate)} · Clicks ${formatNewsletterNumber(clicks)} · Click rate ${formatNewsletterPercent(clickRate)} · ${escapeNewsletterHtml(date)}</div>
      </div>
      <div class="score">${formatNewsletterPercent(clickRate)}</div>
    </article>
  `;
}

function inTimeframe(dateValue, timeframe) {
  if (timeframe === "all") return true;
  const match = /^(\d+)d$/.exec(timeframe);
  if (!match) return true;
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date(Date.now() - Number(match[1]) * 24 * 60 * 60 * 1000);
}

function numeric(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatNewsletterNumber(value) {
  return numeric(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatNewsletterPercent(value) {
  return `${numeric(value).toFixed(1)}%`;
}

function escapeNewsletterHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const newsletterObserver = new MutationObserver(() => {
  void patchTopNewsletters();
});

newsletterObserver.observe(document.querySelector("#page-root"), {
  childList: true,
  subtree: true
});

void patchTopNewsletters();
