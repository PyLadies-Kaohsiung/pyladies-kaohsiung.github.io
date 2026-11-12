(function () {
  "use strict";

  const EVENT_HASH_PREFIX = "#event-";
  const CONNECTION_HASH_PREFIX = "#connection-";

  // Homepage filter groups; topics carry one of these as topic.category.
  const CATEGORIES = [
    { id: "workshop", label: "Python 工作坊" },
    { id: "talk", label: "技術與職涯經驗分享" },
    { id: "community", label: "社群交流" },
  ];
  const ROLE_ICONS = {
    booth: "bi-shop",
    talk: "bi-mic",
    partner: "bi-people",
    publication: "bi-book",
  };
  const ROLE_LABELS = {
    booth: "擺攤",
    talk: "講者",
    partner: "社群夥伴",
    publication: "刊物",
  };
  const LANG_LABELS = { zh: "中文", en: "English", ko: "한국어", ja: "日本語" };

  const dialogEl = document.getElementById("event-dialog");
  const dialogBodyEl = document.getElementById("event-dialog-body");
  let allEvents = [];
  let allConnections = [];
  let pastItems = [];
  let currentYear = "all";
  let currentCategory = "all";
  let currentSearch = "";

  function fetchJson(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  Promise.all([
    fetchJson("data/events.json"),
    // Community connections are optional: the hosted events still render if
    // this file is missing or broken.
    fetchJson("data/community-connections.json").catch(() => []),
  ])
    .then(([events, connections]) => init(events, connections))
    .catch((err) => {
      const target = document.getElementById("upcoming-list");
      if (target) {
        target.innerHTML =
          `<div class="col-12 event-empty">活動資料載入失敗：${escapeHtml(
            err.message
          )}</div>`;
      }
    });

  function init(events, connections) {
    allEvents = events;
    allConnections = connections;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items = [
      ...events.map((e) => ({ kind: "event", data: e })),
      ...connections.map((c) => ({ kind: "connection", data: c })),
    ];
    const upcoming = [];
    const past = [];
    items.forEach((it) => {
      (itemStart(it) >= today ? upcoming : past).push(it);
    });
    upcoming.sort((a, b) => itemStart(a) - itemStart(b));
    past.sort((a, b) => itemStart(b) - itemStart(a));
    pastItems = past;

    document.getElementById("upcoming-list").innerHTML = upcoming.length
      ? upcoming.map((it) => cardFor(it, true)).join("")
      : `<li class="event-empty">目前沒有即將舉辦的活動，歡迎追蹤<a href='https://www.facebook.com/pyladies.kaohsiung' target='_blank'>粉絲專頁</a>獲得最新消息</li>`;

    const years = Array.from(new Set(past.map(itemYear))).sort((a, b) => b - a);
    if (years.length > 0) currentYear = String(years[0]);

    renderYearFilter();
    renderCategoryFilter();
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

  // --- Items: a hosted event or a community connection, side by side ---

  function itemStart(it) {
    return it.kind === "event"
      ? firstStart(it.data)
      : parseLocalDateTime(it.data.date_start).getTime();
  }

  function itemYear(it) {
    return new Date(itemStart(it)).getFullYear();
  }

  function itemCategory(it) {
    if (it.kind === "connection") return "community";
    return (it.data.topic && it.data.topic.category) || "";
  }

  // The value carried by data-event-detail and the share hash.
  function itemKey(it) {
    return it.kind === "event"
      ? String(it.data.event_id)
      : "connection-" + it.data.slug;
  }

  function itemHash(it) {
    return it.kind === "event"
      ? EVENT_HASH_PREFIX + it.data.event_id
      : CONNECTION_HASH_PREFIX + it.data.slug;
  }

  function findItem(key) {
    key = String(key);
    if (key.startsWith("connection-")) {
      const slug = key.slice("connection-".length);
      const c = allConnections.find((x) => x.slug === slug);
      return c ? { kind: "connection", data: c } : null;
    }
    const e = allEvents.find((x) => String(x.event_id) === key);
    return e ? { kind: "event", data: e } : null;
  }

  function cardFor(it, isUpcoming) {
    if (it.kind === "connection") return connectionItem(it.data, isUpcoming);
    return isUpcoming ? upcomingItem(it.data) : listItem(it.data);
  }

  function connectionItem(c, isUpcoming) {
    const where = [c.city, c.venue].filter(Boolean).join("・");
    const roles = roleTags(c.roles);
    const talks = (c.talks || []).map((t) => t.title);
    const actions =
      isUpcoming && c.url
        ? [actionLink(c.url, "bi-box-arrow-up-right", "活動官網")]
        : [];
    const key = "connection-" + c.slug;
    return `
      <li class="event-card event-card-list is-connection" data-year="${new Date(
        parseLocalDateTime(c.date_start)
      ).getFullYear()}"
          data-event-detail="${escapeHtml(key)}"
          tabindex="0" role="button"
          aria-label="查看「${escapeHtml(c.title)}」詳細資訊">
        <header class="event-card-header">
          <span class="event-card-topic is-community">社群交流</span>
          <ul class="event-card-roles">${roles}</ul>
        </header>
        <h3 class="event-card-title">${escapeHtml(c.title)}</h3>
        <ul class="event-card-meta">
          <li><i class="bi bi-calendar-event"></i><span>${escapeHtml(
            formatDayRange(c.date_start, c.date_end)
          )}</span></li>
          <li><i class="bi bi-geo-alt"></i><span>${escapeHtml(where)}</span></li>
          ${
            talks.length
              ? `<li><i class="bi bi-mic"></i><span>${escapeHtml(
                  talks.join("、")
                )}</span></li>`
              : c.organizer
              ? `<li><i class="bi bi-people"></i><span>${escapeHtml(
                  c.organizer
                )}</span></li>`
              : ""
          }
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
      registerLink(url, e)
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
    const years = Array.from(new Set(pastItems.map(itemYear))).sort(
      (a, b) => b - a
    );
    const filterEl = document.getElementById("past-year-filter");
    if (!pastItems.length) {
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

  function filterButton(value, label, active, attr = "year") {
    return `<button type="button" class="event-year-btn${
      active ? " is-active" : ""
    }" role="tab" aria-selected="${active}" data-${attr}="${escapeHtml(
      value
    )}">${escapeHtml(label)}</button>`;
  }

  function renderCategoryFilter() {
    const filterEl = document.getElementById("past-category-filter");
    if (!filterEl) return;
    if (!pastItems.length) {
      filterEl.innerHTML = "";
      return;
    }
    const present = new Set(pastItems.map(itemCategory));
    filterEl.innerHTML = [
      filterButton("all", "全部類型", currentCategory === "all", "category"),
      // Everything we organised ourselves, i.e. not a community connection.
      ...(pastItems.some((it) => it.kind === "event")
        ? [filterButton("hosted", "主辦活動", currentCategory === "hosted", "category")]
        : []),
      ...CATEGORIES.filter((c) => present.has(c.id)).map((c) =>
        filterButton(c.id, c.label, currentCategory === c.id, "category")
      ),
    ].join("");
  }

  function renderPastList() {
    const pastListEl = document.getElementById("past-list");
    const filtered = pastItems.filter(
      (it) => matchesYear(it) && matchesCategory(it) && matchesSearch(it)
    );
    if (!filtered.length) {
      const msg = !pastItems.length
        ? "尚無過往活動紀錄"
        : currentSearch
        ? `沒有符合「${currentSearch}」的活動`
        : currentCategory !== "all"
        ? "這個類型在本年度沒有活動紀錄"
        : "本年度沒有活動紀錄";
      pastListEl.innerHTML = `<li class="event-empty">${escapeHtml(msg)}</li>`;
      return;
    }
    pastListEl.innerHTML = filtered.map((it) => cardFor(it, false)).join("");
  }

  function matchesYear(it) {
    return currentYear === "all" || String(itemYear(it)) === currentYear;
  }

  function matchesCategory(it) {
    if (currentCategory === "hosted") return it.kind === "event";
    return currentCategory === "all" || itemCategory(it) === currentCategory;
  }

  function matchesSearch(it) {
    if (!currentSearch) return true;
    const q = currentSearch.toLowerCase();
    const has = (s) => String(s || "").toLowerCase().includes(q);
    if (it.kind === "connection") {
      const c = it.data;
      return (
        [c.title, c.organizer, c.city, c.venue, "社群交流"].some(has) ||
        c.roles.some((r) => has(ROLE_LABELS[r])) ||
        (c.talks || []).some((t) => has(t.title) || has(t.info && t.info.name))
      );
    }
    const e = it.data;
    if (has(e.title)) return true;
    if (has(e.topic.name)) return true;
    return e.speakers.some((s) => has(s.info.name));
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

    const categoryEl = document.getElementById("past-category-filter");
    if (categoryEl) {
      categoryEl.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-category]");
        if (!btn) return;
        currentCategory = btn.dataset.category;
        renderCategoryFilter();
        renderPastList();
      });
    }

    const searchEl = document.getElementById("past-search");
    if (searchEl) {
      searchEl.addEventListener("input", (ev) => {
        currentSearch = ev.target.value.trim();
        renderPastList();
      });
    }

    document.body.addEventListener("click", (ev) => {
      // "我要報名" is handled by assets/js/register-gate.js.
      if (ev.target.closest("[data-register-gate]")) return;
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
      if (ev.key !== "Escape") return;
      if (document.querySelector(".register-dialog[open]")) return; // native Esc closes the gate only
      if (dialogEl.open) closeDialog();
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

  function openDialog(key, options) {
    const it = findItem(key);
    if (!it) return;
    const pushHash = !options || options.pushHash !== false;

    dialogBodyEl.innerHTML =
      it.kind === "event" ? dialogContent(it.data) : connectionDialog(it.data);
    dialogEl.dataset.eventId = itemKey(it);

    if (pushHash) {
      const hash = itemHash(it);
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
  // proper preview card on Facebook / LINE / Threads. Community connections
  // have no page of their own yet, so they share the homepage hash.
  function eventLinkFor(key) {
    const it = findItem(key);
    if (!it) return window.location.href;
    if (it.kind === "connection") {
      return window.location.origin + window.location.pathname + itemHash(it);
    }
    return window.location.origin + eventPagePath(it.data);
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

  // Returns the item key (see itemKey) the hash points at, or null.
  function eventIdFromHash() {
    const hash = window.location.hash;
    let m = /^#event-([1-9][0-9]*)$/.exec(hash);
    if (m) return m[1];
    m = /^#connection-([a-z0-9-]+)$/.exec(hash);
    return m ? "connection-" + m[1] : null;
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
    if (!findItem(eventId)) {
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
    const it = findItem(eventId);
    if (!it) return;

    const isPast = pastItems.some((p) => itemKey(p) === itemKey(it));
    if (isPast) {
      let needsRerender = false;
      if (currentSearch && !matchesSearch(it)) {
        currentSearch = "";
        const searchEl = document.getElementById("past-search");
        if (searchEl) searchEl.value = "";
        needsRerender = true;
      }
      if (!matchesCategory(it)) {
        currentCategory = "all";
        renderCategoryFilter();
        needsRerender = true;
      }
      const year = String(itemYear(it));
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
          registerLink(url, e)
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

  // How we took part (擺攤 / 講者 ...): outlined with an icon so it never
  // reads like the grey target-audience tags on hosted events.
  function roleTags(roles) {
    return roles
      .map(
        (r) =>
          `<li><i class="bi ${ROLE_ICONS[r] || "bi-dot"}"></i>${escapeHtml(
            ROLE_LABELS[r] || r
          )}</li>`
      )
      .join("");
  }

  function connectionDialog(c) {
    const where = [c.city, c.venue].filter(Boolean).join("・");
    const roles = roleTags(c.roles);

    const talkItems = (c.talks || [])
      .map((t) => {
        const when =
          t.datetime_start && t.datetime_end
            ? formatDateRange([
                { datetime_start: t.datetime_start, datetime_end: t.datetime_end },
              ])
            : "";
        const meta = [when, t.language].filter(Boolean).join("・");
        const links = [
          t.url ? actionLink(t.url, "bi-easel", "議程頁面") : "",
          t.slides ? actionLink(t.slides, "bi-file-earmark-slides", "講義") : "",
        ].join("");
        return `
          <li class="event-dialog-talk">
            <strong>${escapeHtml(t.title)}</strong>
            ${meta ? `<p class="event-dialog-talk-meta">${escapeHtml(meta)}</p>` : ""}
            <ul class="event-dialog-speakers">${speakerBlock(t)}</ul>
            ${links ? `<div class="event-card-actions">${links}</div>` : ""}
          </li>`;
      })
      .join("");

    const mentionItems = (c.mentions || [])
      .map((m) => {
        const meta = [
          m.author,
          m.source,
          m.date ? m.date.replace(/-/g, "/") : "",
          LANG_LABELS[m.lang] || "",
        ]
          .filter(Boolean)
          .join("・");
        return `<li><a href="${escapeHtml(
          m.url
        )}" target="_blank" rel="noopener">${escapeHtml(
          m.title
        )}<i class="bi bi-box-arrow-up-right"></i></a><span>${escapeHtml(
          meta
        )}</span></li>`;
      })
      .join("");

    const actions = [];
    if (c.url) actions.push(actionLink(c.url, "bi-box-arrow-up-right", "活動官網"));
    (c.recap_links || []).forEach((rl) => {
      actions.push(actionLink(rl.url, recapIcon(rl.type), recapLabel(rl)));
    });
    actions.push(
      `<button type="button" class="event-card-action" data-event-share="${escapeHtml(
        "connection-" + c.slug
      )}"><i class="bi bi-link-45deg"></i>複製連結</button>`
    );

    return `
      <header class="event-dialog-header">
        <div class="event-dialog-meta">
          <span class="event-card-topic is-community">社群交流</span>
          <ul class="event-card-roles">${roles}</ul>
        </div>
        <h3 class="event-dialog-title" id="event-dialog-title">${escapeHtml(
          c.title
        )}</h3>
      </header>

      <dl class="event-dialog-info">
        <dt><i class="bi bi-calendar-event"></i>時間</dt>
        <dd>${escapeHtml(formatDayRange(c.date_start, c.date_end))}</dd>

        <dt><i class="bi bi-geo-alt"></i>地點</dt>
        <dd>${escapeHtml(where)}</dd>

        ${
          c.organizer
            ? `<dt><i class="bi bi-people"></i>主辦</dt>
               <dd>${escapeHtml(c.organizer)}</dd>`
            : ""
        }

        ${
          talkItems
            ? `<dt><i class="bi bi-mic"></i>演講</dt>
               <dd><ul class="event-dialog-talks">${talkItems}</ul></dd>`
            : ""
        }

        ${
          mentionItems
            ? `<dt><i class="bi bi-chat-quote"></i>他們怎麼說</dt>
               <dd><ul class="event-dialog-mentions">${mentionItems}</ul></dd>`
            : ""
        }
      </dl>

      <div class="event-card-actions event-dialog-actions">${actions.join("")}</div>
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

  function registerLink(url, e) {
    // Men can join online sessions only, so the gate's note depends on whether
    // this event has an online location.
    const hasOnline = (e.locations || []).some((l) => l.is_online);
    return `<a class="event-card-action is-primary" href="${escapeHtml(
      url
    )}" target="_blank" rel="noopener" data-register-gate data-has-online="${hasOnline ? "1" : "0"}"><i class="bi bi-ticket-perforated"></i>我要報名</a>`;
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

  // For date-only items (community connections): "2026/10/17 (週六) – 10/18 (週日)".
  function formatDayRange(start, end) {
    const wd = ["日", "一", "二", "三", "四", "五", "六"];
    const s = parseLocalDateTime(start);
    const fmt = (d, withYear) =>
      `${withYear ? d.getFullYear() + "/" : ""}${pad(d.getMonth() + 1)}/${pad(
        d.getDate()
      )} (週${wd[d.getDay()]})`;
    if (!end || end === start) return fmt(s, true);
    const e = parseLocalDateTime(end);
    return `${fmt(s, true)} – ${fmt(e, e.getFullYear() !== s.getFullYear())}`;
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
