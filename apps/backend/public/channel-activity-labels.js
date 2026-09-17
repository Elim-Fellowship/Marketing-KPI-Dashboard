let websiteActiveUsersRequest = 0;
let websiteActiveUsersSignature = "";

function formatChannelCount(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function channelDateRange() {
  const mode = document.querySelector("#channel-date-mode")?.value;
  const today = new Date();
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  if (mode === "month") {
    const month = document.querySelector("#channel-month")?.value;
    if (!/^\d{4}-\d{2}$/.test(month ?? "")) return null;
    const [year, monthNumber] = month.split("-").map(Number);
    return {
      startDate: `${month}-01`,
      endDate: formatDate(new Date(year, monthNumber, 0))
    };
  }

  if (mode === "quarter") {
    const quarter = document.querySelector("#channel-quarter")?.value;
    const match = /^(\d{4})-Q([1-4])$/.exec(quarter ?? "");
    if (!match) return null;
    const year = Number(match[1]);
    const quarterNumber = Number(match[2]);
    const startMonth = (quarterNumber - 1) * 3;
    return {
      startDate: formatDate(new Date(year, startMonth, 1)),
      endDate: formatDate(new Date(year, startMonth + 3, 0))
    };
  }

  if (mode === "custom") {
    const startDate = document.querySelector("#channel-start-date")?.value;
    const endDate = document.querySelector("#channel-end-date")?.value;
    return startDate && endDate ? { startDate, endDate } : null;
  }

  const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    startDate: formatDate(new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth() - 1, 1)),
    endDate: formatDate(new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth(), 0))
  };
}

async function applyWebsiteActiveUsers(card) {
  const range = channelDateRange();
  if (!range) return;
  const signature = `${range.startDate}:${range.endDate}`;
  if (signature === websiteActiveUsersSignature) return;
  websiteActiveUsersSignature = signature;
  const requestId = ++websiteActiveUsersRequest;

  try {
    const params = new URLSearchParams({ ...range, dateMode: "custom" });
    const response = await fetch(`/api/engagement?${params.toString()}`);
    if (!response.ok || requestId !== websiteActiveUsersRequest) return;
    const payload = await response.json();
    const activeUsers = (payload.engagementCards ?? []).find((item) => item.id === "website_active_users");
    if (!activeUsers?.hasData || requestId !== websiteActiveUsersRequest) return;

    const currentWebsiteCard = Array.from(document.querySelectorAll(".breakdown-card")).find(
      (item) => item.querySelector(".channel-label")?.textContent?.trim().toLowerCase() === "website"
    );
    const volumeValue = currentWebsiteCard?.querySelector(".breakdown-volume strong");
    if (volumeValue) volumeValue.textContent = formatChannelCount(activeUsers.currentValue);
  } catch {
    websiteActiveUsersSignature = "";
  }
}

function applyChannelActivityLabels() {
  const labels = {
    spotify: "Episodes Engaged",
    castos: "Episodes Published",
    youtube: "Videos Published",
    website: "Active Users"
  };

  document.querySelectorAll(".breakdown-card").forEach((card) => {
    const channelName = card.querySelector(".channel-label")?.textContent?.trim().toLowerCase();
    const volumeLabel = card.querySelector(".breakdown-volume span");
    if (!channelName || !volumeLabel) return;

    const label = labels[channelName];
    if (label && volumeLabel.textContent !== label) {
      volumeLabel.textContent = label;
    }

    if (channelName === "website") void applyWebsiteActiveUsers(card);
  });
}

const pageRoot = document.querySelector("#page-root");
if (pageRoot) {
  const observer = new MutationObserver(() => {
    websiteActiveUsersSignature = "";
    applyChannelActivityLabels();
  });
  observer.observe(pageRoot, { childList: true, subtree: true });
}
applyChannelActivityLabels();
