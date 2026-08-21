const topContentSocialCache = new Map();
let topContentSocialPatchInFlight = false;

async function patchTopContentSocialSections() {
  const container = document.querySelector("#page-root .content-sections");
  if (!container || topContentSocialPatchInFlight) return;

  const bands = [...container.querySelectorAll(":scope > .band")];
  const facebookBand = bands.find((band) => {
    const title = band.querySelector(".section-title")?.textContent?.trim();
    return title === "Top Social Posts" || title === "Top Facebook Posts";
  });
  const instagramBand = bands.find((band) => {
    const title = band.querySelector(".section-title")?.textContent?.trim();
    return title === "Top Videos" || title === "Top Instagram Posts";
  });
  if (!facebookBand || !instagramBand) return;

  const timeframe = document.querySelector("#timeframe-filter")?.value ?? "90d";
  const platform = String(document.querySelector("#platform-filter")?.value ?? "all").toLowerCase();
  const groupBy = document.querySelector("#groupby-filter")?.value ?? "none";
  const patchKey = `${timeframe}:${platform}:${groupBy}`;

  if (
    facebookBand.dataset.socialSplitKey === patchKey &&
    instagramBand.dataset.socialSplitKey === patchKey
  ) {
    return;
  }

  topContentSocialPatchInFlight = true;
  try {
    const data = await loadSocialRankings(timeframe, groupBy);
    const showFacebook = platform === "all" || platform === "facebook";
    const showInstagram = platform === "all" || platform === "instagram";

    renderSocialBand(
      facebookBand,
      "Top Facebook Posts",
      showFacebook ? data.facebook : [],
      patchKey
    );
    renderSocialBand(
      instagramBand,
      "Top Instagram Posts",
      showInstagram ? data.instagram : [],
      patchKey
    );
  } catch (error) {
    console.error("Unable to split Top Content social rankings", error);
    renderSocialBand(facebookBand, "Top Facebook Posts", [], patchKey);
    renderSocialBand(instagramBand, "Top Instagram Posts", [], patchKey);
  } finally {
    topContentSocialPatchInFlight = false;
  }
}

async function loadSocialRankings(timeframe, groupBy) {
  const cacheKey = `${timeframe}:${groupBy}`;
  if (topContentSocialCache.has(cacheKey)) {
    return topContentSocialCache.get(cacheKey);
  }

  const query = (platform) =>
    `/api/top-content?timeframe=${encodeURIComponent(timeframe)}` +
    `&platform=${encodeURIComponent(platform)}` +
    `&groupBy=${encodeURIComponent(groupBy)}`;

  const [facebookResponse, instagramResponse] = await Promise.all([
    fetch(query("facebook")),
    fetch(query("instagram"))
  ]);
  if (!facebookResponse.ok || !instagramResponse.ok) {
    throw new Error("Top Content social ranking request failed");
  }

  const [facebookData, instagramData] = await Promise.all([
    facebookResponse.json(),
    instagramResponse.json()
  ]);
  const rankings = {
    facebook: facebookData.sections?.socialPosts ?? [],
    instagram: instagramData.sections?.socialPosts ?? []
  };
  topContentSocialCache.set(cacheKey, rankings);
  return rankings;
}

function renderSocialBand(band, title, items, patchKey) {
  const heading = band.querySelector(".section-title");
  const rankList = band.querySelector(".rank-list");
  if (heading) heading.textContent = title;
  if (rankList) {
    rankList.innerHTML =
      items.slice(0, 5).map(renderSocialContentCard).join("") ||
      `<div class="empty-state">No data available</div>`;
  }
  band.dataset.socialSplitKey = patchKey;
}

function renderSocialContentCard(item, index) {
  const score = item.scoreAvailable
    ? formatSocialNumber(item.contentScore ?? item.metricValue)
    : "No data";
  return `
    <article class="content-card">
      <div class="rank-badge">${formatSocialNumber(item.rank ?? index + 1)}</div>
      <div>
        <strong>${escapeSocialHtml(item.title)}</strong>
        <div class="content-meta">${escapeSocialHtml(item.platform)} - ${escapeSocialHtml(item.metricLabel ?? "Content Score")} - ${escapeSocialHtml(item.date ?? "No date")}</div>
      </div>
      <div class="score">${score}</div>
    </article>
  `;
}

function formatSocialNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number)
    ? number.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "0";
}

function escapeSocialHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const topContentSocialObserver = new MutationObserver(() => {
  void patchTopContentSocialSections();
});

topContentSocialObserver.observe(document.querySelector("#page-root"), {
  childList: true,
  subtree: true
});

void patchTopContentSocialSections();
