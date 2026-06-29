# CDE 題庫式問卷格式規格(SurveyForm / SurveyBank)

> 目的:把「題庫式問卷」抽象為一種通用 CDE 顯示格式,讓**各類考評表、滿意度調查、公告回覆表**共用同一套資料結構、JSON 配置與渲染引擎。

---

## 1. 兩個新 FormType

| FormType | 用途 | 角色 |
|---|---|---|
| `SurveyBank` | 題庫**設計維護**(四層巢狀:題庫→群組→問題→選項) | HR / 系統管理者建題庫 |
| `SurveyForm` | 把題庫**渲染成問卷**供填寫,作答存入 response/answer | 受評者 / 受訪者 / 公告對象 |

兩者沿用既有 CDE 四參數派工契約(`@ProgInfo`/`@UserInfo`/`@InputData` → `@ReturnMsg`/`@ReturnData`)與 `DocStatus` 狀態機。`SurveyBank` 可直接用既有 Master-Detail 引擎(題庫為主檔,群組/問題/選項為三層巢狀明細);`SurveyForm` 需新增 `renderSurvey()` 渲染分支(見 §8)。

---

## 2. 資料模型(7 張表 / 兩層分離)

所有表共用 `RowHeader`(RowGuid / EntityID='hrm' / Status / CreatedAt·UpdatedAt / CreatedBy·UpdatedBy)。

### 定義層 — 可重複使用的題庫

| 表 | 說明 | 關鍵欄位 |
|---|---|---|
| `survBank` | 題庫主檔 | BankCode(UNIQUE)、BankName、**BankType**(EVAL/SATISFY/REPLY)、**ScoringMode**(none/weighted/sum)、Version、PassScore、Anonymous、Intro、ThankYou、GradeRule(JSON)、EffectiveDate、DocStatus |
| `survBankGroup` | 題庫問題群組 | BankCode(FK)、GroupCode、GroupName、GroupDesc、**GroupWeight**、DisplayOrder |
| `survBankQuestion` | 題庫問題 | BankCode(FK)、GroupCode(FK)、QuestionCode、QuestionText、**QuestionType**、IsRequired、**QuestionWeight**、MaxScore、HelpText、Placeholder、Min/Max/Step、**Condition**(JSON)、DisplayOrder |
| `survBankOption` | 題庫問題選項 | BankCode(FK)、QuestionCode(FK)、OptionCode、OptionText、**OptionScore**、AllowInput、IsExclusive、DisplayOrder |

### 作答層 — 填寫實例

| 表 | 說明 | 關鍵欄位 |
|---|---|---|
| `survResponse` | 填寫單主檔 | ResponseNo(UNIQUE)、BankCode(FK)、RespondentType(EMP/ANON)、RespondentNo、**RefSourceType/RefSourceNo**(連回考評單/公告)、TotalScore、Grade、DocStatus(0草稿/1送出)、SubmittedAt |
| `survAnswer` | 答案明細 | ResponseNo(FK)、GroupCode、QuestionCode、**AnswerValue**(選項碼 CSV / 數值 / 文字)、AnswerText(其他/補述)、AnswerScore |

> **業務鍵**:裸碼 UNIQUE,FK 參照裸碼(同 HRM 慣例)。`survBankQuestion` 矩陣題的子題以 `SubQuestions[]` 表示,作答以 `AnswerValue` 存 `子題碼:選項碼` 對應。

---

## 3. SurveySpec JSON Schema(新 JSON 格式核心)

一份 `SurveyForm` config 在 `SurveySpec` 內攜帶完整題庫樹;`DoInit` 由後端依 `survBank*` 組裝後回傳。

```jsonc
{
  "FuncCode": "survSatis2026",
  "PageMeta": { "FormType": "SurveyForm", "PageTitle": "...", "Icon": "..." },
  "Resources": { "CodeSets": { "BankType": [...], "ScoringMode": [...] } },
  "SurveySpec": {
    "Bank": {
      "BankCode": "BANK-SAT-2026", "BankName": "...",
      "BankType": "SATISFY",              // EVAL | SATISFY | REPLY
      "ScoringMode": "none",              // none | weighted | sum
      "Version": "1.0", "Anonymous": true,
      "PassScore": 60,                    // 計分型用
      "GradeRule": [{ "Grade": "A", "Min": 85 }],
      "Intro": "...", "ThankYou": "..."
    },
    "Groups": [{
      "GroupCode": "G1", "GroupName": "...", "GroupDesc": "...",
      "GroupWeight": 40,                  // weighted 模式用(各群組加總=100)
      "DisplayOrder": 1,
      "Questions": [{
        "QuestionCode": "Q1", "QuestionText": "...",
        "QuestionType": "rating",         // 見 §4
        "IsRequired": true,
        "QuestionWeight": 50,             // 群組內加權(同群組加總=100)
        "MaxScore": 100,
        "HelpText": "...", "Placeholder": "...",
        "Min": 0, "Max": 100, "Step": 1,  // rating/number
        "Max": 5,                          // stars
        "YesScore": 100, "NoScore": 0,     // yesno 計分
        "SubQuestions": [{ "Code": "M1", "Text": "..." }],   // matrix
        "Condition": { "QuestionCode": "Q0", "Equals": "Y" },// 條件顯示
        "Options": [{
          "OptionCode": "5", "OptionText": "非常滿意",
          "OptionScore": 100,             // 計分型用
          "AllowInput": false,            // 「其他___」可輸入
          "DisplayOrder": 1
        }]
      }]
    }]
  },
  "ResponseSchema": {                      // 作答如何回存
    "ResponseEntity": "survResponse", "AnswerEntity": "survAnswer",
    "Actions": ["DoInit", "DoSaveDraft", "DoSubmit", "DoQueryResult"]
  }
}
```

