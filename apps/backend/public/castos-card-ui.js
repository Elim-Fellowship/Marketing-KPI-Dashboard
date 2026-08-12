function patchCastosCard() {
  const cards = document.querySelectorAll(".breakdown-card");
  for (const card of cards) {
    const label = card.querySelector(".channel-label")?.textContent?.trim().toLowerCase();
    if (label !== "castos") continue;

    const metric = card.querySelector(".breakdown-metric");
    if (metric) {
      metric.innerHTML = `
        <span>Downloads / Listens</span>
        <strong style="font-size:1rem;font-weight:600;">Not available</strong>
      `;
    }

    const change = card.querySelector(".channel-change");
    if (change) {
      change.textContent = "Audience analytics unavailable";
      change.classList.remove("up", "down");
      change.style.fontSize = "0.85rem";
      change.style.fontWeight = "600";
      change.style.color = "#64748b";
    }
  }
}

const observer = new MutationObserver(() => patchCastosCard());
observer.observe(document.documentElement, { childList: true, subtree: true });
patchCastosCard();
