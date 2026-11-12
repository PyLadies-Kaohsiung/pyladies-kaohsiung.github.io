// "我要報名" gate, shared by the homepage (events.js) and each event's own
// page (events/*/index.html). Any link with [data-register-gate] opens a
// dialog with the sign-up steps before handing over the registration URL;
// data-has-online="1" means the event has an online session (men can join).
(function () {
  "use strict";

  const DISCORD_URL = "https://discord.gg/8Xp9vJh4Bb";
  let registerDialogEl = null;

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // "我要報名" first shows how to take part (the sign-up steps),
  // then hands over the registration link.

  function openRegisterGate(url, hasOnline) {
    if (!registerDialogEl) {
      registerDialogEl = document.createElement("dialog");
      registerDialogEl.className = "event-dialog register-dialog section-warm";
      registerDialogEl.setAttribute("aria-labelledby", "register-dialog-title");
      registerDialogEl.addEventListener("click", (ev) => {
        if (ev.target === registerDialogEl || ev.target.closest("[data-register-close]")) {
          registerDialogEl.close();
        }
      });
      document.body.appendChild(registerDialogEl);
    }
    // A stepper: a dot per step joined by a line. Steps 1 and 6 are where the
    // visitor actually goes, so those dots (and labels) are the links.
    const inner = (no, icon, label, isLink) =>
      `<span class="reg-dot"><i class="bi ${icon}"></i></span><span class="reg-text"><span class="reg-no">${no}</span><strong>${label}${
        isLink ? '<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>' : ""
      }</strong></span>`;
    const step = (no, icon, label) => `<li>${inner(no, icon, label, false)}</li>`;
    const linkStep = (no, icon, label, href) =>
      `<li class="is-link"><a href="${escapeHtml(
        href
      )}" target="_blank" rel="noopener">${inner(no, icon, label, true)}</a></li>`;
    registerDialogEl.innerHTML = `
      <button type="button" class="event-dialog-close" data-register-close aria-label="關閉"><i class="bi bi-x-lg"></i></button>
      <div class="event-dialog-body">
        <header class="event-dialog-header">
          <h3 class="event-dialog-title" id="register-dialog-title">參加活動</h3>
        </header>
        <div class="reg-flow">
          <div class="reg-phase is-once">
            <p class="reg-phase-label">第一次參加・只需一次</p>
            <ol class="reg-steps">
              ${linkStep(1, "bi-discord", "加入社群", DISCORD_URL)}
              ${step(2, "bi-chat-square-text", "自我介紹")}
              ${step(3, "bi-person-check", "成為社群成員")}
            </ol>
          </div>
          <div class="reg-phase">
            <p class="reg-phase-label">每場活動</p>
            <ol class="reg-steps" start="4">
              ${step(4, "bi-ui-checks", "填寫報名表單")}
              ${step(5, "bi-key", "獲得活動代碼")}
              ${linkStep(6, "bi-ticket-perforated", "KKTIX 報名", url)}
            </ol>
          </div>
        </div>
        <div class="join-note">
          <i class="bi bi-info-circle"></i>
          <div>
            ${
              hasOnline
                ? `<p><strong>男性朋友</strong>：目前只能參加線上活動，在自我介紹時需提供<a href="https://community-card.org/" target="_blank" rel="noopener">高雄社群參與證明</a>。</p>`
                : `<p><strong>本場活動僅限女性參與。</strong>男性朋友也歡迎加入社群，於自我介紹時提供<a href="https://community-card.org/" target="_blank" rel="noopener">高雄社群參與證明</a>，通過審核後即可參與開放報名的活動。</p>`
            }
          </div>
        </div>
        <p class="register-coc">參加活動即表示同意遵守<a href="/about/#coc">行為準則</a>。</p>
        <p class="register-faq"><a href="/about/#faq"><i class="bi bi-question-circle"></i>活動常見問題</a></p>
      </div>`;
    if (!registerDialogEl.open) {
      if (typeof registerDialogEl.showModal === "function") registerDialogEl.showModal();
      else registerDialogEl.setAttribute("open", "");
    }
  }

  document.addEventListener("click", (ev) => {
    const link = ev.target.closest("[data-register-gate]");
    if (!link) return;
    ev.preventDefault();
    openRegisterGate(link.href, link.dataset.hasOnline === "1");
  });
})();
