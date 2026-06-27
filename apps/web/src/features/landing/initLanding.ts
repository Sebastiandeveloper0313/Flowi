/**
 * Wires up the landing page interactions (channel toggle, comparison tabs,
 * scroll reveals, cursor spotlight, magnetic buttons, number tickers).
 * Returns a cleanup function that detaches global listeners/observers.
 */
export function initLanding(root: HTMLElement): () => void {
  const observers: IntersectionObserver[] = [];
  const cleanups: Array<() => void> = [];

  /* ---- channel toggle ---- */
  const toggle = root.querySelector<HTMLElement>(".channel-toggle");
  if (toggle) {
    const glow = toggle.querySelector<HTMLElement>(".ch-glow");
    const btns = Array.from(toggle.querySelectorAll<HTMLElement>(".ch-btn"));
    const move = (btn: HTMLElement) => {
      btns.forEach((b) => b.classList.toggle("active", b === btn));
      if (glow) glow.style.transform = `translateX(${btn.offsetLeft - btns[0].offsetLeft}px)`;
    };
    btns.forEach((b) => b.addEventListener("click", () => move(b)));
    if (btns[0]) move(btns[0]);
  }

  /* ---- comparison tabs ---- */
  const tabs = Array.from(root.querySelectorAll<HTMLElement>(".cmp-tab"));
  if (tabs.length) {
    const copy: Record<string, { gpt: string; flowy: string; tag: string; file: string }> = {
      report: {
        gpt: "Explains how to build a sales report. You still pull the data and make it.",
        flowy: "Pulls last night’s numbers and posts a clean recap every morning at 8.",
        tag: "Builds it. Posts the PDF.",
        file: "Daily-Recap.pdf",
      },
      research: {
        gpt: "Gives you a framework for researching leads. You open the 30 tabs.",
        flowy: "Enriches every new signup and drops a ranked shortlist in your channel daily.",
        tag: "Researches it. Posts the list.",
        file: "Hot-Leads.csv",
      },
      content: {
        gpt: "Outlines how to make a trends deck. You build all the slides.",
        flowy: "Ships three slides on what’s trending, in your format, every day at noon.",
        tag: "Makes it. Posts the deck.",
        file: "Trends.pdf",
      },
      ops: {
        gpt: "Describes a process for comparing suppliers. Then it waits on you.",
        flowy: "Compares your suppliers every week and flags where you’re overpaying.",
        tag: "Does it. Posts the result.",
        file: "Supplier-Check.pdf",
      },
    };
    const gptLine = root.querySelector<HTMLElement>(".cmp-card.chatgpt .cmp-line");
    const flowyLine = root.querySelector<HTMLElement>(".cmp-card.flowy .cmp-line");
    const crTag = root.querySelector<HTMLElement>(".cr-tag");
    const crFile = root.querySelector<HTMLElement>(".cr-file");
    const fade = [gptLine, flowyLine, crTag, crFile];
    fade.forEach((el) => el && (el.style.transition = "opacity .18s ease"));
    tabs.forEach((tab) =>
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const d = copy[tab.dataset.cmp ?? ""];
        if (!d) return;
        fade.forEach((el) => el && (el.style.opacity = "0"));
        setTimeout(() => {
          if (gptLine) gptLine.textContent = d.gpt;
          if (flowyLine) flowyLine.textContent = d.flowy;
          if (crTag) crTag.textContent = d.tag;
          if (crFile) crFile.textContent = d.file;
          fade.forEach((el) => el && (el.style.opacity = "1"));
        }, 160);
      }),
    );
  }

  /* ---- scroll reveal ---- */
  const revealTargets = root.querySelectorAll<HTMLElement>(
    ".statement, .feat-card, .compare-title, .compare-sub, .cmp-tabs, .cmp-panels, .pro-copy, .pro-card, .how-card, .how-title, .trust-inner, .cta-card, .logos",
  );
  revealTargets.forEach((t) => t.classList.add("reveal"));
  const revealIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          const el = e.target as HTMLElement;
          el.style.transitionDelay =
            el.classList.contains("feat-card") || el.classList.contains("how-card")
              ? `${(i % 3) * 80}ms`
              : "0ms";
          el.classList.add("in");
          revealIO.unobserve(el);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  revealTargets.forEach((t) => revealIO.observe(t));
  observers.push(revealIO);

  /* ---- nav shadow on scroll ---- */
  const nav = root.querySelector<HTMLElement>(".nav");
  if (nav) {
    const onScroll = () => {
      const y = window.scrollY;
      nav.style.boxShadow =
        y > 20 ? "0 20px 50px -22px rgba(16,48,120,.5)" : "0 16px 40px -20px rgba(16,48,120,.35)";
      nav.style.background = y > 20 ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.72)";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", onScroll));
  }

  /* ---- card spotlight ---- */
  root.querySelectorAll<HTMLElement>(".feat-card, .how-card").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  });

  /* ---- magnetic buttons ---- */
  if (window.matchMedia("(hover: hover)").matches) {
    root.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((btn) => {
      const s = 0.22;
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${x * s}px, ${y * s * 1.3}px)`;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "";
      });
    });
  }

  /* ---- number ticker ---- */
  const countEls = root.querySelectorAll<HTMLElement>(".count");
  if (countEls.length) {
    const run = (el: HTMLElement) => {
      const to = Number.parseFloat(el.dataset.to ?? "0");
      const dec = el.dataset.dec ? Number(el.dataset.dec) : 0;
      const pre = el.dataset.pre ?? "";
      const suf = el.dataset.suf ?? "";
      const dur = 1300;
      const start = performance.now();
      const tick = (now: number) => {
        let p = Math.min((now - start) / dur, 1);
        p = 1 - (1 - p) ** 3;
        const v = to * p;
        el.textContent = pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + suf;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const countIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            run(e.target as HTMLElement);
            countIO.unobserve(e.target);
          }
        });
      },
      { threshold: 0.6 },
    );
    countEls.forEach((el) => countIO.observe(el));
    observers.push(countIO);
  }

  return () => {
    observers.forEach((o) => o.disconnect());
    cleanups.forEach((fn) => fn());
  };
}
