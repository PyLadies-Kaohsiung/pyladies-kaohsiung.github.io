import { createBadgeStore } from "./badges.js";

const GOAL = 5;
// Opening questions, in order; chapters within a group are shuffled.
const FEATURED_GROUPS = [
  ["kaohsiung-taiwan"],
  ["manila-philippines", "seoul-korea"],
  ["tokyo", "taiwan"],
];
const FEATURED = FEATURED_GROUPS.flat();
const NEARBY_POOL = 5;
const TIP_COOLDOWN = 4;

// Render both languages; CSS shows the one matching <html data-ui>.
const t = (zh, en) => `<span data-lang="zh">${zh}</span><span data-lang="en">${en}</span>`;

const FIRE_STREAK = 7;
const ASIA_GOAL = 7;
const MASTER_GOAL = 30;

// Names and conditions are HTML (t() for per-language text).
// The condition stays hidden until the badge is earned.
const BADGES = [
  { id: "complete", icon: "🎯", name: "Challenge Complete",
    how: t(`答對 ${GOAL} 題，完成挑戰！`, `You got ${GOAL} right — challenge complete!`) },
  { id: "traveler", icon: "🌏", name: "World Traveler",
    how: t("答對 3 個不同大洲的 Chapter", "You named chapters from 3 continents!") },
  { id: "asia", icon: "🤝", name: "Friends of Asia",
    how: t(`累計答對 ${ASIA_GOAL} 個亞洲 Chapter`, `You named ${ASIA_GOAL} chapters across Asia!`) },
  { id: "online", icon: "💻", name: "Online Explorer",
    how: t("答對了一個線上社群！", "You spotted an online chapter!") },
  { id: "on-fire", icon: "🔥", name: "On Fire",
    how: t(`連續答對 ${FIRE_STREAK} 題`, `${FIRE_STREAK} right answers in a row!`) },
  { id: "master", icon: "🏆", name: "Logo Master",
    how: t(`累計答對 ${MASTER_GOAL} 個不同的 Chapter`, `You've named ${MASTER_GOAL} different chapters!`) },
];

const TIPS = {
  mixed: {
    zh: "PyLadies 的 Chapter 有些以國家命名，有些以城市命名；各地社群都是獨立運作的。",
    en: "Some chapters are named after countries, others after cities — and each one runs independently.",
  },
  online: {
    zh: "有些 Chapter 不屬於特定城市，而是在線上聚會。",
    en: "Some chapters aren't tied to a city — they meet online.",
  },
};

const $ = (sel) => document.querySelector(sel);
const LANG_KEY = "pyladies-game:lang";

const badges = createBadgeStore();

let chapters = [];
let byId = new Map();
let game;

// ---------- helpers ----------

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function distance(a, b) {
  if (a.lat == null || b.lat == null) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(h));
}

// ---------- question generation ----------

// Chapters this device already answered correctly are skipped until the
// badges are cleared; once every chapter is done, the full pool comes back.
function buildQueue() {
  const fresh = (id) => byId.has(id) && !badges.correctIds.has(id);
  let opening = FEATURED_GROUPS.flatMap((group) => shuffle(group)).filter(fresh);
  let rest = chapters.map((c) => c.id).filter((id) => !FEATURED.includes(id) && fresh(id));
  if (opening.length + rest.length === 0) {
    opening = FEATURED_GROUPS.flatMap((group) => shuffle(group)).filter((id) => byId.has(id));
    rest = chapters.map((c) => c.id).filter((id) => !FEATURED.includes(id));
  }
  return [...opening, ...shuffle(rest)];
}

// Two plausible wrong answers: country/city partner first, then same
// country, then nearby chapters, then anything.
function pickDistractors(answer) {
  const others = chapters.filter((c) => c.id !== answer.id);
  const picks = [];
  const add = (c) => {
    if (c && picks.length < 2 && !picks.includes(c)) picks.push(c);
  };

  const sameCountry = shuffle(others.filter((c) => answer.country && c.country === answer.country));
  if (answer.type === "city") add(sameCountry.find((c) => c.type === "country"));
  if (answer.type === "country") add(sameCountry.find((c) => c.type === "city"));
  if (answer.type === "online") add(others.find((c) => c.type === "online"));
  sameCountry.forEach(add);

  const nearby = others
    .filter((c) => !picks.includes(c) && distance(answer, c) < Infinity)
    .sort((a, b) => distance(answer, a) - distance(answer, b))
    .slice(0, NEARBY_POOL);
  shuffle(nearby).forEach(add);
  shuffle(others).forEach(add);
  return picks;
}

