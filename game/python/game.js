import { QUESTIONS } from "./questions.js";

const LANG_KEY = "pyladies-game:lang";
const QR_KEY = "pyladies-game:qr-hidden";

const $ = (sel, root = document) => root.querySelector(sel);

// Render both languages; CSS shows the one matching <html data-ui>.
const t = (zh, en) => `<span data-lang="zh">${zh}</span><span data-lang="en">${en}</span>`;
const L = (text) => (typeof text === "string" ? escapeHtml(text) : t(text.zh, text.en));

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- syntax highlighting ----------

const TOKEN = /(#.*$)|(f?"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(import|from|as|for|in|if|elif|else|def|async|await|with|and|or|not|return|True|False|None)\b|(\b\d+(?:\.\d+)?\b)|(@[\w.]+)/gm;
const CLASSES = [null, "tok-comment", "tok-string", "tok-keyword", "tok-number", "tok-decorator"];

// Returns HTML. clues are wrapped in <mark> (used after answering a "guess" question).
function highlight(code, clues = []) {
  const parts = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    if (m.index > last) parts.push({ text: code.slice(last, m.index) });
    const group = m.slice(1).findIndex((g) => g !== undefined) + 1;
    parts.push({ text: m[0], cls: CLASSES[group] });
    last = m.index + m[0].length;
  }
  if (last < code.length) parts.push({ text: code.slice(last) });

  const clueRe = clues.length
    ? new RegExp(`(${clues.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g")
    : null;
  return parts.map(({ text, cls }) => {
    let html = escapeHtml(text);
    if (clueRe) html = text.split(clueRe).map((s, i) => (i % 2 ? `<mark>${escapeHtml(s)}</mark>` : escapeHtml(s))).join("");
    return cls ? `<span class="${cls}">${html}</span>` : html;
  }).join("");
}

// ---------- a tiny interpreter for "fix" questions ----------

class PyError extends Error {
  constructor(message, line) {
    super(message);
    this.line = line; // 0-based row index, or null
  }
}

const HEADERS = new Set(["if", "elif", "else", "for"]);

// Python checks indentation before running anything, so do the same.
function checkStructure(rows) {
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    if (prev && HEADERS.has(prev.line.kind)) {
      if (row.indent !== prev.indent + 1) {
        throw new PyError(`IndentationError: expected an indented block after '${prev.line.kind}' statement on line ${i}`, i);
      }
    } else if (row.indent > (prev ? prev.indent : 0)) {
      throw new PyError("IndentationError: unexpected indent", i);
    }
    // elif / else must close an if (or elif) block at the same indent.
    if (row.line.kind === "else" || row.line.kind === "elif") {
      let j = i - 1;
      while (j >= 0 && rows[j].indent > row.indent) j--;
      const opener = j >= 0 && (rows[j].line.kind === "if" || rows[j].line.kind === "elif");
      if (!opener || rows[j].indent !== row.indent || j === i - 1) {
        throw new PyError("SyntaxError: invalid syntax", i);
      }
    }
  });
  const last = rows.length - 1;
  if (last >= 0 && HEADERS.has(rows[last].line.kind)) {
    throw new PyError(`IndentationError: expected an indented block after '${rows[last].line.kind}' statement on line ${last + 1}`, last);
  }
}

function blockEnd(rows, i, end) {
  let j = i + 1;
  while (j < end && rows[j].indent > rows[i].indent) j++;
  return j;
}

function execute(rows) {
  const env = {};
  const output = [];
  const lookup = (name, i) => {
    if (!(name in env)) throw new PyError(`NameError: name '${name}' is not defined`, i);
    return env[name];
  };

  // conds joins several conditions with "and"; a line without conds is one condition.
  const test = (line, i) => (line.conds || [line]).every((c) => {
    const value = lookup(c.name, i);
    return c.op === "truthy" ? Boolean(value) : c.op === ">=" ? value >= c.value : value === c.value;
  });

  const run = (start, end) => {
    let i = start;
    while (i < end) {
      const { line } = rows[i];
      const close = blockEnd(rows, i, end);
      if (line.kind === "assign") {
        env[line.name] = line.value;
        i += 1;
      } else if (line.kind === "print") {
        output.push(line.text.replace(/\{(\w+)\}/g, (_, name) => lookup(name, i)));
        i += 1;
      } else if (line.kind === "for") {
        for (const item of lookup(line.list, i)) {
          env[line.name] = item;
          run(i + 1, close);
        }
        i = close;
      } else if (line.kind === "if") {
        // Walk the if / elif / else chain; only the first true branch runs.
        let j = i;
        let done = false;
        for (;;) {
          const branch = rows[j];
          const branchClose = blockEnd(rows, j, end);
          if (!done && (branch.line.kind === "else" || test(branch.line, j))) {
            run(j + 1, branchClose);
            done = true;
          }
          j = branchClose;
          const next = rows[j];
          const continues = j < end && branch.line.kind !== "else" && next.indent === branch.indent
            && (next.line.kind === "elif" || next.line.kind === "else");
          if (!continues) break;
        }
        i = j;
      } else {
        i = close;
      }
    }
  };

  try {
    checkStructure(rows);
  } catch (error) {
    return { output: [], error };
  }
  try {
    run(0, rows.length);
    return { output, error: null };
  } catch (error) {
    return { output, error };
  }
}

let game;

// ---------- game state ----------

// "fix" questions: run the buggy program and every fixed version through the interpreter.
function prepare(q) {
  if (q.type !== "fix") return q;
  const byId = new Map(q.lines.map((l) => [l.id, l]));
  const program = (arrangement) => {
    const rows = arrangement.map(([id, indent]) => ({ line: byId.get(id), indent }));
    return {
      code: rows.map((r) => "    ".repeat(r.indent) + r.line.code).join("\n"),
      ...execute(rows),
    };
  };
  return { ...q, base: program(q.program), options: q.options.map((o) => ({ ...o, ...program(o.program) })) };
}

function newGame() {
  return { questions: QUESTIONS.map(prepare), index: 0, options: [], answered: false, score: 0 };
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
  const total = game.questions.length;
  const dots = Array.from({ length: total }, (_, i) =>
    `<span class="dot${i < game.index ? " is-on" : ""}"></span>`).join("");
  $("#progress").innerHTML = `<span class="dots" aria-hidden="true">${dots}</span><span>${game.index + 1} / ${total}</span>`;
}

// Headings are the question itself, not the Python topic behind it.
const TEXT = {
  guess: {
    title: t("這段程式在解決什麼問題？", "What problem does this code solve?"),
    prompt: t("提示：看看裡面的英文單字 👀", "Hint: look at the English words 👀"),
  },
  fix: {
    prompt: t("要怎麼修正，才能印出 🎯 的結果？", "How do you fix it so it prints the 🎯 output?"),
  },
};

const KEYS = "ABCD";

const current = () => game.questions[game.index];

// Terminal text: plain output lines plus an error line in red.
function terminalHtml(output, error) {
  const lines = output.map(escapeHtml);
  if (error) lines.push(`<span class="term-error">${escapeHtml(error.message)}</span>`);
  return lines.join("\n") || `<span class="term-muted">${t("（沒有印出任何東西）", "(nothing printed)")}</span>`;
}

// Code card with line numbers, for questions that refer to "line 4".
function numbered(code) {
  return highlight(code).split("\n").map((line) => `<span class="ln">${line}</span>`).join("");
}

function renderQuestion() {
  const q = current();
  const fix = q.type === "fix";
  const text = TEXT[q.type];
  // A fix question's "both of the above" must stay last, so its options keep their order.
  game.options = fix ? q.options : shuffle(q.options);
  game.answered = false;

  renderProgress();
  $("#quiz-title").innerHTML = fix ? L(q.title) : text.title;
  $("#quiz-prompt").innerHTML = text.prompt;

  // Fix questions number their lines and show the target output.
  $("#quiz-code").classList.toggle("is-numbered", fix);
  $("#quiz-code").innerHTML = fix ? numbered(q.base.code) : highlight(q.code);
  $("#quiz-goal").hidden = !fix;
  if (fix) $("#quiz-goal").textContent = q.expected.join("\n");

  $("#quiz-options").innerHTML = game.options.map((o, i) => `
    <button type="button" class="option" data-id="${o.id}">
      <span class="option-key">${KEYS[i]}</span>
      <span class="option-text">${L(o.text)}</span>
    </button>`).join("");
  $("#quiz-feedback").hidden = true;
  show("quiz");
}

function answer(id) {
  if (game.answered) return;
  game.answered = true;
  const q = current();
  const fix = q.type === "fix";
  const correct = id === q.answer;
  if (correct) game.score += 1;

  document.querySelectorAll("#quiz-options .option").forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.id === q.answer) btn.classList.add("is-answer");
    else if (btn.dataset.id === id) btn.classList.add("is-wrong");
  });

  const fb = $("#quiz-feedback");
  fb.classList.toggle("is-correct", correct);
  fb.classList.toggle("is-wrong", !correct);
  $(".result", fb).textContent = correct ? "🎉 Correct!" : "❌ Not quite!";

  const term = $(".terminal", fb);
  const label = $(".term-label", fb);
  const answerEl = $(".answer", fb);
  term.hidden = !fix;
  label.hidden = !fix || correct;
  answerEl.hidden = fix || correct;

  if (fix) {
    // Run the fix they picked, so a wrong pick shows what Python would print.
    const picked = q.options.find((o) => o.id === id);
    label.innerHTML = t("只這樣改，會印出：", "With only that fix, it prints:");
    term.innerHTML = terminalHtml(picked.output, picked.error);
    $(".tip-head", fb).innerHTML = "💡";
    $(".tip-text", fb).innerHTML = L(correct ? q.tip : picked.why);
  } else {
    // Name the answer and highlight the words that give it away.
    const right = q.options.find((o) => o.id === q.answer);
    answerEl.innerHTML = `${t("正確答案：", "Answer: ")}<strong>${L(right.text)}</strong>`;
    $("#quiz-code").innerHTML = highlight(q.code, q.clues);
    $(".tip-head", fb).innerHTML = t("💡 你有發現<mark>這些字</mark>嗎？", "💡 Did you spot the <mark>clues</mark>?");
    $(".tip-text", fb).innerHTML = L(q.explain);
  }

  $(".note", fb).hidden = !q.note;
  $(".note-text", fb).innerHTML = q.note ? L(q.note) : "";

  const shot = $(".shot", fb);
  shot.hidden = !q.image;
  if (q.image) {
    $("img", shot).src = q.image.src;
    $("img", shot).alt = q.image.alt;
  }

  const last = game.index === game.questions.length - 1;
  $(".next", fb).innerHTML = last ? t("完成挑戰 🎉", "Finish 🎉") : t("下一題 →", "Next question →");
  fb.hidden = false;
  $(".next", fb).focus({ preventScroll: true });
  fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function nextQuestion() {
  if (game.index < game.questions.length - 1) {
    game.index += 1;
    renderQuestion();
  } else {
    complete();
  }
}

function complete() {
  $("#summary").innerHTML = `<li>${t(`答對 ${game.score} / ${game.questions.length} 題`, `${game.score} / ${game.questions.length} correct`)}</li>`;
  show("complete");
}

function start() {
  game = newGame();
  renderQuestion();
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

function setQrHidden(hidden) {
  $("#qr").classList.toggle("is-collapsed", hidden);
  try {
    localStorage.setItem(QR_KEY, hidden ? "1" : "0");
  } catch {
    // Storage blocked: the choice lasts for this page load only.
  }
}

function bind() {
  try {
    $("#qr").classList.toggle("is-collapsed", localStorage.getItem(QR_KEY) === "1");
  } catch {
    // Storage blocked: show the QR code by default.
  }
  $("#qr-hide").addEventListener("click", () => setQrHidden(true));
  $("#qr-show").addEventListener("click", () => setQrHidden(false));

  document.querySelectorAll("[data-set-lang]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.setLang === document.documentElement.dataset.ui));
    b.addEventListener("click", () => setLang(b.dataset.setLang));
  });

  $("#start").addEventListener("click", start);
  document.querySelectorAll(".restart").forEach((b) => b.addEventListener("click", start));
  $("#quiz-options").addEventListener("click", (e) => {
    const btn = e.target.closest(".option");
    if (btn) answer(btn.dataset.id);
  });
  $("#quiz-feedback .next").addEventListener("click", nextQuestion);

  document.addEventListener("keydown", (e) => {
    if ($('[data-screen="quiz"]').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toUpperCase();
    const i = "1234".includes(key) ? Number(key) - 1 : KEYS.indexOf(key);
    if (!game.answered && i >= 0 && i < game.options.length) {
      answer(game.options[i].id);
    } else if (game.answered && e.key === "Enter" && document.activeElement !== $("#quiz-feedback .next")) {
      nextQuestion();
    }
  });
}

bind();
