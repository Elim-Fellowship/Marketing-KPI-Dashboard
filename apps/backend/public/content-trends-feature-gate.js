// Temporary UI feature gate.
// The legacy Content Trends implementation remains in app.js for rollback
// while Content Trend Analysis is developed.

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

function installLegacyContentTrendsGate() {
  const pageRoot = document.querySelector("#page-root");
  if (!pageRoot) {
    return;
  }

  const observer = new MutationObserver(() => hideLegacyContentTrends());
  observer.observe(pageRoot, { childList: true, subtree: true });
  hideLegacyContentTrends();

  // app.js renders asynchronously after API calls. This extra check ensures
  // the legacy module is hidden even if a browser delays mutation delivery.
  window.addEventListener("load", hideLegacyContentTrends, { once: true });
  setTimeout(hideLegacyContentTrends, 250);
  setTimeout(hideLegacyContentTrends, 1000);
}

installLegacyContentTrendsGate();