function isCityCountryMix(options) {
  return options.some((a) => a.type === "country" && options.some((b) => b.type === "city" && b.country === a.country));
}

function nextQuestion() {
  if (game.queue.length === 0) {
    const queue = buildQueue();
    // Avoid showing the same logo twice in a row, unless it's the only one left.
    game.queue = queue.length > 1 ? queue.filter((id) => id !== game.question?.answer.id) : queue;
  }
  const answer = byId.get(game.queue.shift());
  const options = shuffle([answer, ...pickDistractors(answer)]);
  game.question = { answer, options, mixed: isCityCountryMix(options), answered: false };
  game.number += 1;
}

// ---------- badges ----------

function checkBadges() {
  // Ids of chapters later dropped from the question pool don't count.
  const known = [...badges.correctIds].map((id) => byId.get(id)).filter(Boolean);
  const continents = new Set(known.map((c) => c.continent).filter((c) => c !== "Online"));
  const rules = {
    complete: game.correct >= GOAL,
    traveler: continents.size >= 3,
    "on-fire": game.streak >= FIRE_STREAK,
    asia: known.filter((c) => c.continent === "Asia").length >= ASIA_GOAL,
    online: known.some((c) => c.type === "online"),
    master: known.length >= MASTER_GOAL,
  };
  return BADGES.filter((b) => rules[b.id] && badges.award(b.id));
}

// ---------- rendering ----------

function show(screen) {
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.hidden = el.dataset.screen !== screen;
  });
  document.body.dataset.active = screen;
  window.scrollTo(0, 0);
}

function renderProgress() {
  const el = $("#progress");
  if (!game.completed) {
    const dots = Array.from({ length: GOAL }, (_, i) =>
      `<span class="dot${i < game.correct ? " is-on" : ""}"></span>`).join("");
    el.innerHTML = `<span class="dots" aria-hidden="true">${dots}</span><span>${game.correct} / ${GOAL} ${t("答對", "correct")}</span>`;
  } else {
    el.innerHTML = `<span>🔥 ${t("連續答對", "Streak")} <strong>${game.streak}</strong></span>`;
  }
  $("#question-no").textContent = `Q${game.number}`;
  $("#finish").hidden = !game.completed;
}

function renderQuestion() {
  const { answer, options } = game.question;
  const img = $("#logo");
  img.classList.remove("is-loaded");
  img.onload = () => img.classList.add("is-loaded");
  img.src = answer.logo;
  img.alt = "PyLadies chapter logo";

  $("#options").innerHTML = options
    .map((c, i) => `
      <button type="button" class="option" data-id="${c.id}">
        <span class="option-key">${"ABC"[i]}</span>
        <span class="option-label"><span class="en">${c.en}</span><span class="zh">${c.zh}</span></span>
      </button>`)
    .join("");

  $("#feedback").hidden = true;
  renderProgress();
  show("play");
}

function renderFeedback(correct) {
  const { answer, mixed } = game.question;
  const fb = $("#feedback");
  fb.classList.toggle("is-correct", correct);
  fb.classList.toggle("is-wrong", !correct);
  $("#result").textContent = correct ? "🎉 Correct!" : "❌ Not quite!";
  $("#answer").innerHTML = `${correct ? "" : t("正確答案：", "Answer: ")}<strong>${answer.en} ${answer.zh}</strong>` +
    (answer.country && answer.type === "city" ? ` <span class="country">· ${answer.country}</span>` : "");

  // Brazil alone has 20+ chapters, so rate-limit the tip to keep it special.
  const tipReady = game.number - game.lastTipAt >= TIP_COOLDOWN;
  const tip = !tipReady ? null : mixed ? TIPS.mixed : answer.type === "online" ? TIPS.online : null;
  if (tip) game.lastTipAt = game.number;
  $("#tip").hidden = !tip;
  $("#tip-text").innerHTML = tip ? t(tip.zh, tip.en) : "";

  const goingToComplete = !game.completed && game.correct >= GOAL;
  $("#next").innerHTML = goingToComplete ? t("完成挑戰 🎉", "Finish 🎉") : t("下一題 →", "Next Question →");
  fb.hidden = false;
  $("#next").focus({ preventScroll: true });
  fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderBadges() {
  $("#badge-grid").innerHTML = BADGES.map((b) => {
    const on = badges.earned.has(b.id);
    return `
      <li class="badge${on ? " is-earned" : ""}">
        <span class="badge-icon" aria-hidden="true">${on ? b.icon : "🔒"}</span>
        <span class="badge-name">${b.name}</span>
        ${on ? `<span class="badge-how">${b.how}</span>` : ""}
      </li>`;
  }).join("");
  const count = `${BADGES.filter((b) => badges.earned.has(b.id)).length} / ${BADGES.length}`;
  document.querySelectorAll(".badge-count").forEach((el) => { el.textContent = count; });
}

let toastTimer;
function toast(newBadges) {
  if (!newBadges.length) return;
  const el = $("#toast");
  el.innerHTML = newBadges.map((b) => `<div>${b.icon} ${t("解鎖徽章：", "Badge unlocked: ")}<strong>${b.name}</strong><small>${b.how}</small></div>`).join("");
  el.hidden = false;
  el.classList.remove("is-out");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add("is-out");
    setTimeout(() => { el.hidden = true; }, 300);
  }, 3600);
}

