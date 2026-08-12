const activityLabels = {
  instagram: "Posts / reels published",
  facebook: "Posts / reels published",
  email: "Email campaigns sent",
  spotify: "Episodes tracked",
  castos: "Podcast episodes published",
  youtube: "Videos published",
  website: "Articles / pages published",
  "voice of elim": "Email campaigns sent",
  "elim updates": "Email campaigns sent"
};

function patchChannelCards() {
  const cards = document.querySelectorAll(".breakdown-card");
  for (const card of cards) {
    const channelLabel = card.querySelector(".channel-label")?.textContent?.trim().toLowerCase();
    if (!channelLabel) continue;

    const volumeLabel = card.querySelector(".breakdown-volume span");
    const activityLabel = activityLabels[channelLabel];
    if (volumeLabel && activityLabel && volumeLabel.textContent !== activityLabel) {
      volumeLabel.textContent = activityLabel;
    }

    if (channelLabel !== "castos") continue;

    const metric = card.querySelector(".breakdown-metric");
    if (metric && !metric.dataset.castosUnavailable) {
      metric.innerHTML = `
        <span>Downloads / Listens</span>
        <strong style="font-size:1rem;font-weight:600;">Not available</strong>
      `;
      metric.dataset.castosUnavailable = "true";
    }

    const change = card.querySelector(".channel-change");
    if (change && change.dataset.castosUnavailable !== "true") {
      change.textContent = "Audience analytics unavailable";
      change.classList.remove("up", "down");
      change.style.fontSize = "0.85rem";
      change.style.fontWeight = "600";
      change.style.color = "#64748b";
      change.dataset.castosUnavailable = "true";
    }
  }
}

patchChannelCards();

// The dashboard re-renders cards when filters or pages change. Polling is
// intentionally used instead of MutationObserver so card label updates cannot
// recursively trigger themselves.
window.setInterval(patchChannelCards, 1000);
