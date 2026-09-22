(function () {
  "use strict";

  const EVENT_HASH_PREFIX = "#event-";

  const dialogEl = document.getElementById("event-dialog");
  const dialogBodyEl = document.getElementById("event-dialog-body");
  let allEvents = [];
  let pastEvents = [];
  let currentYear = "all";
  let currentSearch = "";

  fetch("data/events.json")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(init)
    .catch((err) => {
      const target = document.getElementById("upcoming-list");
      if (target) {
        target.innerHTML =
          `<div class="col-12 event-empty">活動資料載入失敗：${escapeHtml(
            err.message
          )}</div>`;
      }
    });

  function init(events) {
    allEvents = events;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = [];
    const past = [];
    events.forEach((e) => {
      const earliest = parseLocalDateTime(e.datetimes[0].datetime_start);
      (earliest >= today ? upcoming : past).push(e);
    });
    upcoming.sort((a, b) => firstStart(a) - firstStart(b));
    past.sort((a, b) => firstStart(b) - firstStart(a));
    pastEvents = past;

    document.getElementById("upcoming-list").innerHTML = upcoming.length
      ? upcoming.map(upcomingItem).join("")
      : `<li class="event-empty">目前沒有即將舉辦的活動，歡迎追蹤<a href='https://www.facebook.com/pyladies.kaohsiung' target='_blank'>粉絲專頁</a>獲得最新消息</li>`;

    const years = Array.from(new Set(past.map(eventYear))).sort((a, b) => b - a);
    if (years.length > 0) currentYear = String(years[0]);

    renderYearFilter();
    renderPastList();
    bindDelegatedEvents();
    injectEventJsonLd(events);

    // Landed on a shared #event-N link — open that event straight away.
    syncDialogToHash();
  }

  function injectEventJsonLd(events) {
    const SITE_URL = "https://kaohsiung.pyladies.com/";
    const ORGANIZER = {
      "@type": "Organization",
      name: "PyLadies Kaohsiung",
      url: SITE_URL,
    };

    const items = events
      .map((e) => buildEventSchema(e, SITE_URL, ORGANIZER))
      .filter(Boolean);
    if (items.length === 0) return;

    const payload = items.length === 1 ? items[0] : items;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-event-jsonld", "");
    script.textContent = JSON.stringify(payload);
    document.head.appendChild(script);
  }

  function buildEventSchema(e, SITE_URL, ORGANIZER) {
    if (!e.datetimes || e.datetimes.length === 0) return null;
    const sorted = e.datetimes.slice().sort((a, b) => {
      return (
        parseLocalDateTime(a.datetime_start) -
        parseLocalDateTime(b.datetime_start)
      );
    });
    const startDate = toIsoLocal(sorted[0].datetime_start);
    const endDate = toIsoLocal(sorted[sorted.length - 1].datetime_end);

    const locations = (e.locations || []).map((l) => {
      if (l.is_online) {
        return {
          "@type": "VirtualLocation",
          url: (e.register_links && e.register_links[0]) || SITE_URL,
          name: l.name,
        };
      }
      const place = { "@type": "Place", name: l.name };
      if (l.address) {
        place.address = {
          "@type": "PostalAddress",
          streetAddress: l.address,
          addressCountry: "TW",
        };
      }
      return place;
    });

    const hasOnline = (e.locations || []).some((l) => l.is_online);
    const hasOffline = (e.locations || []).some((l) => !l.is_online);
    let attendanceMode = "https://schema.org/OfflineEventAttendanceMode";
    if (hasOnline && hasOffline)
      attendanceMode = "https://schema.org/MixedEventAttendanceMode";
    else if (hasOnline)
      attendanceMode = "https://schema.org/OnlineEventAttendanceMode";

    const performers = uniqueSpeakers(e.speakers || []).map((s) => ({
      "@type": "Person",
      name: s.info.name,
    }));

    const offers = (e.register_links || []).map((url) => ({
      "@type": "Offer",
      url,
      price: "0",
      priceCurrency: "TWD",
      availability: "https://schema.org/InStock",
      validFrom: startDate,
    }));

    const schema = {
      "@context": "https://schema.org",
      "@type": "Event",
      name: e.title,
      startDate,
      endDate,
      eventAttendanceMode: attendanceMode,
      eventStatus: "https://schema.org/EventScheduled",
      location: locations.length === 1 ? locations[0] : locations,
      organizer: ORGANIZER,
      url: SITE_URL.replace(/\/$/, "") + eventPagePath(e),
    };
    if (e.topic && e.topic.description) {
      schema.description = `${e.title} — ${e.topic.description}`;
    } else if (e.topic && e.topic.name) {
      schema.description = `${e.title}（${e.topic.name}）`;
    }
    if (performers.length > 0) schema.performer = performers;
    if (offers.length > 0) schema.offers = offers;
    return schema;
  }

  function toIsoLocal(dateTimeStr) {
    return dateTimeStr.replace(" ", "T") + "+08:00";
  }

  function firstStart(e) {
    return parseLocalDateTime(e.datetimes[0].datetime_start).getTime();
  }

  function eventYear(e) {
    return parseLocalDateTime(e.datetimes[0].datetime_start).getFullYear();
  }

  function upcomingItem(e) {
    const dateStr = formatDateRange(e.datetimes);
    const locationStr = e.locations.map((l) => l.name).join("、");
    const speakerStr = uniqueSpeakers(e.speakers)
      .map((s) => s.info.name)
      .join("、");

    const tags = e.target_audiences
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");

    const actions = (e.register_links || []).map((url) =>
      actionLink(url, "bi-ticket-perforated", "我要報名", "is-primary")
    );

    return `
      <li class="event-card event-card-list" data-year="${eventYear(e)}"
          data-event-detail="${escapeHtml(e.event_id)}"
          tabindex="0" role="button"
          aria-label="查看「${escapeHtml(e.title)}」詳細資訊">
        <header class="event-card-header">
          <span class="event-card-id">#${escapeHtml(e.event_id)}</span>
          <span class="event-card-topic">${escapeHtml(
            e.topic.name
          )}</span>
          ${tags ? `<ul class="event-card-tags">${tags}</ul>` : ""}
        </header>
        <h3 class="event-card-title">${escapeHtml(e.title)}</h3>
        <ul class="event-card-meta">
          <li><i class="bi bi-calendar-event"></i><span>${escapeHtml(
            dateStr
          )}</span></li>
          <li><i class="bi bi-geo-alt"></i><span>${escapeHtml(
            locationStr
          )}</span></li>
          <li><i class="bi bi-mic"></i><span>${escapeHtml(speakerStr)}</span></li>
        </ul>
        ${
          actions.length
            ? `<div class="event-card-actions">${actions.join("")}</div>`
            : ""
        }
        <i class="bi bi-chevron-right event-card-list-arrow" aria-hidden="true"></i>
      </li>
    `;
  }

  function listItem(e) {
    const dateStr = formatDateRange(e.datetimes);
    const locationStr = e.locations.map((l) => l.name).join("、");
    const speakerStr = uniqueSpeakers(e.speakers)
      .map((s) => s.info.name)
      .join("、");
    const year = eventYear(e);
    const tags = (e.target_audiences || [])
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");
    return `
      <li class="event-card event-card-list" data-year="${year}"
          data-event-detail="${escapeHtml(e.event_id)}"
          tabindex="0" role="button"
          aria-label="查看「${escapeHtml(e.title)}」詳細資訊">
        <header class="event-card-header">
          <span class="event-card-id">#${escapeHtml(e.event_id)}</span>
          <span class="event-card-topic">${escapeHtml(
            e.topic.name
          )}</span>
          ${tags ? `<ul class="event-card-tags">${tags}</ul>` : ""}
        </header>
        <h3 class="event-card-title">${escapeHtml(e.title)}</h3>
        <ul class="event-card-meta">
          <li><i class="bi bi-calendar-event"></i><span>${escapeHtml(
            dateStr
          )}</span></li>
          <li><i class="bi bi-geo-alt"></i><span>${escapeHtml(
            locationStr
          )}</span></li>
          <li><i class="bi bi-mic"></i><span>${escapeHtml(speakerStr)}</span></li>
        </ul>
        <i class="bi bi-chevron-right event-card-list-arrow" aria-hidden="true"></i>
      </li>
    `;
  }

  function renderYearFilter() {
    const years = Array.from(new Set(pastEvents.map(eventYear))).sort(
      (a, b) => b - a
    );
    const filterEl = document.getElementById("past-year-filter");
    if (!pastEvents.length) {
      filterEl.innerHTML = "";
      return;
    }
    const buttons = [
      ...years.map((y) =>
        filterButton(String(y), String(y), currentYear === String(y))
      ),
      filterButton("all", "全部", currentYear === "all"),
    ];
    filterEl.innerHTML = buttons.join("");
  }

  function filterButton(value, label, active) {
    return `<button type="button" class="event-year-btn${
      active ? " is-active" : ""
    }" role="tab" aria-selected="${active}" data-year="${escapeHtml(
      value
    )}">${escapeHtml(label)}</button>`;
  }

  function renderPastList() {
    const pastListEl = document.getElementById("past-list");
    const filtered = pastEvents.filter(
      (e) => matchesYear(e) && matchesSearch(e)
    );
    if (!filtered.length) {
      const msg = !pastEvents.length
        ? "尚無過往活動紀錄"
        : currentSearch
        ? `沒有符合「${currentSearch}」的活動`
        : "本年度沒有活動紀錄";
      pastListEl.innerHTML = `<li class="event-empty">${escapeHtml(msg)}</li>`;
      return;
    }
    pastListEl.innerHTML = filtered.map(listItem).join("");
  }

  function matchesYear(e) {
    return currentYear === "all" || String(eventYear(e)) === currentYear;
  }

  function matchesSearch(e) {
    if (!currentSearch) return true;
    const q = currentSearch.toLowerCase();
    if (e.title.toLowerCase().includes(q)) return true;
    if ((e.topic.name || "").toLowerCase().includes(q)) return true;
    return e.speakers.some((s) =>
      (s.info.name || "").toLowerCase().includes(q)
    );
  }

  function bindDelegatedEvents() {
    document
      .getElementById("past-year-filter")
      .addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-year]");
        if (!btn) return;
        currentYear = btn.dataset.year;
        renderYearFilter();
        renderPastList();
      });

    const searchEl = document.getElementById("past-search");
    if (searchEl) {
      searchEl.addEventListener("input", (ev) => {
        currentSearch = ev.target.value.trim();
        renderPastList();
      });
    }

    document.body.addEventListener("click", (ev) => {
      const trigger = ev.target.closest("[data-event-detail]");
      if (trigger) {
        const inner = ev.target.closest("a, button");
        if (inner && inner !== trigger && trigger.contains(inner)) return;
        ev.preventDefault();
        openDialog(trigger.dataset.eventDetail);
        return;
      }
      const shareBtn = ev.target.closest("[data-event-share]");
      if (shareBtn) {
        copyEventLink(shareBtn);
        return;
      }
      if (ev.target.closest("[data-event-dialog-close]")) {
        closeDialog();
        return;
      }
    });

    dialogEl.addEventListener("click", (ev) => {
      if (ev.target === dialogEl) closeDialog();
    });

    // Esc dismisses a modal dialog natively; catch it so the hash is cleared
    // too. Paired with the "close" listener below for engines that do fire it.
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && dialogEl.open) closeDialog();
    });
    dialogEl.addEventListener("close", onDialogClosed);

    // Back/forward, and hand-edited hashes, drive the dialog too.
    window.addEventListener("popstate", syncDialogToHash);
    window.addEventListener("hashchange", syncDialogToHash);

    document.body.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      if (ev.target.closest("a, button")) return;
      const trigger = ev.target.closest('[data-event-detail][role="button"]');
      if (!trigger) return;
      ev.preventDefault();
      openDialog(trigger.dataset.eventDetail);
    });
  }

  // The event's own static page, built by scripts/render_pages.py.
  // Cards deliberately stay in-page; this URL is what gets shared and indexed.
  function eventPagePath(e) {
    return "/events/" + e.en_abbr + "/";
  }

  function openDialog(eventId, options) {
    const e = allEvents.find((x) => String(x.event_id) === String(eventId));
    if (!e) return;
    const pushHash = !options || options.pushHash !== false;

    dialogBodyEl.innerHTML = dialogContent(e);
    dialogEl.dataset.eventId = String(e.event_id);

    if (pushHash) {
      const hash = EVENT_HASH_PREFIX + e.event_id;
      if (window.location.hash !== hash) {
        history.pushState(null, "", hash);
      }
    }

    if (!dialogEl.open) {
      if (typeof dialogEl.showModal === "function") {
        dialogEl.showModal();
      } else {
        dialogEl.setAttribute("open", "");
      }
    }
  }

  function closeDialog() {
    if (typeof dialogEl.close === "function") {
      if (dialogEl.open) dialogEl.close();
    } else {
      dialogEl.removeAttribute("open");
    }
    // Not every engine dispatches the dialog "close" event, so do the cleanup
    // here as well — onDialogClosed() is safe to run twice.
    onDialogClosed();
  }

  function onDialogClosed() {
    delete dialogEl.dataset.eventId;
    // Drop #event-N so the address bar matches what is on screen. replaceState
    // (not pushState) keeps Back pointing at wherever the visitor came from.
    if (eventIdFromHash()) {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }

  // Share the event's own page, not the #event-N hash: only a real URL gets a
  // proper preview card on Facebook / LINE / Threads.
  function eventLinkFor(eventId) {
    const e = allEvents.find((x) => String(x.event_id) === String(eventId));
    if (!e) return window.location.href;
    return window.location.origin + eventPagePath(e);
  }

  function copyEventLink(btn) {
    const url = eventLinkFor(btn.dataset.eventShare);
    writeToClipboard(url).then((ok) => {
      const original = btn.innerHTML;
      btn.innerHTML = ok
        ? '<i class="bi bi-check-lg"></i>已複製連結'
        : '<i class="bi bi-exclamation-circle"></i>複製失敗';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerHTML = original;
        btn.disabled = false;
      }, 2000);
    });
  }

  function writeToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard
        .writeText(text)
        .then(() => true)
        .catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }

  // execCommand fallback for browsers or origins without the async clipboard.
  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function eventIdFromHash() {
    const m = /^#event-([1-9][0-9]*)$/.exec(window.location.hash);
    return m ? m[1] : null;
  }

  // Single source of truth: whatever the hash says, the dialog follows.
  function syncDialogToHash() {
    const eventId = eventIdFromHash();
    if (!eventId) {
      if (dialogEl.open) closeDialog();
      return;
    }
    // Mistyped or retired id: fall back to the plain page instead of leaving
    // whatever was on screen behind an address that no longer describes it.
    if (!allEvents.some((x) => String(x.event_id) === eventId)) {
      if (dialogEl.open) closeDialog();
      else onDialogClosed();
      return;
    }
    if (dialogEl.dataset.eventId === eventId) return;
    revealEventCard(eventId);
    openDialog(eventId, { pushHash: false });
  }

  // A shared link may point at an event the current filters hide, so widen
  // them until its card is on the page, then bring it into view.
  function revealEventCard(eventId) {
    const e = allEvents.find((x) => String(x.event_id) === String(eventId));
    if (!e) return;

    const isPast = pastEvents.some(
      (p) => String(p.event_id) === String(eventId)
    );
    if (isPast) {
      let needsRerender = false;
      if (currentSearch && !matchesSearch(e)) {
        currentSearch = "";
        const searchEl = document.getElementById("past-search");
        if (searchEl) searchEl.value = "";
        needsRerender = true;
      }
      const year = String(eventYear(e));
      if (currentYear !== "all" && currentYear !== year) {
        currentYear = year;
        renderYearFilter();
        needsRerender = true;
      }
      if (needsRerender) renderPastList();
    }

    const card = document.querySelector(
      '[data-event-detail="' + String(eventId).replace(/"/g, '\\"') + '"]'
    );
    if (card) card.scrollIntoView({ block: "center" });
  }

  function dialogContent(e) {
    const wd = ["日", "一", "二", "三", "四", "五", "六"];
    const fmtDt = (s) => {
      const d = parseLocalDateTime(s);
      return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(
        d.getDate()
      )} (週${wd[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const datetimeItems = e.datetimes
      .map((dt) => {
        const start = fmtDt(dt.datetime_start);
        const endParsed = parseLocalDateTime(dt.datetime_end);
        const startParsed = parseLocalDateTime(dt.datetime_start);
        const sameDay =
          startParsed.getFullYear() === endParsed.getFullYear() &&
          startParsed.getMonth() === endParsed.getMonth() &&
          startParsed.getDate() === endParsed.getDate();
        const endStr = sameDay
          ? `${pad(endParsed.getHours())}:${pad(endParsed.getMinutes())}`
          : fmtDt(dt.datetime_end);
        return `<li>${escapeHtml(start)} – ${escapeHtml(endStr)}</li>`;
      })
      .join("");

    const locationItems = e.locations
      .map((l) => `<li>${escapeHtml(l.name)}</li>`)
      .join("");

    const speakerItems = uniqueSpeakers(e.speakers)
      .map((s) => speakerBlock(s))
      .join("");

    const tags = e.target_audiences
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isUpcoming = parseLocalDateTime(e.datetimes[0].datetime_start) >= today;
    const actions = [];
    if (isUpcoming) {
      (e.register_links || []).forEach((url) => {
        actions.push(
          actionLink(url, "bi-ticket-perforated", "我要報名", "is-primary")
        );
      });
    }
    (e.recap_links || []).forEach((rl) => {
      actions.push(actionLink(rl.url, recapIcon(rl.type), recapLabel(rl)));
    });
    actions.push(
      `<button type="button" class="event-card-action" data-event-share="${escapeHtml(
        e.event_id
      )}"><i class="bi bi-link-45deg"></i>複製連結</button>`
    );

    return `
      <header class="event-dialog-header">
        <div class="event-dialog-meta">
          <span class="event-card-id">#${escapeHtml(e.event_id)}</span>
          <span class="event-card-topic">${escapeHtml(
            e.topic.name
          )}</span>
        </div>
        <h3 class="event-dialog-title" id="event-dialog-title">${escapeHtml(
          e.title
        )}</h3>
      </header>

      <dl class="event-dialog-info">
        <dt><i class="bi bi-calendar-event"></i>時間</dt>
        <dd><ul>${datetimeItems}</ul></dd>

        <dt><i class="bi bi-geo-alt"></i>地點</dt>
        <dd><ul>${locationItems}</ul></dd>

        <dt><i class="bi bi-mic"></i>講者</dt>
        <dd><ul class="event-dialog-speakers">${speakerItems}</ul></dd>

        ${
          e.topic.description
            ? `<dt><i class="bi bi-bookmark"></i>主題</dt>
               <dd>${escapeHtml(e.topic.description)}</dd>`
            : ""
        }

        ${
          tags
            ? `<dt><i class="bi bi-people"></i>適合對象</dt>
               <dd><ul class="event-card-tags">${tags}</ul></dd>`
            : ""
        }
      </dl>

      ${
        actions.length
          ? `<div class="event-card-actions event-dialog-actions">${actions.join(
              ""
            )}</div>`
          : ""
      }
    `;
  }

  function speakerBlock(s) {
    const name = s.info.name || "";
    const intro = s.info.intro || "";
    const photo = s.info.photo;
    const links = s.info.social_links || {};
    const linkIcons = {
      personal: "bi-globe",
      linkedin: "bi-linkedin",
      fb: "bi-facebook",
      threads: "bi-at",
      ig: "bi-instagram",
      email: "bi-envelope",
    };
    const linkLabels = {
      personal: "個人網站",
      linkedin: "LinkedIn",
      fb: "Facebook",
      threads: "Threads",
      ig: "Instagram",
      email: "Email",
    };
    const linkHtml = Object.entries(links)
      .filter(([, url]) => url)
      .map(([key, url]) => {
        const href = key === "email" ? `mailto:${url}` : url;
        const icon = linkIcons[key] || "bi-link-45deg";
        const label = linkLabels[key] || key;
        return `<a href="${escapeHtml(
          href
        )}" target="_blank" rel="noopener" aria-label="${escapeHtml(
          label
        )}"><i class="bi ${icon}"></i></a>`;
      })
      .join("");

    return `
      <li class="event-dialog-speaker">
        ${
          photo
            ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(name)}" />`
            : `<span class="event-dialog-speaker-avatar"><i class="bi bi-person-circle"></i></span>`
        }
        <div>
          <strong>${escapeHtml(name)}</strong>
          ${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
          ${linkHtml ? `<div class="event-dialog-speaker-links">${linkHtml}</div>` : ""}
        </div>
      </li>
    `;
  }

  function actionLink(href, icon, label, cls = "") {
    return `<a class="event-card-action ${cls}" href="${escapeHtml(
      href
    )}" target="_blank" rel="noopener"><i class="bi ${icon}"></i>${escapeHtml(
      label
    )}</a>`;
  }

  function recapIcon(type) {
    return (
      {
        fb: "bi-facebook",
        slides: "bi-file-earmark-slides",
        video: "bi-play-btn",
        blog: "bi-journal-text",
        other: "bi-link-45deg",
      }[type] || "bi-link-45deg"
    );
  }

  function recapLabel(rl) {
    if (rl.label) return rl.label;
    const base =
      {
        fb: "活動回顧",
        slides: "講義",
        video: "錄影",
        blog: "部落格",
        other: "連結",
      }[rl.type] || "連結";
    if (rl.speaker) return `${base} (${rl.speaker})`;
    return base;
  }

  function uniqueSpeakers(speakers) {
    const seen = new Set();
    return speakers.filter((s) => {
      const key = s.speaker;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function parseLocalDateTime(s) {
    const [date, time = "00:00:00"] = s.split(" ");
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm, ss] = time.split(":").map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
  }

  function formatDateRange(datetimes) {
    const first = parseLocalDateTime(datetimes[0].datetime_start);
    const last = parseLocalDateTime(
      datetimes[datetimes.length - 1].datetime_end
    );
    const wd = ["日", "一", "二", "三", "四", "五", "六"];
    const fmtDate = (d) =>
      `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(
        d.getDate()
      )} (週${wd[d.getDay()]})`;
    const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const sameDay =
      first.getFullYear() === last.getFullYear() &&
      first.getMonth() === last.getMonth() &&
      first.getDate() === last.getDate();
    const moreThanOne =
      datetimes.length > 1 ? `（${datetimes.length} 個時段）` : "";
    if (sameDay)
      return `${fmtDate(first)} ${fmtTime(first)}–${fmtTime(
        last
      )}${moreThanOne}`;
    return `${fmtDate(first)} ${fmtTime(first)} – ${fmtDate(last)} ${fmtTime(
      last
    )}`;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
})();
