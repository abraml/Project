(() => {
    // cde.ts
    var DoInit = null;
    var DEFAULT_FUNC = "hrmCompany";
    var CURRENT_FUNC = DEFAULT_FUNC;
    var CURRENT_FOLDER = "";
    var configUrlFor = (fc, folder = CURRENT_FOLDER) => folder ? `${folder}/${fc}.txt` : `${fc}.txt`;
    var ACTIVE_MODULE = (() => {
        try {
            const q = new URLSearchParams(location.search);
            return (q.get("m") || q.get("module") || "hrm").toLowerCase();
        } catch (e) {
            return "hrm";
        }
    })();
    var MENU_URL = `${ACTIVE_MODULE}/menu.txt`;
    var MENU = null;
    var APPS = [];
    var APPS_URL = "modules.txt";
    var BRAND_NAME = "\u5146\u806F EIP";
    function menuDefaultFolder() {
        return MENU && (MENU.Folder || (MENU.ModuleCode ? String(MENU.ModuleCode).toLowerCase() : "")) || "";
    }
    function folderForFunc(fc) {
        if (MENU && Array.isArray(MENU.Groups)) {
            for (const g of MENU.Groups) {
                for (const it of g.Items || []) {
                    if (it.FuncCode === fc) return it.Folder || g.Folder || menuDefaultFolder();
                }
            }
        }
        return menuDefaultFolder();
    }
    function firstFuncOfMenu() {
        if (MENU && Array.isArray(MENU.Groups)) {
            for (const g of MENU.Groups) {
                for (const it of g.Items || []) {
                    if (it && it.FuncCode) return { fc: it.FuncCode, folder: it.Folder || g.Folder || menuDefaultFolder() };
                }
            }
        }
        return null;
    }
    var __configSource = "loading";
    var ProgInfo = { SystemCode: null, ModuleCode: null, FuncCode: null, Lang: "zh-TW" };
    var UserInfo = { UserAccount: "demo.user", UserName: "\u7CFB\u7D71\u7BA1\u7406\u54E1", EntityID: null, AuthLevel: 3, RoleID: "SysAdmin" };
    var DB = [];
    var RT = {
        rows: [],
        // DoQuery 回傳之列表資料
        selected: /* @__PURE__ */ new Set(),
        // 多筆勾選 (DoDelete 批次)
        curRow: null,
        // 編輯中資料列
        drawerMode: "create",
        page: 1,
        pageSize: 100,
        total: 0,
        totalPage: 1,
        filter: {},
        sort: { Column: "SortNo", Direction: "asc" },
        detailWorking: {},
        // DetailID → 工作中明細列 (抽屜內編輯緩衝;儲存主檔時 commit)
        detailUI: { active: null, editing: {} },
        // active=目前頁籤;editing[DetailID]=編輯中 rowKey | "__new__" | null
        logSeq: 0,
        logs: []
    };
    var CODE = {};
    function codeName(set, id) {
        const c = (CODE[set] || []).find((x) => x.CodeID == id);
        return c ? c.CodeName : id ?? "";
    }
    var ROWKEY = "RowGuid";
    var KEYFIELD = null;
    var TITLEFIELD = null;
    var PARENTFIELD = null;
    var PATHFIELD = null;
    var STATUSFIELD = "Status";
    var DETAIL_DEFS = [];
    var DETAIL_DB = {};
    function detailDef(id) {
        return DETAIL_DEFS.find((d) => d.DetailID === id);
    }
    function detailCodeSet(dv, set) {
        return dv && dv.CodeSets && dv.CodeSets[set] || CODE[set] || [];
    }
    function detailCodeName(dv, set, id) {
        const c = detailCodeSet(dv, set).find((x) => x.CodeID == id);
        return c ? c.CodeName : id ?? "";
    }
    function getTreeCfg() {
        const cs = DoInit?.CustomMeta?.CustomSchema || {};
        const tc = cs.TreeConfig || cs;
        return {
            Key: tc.KeyField || cs.KeyField || null,
            Parent: tc.ParentKeyField || cs.ParentKeyField || null,
            Path: tc.PathField || cs.PathField || null,
            Title: tc.TitleField || cs.TitleField || null,
            Sep: tc.PathSeparator || "/"
        };
    }
    function initDerived() {
        CODE = DoInit.Resources?.CodeSets || {};
        RT.pageSize = DoInit.View?.ListView?.ListSpec?.Pagination?.PageSize || 100;
        visibleCols = (DoInit.View?.ListView?.FieldSpecs || []).filter((f) => f.DefaultVisible).map((f) => f.BindField);
        RT.page = 1;
        RT.selected.clear();
        const ds = DoInit.View?.ListView?.ListSpec?.DefaultSort;
        RT.sort = { Column: ds?.Field || "SortNo", Direction: ds?.Order || "asc" };
        const tc = getTreeCfg();
        ROWKEY = DoInit.View?.RowKey || DoInit.View?.ListView?.ListSpec?.RowKey || "RowGuid";
        KEYFIELD = tc.Key;
        TITLEFIELD = tc.Title;
        PARENTFIELD = tc.Parent;
        PATHFIELD = tc.Path;
        ProgInfo = { SystemCode: DoInit.SystemCode, ModuleCode: DoInit.ModuleCode, FuncCode: DoInit.FuncCode, Lang: DoInit.PageMeta?.Lang || "zh-TW" };
        UserInfo.EntityID = DoInit.EntityID ?? UserInfo.EntityID;
        DB = Array.isArray(DoInit.SeedData) ? JSON.parse(JSON.stringify(DoInit.SeedData)) : [];
        DETAIL_DEFS = DoInit.View?.DetailViews || [];
        DETAIL_DB = {};
        DETAIL_DEFS.forEach((dv) => {
            DETAIL_DB[dv.DetailID] = Array.isArray(dv.SeedData) ? JSON.parse(JSON.stringify(dv.SeedData)) : [];
        });
    }
    function nowStr() {
        const d = /* @__PURE__ */ new Date();
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    function newGuid() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            return (c == "x" ? r : r & 3 | 8).toString(16);
        });
    }
    var CDE = {
        dispatch(action, inputData) {
            const req = { Action: action, ProgInfo, UserInfo, InputData: inputData || {} };
            let res;
            try {
                const fn = CDE["_" + action];
                if (!fn) {
                    res = CDE._err("E404", "ACTION_NOT_FOUND: " + action);
                } else {
                    res = fn(inputData || {});
                }
            } catch (e) {
                res = CDE._err("E500", e.message);
            }
            logDispatch(req, res);
            return res;
        },
        _ok(data, code, msgText, affected) {
            return {
                ReturnMsg: {
                    IsSuccess: "Y",
                    Level: "Info",
                    ReturnCode: code || "OK",
                    MsgID: msgText || "MSG_SUCCESS",
                    Message: msgText || "\u64CD\u4F5C\u6210\u529F",
                    AffectedCount: affected ?? 0,
                    Lang: "zh-TW"
                }, ReturnData: data ?? {}
            };
        },
        _err(code, msg) {
            return { ReturnMsg: { IsSuccess: "N", Level: "Error", ReturnCode: code, MsgID: msg, Message: msg, AffectedCount: 0, Lang: "zh-TW" }, ReturnData: {} };
        },
        /* —— DoInit:回傳功能完整配置 —— */
        _DoInit() {
            return CDE._ok(DoInit, "OK", "MSG_INIT_SUCCESS", 0);
        },
        _DoSubmit(input) {
            const no = "RESP-" + Date.now();
            return CDE._ok({ ResponseNo: no, BankCode: input.BankCode, TotalScore: input.TotalScore ?? null, Grade: input.Grade ?? null, Answers: input.Answers || [] }, "OK", "MSG_SUBMIT_SUCCESS", (input.Answers || []).length);
        },
        _DoSaveDraft(input) {
            const no = "RESP-" + Date.now();
            return CDE._ok({ ResponseNo: no, DocStatus: "0", Answers: input.Answers || [] }, "OK", "MSG_DRAFT_SAVED", (input.Answers || []).length);
        },
        /* —— DoQuery:依 DataScope + Filter (多租戶 EntityID 物理隔離) — 通用 —— */
        _DoQuery(input) {
            const f = input.Filter || {};
            let data = DB.filter((r) => r.EntityID === UserInfo.EntityID && r[STATUSFIELD] !== "0");
            Object.keys(CODE).forEach((key) => {
                if (f[key]) data = data.filter((r) => String(r[key]) === String(f[key]));
            });
            if (f.Search1) {
                const k = String(f.Search1).toLowerCase();
                const cols = (DoInit.View.ListView.FieldSpecs || []).map((s) => s.BindField);
                data = data.filter((r) => cols.some((c) => String(r[c] ?? "").toLowerCase().includes(k)));
            }
            const ds = DoInit.View.ListView.ListSpec?.DefaultSort || {};
            const col = RT.sort?.Column || ds.Field || "SortNo", dir = RT.sort?.Direction || ds.Order || "asc";
            data = data.slice().sort((a, b) => {
                const r = String(a[col] ?? "").localeCompare(String(b[col] ?? ""), void 0, { numeric: true });
                return dir === "desc" ? -r : r;
            });
            const total = data.length, page = input.Pagination?.Page || 1, size = input.Pagination?.PageSize || RT.pageSize;
            const paged = data.slice((page - 1) * size, page * size);
            const out = paged.map((r) => ({ KeyValue: r[ROWKEY], RowAction: { CanEdit: true, CanDelete: true, CanView: true }, ...r }));
            return CDE._ok({ Data: out, Pagination: { Page: page, PageSize: size, TotalCount: total, TotalPage: Math.max(1, Math.ceil(total / size)) }, Sort: RT.sort }, "OK", "MSG_QUERY_SUCCESS", total);
        },
        /* —— DoGet:依 KeyValue 取單筆 —— */
        _DoGet(input) {
            const r = DB.find((x) => x[ROWKEY] === input.KeyValue);
            if (!r) return CDE._err("E404", "ROW_NOT_FOUND");
            return CDE._ok({ Data: { ...r } }, "OK", "MSG_GET_SUCCESS", 1);
        },
        /* —— DoVerify:依 FieldSpecs.Validations + BusinessValidation 通用驗證 —— */
        _DoVerify(input) {
            const d = input.Data || {};
            const errs = [];
            (DoInit.View.FormView?.FieldSpecs || []).forEach((f) => {
                const v = d[f.BindField];
                (f.Validations || []).forEach((rule) => {
                    if (rule.Rule === "Required" && (v == null || v === "")) errs.push({ Field: f.BindField, Message: rule.Message });
                    else if (rule.Rule === "MaxLength" && v && String(v).length > rule.Value) errs.push({ Field: f.BindField, Message: rule.Message });
                    else if (rule.Rule === "Email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errs.push({ Field: f.BindField, Message: rule.Message });
                    else if (rule.Rule === "Range" && v !== "" && v != null && (+v < rule.Min || +v > rule.Max)) errs.push({ Field: f.BindField, Message: rule.Message });
                    else if (rule.Rule === "Unique" && KEYFIELD && d[KEYFIELD]) {
                        const dup = DB.find((x) => x[KEYFIELD] === d[KEYFIELD] && x[ROWKEY] !== d[ROWKEY] && x[STATUSFIELD] !== "0");
                        if (dup) errs.push({ Field: f.BindField, Message: rule.Message });
                    } else if (rule.Rule === "JsonFormat" && v) {
                        try {
                            JSON.parse(v);
                        } catch {
                            errs.push({ Field: f.BindField, Message: rule.Message });
                        }
                    }
                });
            });
            (DoInit.CustomMeta?.BusinessRules?.BusinessValidation || []).forEach((bv) => {
                const v = d[bv.Field];
                if (bv.Rule === "NoSelfReference" && KEYFIELD && v && v === d[KEYFIELD]) errs.push({ Field: bv.Field, Message: bv.Message });
                if (bv.Rule === "MaxCurrentYear" && v && +v > (/* @__PURE__ */ new Date()).getFullYear()) errs.push({ Field: bv.Field, Message: bv.Message });
            });
            const seen = /* @__PURE__ */ new Set();
            const uniq = errs.filter((e) => seen.has(e.Field) ? false : (seen.add(e.Field), true));
            if (uniq.length) return { ReturnMsg: { IsSuccess: "N", Level: "Warning", ReturnCode: "E422", MsgID: "MSG_VALIDATION_FAILED", Message: "\u8CC7\u6599\u9A57\u8B49\u672A\u901A\u904E", AffectedCount: 0 }, ReturnData: { Errors: uniq } };
            return CDE._ok({ Valid: true }, "OK", "MSG_VERIFY_PASS", 0);
        },
        /* —— 物化一筆完整資料列 (套用系統欄位 / 物化路徑) —— */
        _materialize(d, key, isNew, base) {
            const row = base ? { ...base } : {};
            (DoInit.View.FormView?.FieldSpecs || []).forEach((f) => {
                if (f.BindField === ROWKEY) return;
                if (d[f.BindField] !== void 0) row[f.BindField] = d[f.BindField];
            });
            row[ROWKEY] = key;
            row.EntityID = UserInfo.EntityID;
            if (!row[STATUSFIELD]) row[STATUSFIELD] = d[STATUSFIELD] || "1";
            if (PATHFIELD && KEYFIELD) row[PATHFIELD] = CDE._buildPath(d[PARENTFIELD], d[KEYFIELD]);
            const now = nowStr();
            if (isNew) {
                row.CreatedBy = UserInfo.UserAccount;
                row.CreatedAt = now;
            }
            row.UpdatedBy = UserInfo.UserAccount;
            row.UpdatedAt = now;
            return row;
        },
        /* —— DoInsert —— */
        _DoInsert(input) {
            const v = CDE._DoVerify(input);
            if (v.ReturnMsg.IsSuccess === "N") return v;
            const guid = newGuid();
            const row = CDE._materialize(input.Data, guid, true);
            DB.push(row);
            return CDE._ok({ KeyValue: guid, Path: row[PATHFIELD] || null }, "OK", "MSG_INSERT_SUCCESS", 1);
        },
        /* —— DoUpdate —— */
        _DoUpdate(input) {
            const v = CDE._DoVerify(input);
            if (v.ReturnMsg.IsSuccess === "N") return v;
            const d = input.Data;
            const idx = DB.findIndex((x) => x[ROWKEY] === d[ROWKEY]);
            if (idx < 0) return CDE._err("E404", "ROW_NOT_FOUND");
            DB[idx] = CDE._materialize(d, d[ROWKEY], false, DB[idx]);
            return CDE._ok({ KeyValue: d[ROWKEY], Path: DB[idx][PATHFIELD] || null }, "OK", "MSG_UPDATE_SUCCESS", 1);
        },
        /* —— DoDelete:邏輯刪除 Status='0';若有物化路徑則連動下屬 —— */
        _DoDelete(input) {
            let keys = input.KeyValue;
            keys = Array.isArray(keys) ? keys : [keys];
            let affected = 0;
            const cascaded = [];
            keys.forEach((k) => {
                const r = DB.find((x) => x[ROWKEY] === k);
                if (!r) return;
                let targets = [r];
                if (PATHFIELD && r[PATHFIELD]) targets = DB.filter((x) => x[STATUSFIELD] !== "0" && x[PATHFIELD] && String(x[PATHFIELD]).startsWith(r[PATHFIELD]));
                targets.forEach((x) => {
                    if (x[STATUSFIELD] === "0") return;
                    x[STATUSFIELD] = "0";
                    x.UpdatedBy = UserInfo.UserAccount;
                    x.UpdatedAt = nowStr();
                    affected++;
                    if (x[ROWKEY] !== k) cascaded.push(x[KEYFIELD] || x[ROWKEY]);
                });
            });
            return CDE._ok({ DeletedKeys: keys, CascadedCodes: cascaded }, "OK", "MSG_DELETE_SUCCESS", affected);
        },
        /* —— DoImport:依 ImportColumns;DuplicateAction=Update;AtomicImport —— */
        _DoImport(input) {
            const rows = input.Rows || [];
            let ins = 0, upd = 0;
            const errs = [];
            const reqCols = (DoInit.Features?.ImportSpec?.ImportColumns || []).filter((c) => c.Required).map((c) => c.FieldID);
            rows.forEach((d, i) => {
                if (reqCols.some((c) => d[c] == null || d[c] === "")) {
                    errs.push({ Row: i + 1, Message: "\u5FC5\u586B\u6B04\u4F4D\u7F3A\u6F0F" });
                    return;
                }
                const ex = KEYFIELD ? DB.find((x) => x[KEYFIELD] === d[KEYFIELD] && x[STATUSFIELD] !== "0") : null;
                if (ex) {
                    const idx = DB.indexOf(ex);
                    DB[idx] = CDE._materialize({ ...ex, ...d }, ex[ROWKEY], false, ex);
                    upd++;
                } else {
                    DB.push(CDE._materialize(d, newGuid(), true));
                    ins++;
                }
            });
            if (errs.length && DoInit.Features?.ImportSpec?.ImportRules?.AtomicImport)
                return { ReturnMsg: { IsSuccess: "N", Level: "Error", ReturnCode: "E422", Message: "\u532F\u5165\u9A57\u8B49\u5931\u6557\uFF0C\u5DF2\u6574\u6279\u56DE\u6EFE(AtomicImport)", AffectedCount: 0 }, ReturnData: { Errors: errs } };
            return CDE._ok({ Inserted: ins, Updated: upd, Errors: errs }, "OK", "MSG_IMPORT_SUCCESS", ins + upd);
        },
        /* —— DoExport:依 ExportColumns —— */
        _DoExport(input) {
            const scope = input.Scope || "current";
            let data = DB.filter((r) => r.EntityID === UserInfo.EntityID && r[STATUSFIELD] !== "0");
            if (scope === "selected") data = data.filter((r) => (input.Keys || []).includes(r[ROWKEY]));
            const cols = input.Columns || (DoInit.Features?.ExportSpec?.ExportColumns || []).map((c) => c.DataKey);
            return CDE._ok({ RowCount: data.length, Columns: cols, FileName: `${DoInit.FuncCode || "CDE"}_${Date.now()}.xlsx`, Rows: data }, "OK", "MSG_EXPORT_SUCCESS", data.length);
        },
        /* —— DoReport:依 ReportView.ReportTypes 之 GroupBy/Layout 統計 (通用) —— */
        _DoReport(input) {
            const data = DB.filter((r) => r.EntityID === UserInfo.EntityID && r[STATUSFIELD] !== "0");
            const types = DoInit.View?.ReportView?.ReportTypes || [];
            const def = types.find((t) => t.Type === input.ReportType) || types[0] || { Type: "summary", Title: "\u5F59\u7E3D\u5831\u8868", Layout: "StatsAndTable" };
            const specs = DoInit.View.ListView.FieldSpecs || [];
            const isTag = (k) => specs.some((s) => s.BindField === k && s.Formatter === "Tag");
            const isList = (k) => specs.some((s) => s.BindField === k);
            const dim = def.GroupBy || Object.keys(CODE).find(isTag) || Object.keys(CODE).find(isList) || null;
            const groups = {};
            if (dim && CODE[dim]) CODE[dim].forEach((c) => groups[c.CodeName] = data.filter((r) => String(r[dim]) === String(c.CodeID)).length);
            return CDE._ok({ ReportType: def.Type, Title: def.Title, Layout: def.Layout || "StatsAndTable", Dim: dim, Total: data.length, Groups: groups, Rows: data, GeneratedAt: nowStr() }, "OK", "MSG_REPORT_SUCCESS", data.length);
        },
        /* —— 物化路徑產生 (PathGeneration);無樹狀配置時回 null —— */
        _buildPath(parentKey, key) {
            if (!PATHFIELD || !KEYFIELD) return null;
            const sep = getTreeCfg().Sep || "/";
            if (!parentKey) return `${sep}${key}${sep}`;
            const p = DB.find((x) => x[KEYFIELD] === parentKey && x[STATUSFIELD] !== "0");
            const pp = p && p[PATHFIELD] ? p[PATHFIELD] : `${sep}${parentKey}${sep}`;
            return `${pp}${key}${sep}`;
        }
    };
    var $ = (id) => document.getElementById(id);
    var esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    function bootstrap() {
        const r = CDE.dispatch("DoInit");
        const cfg = r.ReturnData;
        const pm = cfg.PageMeta;
        $("phTitle").textContent = pm.PageTitle || cfg.FuncCode || "\u2014";
        $("phIcon").className = pm.Icon || "ri-apps-2-line";
        {
            const _ft = $("cbFormType");
            if (_ft) _ft.textContent = pm.FormType || "\u2014";
        }
        {
            const _wg = $("cbWidget");
            if (_wg) _wg.textContent = cfg.CustomMeta?.CustomSchema?.WidgetType || "\u2014";
        }
        document.title = `${BRAND_NAME} \u2014 ${pm.PageTitle || cfg.FuncCode || ""}`;
        const ur = document.querySelector(".top-urole");
        if (ur) ur.textContent = (UserInfo.RoleID === "SysAdmin" ? "\u7CFB\u7D71\u7BA1\u7406\u54E1" : "\u4F7F\u7528\u8005") + " \xB7 " + (cfg.EntityID || "");
        const un = document.querySelector(".top-uname");
        if (un) un.textContent = UserInfo.UserName || "";
        const tpill = document.querySelector(".top-pill");
        if (tpill) tpill.textContent = cfg.SystemCode || "";
        const av = document.querySelector(".top-avatar");
        if (av) av.textContent = (UserInfo.UserName || "U").slice(0, 2);
        const gt = $("gridTitle");
        if (gt) gt.textContent = pm.PageTitle || "\u8CC7\u6599\u5217\u8868";
        const rct = $("rptCardTitle");
        if (rct) rct.textContent = cfg.View?.ReportView?.Title || (pm.PageTitle ? pm.PageTitle + " \u5831\u8868" : "\u5831\u8868");
        renderReportTypes();
        highlightMenu();
        $("phBreadcrumb").innerHTML = (pm.Breadcrumb || []).map((b, i) => {
            const sep = i > 0 ? '<span class="ph-bc-sep">/</span>' : "";
            const last = i === pm.Breadcrumb.length - 1;
            return sep + (last ? `<span class="ph-bc-cur">${esc(b.Title)}</span>` : `<a href="javascript:void(0)">${esc(b.Title)}</a>`);
        }).join("");
        if (pm.FormType === "SurveyForm") {
            renderMeta(cfg);
            renderSurvey(cfg);
            return;
        }
        restoreGridCards();
        renderToolbar(cfg.AllowAction);
        renderSearchPanel();
        renderGridHead();
        renderExportCols();
        renderImportInstr();
        renderMeta(cfg);
        doQuery(1);
    }
    function renderToolbar(aa) {
        const typeMap = { Primary: "btn-pri", Danger: "btn-dan", Default: "btn-def", Success: "btn-suc" };
        const handler = { Add: "openCreate", Query: "query", Delete: "deleteSelected", Import: "openImport", Export: "openExport" };
        const batch = DoInit.Resources?.FeatureFlags?.EnableBatchDelete !== false;
        let html = "";
        aa.DataActions.filter((a) => a.Position !== "Form" && a.ActionID !== "Save").forEach((a) => {
            if (a.ActionID === "Query") return;
            if (a.ActionID === "Delete" && !batch) return;
            html += `<button class="btn ${typeMap[a.Type] || "btn-def"} btn-sm" data-act="${handler[a.ActionID] || ""}"><i class="${a.Icon}"></i>${a.Label}</button>`;
        });
        html += `<span class="sp"></span>`;
        aa.ExtensionActions.forEach((a) => {
            html += `<button class="btn btn-def btn-sm" data-act="${handler[a.ActionID] || ""}"><i class="${a.Icon}"></i>${a.Label}</button>`;
        });
        if (DoInit.View?.ReportView) {
            html += `<button class="btn btn-def btn-sm" data-act="goReport"><i class="ri-bar-chart-box-line"></i>\u5831\u8868\u7522\u751F</button>`;
        }
        html += `<button class="btn btn-ghost btn-sm" data-act="toggleColPicker" title="\u6B04\u4F4D\u986F\u793A"><i class="ri-layout-column-line"></i></button>`;
        $("toolbar").innerHTML = html;
    }
    function renderSearchPanel() {
        const listFields = new Set((DoInit.View.ListView.FieldSpecs || []).map((s) => s.BindField));
        const dims = Object.keys(CODE).filter((k) => listFields.has(k));
        const sels = dims.map((key) => {
            const title = (DoInit.View.ListView.FieldSpecs.find((s) => s.BindField === key) || {}).Title || key;
            return `<div class="fld"><span class="fld-lbl">${esc(title)}</span>
      <select class="sel" id="q_${key}"><option value="">\u5168\u90E8</option>${CODE[key].map((c) => `<option value="${esc(c.CodeID)}">${esc(c.CodeName)}</option>`).join("")}</select></div>`;
        }).join("");
        $("searchGrid").innerHTML = `
    <div class="fld"><span class="fld-lbl"><i class="ri-search-line"></i>\u95DC\u9375\u5B57</span>
      <input class="inp" id="q_Search1" placeholder="\u8DE8\u6B04\u4F4D\u6A21\u7CCA\u67E5\u8A62"></div>${sels}`;
        $("q_Search1").addEventListener("keydown", (e) => {
            if (e.key === "Enter") doQuery(1);
        });
    }
    var visibleCols = [];
    function renderGridHead() {
        const specs = DoInit.View.ListView.FieldSpecs.filter((f) => visibleCols.includes(f.BindField));
        const batch = DoInit.Resources?.FeatureFlags?.EnableBatchDelete !== false;
        let th = "";
        if (batch) th += `<th style="width:38px" class="col-center"><input type="checkbox" class="chk" id="chkAll" data-change="toggleAll"></th>`;
        th += `<th style="width:72px" class="col-center">Action</th>`;
        th += `<th style="width:62px" class="col-center">No</th>`;
        specs.forEach((f) => {
            const al = f.Align === "Center" ? "col-center" : f.Align === "Right" ? "text-align:right" : "";
            const sort = f.Sorter ? `<i class="ri-arrow-up-down-line" style="font-size:11px;opacity:.5;margin-left:3px;cursor:pointer" data-act="sortBy" data-arg="${f.BindField}"></i>` : "";
            th += `<th class="${al}" style="min-width:${f.Width || 100}px">${esc(f.Title)}${sort}</th>`;
        });
        $("gridHead").innerHTML = `<tr>${th}</tr>`;
    }
    function fmt(field, row) {
        const spec = (DoInit.View.ListView.FieldSpecs || []).find((f) => f.BindField === field) || {};
        const v = row[field];
        const blank = '<span class="muted">\u2014</span>';
        const key = row[ROWKEY];
        switch (spec.Formatter) {
            case "Link":
            case "TreeNode":
                return v != null && v !== "" ? `<span class="link" style="font-weight:500" data-act="openEdit" data-arg="${key}">${esc(v)}</span>` : blank;
            case "Tag":
                return v != null && v !== "" ? `<span class="tag ${esc(v)}">${esc(codeName(field, v))}</span>` : blank;
            case "StatusTag": {
                const on = ["1", "Y", "TRUE", "ACTIVE", "A", "ENABLED"].includes(String(v).toUpperCase());
                return `<span class="tag ${on ? "on" : "off"}"><i class="ri-circle-fill" style="font-size:7px"></i>${esc(codeName(field, v) || v || "")}</span>`;
            }
            case "ParentName": {
                if (!v) return '<span class="muted">\u2014 \u6700\u4E0A\u5C64 \u2014</span>';
                const tc = getTreeCfg();
                const p = DB.find((x) => x[tc.Key] === v && x[STATUSFIELD] !== "0");
                return p ? `${esc(p[tc.Title])}<span class="muted" style="margin-left:4px">\uFF08${esc(v)}\uFF09</span>` : esc(v);
            }
            case "DateTime":
                return v ? esc(v) : blank;
            default:
                return v != null && v !== "" ? esc(v) : blank;
        }
    }
    function renderGrid() {
        const rows = RT.rows;
        const batch = DoInit.Resources?.FeatureFlags?.EnableBatchDelete !== false;
        const specs = DoInit.View.ListView.FieldSpecs.filter((f) => visibleCols.includes(f.BindField));
        const fixedCount = (batch ? 1 : 0) + 2;
        let html = "";
        let visibleCount = 0;
        rows.forEach((r, idx) => {
            const no = (RT.page - 1) * RT.pageSize + idx + 1;
            const selCls = RT.selected.has(r.RowGuid) ? "sel" : "";
            let tds = "";
            if (batch)
                tds += `<td class="col-center"><input type="checkbox" class="chk" ${RT.selected.has(r.RowGuid) ? "checked" : ""} data-change="toggleSel" data-arg="${r.RowGuid}"></td>`;
            tds += `<td class="col-center"><button class="kebab" id="kb_${r.RowGuid}" data-act="openRowMenu" data-arg="${r.RowGuid}"><i class="ri-more-2-fill"></i></button></td>`;
            tds += `<td class="col-center"><span class="badge-no">${no}</span></td>`;
            specs.forEach((f) => {
                const al = f.Align === "Center" ? "col-center" : "";
                tds += `<td class="${al}">${fmt(f.BindField, r)}</td>`;
            });
            html += `<tr class="${selCls}" data-key="${esc(r[KEYFIELD] || r[ROWKEY] || "")}">${tds}</tr>`;
            visibleCount++;
        });
        if (visibleCount === 0) {
            html = `<tr><td colspan="${specs.length + fixedCount}"><div class="empty"><i class="ri-inbox-line"></i><p>${DoInit.View.ListView.ListSpec.EmptyText}</p></div></td></tr>`;
        }
        $("gridBody").innerHTML = html;
        renderPager();
        renderBatchBar();
        {
            const _tc = $("tabCount");
            if (_tc) _tc.textContent = RT.total;
        }
        syncChkAll();
    }
    var _menuGuid = null;
    function openRowMenu(ev, guid, srcEl) {
        ev.stopPropagation();
        const btnEl = srcEl || ev.currentTarget || ev.target;
        const menu = $("rowMenu");
        if (_menuGuid === guid && menu.classList.contains("open")) {
            closeRowMenu();
            return;
        }
        _menuGuid = guid;
        menu.innerHTML = `
    <button data-act="rowEdit" data-arg="${guid}"><i class="ri-edit-line"></i>\u7DE8\u8F2F Update</button>
    <button data-act="rowView" data-arg="${guid}"><i class="ri-eye-line"></i>\u6AA2\u8996 View</button>
    <button class="del" data-act="rowDel" data-arg="${guid}"><i class="ri-delete-bin-line"></i>\u522A\u9664 Delete</button>`;
        menu.classList.add("open");
        const b = btnEl.getBoundingClientRect();
        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        let left = b.left, top = b.bottom + 4;
        if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
        if (top + mh > window.innerHeight - 8) top = b.top - mh - 4;
        menu.style.left = Math.max(8, left) + "px";
        menu.style.top = Math.max(8, top) + "px";
        document.querySelectorAll(".kebab.active").forEach((x) => x.classList.remove("active"));
        btnEl.classList.add("active");
    }
    function closeRowMenu() {
        const menu = $("rowMenu");
        if (menu) menu.classList.remove("open");
        document.querySelectorAll(".kebab.active").forEach((x) => x.classList.remove("active"));
        _menuGuid = null;
    }
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".row-menu") && !e.target.closest(".kebab")) closeRowMenu();
    });
    window.addEventListener("scroll", closeRowMenu, true);
    window.addEventListener("resize", closeRowMenu);
    function renderPager() {
        const tp = RT.totalPage, cur = RT.page;
        const start = RT.total === 0 ? 0 : (cur - 1) * RT.pageSize + 1;
        const end = Math.min(cur * RT.pageSize, RT.total);
        let ctrl = `<button class="pg txt" ${cur <= 1 ? "disabled" : ""} data-act="goPage" data-arg="${cur - 1}">Previous</button>`;
        const win = 5;
        let s = Math.max(1, cur - 2), e = Math.min(tp, s + win - 1);
        s = Math.max(1, e - win + 1);
        if (s > 1) {
            ctrl += `<button class="pg" data-act="query">1</button>`;
            if (s > 2) ctrl += `<span class="pg-gap">\u2026</span>`;
        }
        for (let p = s; p <= e; p++) ctrl += `<button class="pg ${p === cur ? "active" : ""}" data-act="goPage" data-arg="${p}">${p}</button>`;
        if (e < tp && e < tp - 1) ctrl += `<span class="pg-gap">\u2026</span>`;
        ctrl += `<button class="pg txt" ${cur >= tp ? "disabled" : ""} data-act="goPage" data-arg="${tp}">Last Page</button>`;
        ctrl += `<button class="pg txt" ${cur >= tp ? "disabled" : ""} data-act="goPage" data-arg="${cur + 1}">Next</button>`;
        $("pager").innerHTML = `<div class="pager-info">\u986F\u793A <b>${start}</b>\u2013<b>${end}</b> \u7B46,\u5171 <b>${RT.total}</b> \u7B46 \xB7 \u7B2C ${cur}/${tp} \u9801</div><div class="pager-ctrl">${ctrl}</div>`;
    }
    function renderBatchBar() {
        const n = RT.selected.size;
        if (n === 0) {
            $("batchBar").innerHTML = "";
            $("batchBar").style.padding = "0";
            return;
        }
        $("batchBar").style.padding = "10px 0";
        $("batchBar").innerHTML = `<div style="display:flex;align-items:center;gap:10px;background:var(--pril);border-radius:7px;padding:8px 14px">
    <i class="ri-checkbox-multiple-line" style="color:var(--pri);font-size:17px"></i>
    <span style="font-size:12.5px">\u5DF2\u9078\u53D6 <b style="color:var(--pri)">${n}</b> \u7B46\u8CC7\u6599</span>
    <span style="flex:1"></span>
    <button class="btn btn-dan btn-xs" data-act="deleteSelected"><i class="ri-delete-bin-line"></i>\u6279\u6B21\u522A\u9664</button>
    <button class="btn btn-def btn-xs" data-act="exportSelected"><i class="ri-file-excel-line"></i>\u532F\u51FA\u9078\u53D6</button>
    <button class="btn btn-ghost btn-xs" data-act="clearSel">\u53D6\u6D88\u9078\u53D6</button>
  </div>`;
    }
    function doQuery(page) {
        const filter = { Search1: $("q_Search1")?.value.trim() || "" };
        Object.keys(CODE).forEach((key) => {
            const el = $("q_" + key);
            if (el) filter[key] = el.value || "";
        });
        RT.filter = filter;
        const res = CDE.dispatch("DoQuery", { Filter: filter, Pagination: { Page: page, PageSize: RT.pageSize }, Sort: RT.sort });
        if (res.ReturnMsg.IsSuccess !== "Y") {
            toast("err", "\u67E5\u8A62\u5931\u6557", res.ReturnMsg.Message);
            return;
        }
        RT.rows = res.ReturnData.Data;
        RT.page = res.ReturnData.Pagination.Page;
        RT.total = res.ReturnData.Pagination.TotalCount;
        RT.totalPage = res.ReturnData.Pagination.TotalPage;
        renderGrid();
        const hasFilter = filter.Search1 || Object.keys(CODE).some((k) => filter[k]);
        if (hasFilter) toast("suc", "\u67E5\u8A62\u5B8C\u6210", `\u5171 ${RT.total} \u7B46\u7B26\u5408\u689D\u4EF6`);
    }
    function resetSearch() {
        const ids = ["q_Search1", ...Object.keys(CODE).map((k) => "q_" + k)];
        ids.forEach((id) => {
            const e = $(id);
            if (e) e.value = "";
        });
        doQuery(1);
    }
    function toggleSearch() {
        const b = $("searchBody");
        const c = $("searchCaret");
        const h = b.style.display === "none";
        b.style.display = h ? "" : "none";
        c.className = h ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line";
    }
    function sortBy(field) {
        RT.sort = { Column: field, Direction: RT.sort.Column === field && RT.sort.Direction === "asc" ? "desc" : "asc" };
        doQuery(RT.page);
    }
    function toggleSel(guid, el) {
        if (el.checked) RT.selected.add(guid);
        else RT.selected.delete(guid);
        renderBatchBar();
        syncChkAll();
        document.querySelector(`tr[data-code]`);
        renderGrid();
    }
    function toggleAll(el) {
        if (el.checked) RT.rows.forEach((r) => RT.selected.add(r.RowGuid));
        else RT.selected.clear();
        renderGrid();
    }
    function syncChkAll() {
        const all = $("chkAll");
        if (!all) return;
        const total = RT.rows.length;
        const sel = RT.rows.filter((r) => RT.selected.has(r.RowGuid)).length;
        all.checked = total > 0 && sel === total;
        all.indeterminate = sel > 0 && sel < total;
    }
    function clearSel() {
        RT.selected.clear();
        renderGrid();
    }
    function toggleColPicker() {
        const optional = DoInit.View.ListView.FieldSpecs.filter((f) => !f.DefaultVisible);
        const sortNo = visibleCols.includes("SortNo");
        if (visibleCols.includes("UpdatedAt")) {
            visibleCols = visibleCols.filter((c) => c !== "UpdatedAt" && c !== "SortNo");
            toast("info", "\u6B04\u4F4D\u8ABF\u6574", "\u5DF2\u96B1\u85CF \u6392\u5E8F\uFF0F\u66F4\u65B0\u6642\u9593 \u6B04");
        } else {
            visibleCols = [...visibleCols, "SortNo", "UpdatedAt"];
            toast("info", "\u6B04\u4F4D\u8ABF\u6574", "\u5DF2\u986F\u793A \u6392\u5E8F\uFF0F\u66F4\u65B0\u6642\u9593 \u6B04");
        }
        renderGridHead();
        renderGrid();
    }
    function openCreate() {
        openForm("create", null);
    }
    function openEdit(guid) {
        openForm("edit", guid);
    }
    function openView(guid) {
        openForm("view", guid);
    }
    function openForm(mode, guid) {
        RT.drawerMode = mode;
        let data;
        if (mode === "create") {
            data = {};
            DoInit.View.FormView.FieldSpecs.forEach((f) => {
                if (f.DefaultValue !== void 0) data[f.BindField] = f.DefaultValue;
            });
            data.RowKey = "";
        } else {
            const r = CDE.dispatch("DoGet", { KeyValue: guid });
            if (r.ReturnMsg.IsSuccess !== "Y") {
                toast("err", "\u8F09\u5165\u5931\u6557", r.ReturnMsg.Message);
                return;
            }
            data = { ...r.ReturnData.Data, RowKey: r.ReturnData.Data.RowGuid };
        }
        RT.curRow = data;
        RT.detailWorking = {};
        RT.detailUI = { active: DETAIL_DEFS[0]?.DetailID || null, editing: {} };
        const mkv = mode === "create" ? "" : String(data[KEYFIELD] ?? "");
        DETAIL_DEFS.forEach((dv) => {
            const rk = dv.RelationKey || KEYFIELD;
            RT.detailWorking[dv.DetailID] = mode === "create" ? [] : JSON.parse(JSON.stringify((DETAIL_DB[dv.DetailID] || []).filter((r) => String(r[rk]) === mkv && r[STATUSFIELD] !== "0")));
            RT.detailUI.editing[dv.DetailID] = null;
        });
        const titleMap = { create: ["\u65B0\u589E", "CREATE", "ri-add-box-line"], edit: ["\u4FEE\u6539", "UPDATE", "ri-edit-box-line"], view: ["\u6AA2\u8996", "READONLY", "ri-eye-line"] };
        const [t, m, ic] = titleMap[mode];
        $("drawerTitle").textContent = t;
        $("drawerMode").textContent = m;
        $("drawerSave").style.display = mode === "view" ? "none" : "";
        $("drawer").classList.toggle("has-detail", DETAIL_DEFS.length > 0);
        const fh = $("drawerFootHint");
        if (fh) fh.innerHTML = DETAIL_DEFS.length && mode !== "view" ? `<i class="ri-stack-line"></i>\u660E\u7D30\u8CC7\u6599\u5C07\u65BC\u5132\u5B58\u4E3B\u6A94\u6642\u4E00\u4F75\u5BEB\u5165` : "";
        renderForm(data, mode);
        $("drawerMask").classList.add("open");
        $("drawer").classList.add("open");
    }
    function isSensitiveSection(sec) {
        if (sec.Sensitive === true) return true;
        return /機敏|敏感|機密|sensitive/i.test(String(sec.Title || ""));
    }
    function renderForm(data, mode) {
        const fv = DoInit.View.FormView;
        const hasDetail = DETAIL_DEFS.length > 0;
        let secHtml = "";
        fv.FormSpec.Sections.forEach((sec) => {
            const fields = fv.FieldSpecs.filter((f) => f.Section === sec.SectionID && f.Mode !== "Hidden");
            if (fields.length === 0) return;
            const open = sec.DefaultOpen;
            const sensitive = isSensitiveSection(sec);
            const sub = sec.Subtitle || sec.Description || "";
            secHtml += `<div class="sec${sensitive ? " sec-sensitive" : ""}"><div class="sec-head" data-act="toggleSec" data-arg="${sec.SectionID}">
        <span class="st">
          <span class="sec-ic"><i class="${sec.Icon || "ri-folder-line"}"></i></span>
          <span class="sec-tt"><span class="sec-title">${esc(sec.Title)}${sensitive ? '<i class="ri-lock-2-line sec-lock" title="\u6A5F\u654F\u8CC7\u6599"></i>' : ""}</span>${sub ? `<span class="sec-sub">${esc(sub)}</span>` : ""}</span>
        </span>
        ${sec.IsCollapsible ? `<i class="caret ri-arrow-down-s-line ${open ? "" : "closed"}" id="caret_${sec.SectionID}"></i>` : ""}
      </div>
      <div class="sec-body ${open ? "" : "closed"}" id="secbody_${sec.SectionID}">`;
            fields.forEach((f) => {
                secHtml += renderField(f, data, mode);
            });
            secHtml += `</div></div>`;
        });
        let html;
        if (hasDetail) {
            const pm = DoInit.PageMeta || {};
            html = `<div class="form-split">
        <div class="form-master-col">
          <div class="fm-cap"><i class="${pm.Icon || "ri-profile-line"}"></i>\u4E3B\u6A94 Master<span class="fm-cap-sub">${esc(pm.PageTitle || DoInit.FuncCode || "")}</span></div>
          ${secHtml}
        </div>
        <div class="form-detail-col" id="detailHost"></div>
      </div>`;
        } else {
            html = secHtml;
        }
        $("drawerBody").innerHTML = html;
        applyFormLogic();
        if (hasDetail) paintDetails(mode);
    }
    function paintDetails(mode) {
        const host = $("detailHost");
        if (!host) return;
        if (!DETAIL_DEFS.length) {
            host.innerHTML = "";
            return;
        }
        if (!RT.detailUI.active) RT.detailUI.active = DETAIL_DEFS[0].DetailID;
        const active = RT.detailUI.active;
        const total = DETAIL_DEFS.reduce((s, dv) => s + (RT.detailWorking[dv.DetailID] || []).length, 0);
        const tabs = DETAIL_DEFS.map((dv) => {
            const n = (RT.detailWorking[dv.DetailID] || []).length;
            return `<button class="dt-tab ${dv.DetailID === active ? "active" : ""}" data-act="detailTab" data-arg="${dv.DetailID}">
      <i class="${dv.Icon || "ri-list-check-2"}"></i><span class="dt-tab-tx">${esc(dv.Title)}</span><span class="dt-badge ${n ? "" : "zero"}">${n}</span></button>`;
        }).join("");
        host.innerHTML = `
    <div class="fd-head">
      <div class="fd-h-main"><i class="ri-stack-line"></i>\u660E\u7D30\u8CC7\u6599 <span class="fd-h-count">${total}</span></div>
      <div class="fd-h-note"><i class="ri-information-line"></i>\u660E\u7D30\u65BC\u4E3B\u6A94\u5132\u5B58\u6642\u4E00\u4F75\u5BEB\u5165</div>
    </div>
    <div class="dt-tabs" role="tablist">${tabs}</div>
    <div class="dt-panel" id="dtPanel"></div>`;
        paintDetailPanel(mode);
    }
    function paintDetailPanel(mode) {
        const dv = detailDef(RT.detailUI.active);
        const panel = $("dtPanel");
        if (!dv || !panel) return;
        const rows = RT.detailWorking[dv.DetailID] || [];
        const ro = mode === "view";
        const k = dv.RowKey || "RowGuid";
        const canAdd = dv.AllowAdd !== false && !ro;
        const cols = dv.Columns || [];
        const editing = RT.detailUI.editing[dv.DetailID];
        const editorHtml = editing != null && !ro ? renderDetailEditor(dv, editing) : "";
        const bar = `<div class="dt-bar">
      <span class="dt-hint"><i class="ri-links-line"></i>${esc(dv.Entity || "")}<span class="dt-hint-rel">\u95DC\u806F\u9375 <code>${esc(dv.RelationKey || KEYFIELD)}</code></span></span>
      <span style="flex:1"></span>
      ${canAdd ? `<button class="btn btn-pri btn-xs" data-act="detailAdd" data-arg="${dv.DetailID}"><i class="ri-add-line"></i>\u65B0\u589E\u660E\u7D30</button>` : ""}
    </div>`;
        const head = cols.map((c) => `<th class="${c.Align === "Center" ? "col-center" : ""}" style="min-width:${c.Width || 90}px">${esc(c.Title)}</th>`).join("");
        const actHead = ro ? "" : `<th class="col-center dt-acthead" style="width:84px">\u64CD\u4F5C</th>`;
        let body;
        if (!rows.length) {
            body = `<tr><td class="dt-empty" colspan="${cols.length + (ro ? 0 : 1)}">
      <div class="dt-empty-wrap"><i class="ri-inbox-2-line"></i><span>${esc(dv.EmptyText || "\u5C1A\u7121\u660E\u7D30\u8CC7\u6599")}</span>
      ${canAdd ? `<button class="btn btn-def btn-xs" data-act="detailAdd" data-arg="${dv.DetailID}"><i class="ri-add-line"></i>\u7ACB\u5373\u65B0\u589E</button>` : ""}</div></td></tr>`;
        } else body = rows.map((r) => {
            const rk = r[k];
            const isEd = editing != null && String(editing) === String(rk);
            const tds = cols.map((c) => `<td class="${c.Align === "Center" ? "col-center" : ""}">${detailFmt(dv, c, r)}</td>`).join("");
            const act = ro ? "" : `<td class="col-center dt-actcell">
        ${dv.AllowEdit !== false ? `<button class="dt-ic" title="\u7DE8\u8F2F" data-act="detailEdit" data-arg="${dv.DetailID}|${rk}"><i class="ri-edit-line"></i></button>` : ""}
        ${dv.AllowDelete !== false ? `<button class="dt-ic del" title="\u522A\u9664" data-act="detailDel" data-arg="${dv.DetailID}|${rk}"><i class="ri-delete-bin-line"></i></button>` : ""}
      </td>`;
            return `<tr class="${isEd ? "dt-row-editing" : ""}">${tds}${act}</tr>`;
        }).join("");
        panel.innerHTML = `${bar}${editorHtml}<div class="tbl-wrap dt-grid-wrap"><table class="grid dt-grid"><thead><tr>${head}${actHead}</tr></thead><tbody>${body}</tbody></table></div>`;
        panel.scrollTop = 0;
    }
    function detailFmt(dv, c, r) {
        const v = r[c.BindField];
        const blank = '<span class="muted">\u2014</span>';
        switch (c.Formatter) {
            case "Tag":
                return v != null && v !== "" ? `<span class="tag def">${esc(detailCodeName(dv, c.OptionKey || c.BindField, v))}</span>` : blank;
            case "YesNo":
                return `<span class="tag ${String(v) === "1" ? "on" : "off"}">${String(v) === "1" ? "\u662F" : "\u5426"}</span>`;
            case "Date":
                return v != null && v !== "" ? esc(v) : blank;
            default:
                return v != null && v !== "" ? esc(v) : blank;
        }
    }
    function renderDetailEditor(dv, editing) {
        const k = dv.RowKey || "RowGuid";
        const isNew = editing === "__new__";
        const row = isNew ? {} : (RT.detailWorking[dv.DetailID] || []).find((r) => String(r[k]) === String(editing)) || {};
        const fields = (dv.FormFields || []).map((f) => renderDetailField(dv, f, row[f.BindField])).join("");
        return `<div class="dt-editor">
      <div class="dt-editor-head">
        <span class="dt-eh-tt"><i class="${isNew ? "ri-add-circle-line" : "ri-edit-2-line"}"></i>${isNew ? "\u65B0\u589E" : "\u7DE8\u8F2F"}${esc(dv.Title)}\u660E\u7D30</span>
        <button class="dt-eh-x" data-act="detailCancel" data-arg="${dv.DetailID}" title="\u53D6\u6D88"><i class="ri-close-line"></i></button>
      </div>
      <div class="dt-editor-grid">${fields}</div>
      <div class="dt-editor-foot">
        <button class="btn btn-def btn-xs" data-act="detailCancel" data-arg="${dv.DetailID}"><i class="ri-close-line"></i>\u53D6\u6D88</button>
        <button class="btn btn-pri btn-xs" data-act="detailSaveRow" data-arg="${dv.DetailID}"><i class="ri-check-line"></i>\u5957\u7528</button>
      </div>
    </div>`;
    }
    function renderDetailField(dv, f, val) {
        const span = f.Span || 12;
        const id = `df_${f.BindField}`;
        const v = val != null && val !== "" ? val : f.DefaultValue !== void 0 ? f.DefaultValue : "";
        const req = (f.Validations || []).some((x) => x.Rule === "Required");
        let ctrl = "";
        switch (f.Component) {
            case "Select": {
                const opts = detailCodeSet(dv, f.Props?.OptionKey || f.BindField);
                ctrl = `<select class="sel" id="${id}">${!req ? '<option value="">\u8ACB\u9078\u64C7</option>' : ""}${opts.map((o) => `<option value="${esc(o.CodeID)}" ${String(v) === String(o.CodeID) ? "selected" : ""}>${esc(o.CodeName)}</option>`).join("")}</select>`;
                break;
            }
            case "YesNo":
                ctrl = `<select class="sel" id="${id}"><option value="0" ${String(v) !== "1" ? "selected" : ""}>\u5426</option><option value="1" ${String(v) === "1" ? "selected" : ""}>\u662F</option></select>`;
                break;
            case "TextArea":
                ctrl = `<textarea class="ta" id="${id}" rows="2">${esc(v)}</textarea>`;
                break;
            case "InputNumber":
                ctrl = `<input class="inp" id="${id}" type="number" value="${esc(v)}">`;
                break;
            case "DatePicker":
                ctrl = `<input class="inp" id="${id}" type="date" value="${esc(v)}">`;
                break;
            default:
                ctrl = `<input class="inp" id="${id}" value="${esc(v)}" placeholder="${esc(f.Props?.Placeholder || "")}">`;
        }
        return `<div class="fld" style="grid-column:span ${span}"><span class="fld-lbl">${esc(f.Title)}${req ? '<span class="req">*</span>' : ""}</span>${ctrl}<span class="f-err" id="dferr_${f.BindField}"></span></div>`;
    }
    function detailTab(id) {
        RT.detailUI.active = id;
        paintDetails(RT.drawerMode);
    }
    function detailAdd(id) {
        RT.detailUI.active = id;
        RT.detailUI.editing[id] = "__new__";
        paintDetails(RT.drawerMode);
    }
    function detailEditRow(arg) {
        const [id, rk] = String(arg).split("|");
        RT.detailUI.active = id;
        RT.detailUI.editing[id] = rk;
        paintDetails(RT.drawerMode);
    }
    function detailCancelRow(id) {
        RT.detailUI.editing[id] = null;
        paintDetailPanel(RT.drawerMode);
    }
    function detailDelRow(arg) {
        const [id, rk] = String(arg).split("|");
        const dv = detailDef(id);
        if (!dv) return;
        const k = dv.RowKey || "RowGuid";
        RT.detailWorking[id] = (RT.detailWorking[id] || []).filter((r) => String(r[k]) !== String(rk));
        RT.detailUI.editing[id] = null;
        paintDetails(RT.drawerMode);
        toast("info", "\u5DF2\u79FB\u9664\u660E\u7D30", "\u5132\u5B58\u4E3B\u6A94\u5F8C\u751F\u6548");
    }
    function detailSaveRow(id) {
        const dv = detailDef(id);
        if (!dv) return;
        const k = dv.RowKey || "RowGuid";
        const editing = RT.detailUI.editing[id];
        const isNew = editing === "__new__";
        const d = {};
        (dv.FormFields || []).forEach((f) => {
            const el = $("df_" + f.BindField);
            if (el) d[f.BindField] = el.value;
        });
        let ok = true;
        (dv.FormFields || []).forEach((f) => {
            const er = $("dferr_" + f.BindField);
            if (er) {
                er.classList.remove("show");
            }
            (f.Validations || []).forEach((rule) => {
                if (rule.Rule === "Required" && (d[f.BindField] == null || d[f.BindField] === "")) {
                    ok = false;
                    if (er) {
                        er.textContent = rule.Message;
                        er.classList.add("show");
                    }
                }
            });
        });
        if (!ok) {
            toast("warn", "\u660E\u7D30\u9A57\u8B49\u672A\u901A\u904E", "\u8ACB\u4FEE\u6B63\u5FC5\u586B\u6B04\u4F4D");
            return;
        }
        const list = RT.detailWorking[id] || (RT.detailWorking[id] = []);
        if (isNew) {
            d[k] = "dtl-" + newGuid();
            d.EntityID = UserInfo.EntityID;
            if (!d[STATUSFIELD]) d[STATUSFIELD] = "1";
            list.push(d);
        } else {
            const idx = list.findIndex((r) => String(r[k]) === String(editing));
            if (idx >= 0) list[idx] = { ...list[idx], ...d };
        }
        RT.detailUI.editing[id] = null;
        paintDetails(RT.drawerMode);
        toast("suc", "\u660E\u7D30\u5DF2\u5957\u7528", "\u5132\u5B58\u4E3B\u6A94\u5F8C\u4E00\u4F75\u5BEB\u5165");
    }
    function commitDetails(masterKey) {
        DETAIL_DEFS.forEach((dv) => {
            const rk = dv.RelationKey || KEYFIELD;
            const store = DETAIL_DB[dv.DetailID] || (DETAIL_DB[dv.DetailID] = []);
            const kept = store.filter((r) => String(r[rk]) !== String(masterKey));
            const work = (RT.detailWorking[dv.DetailID] || []).map((r) => {
                const c = { ...r };
                c[rk] = masterKey;
                c.EntityID = UserInfo.EntityID;
                if (!c[STATUSFIELD]) c[STATUSFIELD] = "1";
                return c;
            });
            DETAIL_DB[dv.DetailID] = kept.concat(work);
        });
    }
    function formDisplayValue(f, data) {
        const v = data[f.BindField];
        if (v == null || v === "") return '<span class="muted">\u2014</span>';
        if (f.Component === "Select") {
            const set = f.Props?.OptionKey;
            return esc(set && CODE[set] ? codeName(set, v) : v);
        }
        if (f.Component === "TreeSelect") {
            const p = f.Props || {};
            const vf = p.ValueField || KEYFIELD || ROWKEY, tf = p.TitleField || TITLEFIELD || vf;
            const r = DB.find((x) => String(x[vf]) === String(v));
            return r ? `${esc(r[tf])} <span class="muted">\uFF08${esc(v)}\uFF09</span>` : esc(v);
        }
        if (f.Component === "JsonEditor") return `<code class="fld-code">${esc(v)}</code>`;
        if (f.Component === "TextArea") return esc(v).replace(/\n/g, "<br>");
        return esc(v);
    }
    function renderField(f, data, mode) {
        const span = f.Span || 12;
        const colStyle = `grid-column:span ${span}`;
        if (mode === "view") {
            return `<div class="fld fld-ro" style="${colStyle}" id="fld_${f.BindField}">
      <span class="fld-lbl">${esc(f.Title)}</span>
      <div class="fld-static">${formDisplayValue(f, data)}</div>
    </div>`;
        }
        const val = data[f.BindField] ?? "";
        const ro = mode === "view" || f.Mode === "Readonly";
        const roAttr = ro ? "disabled" : "";
        const req = (f.Validations || []).some((v) => v.Rule === "Required");
        let ctrl = "";
        const id = `f_${f.BindField}`;
        switch (f.Component) {
            case "Select": {
                const opts = CODE[f.Props?.OptionKey] || [];
                ctrl = `<select class="sel" id="${id}" ${roAttr} data-change="fieldChange" data-arg="${f.BindField}">
        ${!req ? '<option value="">\u8ACB\u9078\u64C7</option>' : ""}
        ${opts.map((o) => `<option value="${o.CodeID}" ${val == o.CodeID ? "selected" : ""}>${o.CodeName}</option>`).join("")}</select>`;
                break;
            }
            case "TreeSelect": {
                const p = f.Props || {};
                const vf = p.ValueField || KEYFIELD || ROWKEY, tf = p.TitleField || TITLEFIELD || vf;
                const selfKey = data[vf];
                const selfPath = PATHFIELD && selfKey ? (DB.find((r) => r[vf] === selfKey) || {})[PATHFIELD] : null;
                const cands = DB.filter((r) => r[STATUSFIELD] !== "0" && r[vf] !== selfKey && !(p.ExcludeSelfAndDescendants && selfPath && r[PATHFIELD] && String(r[PATHFIELD]).startsWith(selfPath))).sort((a, b) => String(a[vf]).localeCompare(String(b[vf])));
                ctrl = `<select class="sel" id="${id}" ${roAttr} data-change="fieldChange" data-arg="${f.BindField}">
        <option value="">\uFF08\u7121\uFF0F\u6700\u4E0A\u5C64\uFF09</option>
        ${cands.map((r) => `<option value="${esc(r[vf])}" ${val == r[vf] ? "selected" : ""}>${esc(r[tf])}\uFF08${esc(r[vf])}\uFF09</option>`).join("")}</select>`;
                break;
            }
            case "TextArea":
                ctrl = `<textarea class="ta" id="${id}" rows="${f.Props?.Rows || 3}" ${roAttr}>${esc(val)}</textarea>`;
                break;
            case "JsonEditor":
                ctrl = `<textarea class="ta code" id="${id}" rows="4" ${roAttr} placeholder='{"key":"value"}'>${esc(val)}</textarea>`;
                break;
            case "InputNumber":
                ctrl = `<input class="inp" id="${id}" type="number" value="${esc(val)}" min="${f.Props?.Min || ""}" max="${f.Props?.Max || ""}" ${roAttr}>`;
                break;
            case "DatePicker":
                ctrl = `<input class="inp" id="${id}" value="${esc(val)}" ${roAttr} readonly>`;
                break;
            default:
                ctrl = `<input class="inp" id="${id}" value="${esc(val)}" placeholder="${esc(f.Props?.Placeholder || "")}" ${f.Mode === "Readonly" ? "readonly" : ""} ${mode === "view" ? "disabled" : ""}>`;
        }
        return `<div class="fld" style="${colStyle}" id="fld_${f.BindField}">
    <span class="fld-lbl">${esc(f.Title)}${req ? '<span class="req">*</span>' : ""}</span>
    ${ctrl}
    <span class="f-err" id="err_${f.BindField}"></span>
  </div>`;
    }
    function toggleSec(secId) {
        const b = $("secbody_" + secId);
        const c = $("caret_" + secId);
        const closed = b.classList.toggle("closed");
        if (c) c.classList.toggle("closed", closed);
    }
    function onFieldChange(field) {
        applyFormLogic();
    }
    function evalCond(val, cond) {
        const m = String(cond || "").match(/^\s*(==|!=)\s*'?([^']*)'?\s*$/);
        if (!m) return false;
        return m[1] === "==" ? String(val) === m[2] : String(val) !== m[2];
    }
    function applyFormLogic() {
        const logic = DoInit.View?.FormView?.FormSpec?.FormLogic || [];
        if (!logic.length) return;
        const specs = DoInit.View.FormView.FieldSpecs || [];
        const targets = /* @__PURE__ */ new Set();
        logic.forEach((r) => (r.TargetFields || []).forEach((t) => targets.add(t)));
        targets.forEach((tf) => {
            const el = $("f_" + tf), fld = $("fld_" + tf), spec = specs.find((f) => f.BindField === tf) || {};
            if (el) el.disabled = RT.drawerMode === "view" || spec.Mode === "Readonly";
            if (fld) {
                fld.style.opacity = "1";
                const lbl = fld.querySelector(".fld-lbl");
                const baseReq = (spec.Validations || []).some((v) => v.Rule === "Required");
                if (lbl) lbl.innerHTML = esc(spec.Title || tf) + (baseReq ? '<span class="req">*</span>' : "");
            }
        });
        logic.forEach((rule) => {
            const trig = $("f_" + rule.TriggerField);
            if (!trig) return;
            if (!evalCond(trig.value, rule.Condition)) return;
            (rule.TargetFields || []).forEach((tf) => {
                const el = $("f_" + tf), fld = $("fld_" + tf);
                if (rule.Action === "SetMode" && rule.Params?.Mode === "Readonly") {
                    if (el) el.disabled = true;
                    if (fld) fld.style.opacity = ".6";
                } else if (rule.Action === "ClearValue") {
                    if (el) el.value = "";
                } else if (rule.Action === "SetRequired" && rule.Params?.Required) {
                    if (fld) {
                        const lbl = fld.querySelector(".fld-lbl");
                        if (lbl && !lbl.querySelector(".req")) lbl.innerHTML += '<span class="req">*</span>';
                    }
                }
            });
        });
    }
    function collectForm() {
        const d = {};
        (DoInit.View.FormView.FieldSpecs || []).forEach((f) => {
            const el = $("f_" + f.BindField);
            if (el) d[f.BindField] = el.value;
        });
        d[ROWKEY] = RT.curRow[ROWKEY] || RT.curRow.RowKey || "";
        return d;
    }
    function validateForm(d) {
        let ok = true;
        document.querySelectorAll(".fld").forEach((f) => f.classList.remove("invalid"));
        document.querySelectorAll(".f-err").forEach((e) => e.classList.remove("show"));
        DoInit.View.FormView.FieldSpecs.forEach((f) => {
            const errs = [];
            const v = d[f.BindField];
            (f.Validations || []).forEach((rule) => {
                if (rule.Rule === "Required" && (!v || v === "")) errs.push(rule.Message);
                if (rule.Rule === "MaxLength" && v && v.length > rule.Value) errs.push(rule.Message);
                if (rule.Rule === "Email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errs.push(rule.Message);
                if (rule.Rule === "Range" && v && (+v < rule.Min || +v > rule.Max)) errs.push(rule.Message);
                if (rule.Rule === "JsonFormat" && v) {
                    try {
                        JSON.parse(v);
                    } catch {
                        errs.push(rule.Message);
                    }
                }
            });
            if (errs.length) {
                ok = false;
                const fld = $("fld_" + f.BindField);
                const er = $("err_" + f.BindField);
                if (fld) fld.classList.add("invalid");
                if (er) {
                    er.textContent = errs[0];
                    er.classList.add("show");
                }
            }
        });
        return ok;
    }
    function doSave() {
        const d = collectForm();
        if (!validateForm(d)) {
            toast("warn", "\u9A57\u8B49\u672A\u901A\u904E", "\u8ACB\u4FEE\u6B63\u6A19\u793A\u4E4B\u6B04\u4F4D");
            return;
        }
        const action = RT.drawerMode === "create" ? "DoInsert" : "DoUpdate";
        const res = CDE.dispatch(action, { Data: d });
        if (res.ReturnMsg.IsSuccess !== "Y") {
            const errs = res.ReturnData?.Errors || [];
            errs.forEach((e) => {
                const fld = $("fld_" + e.Field);
                const er = $("err_" + e.Field);
                if (fld) fld.classList.add("invalid");
                if (er) {
                    er.textContent = e.Message;
                    er.classList.add("show");
                }
            });
            toast("err", "\u5132\u5B58\u5931\u6557", res.ReturnMsg.Message);
            return;
        }
        toast("suc", RT.drawerMode === "create" ? "\u65B0\u589E\u6210\u529F" : "\u4FEE\u6539\u6210\u529F", res.ReturnData?.Path ? "\u8DEF\u5F91:" + res.ReturnData.Path : "");
        if (DETAIL_DEFS.length && KEYFIELD) commitDetails(d[KEYFIELD]);
        closeDrawer();
        doQuery(RT.page);
    }
    function closeDrawer() {
        $("drawerMask").classList.remove("open");
        $("drawer").classList.remove("open");
    }
    function deleteOne(guid) {
        const r = DB.find((x) => x[ROWKEY] === guid) || {};
        const kids = PATHFIELD ? DB.filter((x) => x[STATUSFIELD] !== "0" && x[PATHFIELD]?.startsWith(r[PATHFIELD]) && x[ROWKEY] !== guid) : [];
        const da = (DoInit.AllowAction?.DataActions || []).find((a) => a.ActionID === "Delete");
        const cf = da?.Confirm || "\u78BA\u5B9A\u8981\u522A\u9664\u6B64\u7B46\u8CC7\u6599\u55CE\uFF1F";
        const detail = kids.length > 0 ? `\u6B64\u7BC0\u9EDE\u4E0B\u5C1A\u6709 ${kids.length} \u7B46\u5B50\u8CC7\u6599,\u5C07\u4E00\u4F75\u505C\u7528\u3002` : `${KEYFIELD ? esc(r[KEYFIELD]) + "\u3000" : ""}${TITLEFIELD ? esc(r[TITLEFIELD] || "") : ""}`;
        showConfirm(cf, detail, () => {
            const res = CDE.dispatch("DoDelete", { KeyValue: guid });
            const casc = res.ReturnData.CascadedCodes || [];
            toast("suc", "\u522A\u9664\u6210\u529F", `\u5171\u5F71\u97FF ${res.ReturnMsg.AffectedCount} \u7B46${casc.length ? `(\u9023\u52D5:${casc.join("\u3001")})` : ""}`);
            RT.selected.delete(guid);
            doQuery(RT.page);
        });
    }
    function deleteSelected() {
        if (RT.selected.size === 0) {
            toast("warn", "\u672A\u9078\u53D6\u8CC7\u6599", "\u8ACB\u5148\u52FE\u9078\u6B32\u522A\u9664\u7684\u8CC7\u6599");
            return;
        }
        const keys = [...RT.selected];
        showConfirm(`\u78BA\u8A8D\u6279\u6B21\u522A\u9664\u9078\u53D6\u7684 ${keys.length} \u7B46\u8CC7\u6599\uFF1F`, `\u4EE5\u908F\u8F2F\u522A\u9664 (Status='0') \u65BC\u8CC7\u6599\u5C64\u6392\u9664;\u82E5\u6709\u7269\u5316\u8DEF\u5F91\u5C07\u9023\u52D5\u4E0B\u5C6C\u7BC0\u9EDE\u3002`, () => {
            const res = CDE.dispatch("DoDelete", { KeyValue: keys });
            toast("suc", "\u6279\u6B21\u522A\u9664\u6210\u529F", `\u5171\u5F71\u97FF ${res.ReturnMsg.AffectedCount} \u7B46`);
            RT.selected.clear();
            doQuery(RT.page);
        });
    }
    function showConfirm(txt, sub, onOk) {
        $("confirmTxt").textContent = txt || "\u78BA\u8A8D\u57F7\u884C\u6B64\u64CD\u4F5C\uFF1F";
        $("confirmSub").textContent = sub || "";
        $("confirmMask").classList.add("open");
        $("confirmOk").onclick = () => {
            closeModal("confirmMask");
            onOk();
        };
    }
    function closeModal(id) {
        $(id).classList.remove("open");
    }
    function openImport() {
        const spec = DoInit.Features.ImportSpec;
        $("tplName").textContent = spec.TemplateMeta.FileName;
        $("dupAction").textContent = spec.ImportRules.DuplicateAction === "Update" ? "\u66F4\u65B0" : "\u7565\u904E";
        $("maxRows").textContent = spec.ImportRules.MaxRowCount;
        $("importPreview").style.display = "none";
        $("dropTitle").textContent = "\u9EDE\u6B64\u9078\u64C7 Excel \u6A94,\u6216\u62D6\u66F3\u6A94\u6848\u81F3\u6B64";
        $("importRun").disabled = true;
        RT.importRows = null;
        $("importMask").classList.add("open");
    }
    function renderImportInstr() {
        const ins = DoInit.Features?.ImportSpec?.TemplateMeta?.Instructions;
        if (!ins) {
            $("importInstr").innerHTML = "";
            return;
        }
        $("importInstr").innerHTML = `<div class="instr-t"><i class="ri-information-line"></i>\u532F\u5165\u9808\u77E5</div><ul>${ins.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    }
    function downloadTemplate() {
        const spec = DoInit.Features?.ImportSpec;
        if (!spec) return;
        const cols = spec.ImportColumns || [];
        const header = cols.map((c) => c.ExcelHeader).join(",");
        const sampleVal = (c, i) => c.OptionKey && CODE[c.OptionKey]?.length ? CODE[c.OptionKey][i % CODE[c.OptionKey].length].CodeID : c.DataType === "Number" ? 2020 + i : `${c.ExcelHeader}${i + 1}`;
        const sample = [0, 1].map((i) => cols.map((c) => sampleVal(c, i)).join(","));
        const fn = spec.TemplateMeta?.FileName || DoInit.FuncCode || "\u532F\u5165\u6A23\u677F";
        const csv = "\uFEFF" + header + "\n" + sample.join("\n");
        downloadFile(csv, fn + ".csv", "text/csv");
        toast("suc", "\u6A23\u677F\u5DF2\u4E0B\u8F09", fn + ".csv");
    }
    function simulateFilePick() {
        const cols = DoInit.Features?.ImportSpec?.ImportColumns || [];
        const sampleVal = (c, i) => c.OptionKey && CODE[c.OptionKey]?.length ? CODE[c.OptionKey][i % CODE[c.OptionKey].length].CodeID : c.DataType === "Number" ? 2020 + i : `${c.ExcelHeader}${i + 1}`;
        RT.importRows = [0, 1].map((i) => {
            const row = {};
            cols.forEach((c) => row[c.FieldID] = sampleVal(c, i));
            return row;
        });
        $("dropTitle").textContent = `\u5DF2\u9078\u64C7:\u793A\u7BC4\u532F\u5165\u8CC7\u6599\uFF08${RT.importRows.length} \u5217\uFF09`;
        $("importRun").disabled = false;
        const rows = RT.importRows;
        const show = cols.slice(0, 5);
        let html = `<div class="card-sub" style="margin-bottom:8px">\u89E3\u6790\u9810\u89BD(\u5171 ${rows.length} \u5217;\u91CD\u8907\u9375\u503C\u5C07\u4F9D\u898F\u5247\u300C\u66F4\u65B0\u300D)</div>
    <div class="tbl-wrap" style="max-height:180px;border:1px solid var(--bdr);border-radius:8px">
    <table class="grid"><thead><tr>${show.map((c) => `<th>${esc(c.ExcelHeader)}</th>`).join("")}</tr></thead><tbody>`;
        rows.forEach((r) => {
            const dup = KEYFIELD && DB.find((x) => x[KEYFIELD] === r[KEYFIELD] && x[STATUSFIELD] !== "0");
            html += `<tr>${show.map((c, ci) => `<td>${ci === 0 ? `${esc(r[c.FieldID])} ${dup ? '<span class="tag warn" style="background:var(--warnl);color:#a06d12">\u66F4\u65B0</span>' : '<span class="tag on">\u65B0\u589E</span>'}` : esc(c.OptionKey ? codeName(c.OptionKey, r[c.FieldID]) : r[c.FieldID])}</td>`).join("")}</tr>`;
        });
        html += `</tbody></table></div>`;
        $("importPreview").innerHTML = html;
        $("importPreview").style.display = "block";
    }
    function runImport() {
        const res = CDE.dispatch("DoImport", { Rows: RT.importRows });
        if (res.ReturnMsg.IsSuccess !== "Y") {
            toast("err", "\u532F\u5165\u5931\u6557", res.ReturnMsg.Message);
            return;
        }
        toast("suc", "\u532F\u5165\u5B8C\u6210", `\u65B0\u589E ${res.ReturnData.Inserted} \u7B46,\u66F4\u65B0 ${res.ReturnData.Updated} \u7B46`);
        closeModal("importMask");
        doQuery(1);
    }
    function renderExportCols() {
        const cols = DoInit.Features?.ExportSpec?.ExportColumns;
        if (!cols) {
            $("exportCols").innerHTML = "";
            return;
        }
        $("exportCols").innerHTML = cols.map((c, i) => `<label style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer">
    <input type="checkbox" class="chk" data-key="${c.DataKey}" checked>${esc(c.Header)}</label>`).join("");
    }
    function openExport() {
        $("exportScope").value = "current";
        $("exportMask").classList.add("open");
    }
    function exportSelected() {
        openExport();
        $("exportScope").value = "selected";
    }
    function runExport() {
        const scope = $("exportScope").value;
        const cols = [...document.querySelectorAll("#exportCols input:checked")].map((c) => c.dataset.key);
        const res = CDE.dispatch("DoExport", { Scope: scope, Columns: cols, Keys: [...RT.selected] });
        if (res.ReturnMsg.IsSuccess !== "Y") {
            toast("err", "\u532F\u51FA\u5931\u6557", res.ReturnMsg.Message);
            return;
        }
        const colDefs = DoInit.Features.ExportSpec.ExportColumns.filter((c) => cols.includes(c.DataKey));
        const header = colDefs.map((c) => c.Header).join(",");
        const lines = res.ReturnData.Rows.map((r) => colDefs.map((c) => {
            let v = r[c.DataKey];
            if (c.Format?.startsWith("CodeName:")) {
                v = codeName(c.Format.split(":")[1], v);
            }
            return `"${String(v ?? "").replace(/"/g, '""')}"`;
        }).join(","));
        let csv = "\uFEFF" + header + "\n" + lines.join("\n");
        if (DoInit.Features.ExportSpec.ExportRules.AppendQuerySummary)
            csv += `

"\u67E5\u8A62\u6458\u8981","\u532F\u51FA\u7BC4\u570D:${scope}","\u7B46\u6578:${res.ReturnData.RowCount}","\u532F\u51FA\u6642\u9593:${nowStr()}"`;
        downloadFile(csv, res.ReturnData.FileName.replace(".xlsx", ".csv"), "text/csv");
        toast("suc", "\u532F\u51FA\u5B8C\u6210", `\u5171 ${res.ReturnData.RowCount} \u7B46 \xB7 ${res.ReturnData.FileName}`);
        closeModal("exportMask");
    }
    function downloadFile(content, name, type) {
        const blob = new Blob([content], { type: type + ";charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
    }
    var RPT = null;
    function dispatchReport() {
        const res = CDE.dispatch("DoReport", { ReportType: $("rptType")?.value });
        RPT = res.ReturnData;
        renderReport();
        toast("suc", "\u5831\u8868\u5DF2\u7522\u751F", `\u8CC7\u6599\u6642\u9593 ${RPT.GeneratedAt}`);
    }
    function colTitle(field) {
        return (DoInit.View.ListView.FieldSpecs.find((f) => f.BindField === field) || {}).Title || field;
    }
    function reportCell(c, r) {
        const v = r[c.BindField];
        if (CODE[c.BindField]) return codeName(c.BindField, v);
        return v == null || v === "" ? "\u2014" : v;
    }
    function renderReportTypes() {
        const sel = $("rptType");
        if (!sel) return;
        const types = DoInit.View?.ReportView?.ReportTypes || [];
        sel.innerHTML = types.length ? types.map((t) => `<option value="${esc(t.Type)}">${esc(t.Title)}</option>`).join("") : `<option value="summary">\u5F59\u7E3D\u5831\u8868</option>`;
    }
    function renderReport() {
        if (!RPT) {
            const res = CDE.dispatch("DoReport", { ReportType: $("rptType")?.value });
            RPT = res.ReturnData;
        }
        const title = DoInit.PageMeta?.PageTitle || DoInit.FuncCode || "\u8CC7\u6599";
        const sys = `${DoInit.SystemCode || ""} / ${DoInit.ModuleCode || ""} / ${DoInit.FuncCode || ""}`;
        const head = `<div class="rpt-h"><h1>${esc(title)} \u2014 ${esc(RPT.Title || "\u5831\u8868")}</h1><div class="sub">\u914D\u7F6E\u9A45\u52D5\u5831\u8868${RPT.Dim ? `(\u4F9D\u300C${esc(colTitle(RPT.Dim))}\u300D\u5206\u7D44)` : ""}</div></div>
    <div class="rpt-meta"><span>\u7CFB\u7D71:${esc(sys)}\u3000\u79DF\u6236:${esc(DoInit.EntityID || "")}</span><span>\u7522\u88FD\u4EBA:${esc(UserInfo.UserName)}\u3000\u7522\u88FD\u6642\u9593:${esc(RPT.GeneratedAt)}</span></div>`;
        let body = "";
        if (RPT.Layout === "GroupTable" && RPT.Dim) {
            const total = RPT.Total || 0;
            body = `<table class="rpt-tbl"><thead><tr><th>${esc(colTitle(RPT.Dim))}</th><th>\u6578\u91CF</th><th>\u5360\u6BD4</th></tr></thead><tbody>
      ${Object.entries(RPT.Groups).map(([k, v]) => {
                const pct = total ? (Number(v) / total * 100).toFixed(1) : 0;
                return `<tr><td>${esc(k)}</td><td>${v}</td><td>${pct}%\u3000<span style="display:inline-block;height:8px;background:var(--pri);width:${+pct * 1.5}px;border-radius:4px;vertical-align:middle"></span></td></tr>`;
            }).join("")}
      <tr style="font-weight:700"><td>\u5408\u8A08</td><td>${total}</td><td>100%</td></tr></tbody></table>`;
        } else if (RPT.Layout === "PathTable" && PATHFIELD) {
            const tc = getTreeCfg();
            const sep = tc.Sep || "/";
            const rows = RPT.Rows.slice().sort((a, b) => String(a[PATHFIELD] ?? "").localeCompare(String(b[PATHFIELD] ?? "")));
            body = `<table class="rpt-tbl"><thead><tr><th>\u8DEF\u5F91</th><th>${esc(TITLEFIELD ? colTitle(TITLEFIELD) : "\u540D\u7A31")}</th>${PARENTFIELD ? "<th>\u4E0A\u5C64</th>" : ""}</tr></thead><tbody>
      ${rows.map((r) => {
                const depth = Math.max(0, String(r[PATHFIELD]).split(sep).length - 3);
                return `<tr><td style="font-family:var(--mono);font-size:10px">${esc(r[PATHFIELD])}</td><td>${"\u3000".repeat(depth)}${esc(r[TITLEFIELD] || "")}</td>${PARENTFIELD ? `<td>${esc(r[PARENTFIELD] || "\u2014")}</td>` : ""}</tr>`;
            }).join("")}
      </tbody></table>`;
        } else {
            let stats = `<div class="rpt-stats"><div class="rpt-stat"><div class="n">${RPT.Total}</div><div class="l">\u8CC7\u6599\u7E3D\u6578</div></div>`;
            Object.entries(RPT.Groups || {}).forEach(([k, v]) => {
                stats += `<div class="rpt-stat"><div class="n">${v}</div><div class="l">${esc(k)}</div></div>`;
            });
            stats += `</div>`;
            const cols = (DoInit.View.ListView.FieldSpecs || []).filter((f) => f.DefaultVisible).slice(0, 6);
            const sf = DoInit.View.ListView.ListSpec?.DefaultSort?.Field || KEYFIELD || ROWKEY;
            const rows = RPT.Rows.slice().sort((a, b) => String(a[sf] ?? "").localeCompare(String(b[sf] ?? ""), void 0, { numeric: true }));
            body = `${stats}<table class="rpt-tbl"><thead><tr>${cols.map((c) => `<th>${esc(c.Title)}</th>`).join("")}</tr></thead><tbody>
      ${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(reportCell(c, r))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
        }
        $("rptPage").innerHTML = head + body + `<div class="rpt-foot"><span>\u5146\u806F CDE V2.6 \xB7 \u914D\u7F6E\u9A45\u52D5\u5831\u8868\u5F15\u64CE</span><span>\u7B2C 1 \u9801 / \u5171 1 \u9801</span></div>`;
    }
    function exportReportPdf() {
        toast("info", "PDF \u7522\u88FD", "\u5831\u8868\u5DF2\u900F\u904E DevExpress Web Document Viewer \u7522\u51FA\uFF08\u793A\u7BC4\u74B0\u5883\u4EE5\u5217\u5370\u66FF\u4EE3\uFF09");
        window.print();
    }
    function renderMeta(cfg) {
        const pm = cfg.PageMeta || {}, ds = cfg.DataScope || {}, pg = cfg.CustomMeta?.BusinessRules?.PathGeneration || {};
        const dc = ds.DataConfig || {};
        $("metaKv").innerHTML = `
    <tr><td>\u529F\u80FD\u4EE3\u78BC FuncCode</td><td><code>${esc(cfg.FuncCode ?? "\u2014")}</code></td></tr>
    <tr><td>\u7CFB\u7D71 / \u6A21\u7D44</td><td><b>${esc(cfg.SystemCode ?? "\u2014")}</b> / ${esc(cfg.ModuleCode ?? "\u2014")}</td></tr>
    <tr><td>\u79DF\u6236\u5BE6\u9AD4 EntityID</td><td><code>${esc(cfg.EntityID ?? "\u2014")}</code> <span class="muted">(@UserInfo.EntityID \u7269\u7406\u9694\u96E2)</span></td></tr>
    <tr><td>\u8868\u55AE\u578B\u614B FormType</td><td><code>${esc(pm.FormType ?? "\u2014")}</code> \xB7 \u7DE8\u8F2F\u5448\u73FE <code>${esc(pm.EditDisplayType ?? "\u2014")}</code></td></tr>
    <tr><td>Widget</td><td><code>${esc(cfg.CustomMeta?.CustomSchema?.WidgetType ?? "\u2014")}</code></td></tr>
    <tr><td>\u8CC7\u6599\u7BC4\u570D DefaultWhere</td><td><code>${esc(ds.DefaultWhere ?? "\u2014")}</code></td></tr>
    <tr><td>\u6392\u5E8F SortExp</td><td><code>${esc(ds.SortExp ?? "\u2014")}</code></td></tr>
    <tr><td>\u6B0A\u9650\u5C64\u7D1A AuthLevel</td><td>${esc(ds.AuthLevel ?? "\u2014")} \xB7 RowLimit ${esc(dc.RowLimit ?? "\u2014")}</td></tr>
    <tr><td>\u8DEF\u5F91\u7522\u751F\u7B56\u7565</td><td><code>${esc(pg.Strategy ?? "\u2014")}</code> \xB7 \u6A23\u5F0F <code>${esc(pg.Pattern ?? "\u2014")}</code></td></tr>
    <tr><td>ConfigHash</td><td class="mono" style="font-size:10px;word-break:break-all">${esc(cfg.ConfigHash ?? "\u2014")}</td></tr>`;
        $("configDump").textContent = JSON.stringify(cfg, null, 2);
    }
    function copyConfig() {
        navigator.clipboard?.writeText(JSON.stringify(DoInit, null, 2));
        toast("suc", "\u5DF2\u8907\u88FD", "DoInit JSON \u914D\u7F6E\u5DF2\u8907\u88FD\u5230\u526A\u8CBC\u7C3F");
    }
    function switchView(v) {
        if (!DoInit) {
            toast("warn", "\u914D\u7F6E\u5C1A\u672A\u8F09\u5165", "\u8ACB\u5148\u8F09\u5165 JSON \u914D\u7F6E");
            return;
        }
        document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
        const el = $("view-" + v);
        if (el) el.classList.add("active");
        if (v === "report") {
            dispatchReport();
        }
    }
    function logDispatch(req, res) {
        RT.logSeq++;
        const entry = { seq: RT.logSeq, ts: (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-TW", { hour12: false }), req, res };
        RT.logs.unshift(entry);
        if (RT.logs.length > 30) RT.logs.pop();
        $("logCount").textContent = RT.logSeq;
        renderLog();
    }
    function renderLog() {
        if (RT.logs.length === 0) {
            $("logBody").innerHTML = `<div style="color:rgba(255,255,255,.35);text-align:center;padding:30px 0">\u5C1A\u7121\u6D3E\u767C\u7D00\u9304</div>`;
            return;
        }
        $("logBody").innerHTML = RT.logs.map((e) => {
            const ok = e.res.ReturnMsg.IsSuccess === "Y";
            const inJson = JSON.stringify(e.req.InputData);
            const rm = e.res.ReturnMsg;
            const rdPreview = JSON.stringify(e.res.ReturnData).slice(0, 260);
            return `<div class="log-entry ${ok ? "" : "err"}">
      <div class="log-act"><span class="pill">#${e.seq}</span>spf_cde_DoDispatch \xB7 @Action=${esc(e.req.Action)}<span class="ts">${e.ts}</span></div>
      <div class="log-kv">@UserInfo.EntityID = <b>${esc(e.req.UserInfo.EntityID)}</b> \xB7 AuthLevel=${e.req.UserInfo.AuthLevel}</div>
      <div class="log-kv">\u2192 @InputData:</div>
      <div class="log-json in">${esc(inJson.length > 260 ? inJson.slice(0, 260) + " \u2026" : inJson)}</div>
      <div class="log-kv">\u2190 @ReturnMsg: <b>${rm.IsSuccess}</b> / ${esc(rm.ReturnCode)} / ${esc(rm.Message)} (Affected=${rm.AffectedCount})</div>
      <div class="log-kv">\u2190 @ReturnData:</div>
      <div class="log-json">${esc(rdPreview)}${JSON.stringify(e.res.ReturnData).length > 260 ? " \u2026" : ""}</div>
    </div>`;
        }).join("");
    }
    function toggleLog() {
        $("logPanel").classList.toggle("open");
    }
    function clearLog() {
        RT.logs = [];
        RT.logSeq = 0;
        $("logCount").textContent = "0";
        renderLog();
    }
    function toast(type, title, sub) {
        const icMap = { suc: "ri-checkbox-circle-line", err: "ri-close-circle-line", warn: "ri-error-warning-line", info: "ri-information-line" };
        const el = document.createElement("div");
        el.className = `toast ${type}`;
        el.innerHTML = `<i class="${icMap[type]}"></i><div class="tx"><div class="tt">${esc(title)}</div>${sub ? `<div class="ts">${esc(sub)}</div>` : ""}</div>`;
        $("toastWrap").appendChild(el);
        setTimeout(() => {
            el.style.transition = "all .25s";
            el.style.opacity = "0";
            el.style.transform = "translateX(110%)";
            setTimeout(() => el.remove(), 250);
        }, 3200);
    }
    function injectSurveyCSS() {
        if (document.getElementById("cde-survey-style")) return;
        const css = `
  #surveyHost{max-width:840px;margin:0 auto}
  .sv-hd{border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh);margin-bottom:16px}
  .sv-hd .bar{background:linear-gradient(135deg,#1f5fd0,#3d4d8a);color:#fff;padding:18px 22px}
  .sv-hd .bar h2{font-size:19px;font-weight:600;display:flex;align-items:center;gap:9px}
  .sv-hd .bar .meta{font-size:12px;opacity:.92;margin-top:6px;display:flex;gap:14px;flex-wrap:wrap}
  .sv-hd .intro{padding:13px 22px;font-size:13px;color:#5b6270;background:#fafbfd;border-top:1px solid var(--bdr)}
  .sv-prog{height:5px;background:#eef0f3}.sv-prog>i{display:block;height:100%;background:linear-gradient(90deg,#1f5fd0,#0ab39c);transition:width .25s}
  .sv-grp{margin-bottom:18px}
  .sv-ghd{display:flex;align-items:center;justify-content:space-between;padding:9px 4px;margin-bottom:8px;border-bottom:2px solid var(--pril,#eaf0fc)}
  .sv-ghd .gi{width:27px;height:27px;border-radius:8px;background:var(--pri);color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px;margin-right:9px}
  .sv-ghd .gn{font-size:15px;font-weight:600}.sv-ghd .gd{font-size:12px;color:var(--muted)}
  .sv-ghd .gw{font-size:12px;color:var(--muted)}.sv-ghd .gw b{color:var(--pri);font-family:var(--mono,monospace)}
  .sv-q{background:#fff;border:1px solid var(--bdr);border-radius:var(--r);box-shadow:var(--sh);padding:15px 17px;margin-bottom:11px}
  .sv-q.invalid{border-color:var(--dan);box-shadow:0 0 0 2px var(--danl)}
  .sv-qt{font-size:14px;font-weight:600;margin-bottom:4px}.sv-qt .seq{color:var(--pri);font-family:var(--mono,monospace);font-weight:700;margin-right:5px}.sv-qt .rq{color:var(--dan);font-weight:700;margin-left:4px}
  .sv-help{font-size:12px;color:var(--muted);margin-bottom:10px}
  .sv-opts{display:flex;flex-direction:column;gap:8px}
  .sv-opt{display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid var(--bdr);border-radius:7px;cursor:pointer;font-size:13px;background:#fff}
  .sv-opt:hover{border-color:var(--pri);background:var(--pril,#eaf0fc)}.sv-opt.sel{border-color:var(--pri);background:var(--pril,#eaf0fc);font-weight:600}
  .sv-opt .mk{width:18px;height:18px;border:2px solid #ced4da;border-radius:50%;flex-shrink:0;display:grid;place-items:center}
  .sv-opt.multi .mk{border-radius:4px}.sv-opt.sel .mk{border-color:var(--pri);background:var(--pri)}.sv-opt.sel .mk:after{content:'';width:8px;height:8px;background:#fff;border-radius:inherit}
  .sv-opt .sc{margin-left:auto;font-size:11px;color:var(--muted);font-family:var(--mono,monospace)}
  .sv-scale{display:flex;gap:6px}.sv-scale .s{flex:1;text-align:center;padding:9px 4px;border:1px solid var(--bdr);border-radius:7px;cursor:pointer;font-size:12px}
  .sv-scale .s:hover{border-color:var(--pri);background:var(--pril,#eaf0fc)}.sv-scale .s.sel{border-color:var(--pri);background:var(--pri);color:#fff;font-weight:600}
  .sv-scale .s .v{font-size:16px;font-weight:700;font-family:var(--mono,monospace);display:block}
  .sv-rate{display:flex;align-items:center;gap:14px}.sv-rate input[type=range]{flex:1;accent-color:var(--pri)}
  .sv-rate .num{width:64px;text-align:center;font-family:var(--mono,monospace);font-size:17px;font-weight:700;color:var(--pri);border:2px solid var(--bdr);border-radius:8px;padding:5px}
  .sv-stars{display:flex;gap:5px;font-size:27px;color:#dfe3e8}.sv-stars i{cursor:pointer}.sv-stars i.on{color:var(--warn)}
  .sv-yn{display:flex;gap:10px}.sv-yn .b{flex:1;padding:10px;text-align:center;border:1px solid var(--bdr);border-radius:7px;cursor:pointer;font-weight:600}
  .sv-yn .b.sel.y{border-color:var(--suc);background:var(--sucl);color:#08877a}.sv-yn .b.sel.n{border-color:var(--dan);background:var(--danl);color:#c8472f}
  .sv-q input.t,.sv-q textarea,.sv-q input.dt,.sv-q input.nm{width:100%;border:1px solid var(--bdr);border-radius:7px;padding:9px 11px;font-family:inherit;font-size:13px}
  .sv-q textarea{resize:vertical;min-height:64px}.sv-other{margin-top:7px;width:100%;border:1px solid var(--bdr);border-radius:6px;padding:7px 10px;font-size:13px}
  .sv-mtx{width:100%;border-collapse:collapse;font-size:12px}.sv-mtx th{padding:6px 5px;text-align:center;color:var(--muted);border-bottom:1px solid var(--bdr)}
  .sv-mtx td{padding:6px 5px;text-align:center;border-bottom:1px solid #f0f1f3}.sv-mtx td.sub{text-align:left;font-weight:500}
  .sv-mtx .r{width:18px;height:18px;border:2px solid #ced4da;border-radius:50%;display:inline-block;cursor:pointer}.sv-mtx .r.sel{border-color:var(--pri);background:var(--pri);box-shadow:inset 0 0 0 3px #fff}
  .sv-cond{font-size:11px;color:var(--info);margin-top:3px}
  .sv-foot{position:sticky;bottom:0;background:#fff;border:1px solid var(--bdr);border-radius:var(--r);box-shadow:var(--sh2);padding:13px 18px;display:flex;justify-content:space-between;align-items:center;margin-top:14px}
  .sv-foot .calc{display:flex;gap:22px}.sv-foot .calc .k{font-size:11px;color:var(--muted)}.sv-foot .calc .v{font-size:21px;font-weight:700;font-family:var(--mono,monospace);color:var(--pri)}
  .sv-foot .acts{display:flex;gap:9px}`;
        const st = document.createElement("style");
        st.id = "cde-survey-style";
        st.textContent = css;
        document.head.appendChild(st);
    }
    function svGradeOf(s) {
        var gr = RT.surveySpec && RT.surveySpec.Bank && RT.surveySpec.Bank.GradeRule || [{ Grade: "S", Min: 95 }, { Grade: "A", Min: 85 }, { Grade: "B", Min: 70 }, { Grade: "C", Min: 60 }, { Grade: "D", Min: 0 }];
        for (var i = 0; i < gr.length; i++) {
            if (s >= gr[i].Min) return gr[i].Grade;
        }
        return "D";
    }
    function svAnswered(v) {
        if (v == null || v === "") return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === "object") return Object.keys(v).length > 0;
        return true;
    }
    function svVisible() {
        var out = [], A = RT.surveyAns;
        (RT.surveySpec.Groups || []).forEach(function (g) {
            (g.Questions || []).forEach(function (q) {
                if (q.Condition && A[q.Condition.QuestionCode] !== q.Condition.Equals) return;
                out.push({ g, q });
            });
        });
        return out;
    }
    function svQScore(q, v) {
        if (v == null) return null;
        if (q.QuestionType === "rating") return v / (q.Max || 100) * (q.MaxScore || 100);
        if (q.QuestionType === "yesno") return v === "Y" ? q.YesScore == null ? 100 : q.YesScore : q.NoScore == null ? 0 : q.NoScore;
        if (q.QuestionType === "scale" || q.QuestionType === "single") {
            var o = (q.Options || []).filter(function (o2) {
                return o2.OptionCode === v;
            })[0];
            return o && o.OptionScore != null ? o.OptionScore : null;
        }
        return null;
    }
    function svRecalc() {
        var spec = RT.surveySpec, A = RT.surveyAns;
        svUpdateProgress();
        if (!spec || spec.Bank.ScoringMode !== "weighted") return null;
        var total = 0, wsum = 0;
        spec.Groups.forEach(function (g) {
            var gs = 0, gw = 0;
            g.Questions.forEach(function (q) {
                var s = svQScore(q, A[q.QuestionCode]);
                if (s != null) {
                    gs += s * (q.QuestionWeight || 0) / 100;
                    gw += q.QuestionWeight || 0;
                }
            });
            if (gw > 0) {
                total += gs * (100 / gw) * (g.GroupWeight || 0) / 100;
                wsum += g.GroupWeight || 0;
            }
        });
        var fin = wsum > 0 ? total * (100 / wsum) : 0;
        var all = svVisible().every(function (x) {
            return svQScore(x.q, A[x.q.QuestionCode]) != null;
        });
        var ts = $("svTotal");
        if (ts) ts.textContent = all ? fin.toFixed(1) : "\u2014";
        var gb = $("svGrade");
        if (gb) gb.innerHTML = all ? '<span class="tag ' + svGradeOf(fin) + '">' + svGradeOf(fin) + "</span>" : '<span class="muted" style="font-size:13px">\u586B\u5BEB\u4E2D</span>';
        return fin;
    }
    function svUpdateProgress() {
        var vis = svVisible(), A = RT.surveyAns;
        var done = vis.filter(function (x) {
            return svAnswered(A[x.q.QuestionCode]);
        }).length;
        var pct = vis.length ? Math.round(done / vis.length * 100) : 0;
        var p = $("svProg");
        if (p) p.style.width = pct + "%";
        var t = $("svProgTxt");
        if (t) t.textContent = done + "/" + vis.length;
    }
    function svApplyConditions() {
        var A = RT.surveyAns;
        (RT.surveySpec.Groups || []).forEach(function (g) {
            (g.Questions || []).forEach(function (q) {
                if (q.Condition) {
                    var ok = A[q.Condition.QuestionCode] === q.Condition.Equals;
                    var el = $("svq_" + q.QuestionCode);
                    if (el) el.style.display = ok ? "" : "none";
                }
            });
        });
    }
    function svRerender() {
        renderSurvey(RT.surveyCfg);
    }
    function svInput(q, val) {
        var t = q.QuestionType, A = RT.surveyAns;
        if (t === "single" || t === "multiple") {
            var multi = t === "multiple", arr = Array.isArray(val) ? val : val != null ? [val] : [];
            return '<div class="sv-opts">' + (q.Options || []).map(function (o) {
                var sel = arr.indexOf(o.OptionCode) >= 0;
                return '<div class="sv-opt ' + (multi ? "multi " : "") + (sel ? "sel" : "") + '" data-svopt="' + o.OptionCode + '" data-svq="' + q.QuestionCode + '" data-svtype="' + t + '"><span class="mk"></span><span>' + esc(o.OptionText) + "</span>" + (o.OptionScore != null ? '<span class="sc">' + o.OptionScore + "\u5206</span>" : "") + (o.AllowInput && sel ? '<input class="sv-other" placeholder="\u8ACB\u8AAA\u660E..." data-svother="' + q.QuestionCode + '" onclick="event.stopPropagation()">' : "") + "</div>";
            }).join("") + "</div>";
        }
        if (t === "scale") {
            return '<div class="sv-scale">' + (q.Options || []).map(function (o) {
                return '<div class="s ' + (val === o.OptionCode ? "sel" : "") + '" data-svopt="' + o.OptionCode + '" data-svq="' + q.QuestionCode + '" data-svtype="scale"><span class="v">' + esc(o.OptionCode) + "</span>" + esc(o.OptionText) + "</div>";
            }).join("") + "</div>";
        }
        if (t === "rating") {
            var v = val == null ? q.Min || 0 : val;
            return '<div class="sv-rate"><input type="range" min="' + (q.Min || 0) + '" max="' + (q.Max || 100) + '" step="' + (q.Step || 1) + '" value="' + v + '" data-svrange="' + q.QuestionCode + '"><input class="num" type="number" min="' + (q.Min || 0) + '" max="' + (q.Max || 100) + '" value="' + (val == null ? "" : val) + '" placeholder="\u2014" data-svnum="' + q.QuestionCode + '"></div>';
        }
        if (t === "stars") {
            var sv = val || 0, mx = q.Max || 5, s = "";
            for (var i = 1; i <= mx; i++) s += '<i class="ri-star-' + (i <= sv ? "fill" : "line") + " " + (i <= sv ? "on" : "") + '" data-svstar="' + i + '" data-svq="' + q.QuestionCode + '"></i>';
            return '<div class="sv-stars">' + s + "</div>";
        }
        if (t === "yesno") {
            return '<div class="sv-yn"><div class="b y ' + (val === "Y" ? "sel" : "") + '" data-svyn="Y" data-svq="' + q.QuestionCode + '"><i class="ri-check-line"></i> \u662F</div><div class="b n ' + (val === "N" ? "sel" : "") + '" data-svyn="N" data-svq="' + q.QuestionCode + '"><i class="ri-close-line"></i> \u5426</div></div>';
        }
        if (t === "textarea") return '<textarea data-svtxt="' + q.QuestionCode + '" placeholder="' + esc(q.Placeholder || "") + '">' + esc(val || "") + "</textarea>";
        if (t === "text") return '<input class="t" data-svtxt="' + q.QuestionCode + '" placeholder="' + esc(q.Placeholder || "") + '" value="' + esc(val || "") + '">';
        if (t === "number") return '<input class="nm" type="number" data-svtxt="' + q.QuestionCode + '" placeholder="' + esc(q.Placeholder || "") + '" value="' + (val == null ? "" : val) + '">';
        if (t === "date") return '<input class="dt" type="date" data-svtxt="' + q.QuestionCode + '" value="' + esc(val || "") + '">';
        if (t === "matrix") {
            var head = "<tr><th></th>" + (q.Options || []).map(function (o) {
                return "<th>" + esc(o.OptionText) + "</th>";
            }).join("") + "</tr>";
            var rows = (q.SubQuestions || []).map(function (sq) {
                var cur = (val || {})[sq.Code];
                return '<tr><td class="sub">' + esc(sq.Text) + "</td>" + (q.Options || []).map(function (o) {
                    return '<td><span class="r ' + (cur === o.OptionCode ? "sel" : "") + '" data-svmtx="' + q.QuestionCode + '" data-svsub="' + sq.Code + '" data-svopt="' + o.OptionCode + '"></span></td>';
                }).join("") + "</tr>";
            }).join("");
            return '<table class="sv-mtx"><thead>' + head + "</thead><tbody>" + rows + "</tbody></table>";
        }
        return '<div class="muted">\u672A\u652F\u63F4\u984C\u578B:' + esc(t) + "</div>";
    }
    function svBind() {
        var host = $("surveyHost"), A = RT.surveyAns;
        host.querySelectorAll(".sv-opt").forEach(function (el) {
            el.onclick = function () {
                var q = el.getAttribute("data-svq"), opt = el.getAttribute("data-svopt"), multi = el.getAttribute("data-svtype") === "multiple";
                if (multi) {
                    var a = Array.isArray(A[q]) ? A[q].slice() : [];
                    var i = a.indexOf(opt);
                    i >= 0 ? a.splice(i, 1) : a.push(opt);
                    A[q] = a;
                } else A[q] = opt;
                svRerender();
            };
        });
        host.querySelectorAll(".sv-scale .s").forEach(function (el) {
            el.onclick = function () {
                A[el.getAttribute("data-svq")] = el.getAttribute("data-svopt");
                svRerender();
            };
        });
        host.querySelectorAll(".sv-yn .b").forEach(function (el) {
            el.onclick = function () {
                A[el.getAttribute("data-svq")] = el.getAttribute("data-svyn");
                svRerender();
            };
        });
        host.querySelectorAll(".sv-stars i").forEach(function (el) {
            el.onclick = function () {
                A[el.getAttribute("data-svq")] = +el.getAttribute("data-svstar");
                svRerender();
            };
        });
        host.querySelectorAll("input[data-svrange]").forEach(function (el) {
            el.oninput = function () {
                var q = el.getAttribute("data-svrange");
                A[q] = +el.value;
                var n = host.querySelector('input[data-svnum="' + q + '"]');
                if (n) n.value = el.value;
                svRecalc();
            };
        });
        host.querySelectorAll("input[data-svnum]").forEach(function (el) {
            el.oninput = function () {
                var q = el.getAttribute("data-svnum");
                A[q] = el.value === "" ? null : +el.value;
                var r = host.querySelector('input[data-svrange="' + q + '"]');
                if (r && el.value !== "") r.value = el.value;
                svRecalc();
            };
        });
        host.querySelectorAll("[data-svtxt]").forEach(function (el) {
            el.oninput = function () {
                A[el.getAttribute("data-svtxt")] = el.value;
                svUpdateProgress();
            };
        });
        host.querySelectorAll("[data-svother]").forEach(function (el) {
            el.oninput = function () {
                A["_other_" + el.getAttribute("data-svother")] = el.value;
            };
        });
        host.querySelectorAll(".sv-mtx .r").forEach(function (el) {
            el.onclick = function () {
                var q = el.getAttribute("data-svmtx");
                A[q] = A[q] || {};
                A[q][el.getAttribute("data-svsub")] = el.getAttribute("data-svopt");
                svRerender();
            };
        });
    }
    function svRequiredMissing() {
        var A = RT.surveyAns;
        return svVisible().filter(function (x) {
            return x.q.IsRequired && !svAnswered(A[x.q.QuestionCode]);
        });
    }
    function svSaveDraft() {
        var spec = RT.surveySpec;
        CDE.dispatch("DoSaveDraft", { BankCode: spec.Bank.BankCode, Answers: svCollect() });
        toast("info", "\u5DF2\u66AB\u5B58", "survResponse.DocStatus=0");
    }
    function svCollect() {
        var spec = RT.surveySpec, A = RT.surveyAns, out = [];
        spec.Groups.forEach(function (g) {
            g.Questions.forEach(function (q) {
                var v = A[q.QuestionCode];
                if (v == null || v === "") return;
                out.push({ GroupCode: g.GroupCode, QuestionCode: q.QuestionCode, AnswerValue: Array.isArray(v) ? v.join(",") : typeof v === "object" ? JSON.stringify(v) : String(v), AnswerText: A["_other_" + q.QuestionCode] || null });
            });
        });
        return out;
    }
    function svSubmit() {
        var miss = svRequiredMissing();
        document.querySelectorAll(".sv-q").forEach(function (e) {
            e.classList.remove("invalid");
        });
        if (miss.length) {
            miss.forEach(function (x) {
                var el = $("svq_" + x.q.QuestionCode);
                if (el) el.classList.add("invalid");
            });
            var f = $("svq_" + miss[0].q.QuestionCode);
            if (f && f.scrollIntoView) f.scrollIntoView({ behavior: "smooth", block: "center" });
            toast("warn", "\u5FC5\u586B\u672A\u5B8C\u6210", miss.length + " \u984C\u5FC5\u586B\u672A\u4F5C\u7B54");
            return;
        }
        var spec = RT.surveySpec, total = null, grade = null;
        if (spec.Bank.ScoringMode === "weighted") {
            total = svRecalc();
            grade = svGradeOf(total);
        }
        var res = CDE.dispatch("DoSubmit", { BankCode: spec.Bank.BankCode, Answers: svCollect(), TotalScore: total, Grade: grade });
        if (res.ReturnMsg.IsSuccess === "Y") toast("suc", "\u5DF2\u9001\u51FA", spec.Bank.ScoringMode === "weighted" ? "\u52A0\u6B0A\u7E3D\u5206 " + total.toFixed(1) + " \xB7 \u7B49\u7D1A " + grade : "ResponseNo " + res.ReturnData.ResponseNo);
        else toast("err", "\u9001\u51FA\u5931\u6557", res.ReturnMsg.Message);
    }
    function renderSurvey(cfg) {
        injectSurveyCSS();
        RT.surveyCfg = cfg;
        RT.surveySpec = cfg.SurveySpec;
        RT.surveyAns = RT.surveyAns || {};
        var spec = RT.surveySpec, b = spec.Bank, A = RT.surveyAns;
        var vg = $("view-grid");
        Array.prototype.forEach.call(vg.children, function (c) {
            if (c.classList && c.classList.contains("card")) c.style.display = "none";
        });
        var host = $("surveyHost");
        if (!host) {
            host = document.createElement("div");
            host.id = "surveyHost";
            vg.appendChild(host);
        }
        host.style.display = "";
        var seq = 0, gi = 0, html = "";
        (spec.Groups || []).forEach(function (g) {
            gi++;
            var qh = "";
            (g.Questions || []).forEach(function (q) {
                seq++;
                qh += '<div class="sv-q" id="svq_' + q.QuestionCode + '"><div class="sv-qt"><span class="seq">' + seq + ".</span>" + esc(q.QuestionText) + (q.IsRequired ? '<span class="rq">*</span>' : "") + "</div>" + (q.HelpText ? '<div class="sv-help">' + esc(q.HelpText) + "</div>" : "") + svInput(q, A[q.QuestionCode]) + (q.Condition ? '<div class="sv-cond"><i class="ri-git-branch-line"></i> \u689D\u4EF6\u984C\uFF1A\u7576\u300C' + esc(q.Condition.QuestionCode) + "=" + esc(q.Condition.Equals) + "\u300D\u6642\u986F\u793A</div>" : "") + "</div>";
            });
            html += '<div class="sv-grp"><div class="sv-ghd"><div style="display:flex;align-items:center"><span class="gi">' + gi + '</span><div><div class="gn">' + esc(g.GroupName) + "</div>" + (g.GroupDesc ? '<div class="gd">' + esc(g.GroupDesc) + "</div>" : "") + "</div></div>" + (g.GroupWeight ? '<div class="gw">\u7FA4\u7D44\u6B0A\u91CD <b>' + g.GroupWeight + "%</b></div>" : "") + "</div>" + qh + "</div>";
        });
        var scoring = b.ScoringMode === "weighted";
        host.innerHTML = '<div class="sv-hd"><div class="bar"><h2><i class="ri-survey-line"></i> ' + esc(b.BankName) + ' <span class="tag ' + esc(b.BankType) + '">' + esc(b.BankType) + '</span></h2><div class="meta">' + (b.Respondent ? '<span><i class="ri-user-line"></i> ' + esc(b.Respondent) + "</span>" : "") + (b.Period ? '<span><i class="ri-calendar-line"></i> ' + esc(b.Period) + "</span>" : "") + '<span><i class="ri-price-tag-3-line"></i> ' + esc(b.BankCode) + " \xB7 v" + esc(b.Version || "1.0") + "</span>" + (b.Anonymous ? '<span><i class="ri-spy-line"></i> \u533F\u540D</span>' : "") + "</div></div>" + (b.Intro ? '<div class="intro">' + esc(b.Intro) + "</div>" : "") + '<div class="sv-prog"><i id="svProg" style="width:0%"></i></div></div><div id="svForm">' + html + '</div><div class="sv-foot"><div class="calc"><div><div class="k">\u4F5C\u7B54\u9032\u5EA6</div><div class="v"><span id="svProgTxt">0/0</span></div></div>' + (scoring ? '<div><div class="k">\u52A0\u6B0A\u7E3D\u5206</div><div class="v"><span id="svTotal">\u2014</span></div></div><div><div class="k">\u7B49\u7D1A</div><div class="v"><span id="svGrade">\u2014</span></div></div>' : "") + '</div><div class="acts"><button class="btn btn-def" data-act="surveyDraft"><i class="ri-save-line"></i>\u66AB\u5B58</button><button class="btn btn-pri" data-act="surveySubmit"><i class="ri-send-plane-line"></i>\u9001\u51FA</button></div></div>';
        svBind();
        svApplyConditions();
        svRecalc();
    }
    function restoreGridCards() {
        var vg = $("view-grid");
        if (!vg) return;
        var sh = $("surveyHost");
        if (sh) sh.style.display = "none";
        Array.prototype.forEach.call(vg.children, function (c) {
            if (c.classList && c.classList.contains("card")) c.style.display = "";
        });
    }
    function validateConfig(cfg) {
        if (!cfg || typeof cfg !== "object") return "\u914D\u7F6E\u4E0D\u662F\u6709\u6548\u7684 JSON \u7269\u4EF6";
        if (!cfg.PageMeta) return "\u7F3A\u5C11 PageMeta \u5340\u6BB5";
        const __ft = cfg.PageMeta?.FormType;
        if (__ft === "SurveyForm" || __ft === "SurveyBank") {
            if (!cfg.SurveySpec?.Bank) return "\u7F3A\u5C11 SurveySpec.Bank";
            if (!Array.isArray(cfg.SurveySpec?.Groups)) return "\u7F3A\u5C11 SurveySpec.Groups";
        } else {
            if (!cfg.View?.ListView?.FieldSpecs) return "\u7F3A\u5C11 View.ListView.FieldSpecs";
        }
        if (!cfg.Resources?.CodeSets) return "\u7F3A\u5C11 Resources.CodeSets";
        return null;
    }
    function applyConfig(cfg, source, label) {
        const err = validateConfig(cfg);
        if (err) {
            toast("err", "\u914D\u7F6E\u4E0D\u7B26\u5408 CDE \u7D50\u69CB", err);
            return false;
        }
        DoInit = cfg;
        __configSource = source;
        initDerived();
        bootstrap();
        setConfigSource(source, label);
        return true;
    }
    function setConfigSource(source, label) {
        const url = configUrlFor(CURRENT_FUNC);
        const el = $("cfgSrc");
        const mini = $("cfgSrcMini");
        let cls = "cfg-src fallback", html = "";
        if (source === "external") {
            cls = "cfg-src live";
            html = `<i class="ri-link"></i>\u914D\u7F6E\u4F86\u6E90\uFF1A${esc(label || url)} (\u52D5\u614B\u8B80\u53D6)`;
        } else if (source === "upload") {
            cls = "cfg-src upload";
            html = `<i class="ri-file-upload-line"></i>\u914D\u7F6E\u4F86\u6E90\uFF1A\u5DF2\u4E0A\u50B3 ${esc(label || "JSON")}`;
        } else if (source === "loading") {
            cls = "cfg-src fallback";
            html = `<i class="ri-loader-4-line"></i>\u914D\u7F6E\u4F86\u6E90\uFF1A\u8B80\u53D6\u4E2D\u2026`;
        } else {
            cls = "cfg-src fallback";
            html = `<i class="ri-error-warning-line"></i>\u5C1A\u672A\u8F09\u5165\u914D\u7F6E${label ? `\uFF08${esc(label)}\uFF09` : ""}`;
        }
        if (el) {
            el.className = cls;
            el.innerHTML = html;
        }
        if (mini) {
            mini.className = cls;
            mini.innerHTML = html;
        }
        const dot = $("devFabSrcDot");
        if (dot) {
            dot.className = "devfab-srcdot " + (source === "external" ? "live" : source === "upload" ? "upload" : source === "loading" ? "loading" : "fallback");
        }
    }
    async function tryLoadExternal(silent, funcCode = CURRENT_FUNC, folder) {
        CURRENT_FUNC = funcCode;
        CURRENT_FOLDER = folder != null ? folder : folderForFunc(funcCode);
        const url = configUrlFor(funcCode, CURRENT_FOLDER);
        try {
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const txt = await res.text();
            const cfg = JSON.parse(txt);
            const ok = applyConfig(cfg, "external", url);
            return ok;
        } catch (e) {
            if (!silent) toast("warn", "\u7121\u6CD5\u8B80\u53D6\u5916\u90E8\u914D\u7F6E", `${url}:${e.message}\u3002\u53EF\u6539\u7528\u300C\u8F09\u5165 JSON \u914D\u7F6E\u300D\u4E0A\u50B3\u6216\u62D6\u653E\u3002`);
            return false;
        }
    }
    function reloadExternalConfig() {
        tryLoadExternal(false, CURRENT_FUNC, CURRENT_FOLDER);
    }
    function loadConfigFromFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            let cfg;
            try {
                cfg = JSON.parse(String(ev.target.result));
            } catch (e) {
                toast("err", "JSON \u89E3\u6790\u5931\u6557", e.message);
                return;
            }
            const ok = applyConfig(cfg, "upload", file.name);
            void ok;
        };
        reader.onerror = () => toast("err", "\u8B80\u6A94\u5931\u6557", file.name);
        reader.readAsText(file, "utf-8");
    }
    function bindDropZone() {
        const bz = $("cfgModalMask") || $("cfgBanner");
        if (!bz) return;
        ["dragenter", "dragover"].forEach((t) => bz.addEventListener(t, (e) => {
            e.preventDefault();
            bz.classList.add("drag");
        }));
        ["dragleave", "drop"].forEach((t) => bz.addEventListener(t, (e) => {
            e.preventDefault();
            bz.classList.remove("drag");
        }));
        bz.addEventListener("drop", (e) => {
            const f = e.dataTransfer?.files?.[0];
            if (f) loadConfigFromFile(f);
        });
    }
    function showNoConfigPrompt() {
        const url = configUrlFor(CURRENT_FUNC);
        setConfigSource("none", "\u5916\u90E8\u6A94\u4E0D\u53EF\u8B80");
        const gb = $("gridBody");
        if (gb) gb.innerHTML = `<tr><td colspan="20"><div class="empty">
    <i class="ri-folder-open-line"></i>
    <p style="font-weight:600">\u5C1A\u672A\u8F09\u5165\u914D\u7F6E ${esc(url)}</p>
    <p style="font-size:12px;color:var(--muted);max-width:540px;margin:6px auto 0;line-height:1.7">
      \u591A\u6A94\u67B6\u69CB\u9700\u900F\u904E HTTP \u4F3A\u670D\u5668\u958B\u555F (\u4F8B\u5982 VS Code Live Server / IIS),\u700F\u89BD\u5668\u624D\u80FD\u8B80\u53D6\u540C\u76EE\u9304\u7684 JSON\u3002
      \u82E5\u4EE5 file:// \u76F4\u63A5\u958B\u555F,\u8ACB\u6539\u7528\u4E0A\u65B9\u300C\u8F09\u5165 JSON \u914D\u7F6E\u300D\u6309\u9215,\u6216\u5C07 JSON \u6A94\u62D6\u653E\u5230\u4E0A\u65B9\u6A6B\u5E45\u3002
    </p></div></td></tr>`;
    }
    async function loadMenu() {
        try {
            const r = await fetch(MENU_URL, { cache: "no-store" });
            if (!r.ok) throw new Error("HTTP " + r.status);
            MENU = JSON.parse(await r.text());
        } catch (e) {
            MENU = null;
        }
        renderMenu();
    }
    async function loadApps() {
        try {
            const r = await fetch(APPS_URL, { cache: "no-store" });
            if (r.ok) {
                const j = JSON.parse(await r.text());
                APPS = Array.isArray(j.Apps) ? j.Apps : [];
            } else APPS = [];
        } catch (e) {
            APPS = [];
        }
        renderModSwitch();
    }
    function currentApp() {
        return APPS.find((a) => String(a.Folder || "").toLowerCase() === ACTIVE_MODULE) || null;
    }
    function renderModSwitch() {
        const cur = currentApp();
        const lbl = $("modSwLabel"), ic = $("modSwIcon"), list = $("modSwList");
        if (lbl) lbl.textContent = cur ? cur.Label || cur.Code || "\u6A21\u7D44" : ACTIVE_MODULE.toUpperCase() || "\u6A21\u7D44";
        if (ic) ic.className = "modsw-ic " + esc(cur && cur.Icon || "ri-apps-2-line");
        if (!list) return;
        if (!APPS.length) {
            list.innerHTML = `<div class="modsw-empty">\u5C1A\u672A\u8A2D\u5B9A\u6A21\u7D44<span>modules.txt</span></div>`;
            return;
        }
        list.innerHTML = APPS.map((a) => {
            const folder = String(a.Folder || "").toLowerCase();
            const on = folder === ACTIVE_MODULE;
            return `<button class="modsw-item${on ? " active" : ""}" data-act="switchModule" data-arg="${esc(folder)}">
      <span class="modsw-item-ic"><i class="${esc(a.Icon || "ri-apps-2-line")}"></i></span>
      <span class="modsw-item-tx"><b>${esc(a.Label || a.Code || folder)}</b><em>${esc(a.Sub || a.Code || "")}</em></span>
      ${on ? `<i class="ri-check-line modsw-item-ck"></i>` : `<i class="ri-arrow-right-s-line modsw-item-go"></i>`}
    </button>`;
        }).join("");
    }
    function toggleModSwitch() {
        $("modSwitch")?.classList.toggle("open");
    }
    function closeModSwitch() {
        $("modSwitch")?.classList.remove("open");
    }
    async function switchModule(folder) {
        const f = String(folder || "").toLowerCase().trim();
        closeModSwitch();
        if (!f || f === ACTIVE_MODULE) return;
        ACTIVE_MODULE = f;
        MENU_URL = `${ACTIVE_MODULE}/menu.txt`;
        try {
            const u = new URL(location.href);
            u.searchParams.set("m", f);
            history.replaceState(null, "", u.toString());
        } catch (e) {
        }
        await loadMenu();
        renderModSwitch();
        const first = firstFuncOfMenu();
        if (first) {
            CURRENT_FOLDER = first.folder;
            await loadFuncConfig(first.fc, first.folder);
        } else showNoConfigPrompt();
    }
    function renderBrand() {
        const b = MENU && MENU.Brand || {};
        const mark = $("sbLogoMark"), name = $("sbLogoName"), sub = $("sbLogoSub");
        if (mark && b.Mark) mark.textContent = b.Mark;
        if (name && b.Name) {
            name.textContent = b.Name;
            BRAND_NAME = b.Name;
        }
        if (sub && b.Sub) sub.textContent = b.Sub;
        if (b.Name) document.title = b.Name;
    }
    function renderMenu() {
        renderBrand();
        const nav = $("sidebarNav");
        if (!nav) return;
        if (!MENU || !Array.isArray(MENU.Groups)) {
            nav.innerHTML = `<div class="muted" style="padding:14px 18px;font-size:11px;line-height:1.7">\u9078\u55AE\u672A\u8F09\u5165<br>(menu.txt \u9700\u7D93 HTTP \u4F3A\u670D\u5668\u8B80\u53D6)</div>`;
            return;
        }
        const curFc = typeof DoInit === "object" && DoInit && DoInit.FuncCode ? DoInit.FuncCode : DEFAULT_FUNC;
        nav.innerHTML = MENU.Groups.map((g, gi) => {
            const items = g.Items || [];
            const cnt = items.length;
            const isOpen = items.some((it) => it.FuncCode === curFc);
            return `
    <div class="nb-group${isOpen ? "" : " collapsed"}" data-grp="${gi}">
      <div class="nb-hdr" data-act="toggleNavGroup" data-arg="${gi}">
        <i class="nb-hdr-ic ${esc(g.Icon || "ri-folder-line")}"></i>
        <span class="nb-hdr-t">${esc(g.Header || "")}</span>
        <span class="nb-hdr-cnt">${cnt}</span>
        <i class="nb-hdr-caret ri-arrow-down-s-line"></i>
      </div>
      <div class="nb-items">
        ${items.map((it) => `<div class="nb-item" data-func="${esc(it.FuncCode || "")}" data-folder="${esc(it.Folder || g.Folder || menuDefaultFolder())}" data-act="selectMenu"><i class="nb-icon ${esc(it.Icon || "ri-circle-line")}"></i><span>${esc(it.Label || "")}</span></div>`).join("")}
      </div>
    </div>`;
        }).join("");
        highlightMenu();
    }
    function highlightMenu() {
        const fc = typeof DoInit === "object" && DoInit ? DoInit.FuncCode : null;
        if (!fc) return;
        document.querySelectorAll("#sidebarNav .nb-item").forEach((el) => {
            const on = el.dataset.func === fc;
            el.classList.toggle("active", on);
            if (on) {
                const grp = el.closest(".nb-group");
                if (grp) grp.classList.remove("collapsed");
            }
        });
    }
    function toggleNavGroup(idx) {
        const grp = document.querySelector(`#sidebarNav .nb-group[data-grp="${idx}"]`);
        if (grp) grp.classList.toggle("collapsed");
    }
    function selectMenu(el) {
        const fc = el?.dataset?.func;
        if (!fc) return;
        const folder = el?.dataset?.folder ?? folderForFunc(fc);
        document.querySelectorAll("#sidebarNav .nb-item").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
        loadFuncConfig(fc, folder);
    }
    async function loadFuncConfig(fc, folder = folderForFunc(fc)) {
        setConfigSource("loading");
        const ok = await tryLoadExternal(false, fc, folder);
        if (!ok) showNoConfigPrompt();
    }
    function toggleDevFab() {
        const f = $("devFab");
        if (!f) return;
        f.classList.toggle("open");
    }
    function closeDevFab() {
        $("devFab")?.classList.remove("open");
    }
    function openCfgModal() {
        closeDevFab();
        $("cfgModalMask")?.classList.add("open");
    }
    function toggleCfgBanner() {
        $("cfgBanner")?.classList.toggle("collapsed");
    }
    var ACTIONS = {
        // 無參數
        query: () => doQuery(1),
        resetSearch,
        toggleSearch,
        toggleLog,
        clearLog,
        copyConfig,
        toggleColPicker,
        toggleCfgBanner,
        toggleDevFab,
        toggleModSwitch,
        openCfgModal,
        openCreate,
        openImport,
        openExport,
        exportSelected,
        deleteSelected,
        clearSel,
        doSave,
        closeDrawer,
        runImport,
        runExport,
        downloadTemplate,
        dispatchReport,
        pickImport: () => simulateFilePick(),
        reloadConfig: () => reloadExternalConfig(),
        surveyDraft: () => svSaveDraft(),
        surveySubmit: () => svSubmit(),
        exportPdf: () => exportReportPdf(),
        pickConfig: () => $("cfgFileInput")?.click(),
        printInfo: () => toast("info", "\u5217\u5370\u4E2D", "\u5DF2\u9001\u81F3\u700F\u89BD\u5668\u5217\u5370\u5C0D\u8A71\u6846"),
        // 字串參數
        goPage: (a) => doQuery(+(a || 1) || 1),
        toggleSec: (a) => toggleSec(a),
        sortBy: (a) => sortBy(a),
        openEdit: (a) => openEdit(a),
        closeModal: (a) => closeModal(a),
        openRowMenu: (a, el, ev) => openRowMenu(ev, a, el),
        rowView: (a) => {
            closeRowMenu();
            openView(a);
        },
        rowEdit: (a) => {
            closeRowMenu();
            openEdit(a);
        },
        rowDel: (a) => {
            closeRowMenu();
            deleteOne(a);
        },
        selectMenu: (_a, el) => selectMenu(el),
        switchModule: (a) => switchModule(a),
        toggleNavGroup: (a) => toggleNavGroup(a),
        goGrid: () => switchView("grid"),
        goReport: () => switchView("report"),
        goMeta: () => switchView("meta"),
        // Master-Detail 明細操作
        detailTab: (a) => detailTab(a),
        detailAdd: (a) => detailAdd(a),
        detailEdit: (a) => detailEditRow(a),
        detailDel: (a) => detailDelRow(a),
        detailCancel: (a) => detailCancelRow(a),
        detailSaveRow: (a) => detailSaveRow(a)
    };
    var CHANGES = {
        fieldChange: (a) => onFieldChange(a),
        dispatchReport: () => dispatchReport(),
        toggleSel: (a, el) => toggleSel(a, el),
        toggleAll: (_a, el) => toggleAll(el),
        configFile: (_a, el) => loadConfigFromFile(el.files?.[0])
    };
    function bindDelegation() {
        document.addEventListener("click", (ev) => {
            const fab = $("devFab");
            if (fab && fab.classList.contains("open")) {
                const onToggle = ev.target?.closest?.('[data-act="toggleDevFab"]');
                if (!onToggle) closeDevFab();
            }
            const ms = $("modSwitch");
            if (ms && ms.classList.contains("open") && !ev.target?.closest?.("#modSwitch")) closeModSwitch();
            const t = ev.target?.closest?.("[data-act]");
            if (!t) return;
            const fn = ACTIONS[t.dataset.act];
            if (fn) {
                ev.preventDefault();
                fn(t.dataset.arg, t, ev);
            }
        });
        document.addEventListener("change", (ev) => {
            const t = ev.target?.closest?.("[data-change]");
            if (!t) return;
            const fn = CHANGES[t.dataset.change];
            if (fn) fn(t.dataset.arg, t, ev);
        });
    }
    async function init() {
        bindDelegation();
        await loadMenu();
        await loadApps();
        bindDropZone();
        setConfigSource("loading");
        let bootFc = DEFAULT_FUNC, bootFolder = folderForFunc(DEFAULT_FUNC);
        const inMenu = !!(MENU && Array.isArray(MENU.Groups) && MENU.Groups.some((g) => (g.Items || []).some((it) => it.FuncCode === DEFAULT_FUNC)));
        if (!inMenu) {
            const first = firstFuncOfMenu();
            if (first) {
                bootFc = first.fc;
                bootFolder = first.folder;
            }
        }
        CURRENT_FOLDER = bootFolder;
        const ok = await tryLoadExternal(true, bootFc, bootFolder);
        if (!ok) showNoConfigPrompt();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();