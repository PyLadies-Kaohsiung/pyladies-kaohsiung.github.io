#!/usr/bin/env python3
"""
Render the generated static pages: one page per event, plus sitemap.xml.

Called from scripts/build.py once the data has been validated and
denormalized -- it takes the same enriched event dicts that end up in
data/events.json, so a page can never disagree with the aggregate.

Each event gets its own crawlable URL:

    /events/{en_abbr}/   ->  events/{en_abbr}/index.html

which is what makes a shared link render a proper preview card on
Facebook / LINE / Threads. The hash links on the homepage (#event-{id})
keep working; they just open the dialog instead.
"""

from __future__ import annotations

import html
from datetime import datetime

SITE_URL = "https://kaohsiung.pyladies.com"
SITE_NAME = "PyLadies Kaohsiung"
OG_IMAGE = f"{SITE_URL}/assets/img/logo_horizontal.png"
GA_MEASUREMENT_ID = "G-NBDVQK5QPE"

WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]

# Homepage sections, kept in the sitemap alongside the generated event pages.
STATIC_SITEMAP_ENTRIES = [
    ("/", "weekly", "1.0"),
    ("/#about", "monthly", "0.8"),
    ("/#values", "monthly", "0.6"),
    ("/#growth", "monthly", "0.6"),
    ("/#support", "monthly", "0.6"),
    ("/#faq", "monthly", "0.7"),
    ("/#upcoming", "weekly", "0.9"),
    ("/#past", "monthly", "0.7"),
]

RECAP_ICONS = {
    "fb": "bi-facebook",
    "slides": "bi-file-earmark-slides",
    "video": "bi-play-btn",
    "blog": "bi-journal-text",
    "other": "bi-link-45deg",
}

RECAP_LABELS = {
    "fb": "活動回顧",
    "slides": "講義",
    "video": "錄影",
    "blog": "部落格",
    "other": "連結",
}

SOCIAL_ICONS = {
    "personal": ("bi-globe", "個人網站"),
    "linkedin": ("bi-linkedin", "LinkedIn"),
    "fb": ("bi-facebook", "Facebook"),
    "threads": ("bi-at", "Threads"),
    "ig": ("bi-instagram", "Instagram"),
    "email": ("bi-envelope", "Email"),
}


def e(text) -> str:
    """Escape for HTML text and double-quoted attributes alike."""
    return html.escape(str(text if text is not None else ""), quote=True)