---

## 4. 題型(QuestionType)目錄

| 型別 | 名稱 | 需要 Options | 計分來源 | 適用場景 |
|---|---|---|---|---|
| `single` | 單選 | ✓ | OptionScore | 公告立場、滿意度 |
| `multiple` | 複選 | ✓ | Σ OptionScore | 服務面向多選 |
| `scale` | 量表(Likert) | ✓(帶分) | OptionScore | 滿意度、態度評核 |
| `rating` | 數值評分(滑桿) | — | 值/Max×MaxScore | 考評 KPI |
| `stars` | 星級 | —(Max=N) | 星數/Max×MaxScore | 滿意度體驗 |
| `yesno` | 是/否 | — | YesScore/NoScore | 公告確認、達標與否 |
| `text` | 單行文字 | — | 不計分 | 簡短回覆 |
| `textarea` | 多行文字 | — | 不計分 | 建議、意見 |
| `number` | 數值 | — | 可選 | 量化回報 |
| `date` | 日期 | — | 不計分 | 公告排程回覆 |
| `matrix` | 矩陣(共用量表) | ✓ + SubQuestions | 各子題 OptionScore | 多面向滿意度 |

---

## 5. 計分規則(ScoringMode)

- **none**:純收集,不顯示分數(滿意度、公告回覆)。
- **weighted**:
  1. 題分:`rating = 值/Max×MaxScore`;`scale/single = OptionScore`;`yesno = Yes/NoScore`。
  2. 群組分:`Σ(題分 × QuestionWeight/100)`,以群組內已答題權重正規化。
  3. 總分:`Σ(群組分 × GroupWeight/100)`,以群組權重正規化 → 對照 `GradeRule` 判等級。
- **sum**:各題 OptionScore 直接加總(問卷型測驗)。

> 考評即 `weighted`;`PassScore`/`GradeRule` 由題庫定義。此規則與既有 B04 積分制相容——可將考評表改由本格式產生,核定時再走積分對照表→換算率。

---

## 6. 條件顯示(Condition)

問題可帶 `Condition: { QuestionCode, Equals }`;當被參照題的作答**等於**指定值時才顯示,否則隱藏並**排除於必填驗證與計分**之外。範例:公告回覆「需進一步討論」時才顯示「希望討論日期」。

---

## 7. 派工契約與 Actions

| Action | 說明 | InputData → ReturnData |
|---|---|---|
| `DoInit` | 載入題庫樹(+ 既有草稿) | ProgInfo.FuncCode → SurveySpec + 既存 Answers |
| `DoSaveDraft` | 暫存草稿 | { BankCode, Answers[] } → ResponseNo(DocStatus=0) |
| `DoSubmit` | 送出(驗必填、計分、寫 response/answer) | { BankCode, Answers[], RefSource } → { ResponseNo, TotalScore, Grade } |
| `DoQueryResult` | 結果/統計查詢 | { BankCode, Filters } → 彙總(分布/平均/逐筆) |

> `EntityID`、`RespondentNo` 由後端依 `@UserInfo` 注入(匿名問卷 `RespondentType='ANON'` 不記名);前端不可竄改。`RefSourceType/No` 讓考評單、公告與填寫單雙向追溯。

---

## 8. 引擎整合點(cde.ts)

1. **放寬 `validateConfig()`**:當 `PageMeta.FormType ∈ {SurveyForm, SurveyBank}` 時,改為要求 `SurveySpec`(而非 `View.ListView.FieldSpecs`):

   ```ts
   const ft = cfg.PageMeta?.FormType;
   if (ft === "SurveyForm" || ft === "SurveyBank") {
     if (!cfg.SurveySpec?.Bank) return "缺少 SurveySpec.Bank";
     if (!Array.isArray(cfg.SurveySpec?.Groups)) return "缺少 SurveySpec.Groups";
   } else {
     if (!cfg.View?.ListView?.FieldSpecs) return "缺少 View.ListView.FieldSpecs";
   }
   ```

2. **dispatcher 新增分支**:`bootstrap()` 依 FormType 路由 → `renderSurvey(cfg)`(SurveyForm)/ 既有 Master-Detail(SurveyBank)。

3. **`renderSurvey(cfg)`**:即 `survey_preview.html` 內的同名邏輯——逐群組逐題依 `QuestionType` 渲染輸入元件、套條件顯示、即時計分;`送出` 組裝 `Answers[]` 經 `spf_cde_DoDispatch` 以 `@Action='DoSubmit'` 寫入。preview 之 JS 即參考實作,可整段移植,移植後照慣例跑 jsdom/Puppeteer 回歸。

---

## 9. 三場景對照(同一格式)

| 場景 | BankType | ScoringMode | 代表題型 | 範例 config |
|---|---|---|---|---|
| 員工考評表 | EVAL | weighted | rating / scale / yesno | `survEvalEng.txt` |
| 滿意度調查 | SATISFY | none | scale / stars / multiple / matrix | `survSatis2026.txt` |
| 公告回覆表 | REPLY | none | yesno / single / textarea / date(條件) | `survReplyPolicy.txt` |
