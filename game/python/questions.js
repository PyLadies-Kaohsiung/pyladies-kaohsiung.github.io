// Question bank for the Python Mini Challenge, asked in this order.
// Text shown to players is { zh, en }; code is the same in both languages.
//
// type "guess": what problem does this code solve?
//   clues: words highlighted after answering. image: optional screenshot shown with the answer.
//
// type "fix": one buggy program shown with line numbers; each option is a fix, given as a
//   full program ([lineId, indent] rows). game.js runs every version through a tiny
//   interpreter, so a wrong pick shows what Python would really print.
//   Line kinds the interpreter understands:
//     assign { name, value }      if / elif { name, op, value }  (op: "==", ">=", or "truthy")
//       or if / elif { conds: [{ name, op, value }, ...] }  (conditions joined with "and")
//     else      for { name, list }      print { text }  ({name} in text is replaced by that variable)
//   Options keep their order (the last one is "both of the above").
//   note: optional message shown after any answer, right or wrong.
export const QUESTIONS = [
  {
    id: "images",
    type: "guess",
    code: 'import requests\nfrom bs4 import BeautifulSoup\n\nurl = "https://example.com/gallery"\nsoup = BeautifulSoup(requests.get(url).text, "html.parser")\nfor i, img in enumerate(soup.select("img")):\n    data = requests.get(img["src"]).content\n    with open(f"photo_{i}.jpg", "wb") as f:\n        f.write(data)',
    options: [
      { id: "soup", text: { zh: "要求智慧家電煮一鍋好湯", en: "Request a smart appliance to cook a pot of soup" } },
      { id: "download", text: { zh: "把網頁上的圖片一次全部下載下來", en: "Download every image on a web page at once" } },
      { id: "upload", text: { zh: "把照片上傳到網路相簿", en: "Upload photos to an online album" } },
    ],
    answer: "download",
    clues: ["img", "photo", ".jpg", "write"],
    explain: {
      zh: "這題來自我們的 <strong>Python 入門工作坊</strong>：<code>requests</code> 去拿網頁，<code>BeautifulSoup</code> 找出所有圖片，一張張存成檔案，不用再一直按右鍵另存新檔！同樣的，金融數據工作坊也會用到 <code>requests</code> 抓取股價資訊。",
      en: "This one comes from our <strong>Python fundamental workshop</strong>: <code>requests</code> fetches the page, <code>BeautifulSoup</code> finds every image, and each one is saved to a file — no more right-click → Save As! Our finance data workshop uses <code>requests</code> to fetch stock data too.",
    },
  },
  {
    id: "stock",
    image: { src: "streamlit-stock.png", alt: "Streamlit stock chart page" },
    type: "guess",
    code: 'import streamlit as st\nimport yfinance as yf\n\nst.title("股價走勢")\nstock = st.selectbox("選擇股票", ["NVDA", "AAPL", "GOOGL"])\nprice = yf.download(stock, start="2026-01-01")\nst.line_chart(price["Close"])',
    options: [
      { id: "trade", text: { zh: "自動買賣股票", en: "Trade stocks automatically" } },
      { id: "web", text: { zh: "做一個可以選股票、看股價走勢圖的網頁", en: "Make a web page where you pick a stock and see its price chart" } },
      { id: "revenue", text: { zh: "查公司營收", en: "Look up company revenue" } },
    ],
    answer: "web",
    clues: ["download", "selectbox", "line_chart"],
    explain: {
      zh: "這題來自我們的<strong>金融數據工作坊</strong>：<code>yfinance</code> 下載股價，<code>streamlit</code> 做出下拉選單和折線圖，不用刻 HTML、不用撰寫後端 API，就能做出一個互動式網頁。",
      en: "This one comes from our <strong>finance data workshop</strong>: <code>yfinance</code> downloads prices and <code>streamlit</code> builds the dropdown and line chart — no hand-written HTML, no backend API, and you get an interactive web page.",
    },
  },
  {
    id: "drone",
    type: "guess",
    code: 'from djitellopy import Tello\n\ndrone = Tello()\ndrone.connect()\ndrone.takeoff()\ndrone.move_up(50)\ndrone.rotate_clockwise(360)\ndrone.land()',
    options: [
      { id: "car", text: { zh: "遙控玩具車繞圈", en: "Drive a toy car in circles" } },
      { id: "fly", text: { zh: "讓無人機起飛、往上飛 50 公分、轉一圈，再降落", en: "Make a drone take off, rise 50 cm, spin around and land" } },
      { id: "photo", text: { zh: "幫空拍照片修圖", en: "Edit aerial photos" } },
    ],
    answer: "fly",
    clues: ["takeoff", "move_up", "rotate_clockwise", "land"],
    explain: {
      zh: "<code>takeoff</code>（起飛）、<code>move_up</code>（往上）、<code>rotate_clockwise</code>（順時針轉）、<code>land</code>（降落），讀起來就像在下指令。<strong>Python 也可以控制硬體！</strong>在各大年會，都有機會看到 Python 的各種應用。",
      en: "<code>takeoff</code>, <code>move_up</code>, <code>rotate_clockwise</code>, <code>land</code> — it reads like a list of commands. <strong>Python can control hardware too!</strong> At conferences everywhere you'll see Python used in all sorts of ways.",
    },
  },
  {
    id: "pyladies",
    type: "fix",
    title: { zh: "PyLadies Kaohsiung 的活動只能女性參加嗎？", en: "Are PyLadies Kaohsiung events women-only?" },
    lines: [
      { id: "a", code: 'gender = "男"', kind: "assign", name: "gender", value: "男" },
      { id: "b", code: "is_online = True", kind: "assign", name: "is_online", value: true },
      { id: "c", code: "has_passport_stamp = False", kind: "assign", name: "has_passport_stamp", value: false },
      { id: "C", code: "has_passport_stamp = True", kind: "assign", name: "has_passport_stamp", value: true },
      { id: "d", code: 'if gender == "女":', kind: "if", name: "gender", op: "==", value: "女" },
      { id: "e", code: 'print("歡迎參加 🎉")', kind: "print", text: "歡迎參加 🎉" },
      {
        id: "f", code: "elif is_online and has_passport_stamp:", kind: "elif",
        conds: [{ name: "is_online", op: "truthy" }, { name: "has_passport_stamp", op: "truthy" }],
      },
      { id: "g", code: 'print("歡迎參加線上活動 💻")', kind: "print", text: "歡迎參加線上活動 💻" },
      { id: "h", code: "else:", kind: "else" },
      { id: "i", code: 'print("線上請先參加高雄社群活動集章")', kind: "print", text: "線上請先參加高雄社群活動集章" },
    ],
    program: [["a", 0], ["b", 0], ["c", 0], ["d", 0], ["e", 1], ["f", 0], ["g", 0], ["h", 0], ["i", 1]],
    expected: ["歡迎參加線上活動 💻"],
    options: [
      {
        id: "indent",
        text: { zh: "第 7 行要縮排", en: "Indent line 7" },
        program: [["a", 0], ["b", 0], ["c", 0], ["d", 0], ["e", 1], ["f", 0], ["g", 1], ["h", 0], ["i", 1]],
        why: {
          zh: "縮排修好了，程式可以跑，但 <code>has_passport_stamp</code> 還是 <code>False</code>，所以走到 <code>else</code>。",
          en: "The indentation is fixed and it runs, but <code>has_passport_stamp</code> is still <code>False</code>, so it lands in <code>else</code>.",
        },
      },
      {
        id: "true",
        text: { zh: "第 3 行要換成 True", en: "Change line 3 to True" },
        program: [["a", 0], ["b", 0], ["C", 0], ["d", 0], ["e", 1], ["f", 0], ["g", 0], ["h", 0], ["i", 1]],
        why: {
          zh: "護照章有了，但第 7 行沒有縮排，Python 不知道它屬於 <code>elif</code>，程式根本跑不起來。",
          en: "The stamp is there now, but line 7 isn't indented, so Python can't tell it belongs to the <code>elif</code> and won't run at all.",
        },
      },
      {
        id: "both",
        text: { zh: "以上皆是", en: "Both of the above" },
        program: [["a", 0], ["b", 0], ["C", 0], ["d", 0], ["e", 1], ["f", 0], ["g", 1], ["h", 0], ["i", 1]],
      },
    ],
    answer: "both",
    tip: {
      zh: "兩個地方都要改！縮排讓第 7 行屬於 <code>elif</code>，<code>True</code> 讓條件成立。",
      en: "Both need fixing! Indenting line 7 puts it inside the <code>elif</code>, and <code>True</code> makes the condition pass.",
    },
    // Shown after any answer, right or wrong.
    note: {
      zh: "PyLadies Kaohsiung 的活動<strong>不是一律只限女性</strong>，要看活動形式：目前實體活動雖然僅限女性，但只要有<strong>高雄社群護照章</strong>，任何人都能參加<strong>線上活動</strong> 💻",
      en: "PyLadies Kaohsiung events <strong>aren't all women-only</strong> — it depends on the format: in-person events are currently women-only, but anyone with a <strong>Kaohsiung community passport stamp</strong> can join <strong>online events</strong> 💻",
    },
  },
  {
    id: "discord",
    image: { src: "../../assets/img/recap/2026/review1-channel.png", alt: "PyLadies Kaohsiung Discord bot reviewing a sign-up form" },
    type: "guess",
    code: 'import random\nimport discord\n\n@tree.command(name="pick-meal")\nasync def pick_meal(interaction: discord.Interaction):\n    lunch = ["麥當勞", "八方雲集", "7-11", "すき家"]\n    meal = random.choice(lunch)\n    await interaction.response.send_message(f"推薦你吃 {meal}")',
    options: [
      { id: "kcal", text: { zh: "計算午餐熱量", en: "Count the calories in lunch" } },
      { id: "bot", text: { zh: "在聊天群組輸入 /pick-meal，機器人幫你抽午餐", en: "Type /pick-meal in a group chat and a bot picks lunch for you" } },
      { id: "sms", text: { zh: "傳簡訊揪朋友吃飯", en: "Text friends to grab lunch" } },
    ],
    answer: "bot",
    clues: ["random", "choice", "pick-meal", "send_message"],
    explain: {
      zh: "<code>random.choice</code> 是「隨機選一個」，<code>send_message</code> 是「回訊息」。PyLadies Kaohsiung 也打造了 Discord Bot 讓運行社群更省力！來加入我們的社群，參與後續活動或跟大家交流吧！",
      en: "<code>random.choice</code> means “pick one at random” and <code>send_message</code> replies. PyLadies Kaohsiung has built a Discord bot too, making the community easier to run! Come join our community for upcoming events and to chat with everyone!",
    },
  },
];
