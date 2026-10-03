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
├── speakers/{handle}.json     一位講者一檔，檔名 = speaker handle（限英數、- 和 _）
├── topics.json                主題總表（人為維護）
├── locations.json             地點總表（人為維護）
├── events.json                自動產出，不要手動改
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

## Logo 猜謎遊戲（`/game/`）

PyCon TW 攤位用的「Guess the PyLadies Chapter」，獨立於上面的 build 流程：

```
game/
├── index.html / game.css / game.js
├── badges.js          徽章進度（存在 localStorage）
├── chapters.json      題庫：英文 / 中文顯示名稱、國家、大洲、經緯度
└── logos/{id}.webp    由 scripts/game_logos.py 產生，不要手動改
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