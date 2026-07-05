/**
 * Wires up the landing page interactions (channel toggle, comparison tabs,
 * scroll reveals, cursor spotlight, magnetic buttons, number tickers).
 * Returns a cleanup function that detaches global listeners/observers.
 */
export function initLanding(root: HTMLElement): () => void {
  const observers: IntersectionObserver[] = [];
  const cleanups: Array<() => void> = [];

  /* ---- channel toggle (switches the app-mock preview) ---- */
  const toggle = root.querySelector<HTMLElement>(".channel-toggle");
  if (toggle) {
    const glow = toggle.querySelector<HTMLElement>(".ch-glow");
    const btns = Array.from(toggle.querySelectorAll<HTMLElement>(".ch-btn"));
    const mock = root.querySelector<HTMLElement>("#appMock");
    const move = (btn: HTMLElement) => {
      btns.forEach((b) => b.classList.toggle("active", b === btn));
      if (glow) glow.style.transform = `translateX(${btn.offsetLeft - btns[0].offsetLeft}px)`;
      if (mock && btn.dataset.ch) mock.dataset.view = btn.dataset.ch;
    };
    btns.forEach((b) => b.addEventListener("click", () => move(b)));
    if (btns[0]) move(btns[0]);
  }

  /* ---- comparison tabs ---- */
  const tabs = Array.from(root.querySelectorAll<HTMLElement>(".cmp-tab"));
  if (tabs.length) {
    const copy: Record<string, { gpt: string; flowy: string; tag: string; file: string }> = {
      research: {
        gpt: "Gives you a framework for finding leads. You open the 30 tabs.",
        flowy: "Scans Reddit every day for people asking for what you sell and drafts the replies.",
        tag: "Finds them. Drafts the replies.",
        file: "4 leads · ready to approve",
      },
      content: {
        gpt: "Outlines post ideas. You still write and publish every one.",
        flowy: "Writes and publishes your LinkedIn post every morning, in your brand voice.",
        tag: "Writes it. Publishes it.",
        file: "LinkedIn · posted 9:00 AM",
      },
      inbox: {
        gpt: "Tells you how to write a follow-up email. You still send it.",
        flowy: "Reads the thread, drafts the reply, and sends it the moment you approve.",
        tag: "Drafts it. You approve.",
        file: "Re: partnership · sent",
      },
      report: {
        gpt: "Explains how to build a marketing recap. You still pull everything together.",
        flowy: "Runs your agents on schedule and emails you a recap of what shipped.",
        tag: "Runs it. Emails the recap.",
        file: "Daily recap · in your inbox",
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
    ".statement, .feat-card, .compare-title, .compare-sub, .cmp-tabs, .cmp-panels, .pro-copy, .pro-card, .how-card, .how-title, .trust-inner, .cta-card, .logos, .pricing-title, .pricing-sub, .price-card",
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
            const el = e.target as HTMLElement;
            // data-delay lets counts wait for the intro animation to reveal them
            const delay = Number(el.dataset.delay ?? 0);
            if (delay > 0) setTimeout(() => run(el), delay);
            else run(el);
            countIO.unobserve(el);
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