def parse_dt(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")


def event_url(ev: dict) -> str:
    return f"{SITE_URL}/events/{ev['en_abbr']}/"


def event_page_relpath(ev: dict) -> str:
    return f"events/{ev['en_abbr']}/index.html"


def iso_local(value: str) -> str:
    """Site timezone is Asia/Taipei; the data carries no offset."""
    return value.replace(" ", "T") + "+08:00"


def fmt_datetime(value: str) -> str:
    d = parse_dt(value)
    wd = WEEKDAYS[d.weekday()]
    return f"{d.year}/{d.month:02d}/{d.day:02d} (週{wd}) {d.hour:02d}:{d.minute:02d}"


def fmt_slot(slot: dict) -> str:
    start = parse_dt(slot["datetime_start"])
    end = parse_dt(slot["datetime_end"])
    if start.date() == end.date():
        return f"{fmt_datetime(slot['datetime_start'])} – {end.hour:02d}:{end.minute:02d}"
    return f"{fmt_datetime(slot['datetime_start'])} – {fmt_datetime(slot['datetime_end'])}"


def short_date(ev: dict) -> str:
    d = parse_dt(ev["datetimes"][0]["datetime_start"])
    return f"{d.year}/{d.month:02d}/{d.day:02d}"


def meta_description(ev: dict) -> str:
    """One-line summary for search results and link preview cards."""
    locations = "、".join(l["name"] for l in ev["locations"])
    speakers = "、".join(s["info"]["name"] for s in unique_speakers(ev["speakers"]))
    parts = [f"{short_date(ev)} 於 {locations}"]
    if speakers:
        parts.append(f"講者：{speakers}")
    topic = (ev.get("topic") or {}).get("description") or ""
    if topic:
        parts.append(topic)
    parts.append(f"{SITE_NAME} 主辦。")
    return " ｜ ".join(parts)


def unique_speakers(speakers: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out = []
    for s in speakers:
        if s["speaker"] in seen:
            continue
        seen.add(s["speaker"])
        out.append(s)
    return out


def recap_label(rl: dict) -> str:
    if rl.get("label"):
        return rl["label"]
    base = RECAP_LABELS.get(rl.get("type", ""), "連結")
    if rl.get("speaker"):
        return f"{base} ({rl['speaker']})"
    return base


def speaker_block(s: dict) -> str:
    info = s["info"]
    name = info.get("name", "")
    intro = info.get("intro", "")
    photo = info.get("photo") or ""
    links = info.get("social_links") or {}

    link_html = ""
    for key, url in links.items():
        if not url:
            continue
        icon, label = SOCIAL_ICONS.get(key, ("bi-link-45deg", key))
        href = f"mailto:{url}" if key == "email" else url
        link_html += (
            f'<a href="{e(href)}" target="_blank" rel="noopener" '
            f'aria-label="{e(label)}"><i class="bi {icon}"></i></a>'
        )

    avatar = (
        f'<img src="{e(photo)}" alt="{e(name)}" />'
        if photo
        else '<span class="event-dialog-speaker-avatar">'
        '<i class="bi bi-person-circle"></i></span>'
    )
    return f"""        <li class="event-dialog-speaker">
          {avatar}
          <div>
            <strong>{e(name)}</strong>
            {f'<p>{e(intro)}</p>' if intro else ''}
            {f'<div class="event-dialog-speaker-links">{link_html}</div>' if link_html else ''}
          </div>
        </li>"""


def event_json_ld(ev: dict) -> dict:
    slots = sorted(ev["datetimes"], key=lambda d: d["datetime_start"])
    start = iso_local(slots[0]["datetime_start"])
    end = iso_local(slots[-1]["datetime_end"])

    locations = []
    for l in ev["locations"]:
        if l.get("is_online"):
            locations.append(
                {
                    "@type": "VirtualLocation",
                    "url": (ev.get("register_links") or [event_url(ev)])[0],
                    "name": l["name"],
                }
            )
            continue
        place = {"@type": "Place", "name": l["name"]}
        if l.get("address"):
            place["address"] = {
                "@type": "PostalAddress",
                "streetAddress": l["address"],
                "addressCountry": "TW",
            }
        locations.append(place)

    has_online = any(l.get("is_online") for l in ev["locations"])
    has_offline = any(not l.get("is_online") for l in ev["locations"])
    if has_online and has_offline:
        mode = "https://schema.org/MixedEventAttendanceMode"
    elif has_online:
        mode = "https://schema.org/OnlineEventAttendanceMode"
    else:
        mode = "https://schema.org/OfflineEventAttendanceMode"

    schema = {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": ev["title"],
        "description": meta_description(ev),
        "startDate": start,
        "endDate": end,
        "eventAttendanceMode": mode,
        "eventStatus": "https://schema.org/EventScheduled",
        "location": locations[0] if len(locations) == 1 else locations,
        "organizer": {
            "@type": "Organization",
            "name": SITE_NAME,
            "url": f"{SITE_URL}/",
        },
        "url": event_url(ev),
        "image": OG_IMAGE,
    }

    performers = [
        {"@type": "Person", "name": s["info"]["name"]}
        for s in unique_speakers(ev["speakers"])
    ]
    if performers:
        schema["performer"] = performers

    offers = [
        {
            "@type": "Offer",
            "url": url,
            "price": "0",
            "priceCurrency": "TWD",
            "availability": "https://schema.org/InStock",
            "validFrom": start,
        }
        for url in ev.get("register_links") or []
    ]
    if offers:
        schema["offers"] = offers
    return schema


def breadcrumb_json_ld(ev: dict) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": SITE_NAME,
                "item": f"{SITE_URL}/",
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": "活動",
                "item": f"{SITE_URL}/#upcoming",
            },
            {"@type": "ListItem", "position": 3, "name": ev["title"]},
        ],
    }


