(function () {
  "use strict";

  // Q&A accordion: clicking the question or its chevron toggles open/closed.
  document.querySelectorAll(".qa-row h3, .qa-row .qa-chevron").forEach((el) => {
    el.addEventListener("click", () => {
      el.parentNode.classList.toggle("is-open");
    });
  });

  // Phone menu: the button opens / closes the header nav.
  const header = document.querySelector(".site-header");
  const toggle = header && header.querySelector(".site-header-toggle");
  if (toggle) {
    const setOpen = (open) => {
      header.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "關閉選單" : "開啟選單");
      toggle.querySelector("i").className = open ? "bi bi-x-lg" : "bi bi-list";
    };
    toggle.addEventListener("click", () => setOpen(!header.classList.contains("is-open")));
    // Close after picking a link (also covers same-page anchors like #upcoming).
    header.querySelectorAll(".site-header-nav a").forEach((a) => {
      a.addEventListener("click", () => setOpen(false));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  // Back-to-top button: appears after scrolling, smooth-scrolls to top on click.
  const backToTopBtn = document.querySelector(".back-to-top");
  if (backToTopBtn) {
    const updateVisibility = () => {
      backToTopBtn.classList.toggle("is-visible", window.scrollY > 100);
    };
    backToTopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    window.addEventListener("load", updateVisibility);
    document.addEventListener("scroll", updateVisibility);
  }

  // AOS (animate-on-scroll) initialization.
  if (typeof AOS !== "undefined") {
    window.addEventListener("load", () => {
      AOS.init({
        duration: 300,
        easing: "ease-in-out",
        once: true,
        mirror: false,
      });
    });
  }
})();
