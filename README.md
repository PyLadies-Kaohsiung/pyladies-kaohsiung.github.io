# PyLadies Kaohsiung 高雄

社群官網原始碼。靜態網站（HTML / CSS / JS + Bootstrap），透過 GitHub Pages 部署。

線上網址：<https://pyladies-kaohsiung.github.io/>

---

## 在本機開發

頁面之間用 `fetch()` 載 JSON，**直接用瀏覽器開 `.html` 檔（`file://`）會被 CORS 擋**。請用以下腳本啟動本機 HTTP 伺服器：

```bash
./scripts/serve.sh                      # 預設 http://127.0.0.1:8000/index.html
PORT=9000 ./scripts/serve.sh            # 自訂 port
PAGE=events.html ./scripts/serve.sh     # 預先開特定頁
```

`Ctrl-C` 停止。

---

## 活動 / 講者資料管理

每場活動、每位講者各自一個 JSON 檔，由 `scripts/build.py` 驗證並產出：

- denormalized 的 `data/events.json` / `data/speakers.json` 給前端 fetch
- 每場活動一頁的靜態頁 `events/{en_abbr}/index.html`
- `sitemap.xml`

### 資料夾結構

```
data/
├── events/{1,2,3,...}.json   一場活動一檔，檔名 = event_id（流水號）
├── community-connections/{slug}.json
│                              社群交流（其他社群的活動：擺攤、講者等），不編號，檔名 = slug
├── speakers/{handle}.json     一位講者一檔，檔名 = speaker handle（限英數、- 和 _）
├── topics.json                主題總表（人為維護）
├── locations.json             地點總表（人為維護）
├── events.json                自動產出，不要手動改
├── community-connections.json 自動產出，不要手動改
└── speakers.json              自動產出，不要手動改

events/{en_abbr}/index.html    自動產出，不要手動改
sitemap.xml                    自動產出，不要手動改

schemas/
└── *.schema.json              JSON Schema，定義各檔案欄位規則

scripts/
├── build.py                   驗證 + 產出（進入點）
└── render_pages.py            靜態頁與 sitemap 的 HTML 樣板
```

### 活動靜態頁

每場活動都有自己的網址 `https://kaohsiung.pyladies.com/events/{en_abbr}/`，帶各自的
`<title>`、description、OG / Twitter meta 與 schema.org Event 結構化資料 —— 這是把連結貼到
Facebook / LINE 時能跑出正確預覽卡片的關鍵（首頁的 `#event-{id}` 錨點做不到，因為 `#`
後面的內容不會送到伺服器）。

首頁的活動卡片維持原本「點了在同一頁開彈窗」的行為，不會跳頁；彈窗裡的「複製連結」
複製的才是上面這個靜態頁網址。搜尋引擎則透過 `sitemap.xml`（`robots.txt` 有指向）
收錄這些頁面。

`en_abbr` 就是網址，所以**改 `en_abbr` 等同換網址**，舊連結會失效。改名後跑一次 build，
舊資料夾會自動被刪掉。

### 新增一場活動

1. 在 `data/events/` 建一個新檔，檔名為下一個流水號（如 `4.json`）
2. 必填欄位：`event_id`（= 檔名）、`en_abbr`、`title`、`datetimes`、`locations`、`speakers`、`topic_id`、`target_audiences`
3. `topic_id` 必須在 `data/topics.json` 內；`locations[]` 必須在 `data/locations.json` 內
4. 若用到新講者，先在 `data/speakers/` 加講者檔
5. 跑 build：

```bash
uv run scripts/build.py
```

6. `git add data/ && git commit`（pre-commit hook 會再驗一次）

### 修改主題或地點

直接編輯 `data/topics.json` 或 `data/locations.json`，再跑 `uv run scripts/build.py`。

---

## 共用文字（`data/site-copy.json`）

好幾頁都會出現的同一段文字（例如社群介紹），只寫在 `data/site-copy.json` 一個地方，
`build.py` 會把它填進頁面上標記好的位置：

