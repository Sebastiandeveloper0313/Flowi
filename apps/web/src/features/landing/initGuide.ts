/**
 * Reveal-on-scroll for the long-form guide pages. Adds `.in` to each
 * `.pb-reveal` as it enters the viewport. Falls back to showing everything when
 * IntersectionObserver is missing or the user prefers reduced motion. Returns a
 * cleanup function, mirroring initLanding.
 */
export function initGuide(root: HTMLElement): () => void {
  const els = root.querySelectorAll<HTMLElement>(".pb-reveal");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!("IntersectionObserver" in window) || reduce) {
    els.forEach((e) => e.classList.add("in"));
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  els.forEach((e) => io.observe(e));

  // Solidify the nav on scroll, like the landing, so article text doesn't bleed
  // through the translucent bar as it passes underneath. The nav lives in a
  // sibling <header>, so reach it via the shared .flowy ancestor, not `root`.
  const nav = root.closest(".flowy")?.querySelector<HTMLElement>(".nav") ?? null;
  const onScroll = () => {
    if (!nav) return;
    const y = window.scrollY;
    nav.style.boxShadow =
      y > 20 ? "0 20px 50px -22px rgba(16,48,120,.5)" : "0 16px 40px -20px rgba(16,48,120,.35)";
    nav.style.background = y > 20 ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.72)";
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    io.disconnect();
    window.removeEventListener("scroll", onScroll);
  };
}
