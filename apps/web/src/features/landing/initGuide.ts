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
  return () => io.disconnect();
}
