(function () {
  "use strict";

  // Q&A accordion: clicking the question or its chevron toggles open/closed.
  document.querySelectorAll(".qa-row h3, .qa-row .qa-chevron").forEach((el) => {
    el.addEventListener("click", () => {
      el.parentNode.classList.toggle("is-open");
    });
  });

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