```html
<!-- site-copy:intro class="hero-text" -->
  ...這裡的內容每次 build 都會被覆蓋...
<!-- /site-copy:intro -->
```

- 每個 key 是一個段落陣列（可以寫 HTML 連結），輸出成 `<p>`；`class="..."` 可省略。
- 目前 `intro` 用在首頁第一屏和關於我們的 Who We Are。
- 要改文字：改 JSON → `uv run scripts/build.py`。**不要直接改頁面**，`--check` 會失敗、
  下次 build 也會被蓋掉。
- 年度回顧（`recap/2026/`）要跟年刊一致，刻意不用共用文字。

---

## Logo 猜謎遊戲（`/game/pyladies/`）

PyCon TW 攤位用的「Guess the PyLadies Chapter」，獨立於上面的 build 流程：

```
game/
├── index.html             轉址到 pyladies/（舊的攤位 QR code 指向 /game/）
└── pyladies/
    ├── index.html / game.css / game.js
    ├── badges.js          徽章進度（存在 localStorage）
    ├── chapters.json      題庫：英文 / 中文顯示名稱、國家、大洲、經緯度
    ├── qr.svg             桌機版顯示的 QR code，指向 /game/pyladies/
    └── logos/{id}.webp    由 scripts/game_logos.py 產生，不要手動改
```

重新產生 QR code（網址改了才需要）：

```bash
uv run --with segno python -c "import segno; segno.make('https://kaohsiung.pyladies.com/game/pyladies/', micro=False).save('game/pyladies/qr.svg', kind='svg', border=0, dark='#012970', xmldecl=False, omitsize=True, nl=False)"
```

Logo 原圖取自 [pyladies/pyladies](https://github.com/pyladies/pyladies) 的
`www/_assets/images/`，檔名為 chapter 名稱（例如 `Kaohsiung, Taiwan.png`）。
新增或替換原圖後重新產生：

```bash
uv run scripts/game_logos.py 原圖資料夾                       # 全部
uv run scripts/game_logos.py 原圖資料夾 --only manila-philippines  # 單一 chapter
```

---

## 開發環境設定（一次性）

依賴用 [uv](https://docs.astral.sh/uv/) 管理，自動驗證用 [pre-commit](https://pre-commit.com/)：

```bash
# 安裝 Python 依賴（建立 .venv）
uv sync

# 安裝 git pre-commit hook
uv tool install pre-commit
pre-commit install
```

裝好後，每次 `git commit` 會自動：
- 驗證所有 `data/**.json` 符合 schema 與跨檔規則
- 重建 `data/events.json`、`data/speakers.json`、`events/{en_abbr}/index.html` 與 `sitemap.xml`，並 stage 進這次 commit

CI 也會在 PR 時跑 `uv run scripts/build.py --check` 把關。

### 新增一筆社群交流

社群交流是「我們去參加別人辦的活動」（擺攤、演講等），和主辦活動分開存放、**不編號**，
所以不會影響主辦活動 `#1, #2, ...` 的流水號。首頁會和主辦活動排在同一條時間軸，
以「社群交流」標籤顯示，可用類型篩選。

1. 在 `data/community-connections/` 建一個新檔，檔名 = `slug`（如 `2026-pycontw.json`）
2. 必填欄位：`slug`、`title`、`date_start`（`YYYY-MM-DD`）、`city`、`roles`
3. `roles` 可複選：`booth`（擺攤）、`talk`（講者）、`partner`（社群夥伴）、`publication`（刊物）
4. 有 `talk` 時必須填 `talks[]`，`talks[].speaker` 必須在 `data/speakers/` 內
5. 其他社群寫到我們的文章放 `mentions[]`，會顯示在活動彈窗的「他們怎麼說」
6. 跑 build：`uv run scripts/build.py`

### 活動類型

`data/topics.json` 每個主題都有 `category`，決定首頁篩選分到哪一類：
`workshop`（Python 工作坊）、`talk`（技術與職涯經驗分享）、`community`（社群交流）。
