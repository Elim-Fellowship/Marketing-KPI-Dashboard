function applyChannelActivityLabels() {
  const labels = {
    spotify: "Episodes Engaged",
    castos: "Episodes Published",
    youtube: "Videos Published"
  };

  document.querySelectorAll(".breakdown-card").forEach((card) => {
    const channelName = card.querySelector(".channel-label")?.textContent?.trim().toLowerCase();
    const volumeLabel = card.querySelector(".breakdown-volume span");
    if (!channelName || !volumeLabel) return;

    const label = labels[channelName];
    if (label && volumeLabel.textContent !== label) {
      volumeLabel.textContent = label;
    }
  });
}

const pageRoot = document.querySelector("#page-root");
if (pageRoot) {
  const observer = new MutationObserver(applyChannelActivityLabels);
  observer.observe(pageRoot, { childList: true, subtree: true });
}
applyChannelActivityLabels();
