(() => {
  const originalFetch = window.fetch.bind(window);
  const DAY_MS = 24 * 60 * 60 * 1000;

  function lastCompleteWeekRange() {
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const daysSinceMonday = (todayUtc.getUTCDay() + 6) % 7;
    const currentWeekMonday = new Date(todayUtc.getTime() - daysSinceMonday * DAY_MS);
    const end = new Date(currentWeekMonday.getTime() - DAY_MS);
    const start = new Date(end.getTime() - 6 * DAY_MS);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10)
    };
  }

  function formatDisplayDate(value) {
    return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    });
  }

  window.fetch = function correctedOverviewFetch(input, init) {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input?.url;

    if (!rawUrl) return originalFetch(input, init);

    const url = new URL(rawUrl, window.location.origin);
    const isOverviewRequest = url.pathname === "/api/overview" || url.pathname === "/api/engagement";
    if (isOverviewRequest && url.searchParams.get("dateMode") === "last7") {
      const range = lastCompleteWeekRange();
      url.searchParams.set("startDate", range.startDate);
      url.searchParams.set("endDate", range.endDate);
      const rewritten = rawUrl.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
      return originalFetch(rewritten, init);
    }

    return originalFetch(input, init);
  };

  function updateWeeklyLabels() {
    const select = document.querySelector("#overview-date-mode");
    if (!select) return;

    const option = select.querySelector('option[value="last7"]');
    if (option && option.textContent !== "Last Complete Week") {
      option.textContent = "Last Complete Week";
    }

    if (select.value !== "last7") return;

    const summary = select.closest(".date-selector")?.querySelector("summary");
    if (!summary) return;

    const range = lastCompleteWeekRange();
    const desired = `Last Complete Week: ${formatDisplayDate(range.startDate)} - ${formatDisplayDate(range.endDate)}`;
    if (summary.textContent !== desired) {
      summary.textContent = desired;
    }
  }

  const observer = new MutationObserver(updateWeeklyLabels);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("change", (event) => {
    if (event.target?.id === "overview-date-mode") {
      queueMicrotask(updateWeeklyLabels);
    }
  }, true);
  updateWeeklyLabels();
})();