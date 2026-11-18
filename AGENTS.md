# 1151118南投國中社團點名 - AGENTS.md

## 專案入口

- **專案名稱**：南投縣立南投國民中學 115 學年度各社團點名線上管理系統
- **專案用途**：建置南投國中全校 13 個社團之互動點名網頁系統，限定每週二第7節與第8節點名，具備 nato 密碼管制門禁、點名即時標記與統計、一鍵全員出席、多格式匯出 (Excel/CSV/友善列印) 與 GitHub Pages 線上託管。
- **主要工作目錄**：`D:\antigravity\1151118南投國中社團點名`
- **GitHub repo**：`https://github.com/yaoshuchin/1151118-nantou-club-rollcall`
- **線上網址**：`https://yaoshuchin.github.io/1151118-nantou-club-rollcall/`
- **預設 branch**：`main`
- **系統管制密碼**：`nato`

## Obsidian 對應筆記

- **Obsidian vault**：待使用者指定本機 Vault 路徑
- **專案駕駛艙**：`1151118南投國中社團點名/專案工作流程.md`

## 工作規則

- 回應優先使用繁體中文（台灣）。
- 涉及檔案操作時回報完整產出位置（使用 `file:///` 格式連結）。
- 命令列操作優先使用 Windows PowerShell 語法，Python 執行優先使用 `uv run`。
- 開工時讀本檔、讀專案交接紀錄（`handoff.md`）、檢查檔案現況與 Git 狀態。
- 收工時更新專案紀錄，進度交接寫入 `handoff.md`。
- 不把每日流水帳寫進本檔。
- 落實個資與校園資訊安全原則。

## 不要做

- 不要 commit API key、token、私人密碼或憑證。
- 不要 commit NotebookLM 個人匯出清單或筆記本 ID 清單。
- 不要自動納入無關 git 變更，commit 前先檢查 diff。
- 遵循校園資訊安全與學生隱私保護原則。