// ---------- flow ----------

function startGame() {
  game = { queue: buildQueue(), question: null, number: 0, correct: 0, streak: 0, completed: false, lastCorrect: false, lastTipAt: -Infinity };
  nextQuestion();
  renderQuestion();
}

function answer(id) {
  const q = game.question;
  if (q.answered) return;
  q.answered = true;

  const correct = id === q.answer.id;
  game.lastCorrect = correct;
  if (correct) {
    game.correct += 1;
    game.streak += 1;
    badges.addCorrect(q.answer.id);
  } else {
    game.streak = 0;
  }

  document.querySelectorAll(".option").forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.id === q.answer.id) btn.classList.add("is-answer");
    else if (btn.dataset.id === id) btn.classList.add("is-wrong");
  });

  renderProgress();
  renderFeedback(correct);
  toast(checkBadges());
  renderBadges();

  // Warm the cache for the next logo while the player reads the result.
  if (game.queue.length) new Image().src = byId.get(game.queue[0]).logo;
}

function next() {
  if (!game.completed && game.correct >= GOAL) {
    game.completed = true;
    show("complete");
    return;
  }
  nextQuestion();
  renderQuestion();
}

function continueGame() {
  nextQuestion();
  renderQuestion();
}

// The badges page is a side page: remember where to return to.
let backTo = "start";
function openPage(screen, from) {
  if (screen === "badges") renderBadges();
  backTo = from;
  show(screen);
}

// ---------- wiring ----------

function setLang(lang) {
  const root = document.documentElement;
  root.dataset.ui = lang;
  root.lang = lang === "zh" ? "zh-Hant" : "en";
  document.querySelectorAll("[data-set-lang]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.setLang === lang));
  });
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Storage blocked: the choice lasts for this page load only.
  }
}

function bind() {
  document.querySelectorAll("[data-set-lang]").forEach((b) =>
    b.addEventListener("click", () => setLang(b.dataset.setLang)));
  document.querySelectorAll("[data-set-lang]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.setLang === document.documentElement.dataset.ui));
  });
  $("#start").addEventListener("click", startGame);
  $("#options").addEventListener("click", (e) => {
    const btn = e.target.closest(".option");
    if (btn) answer(btn.dataset.id);
  });
  $("#next").addEventListener("click", next);
  $("#continue").addEventListener("click", continueGame);
  document.querySelectorAll(".restart").forEach((b) => b.addEventListener("click", startGame));
  document.querySelectorAll(".open-badges").forEach((b) =>
    b.addEventListener("click", () => openPage("badges", b.closest("[data-screen]").dataset.screen)));
  $("#finish").addEventListener("click", () => openPage("badges", "start"));
  document.querySelectorAll(".back").forEach((b) =>
    b.addEventListener("click", () => show(backTo === "play" && !game ? "start" : backTo)));
  $("#clear-badges").addEventListener("click", () => {
    const msg = document.documentElement.dataset.ui === "en"
      ? "Clear all badges on this device?"
      : "確定要清除這台裝置上的所有徽章嗎？";
    if (confirm(msg)) {
      badges.clear();
      renderBadges();
    }
  });

  document.addEventListener("keydown", (e) => {
    if ($('[data-screen="play"]').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const i = ["1", "2", "3", "a", "b", "c"].indexOf(e.key.toLowerCase()) % 3;
    if (!game.question.answered && i >= 0) {
      answer(game.question.options[i].id);
    } else if (game.question.answered && e.key === "Enter" && document.activeElement !== $("#next")) {
      next();
    }
  });
}

async function init() {
  bind();
  renderBadges();
  try {
    const res = await fetch("chapters.json");
    chapters = await res.json();
    byId = new Map(chapters.map((c) => [c.id, c]));
    $("#start").disabled = false;
    FEATURED.forEach((id) => { if (byId.has(id)) new Image().src = byId.get(id).logo; });
  } catch {
    $("#load-error").hidden = false;
  }
}

init();
