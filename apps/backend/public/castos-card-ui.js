function patchCastosCard() {
  const cards = document.querySelectorAll(".breakdown-card");
  for (const card of cards) {
    const label = card.querySelector(".channel-label")?.textContent?.trim().toLowerCase();
    if (label !== "castos") continue;

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

patchCastosCard();

// The dashboard re-renders cards when filters or pages change. Polling is
// intentionally used instead of MutationObserver so updating the Castos card
// cannot recursively trigger the patch itself.
window.setInterval(patchCastosCard, 1000);
