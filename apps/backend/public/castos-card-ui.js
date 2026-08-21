const activityLabels = {
  instagram: "Posts / reels published",
  facebook: "Posts / reels published",
  email: "Email campaigns sent",
  website: "Sessions",
  "voice of elim": "Publications",
  "elim updates": "Publications"
};

const podcastCardDefinitions = {
  spotify: {
    contentLabel: "Content Activity",
    contentNative: "Episodes tracked",
    audienceLabel: "Audience Activity",
    audienceNative: "Plays / Streams",
    audienceAvailable: false
  },
  castos: {
    contentLabel: "Content Activity",
    contentNative: "Episodes published",
    audienceLabel: "Audience Activity",
    audienceNative: "Listens",
    audienceAvailable: true
  },
  youtube: {
    contentLabel: "Content Activity",
    contentNative: "Videos published",
    audienceLabel: "Audience Activity",
    audienceNative: "Views",
    audienceAvailable: true
  }
};

function patchChannelCards() {
  const cards = document.querySelectorAll(".breakdown-card");
  for (const card of cards) {
    const channelLabel = card.querySelector(".channel-label")?.textContent?.trim().toLowerCase();
    if (!channelLabel) continue;

    const volumeLabel = card.querySelector(".breakdown-volume span");
    const metricLabel = card.querySelector(".breakdown-metric span");
    const metricValue = card.querySelector(".breakdown-metric strong");
    const change = card.querySelector(".channel-change");
    const podcastDefinition = podcastCardDefinitions[channelLabel];

    if (podcastDefinition) {
      if (volumeLabel) {
        volumeLabel.textContent = `${podcastDefinition.contentLabel} · ${podcastDefinition.contentNative}`;
      }
      if (metricLabel) {
        metricLabel.textContent = `${podcastDefinition.audienceLabel} · ${podcastDefinition.audienceNative}`;
      }

      if (!podcastDefinition.audienceAvailable) {
        if (metricValue) metricValue.textContent = "Not available";
        if (change) {
          change.textContent = "Audience metric not yet available";
          change.classList.remove("up", "down");
          change.classList.add("unavailable");
        }
        card.classList.remove("up", "down");
      }
      continue;
    }

    const activityLabel = activityLabels[channelLabel];
    if (volumeLabel && activityLabel && volumeLabel.textContent !== activityLabel) {
      volumeLabel.textContent = activityLabel;
    }
  }
}

patchChannelCards();
window.setInterval(patchChannelCards, 1000);
