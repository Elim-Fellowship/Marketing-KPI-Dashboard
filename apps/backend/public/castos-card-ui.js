const activityLabels = {
  instagram: "Posts / reels published",
  facebook: "Posts / reels published",
  email: "Email campaigns sent",
  spotify: "Episodes tracked",
  castos: "Podcast episodes published",
  youtube: "Videos published",
  website: "Sessions",
  "voice of elim": "Publications",
  "elim updates": "Publications"
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
  }
}

patchChannelCards();
window.setInterval(patchChannelCards, 1000);