def render_event_page(ev: dict) -> str:
    import json

    url = event_url(ev)
    title = ev["title"]
    page_title = f"{title} — {SITE_NAME} 高雄"
    description = meta_description(ev)

    datetime_items = "".join(
        f"<li>{e(fmt_slot(slot))}</li>"
        for slot in sorted(ev["datetimes"], key=lambda d: d["timeslot"])
    )
    location_items = "".join(f"<li>{e(l['name'])}</li>" for l in ev["locations"])
    speaker_items = "\n".join(
        speaker_block(s) for s in unique_speakers(ev["speakers"])
    )
    tag_items = "".join(f"<li>{e(t)}</li>" for t in ev["target_audiences"])

    # Whether registration is still open depends on when the page is VIEWED,
    # not when it was built, so the links are marked and hidden client-side
    # once the event is over (mirrors the homepage behaviour).
    last_end = max(slot["datetime_end"] for slot in ev["datetimes"])
    register_actions = "".join(
        f'<a class="event-card-action is-primary" href="{e(url_)}" '
        f'target="_blank" rel="noopener">'
        f'<i class="bi bi-ticket-perforated"></i>我要報名</a>'
        for url_ in ev.get("register_links") or []
    )
    register_html = (
        f'<div class="event-card-actions event-page-register" '
        f'data-event-end="{e(iso_local(last_end))}" hidden>{register_actions}</div>'
        if register_actions
        else ""
    )

    recap_actions = "".join(
        f'<a class="event-card-action" href="{e(rl["url"])}" target="_blank" '
        f'rel="noopener"><i class="bi {RECAP_ICONS.get(rl.get("type", ""), "bi-link-45deg")}">'
        f"</i>{e(recap_label(rl))}</a>"
        for rl in ev.get("recap_links") or []
    )
    recap_html = (
        f'<div class="event-card-actions">{recap_actions}</div>' if recap_actions else ""
    )

    topic = ev.get("topic") or {}
    topic_row = (
        f"""        <dt><i class="bi bi-bookmark"></i>主題</dt>
        <dd>{e(topic.get('description'))}</dd>
"""
        if topic.get("description")
        else ""
    )

    jsonld = json.dumps(
        [event_json_ld(ev), breadcrumb_json_ld(ev)], ensure_ascii=False, indent=2
    )

    return f"""<!DOCTYPE html>
<html lang="zh-Hant">

<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id={GA_MEASUREMENT_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){{dataLayer.push(arguments);}}
    gtag('js', new Date());

    gtag('config', '{GA_MEASUREMENT_ID}');
  </script>

  <meta charset="utf-8">
  <meta content="width=device-width, initial-scale=1.0" name="viewport">
  <title>{e(page_title)}</title>
  <meta name="description" content="{e(description)}">
  <meta name="author" content="{SITE_NAME}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{e(url)}">

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="{SITE_NAME}">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(description)}">
  <meta property="og:url" content="{e(url)}">
  <meta property="og:image" content="{OG_IMAGE}">
  <meta property="og:image:alt" content="{SITE_NAME} Logo">
  <meta property="og:locale" content="zh_TW">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(title)}">
  <meta name="twitter:description" content="{e(description)}">
  <meta name="twitter:image" content="{OG_IMAGE}">

  <link rel="icon" href="/assets/img/favicon.png">

  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">

  <link href="/assets/css/main.css" rel="stylesheet">

  <script type="application/ld+json">
{jsonld}
  </script>
</head>

<body class="event-page-body">
  <header class="event-page-header">
    <div class="container">
      <a class="event-page-logo" href="/">
        <img src="/assets/img/logo_horizontal.png" alt="{SITE_NAME} 高雄">
      </a>
    </div>
  </header>

  <main class="event-page">
    <div class="container">
      <a class="event-page-back" href="/#upcoming"><i class="bi bi-arrow-left"></i>回活動列表</a>

      <article class="event-page-card">
        <header class="event-dialog-header">
          <div class="event-dialog-meta">
            <span class="event-card-id">#{e(ev['event_id'])}</span>
            <span class="event-card-topic">{e(topic.get('name'))}</span>
          </div>
          <h1 class="event-dialog-title">{e(title)}</h1>
        </header>

        <dl class="event-dialog-info">
          <dt><i class="bi bi-calendar-event"></i>時間</dt>
          <dd><ul>{datetime_items}</ul></dd>

          <dt><i class="bi bi-geo-alt"></i>地點</dt>
          <dd><ul>{location_items}</ul></dd>

          <dt><i class="bi bi-mic"></i>講者</dt>
          <dd><ul class="event-dialog-speakers">
{speaker_items}
          </ul></dd>

{topic_row}
          <dt><i class="bi bi-people"></i>適合對象</dt>
          <dd><ul class="event-card-tags">{tag_items}</ul></dd>
        </dl>

        {register_html}
        {recap_html}
      </article>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container site-footer-bottom text-center mt-4">
      <div class="social-links">
        <a href="https://www.facebook.com/pyladies.kaohsiung" target="_blank" rel="noopener" aria-label="Facebook"><i class="bi bi-facebook"></i></a>
        <a href="mailto:kaohsiung@pyladies.com" aria-label="Email"><i class="bi bi-envelope"></i></a>
        <a href="https://ocf.neticrm.tw/civicrm/contribute/transact?reset=1&amp;id=93" target="_blank" rel="noopener" aria-label="支持我們"><i class="bi bi-heart-fill"></i></a>
      </div>
      <p>© <span>Copyright</span> <strong class="px-1 sitename">{SITE_NAME}</strong> <span>All Rights Reserved</span></p>
    </div>
  </footer>

  <script>
    // Show the registration links only while the event is still ahead.
    (function () {{
      var el = document.querySelector(".event-page-register");
      if (!el) return;
      if (new Date(el.dataset.eventEnd).getTime() >= Date.now()) {{
        el.hidden = false;
      }}
    }})();
  </script>
</body>

</html>
"""


def render_sitemap(events: list[dict]) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path, changefreq, priority in STATIC_SITEMAP_ENTRIES:
        lines += [
            "  <url>",
            f"    <loc>{SITE_URL}{path}</loc>",
            f"    <changefreq>{changefreq}</changefreq>",
            f"    <priority>{priority}</priority>",
            "  </url>",
        ]
    for ev in events:
        lines += [
            "  <url>",
            f"    <loc>{event_url(ev)}</loc>",
            f"    <lastmod>{parse_dt(ev['datetimes'][0]['datetime_start']).date()}</lastmod>",
            "    <changefreq>monthly</changefreq>",
            "    <priority>0.8</priority>",
            "  </url>",
        ]
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def build_pages(events: list[dict]) -> dict[str, str]:
    """Map repo-relative path -> file content for every generated page."""
    pages: dict[str, str] = {
        event_page_relpath(ev): render_event_page(ev) for ev in events
    }
    pages["sitemap.xml"] = render_sitemap(events)
    return pages
