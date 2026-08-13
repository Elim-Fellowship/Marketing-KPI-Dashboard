(() => {
  let latestSummary = null;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url ?? "";
    if (url.includes("/api/overview")) {
      response.clone().json().then((data) => {
        latestSummary = data?.monthlyActivitySummary ?? null;
        applyCommunicationsOutputUi();
      }).catch(() => {});
    }
    return response;
  };

  const observer = new MutationObserver(() => applyCommunicationsOutputUi());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  function applyCommunicationsOutputUi() {
    const cards = [...document.querySelectorAll(".activity-summary-grid .activity-item")];
    if (cards.length < 5) return;

    const definitions = [
      ["Emails Sent", "emailsSent"],
      ["Podcasts Published", "podcastsPublished"],
      ["Social Posts Published", "socialPostsPublished"],
      ["Unique Website Visitors", "uniqueWebsiteVisitors"],
      ["Email Campaigns Sent", "emailCampaignsSent"]
    ];

    definitions.forEach(([label, key], index) => {
      const card = cards[index];
      const labelNode = card?.querySelector("span");
      const valueNode = card?.querySelector("strong");
      if (labelNode) labelNode.textContent = label;
      const item = latestSummary?.items?.[key];
      if (valueNode && item && item.available === false) valueNode.textContent = "No data";
      if (card && item?.source) card.title = `Source: ${item.source}`;
    });
  }
})();
