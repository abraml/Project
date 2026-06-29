/* ════════════════════════════════════════════════════════════════════
   兆聯 CDE V2.6 — 配置驅動執行期 (TypeScript)
   由 CDE.js 遷移;HTML 以 data-act / data-change 委派,本檔不依賴 window 全域。
   型別邊界:DoInit = DoInitContract(由 cde.contract.schema.json 產生)。
   建置:esbuild → cde.bundle.js;型別檢查:tsc --noEmit
   ════════════════════════════════════════════════════════════════════ */
import type { DoInitContract, CodeItem } from './contract';

/* —— 執行期內部型別 —— */
export type DataRow = Record<string, any>;
interface ReturnMsg { IsSuccess: 'Y' | 'N'; Level?: string; ReturnCode?: string; MsgID?: string; Message?: string; AffectedCount?: number; }
interface DispatchResult { ReturnMsg: ReturnMsg; ReturnData: any; }

/* DOM helpers 之型別放寬(遷移階段) */
declare global { interface Window { [k: string]: any; } }

/* ═══════════════════════════════════════════════════════════════════════
   兆聯 CDE V2.6 — 通用配置驅動執行期 (Config-Driven Runtime)
   ─ DoInit 配置完整內嵌,畫面 100% 由配置產生
   ─ CDE.dispatch(action, input) 模擬 spf_cde_DoDispatch,以 @Action 路由
   ═══════════════════════════════════════════════════════════════════════ */

/* ── [1] DoInit 配置 ──
   配置已外置為「每功能一檔」:<FuncCode>.txt(與本檔同目錄)。
   啟動時載入預設功能(hrmCompany.txt);點選左側選單即依該項 FuncCode 動態載入對應配置檔。
   本檔不再內嵌任何配置;DoInit 於配置載入成功後才有值(SSOT 單一真實來源)。 */
let DoInit: DoInitContract | null = null;
const DEFAULT_FUNC = "hrmCompany";                       // 啟動預設載入之功能(對應 menu 第一筆)
let   CURRENT_FUNC = DEFAULT_FUNC;                        // 目前載入中的 FuncCode(重新讀取 / 來源指示用)
let   CURRENT_FOLDER = "";                                // 目前功能所屬資料夾(如 hrm / lab / mat);由 menu 解析
// 功能配置檔路徑:<Folder>/<FuncCode>.txt;Folder 由 menu 指定(對應模組資料夾)
const configUrlFor = (fc: string, folder: string = CURRENT_FOLDER) => folder ? `${folder}/${fc}.txt` : `${fc}.txt`;
// 啟用模組:由網址 ?m=hrm(或 ?module=hrm)指定,預設 hrm;選單跟著模組走
const ACTIVE_MODULE = (()=>{ try{ const q=new URLSearchParams(location.search); return (q.get("m")||q.get("module")||"hrm").toLowerCase(); }catch(e){ return "hrm"; } })();
const MENU_URL   = `${ACTIVE_MODULE}/menu.txt`;   // 左側選單(JSON);置於模組資料夾,隨模組移動
let MENU: any = null;
let BRAND_NAME = "兆聯 EIP";           // 品牌主名(分頁標題前綴);由 menu.Brand.Name 覆寫
// menu 預設資料夾:menu.Folder 優先,否則由 ModuleCode 小寫推導(HRM→hrm)
function menuDefaultFolder(){ return (MENU && (MENU.Folder || (MENU.ModuleCode ? String(MENU.ModuleCode).toLowerCase() : ""))) || ""; }
// 解析某 FuncCode 所屬資料夾:item.Folder → group.Folder → menu 預設
function folderForFunc(fc: string){
  if(MENU && Array.isArray(MENU.Groups)){
    for(const g of MENU.Groups){ for(const it of (g.Items||[])){ if(it.FuncCode===fc) return it.Folder || g.Folder || menuDefaultFolder(); } }
  }
  return menuDefaultFolder();
}
let __configSource = "loading";               // loading | external | upload | none

/* ── ProgInfo / UserInfo (派發共用上下文,@UserInfo.EntityID 多租戶隔離) ── */
let ProgInfo = {SystemCode:null,ModuleCode:null,FuncCode:null,Lang:"zh-TW"};               // 由 initDerived 依配置指派
let UserInfo = {UserAccount:"demo.user",UserName:"系統管理員",EntityID:null,AuthLevel:3,RoleID:"SysAdmin"}; // EntityID 由配置指派

/* ── [2] 模擬資料庫 ── 由配置 SeedData 載入 (DoQuery 之資料來源;真實環境改為實體 DB 查詢) */
let DB: DataRow[] = [];

/* ── 執行期狀態 ── */
const RT: any = {
  rows:[],            // DoQuery 回傳之列表資料
  selected:new Set(), // 多筆勾選 (DoDelete 批次)
  curRow:null,        // 編輯中資料列
  drawerMode:"create",
  page:1, pageSize:100,
  total:0, totalPage:1,
  filter:{}, sort:{Column:"SortNo",Direction:"asc"},
  detailWorking:{},   // DetailID → 工作中明細列 (抽屜內編輯緩衝;儲存主檔時 commit)
  detailUI:{active:null, editing:{}}, // active=目前頁籤;editing[DetailID]=編輯中 rowKey | "__new__" | null
  logSeq:0, logs:[]
};

/* ── 字典輔助 (CODE 會隨配置切換而重新指派) ── */
let CODE: Record<string, CodeItem[]> = {};   // 配置載入後由 initDerived() 指派
function codeName(set,id){const c=(CODE[set]||[]).find(x=>x.CodeID==id);return c?c.CodeName:(id??"");}

/* ── 通用鍵位 (由 initDerived 依配置指派,使引擎適用於任一 CDE 來源) ── */
let ROWKEY="RowGuid", KEYFIELD=null, TITLEFIELD=null, PARENTFIELD=null, PATHFIELD=null;
const STATUSFIELD="Status";

/* ── Master-Detail 執行期 (由 DoInit.View.DetailViews 驅動) ── */
let DETAIL_DEFS: any[] = [];                 // 明細定義集 (DoInit.View.DetailViews)
let DETAIL_DB: Record<string, DataRow[]> = {}; // DetailID → 明細資料列 (持久層;由 SeedData 載入)
function detailDef(id){ return DETAIL_DEFS.find(d=>d.DetailID===id); }
function detailCodeSet(dv, set){ return (dv && dv.CodeSets && dv.CodeSets[set]) || CODE[set] || []; }
function detailCodeName(dv, set, id){ const c=detailCodeSet(dv,set).find(x=>x.CodeID==id); return c?c.CodeName:(id??""); }

function getTreeCfg(){
  const cs = DoInit?.CustomMeta?.CustomSchema || {};
  const tc = cs.TreeConfig || cs;
  return { Key: tc.KeyField||cs.KeyField||null, Parent: tc.ParentKeyField||cs.ParentKeyField||null,
           Path: tc.PathField||cs.PathField||null, Title: tc.TitleField||cs.TitleField||null,
           Sep: tc.PathSeparator||"/" };
}

/* ── 依當前 DoInit 重算衍生狀態 (換配置時呼叫) ── */
function initDerived(){
  CODE = DoInit.Resources?.CodeSets || {};
  RT.pageSize = DoInit.View?.ListView?.ListSpec?.Pagination?.PageSize || 100;
  visibleCols = (DoInit.View?.ListView?.FieldSpecs || []).filter(f=>f.DefaultVisible).map(f=>f.BindField);
  RT.page = 1;
  RT.selected.clear();
  const ds = DoInit.View?.ListView?.ListSpec?.DefaultSort;
  RT.sort = { Column: ds?.Field || "SortNo", Direction: ds?.Order || "asc" };
  // 通用鍵位 + 身分 + 資料來源(皆由配置驅動)
  const tc = getTreeCfg();
  ROWKEY = DoInit.View?.RowKey || DoInit.View?.ListView?.ListSpec?.RowKey || "RowGuid";
  KEYFIELD = tc.Key; TITLEFIELD = tc.Title; PARENTFIELD = tc.Parent; PATHFIELD = tc.Path;
  ProgInfo = { SystemCode:DoInit.SystemCode, ModuleCode:DoInit.ModuleCode, FuncCode:DoInit.FuncCode, Lang:DoInit.PageMeta?.Lang||"zh-TW" };
  UserInfo.EntityID = DoInit.EntityID ?? UserInfo.EntityID;
  DB = Array.isArray(DoInit.SeedData) ? JSON.parse(JSON.stringify(DoInit.SeedData)) : [];
  // Master-Detail:載入各明細之持久層 (DetailID → rows)
  DETAIL_DEFS = (DoInit.View as any)?.DetailViews || [];
  DETAIL_DB = {};
  DETAIL_DEFS.forEach((dv:any)=>{ DETAIL_DB[dv.DetailID] = Array.isArray(dv.SeedData)?JSON.parse(JSON.stringify(dv.SeedData)):[]; });
}
function nowStr(){const d=new Date();const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;}
function newGuid(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c=='x'?r:(r&0x3|0x8)).toString(16);});}

/* ═══════════════════════════════════════════════════════════════════════
   [3] CDE 派發器 — 模擬 spf_cde_DoDispatch
   標準四參數封包: @ProgInfo / @UserInfo / @InputData
                  → @ReturnMsg / @ReturnData
   以 @Action 路由至內部 spf_cdeFunc_Do* 程序
   ═══════════════════════════════════════════════════════════════════════ */
const CDE = {
  dispatch(action: string, inputData?: any){
    const req = {Action:action, ProgInfo, UserInfo, InputData:inputData||{}};
    let res;
    try{
      const fn = CDE["_"+action];
      if(!fn){ res = CDE._err("E404","ACTION_NOT_FOUND: "+action); }
      else { res = fn(inputData||{}); }
    }catch(e){ res = CDE._err("E500", e.message); }
    logDispatch(req, res);
    return res;
  },
  _ok(data, code, msgText, affected){
    return {ReturnMsg:{IsSuccess:"Y",Level:"Info",ReturnCode:code||"OK",MsgID:msgText||"MSG_SUCCESS",
      Message:msgText||"操作成功",AffectedCount:affected??0,Lang:"zh-TW"}, ReturnData:data??{}};
  },
  _err(code, msg){
    return {ReturnMsg:{IsSuccess:"N",Level:"Error",ReturnCode:code,MsgID:msg,Message:msg,AffectedCount:0,Lang:"zh-TW"}, ReturnData:{}};
  },

  /* —— DoInit:回傳功能完整配置 —— */
  _DoInit(){ return CDE._ok(DoInit,"OK","MSG_INIT_SUCCESS",0); },
  _DoSubmit(input){ const no="RESP-"+Date.now(); return CDE._ok({ResponseNo:no,BankCode:input.BankCode,TotalScore:input.TotalScore??null,Grade:input.Grade??null,Answers:input.Answers||[]},"OK","MSG_SUBMIT_SUCCESS",(input.Answers||[]).length); },
  _DoSaveDraft(input){ const no="RESP-"+Date.now(); return CDE._ok({ResponseNo:no,DocStatus:"0",Answers:input.Answers||[]},"OK","MSG_DRAFT_SAVED",(input.Answers||[]).length); },

  /* —— DoQuery:依 DataScope + Filter (多租戶 EntityID 物理隔離) — 通用 —— */
  _DoQuery(input){
    const f = input.Filter||{};
    let data = DB.filter(r => r.EntityID===UserInfo.EntityID && r[STATUSFIELD]!=="0");
    // 精確過濾:每個字典維度
    Object.keys(CODE).forEach(key=>{ if(f[key]) data = data.filter(r=>String(r[key])===String(f[key])); });
    // 全文模糊:跨所有列表欄位
    if(f.Search1){ const k=String(f.Search1).toLowerCase();
      const cols=(DoInit.View.ListView.FieldSpecs||[]).map(s=>s.BindField);
      data=data.filter(r=>cols.some(c=>String(r[c]??"").toLowerCase().includes(k))); }
    // 排序:RT.sort 優先,否則 DefaultSort
    const ds = DoInit.View.ListView.ListSpec?.DefaultSort||{};
    const col=(RT.sort?.Column)||ds.Field||"SortNo", dir=(RT.sort?.Direction)||ds.Order||"asc";
    data = data.slice().sort((a,b)=>{const r=String(a[col]??"").localeCompare(String(b[col]??""),undefined,{numeric:true});return dir==="desc"?-r:r;});
    const total=data.length, page=input.Pagination?.Page||1, size=input.Pagination?.PageSize||RT.pageSize;
    const paged=data.slice((page-1)*size, page*size);
    const out=paged.map(r=>({KeyValue:r[ROWKEY],RowAction:{CanEdit:true,CanDelete:true,CanView:true},...r}));
    return CDE._ok({Data:out,Pagination:{Page:page,PageSize:size,TotalCount:total,TotalPage:Math.max(1,Math.ceil(total/size))},Sort:RT.sort},"OK","MSG_QUERY_SUCCESS",total);
  },

  /* —— DoGet:依 KeyValue 取單筆 —— */
  _DoGet(input){
    const r = DB.find(x=>x[ROWKEY]===input.KeyValue);
    if(!r) return CDE._err("E404","ROW_NOT_FOUND");
    return CDE._ok({Data:{...r}},"OK","MSG_GET_SUCCESS",1);
  },

  /* —— DoVerify:依 FieldSpecs.Validations + BusinessValidation 通用驗證 —— */
  _DoVerify(input){
    const d = input.Data||{}; const errs=[];
    (DoInit.View.FormView?.FieldSpecs||[]).forEach(f=>{
      const v=d[f.BindField];
      (f.Validations||[]).forEach(rule=>{
        if(rule.Rule==="Required" && (v==null||v==="")) errs.push({Field:f.BindField,Message:rule.Message});
        else if(rule.Rule==="MaxLength" && v && String(v).length>rule.Value) errs.push({Field:f.BindField,Message:rule.Message});
        else if(rule.Rule==="Email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errs.push({Field:f.BindField,Message:rule.Message});
        else if(rule.Rule==="Range" && v!==""&&v!=null && (+v<rule.Min||+v>rule.Max)) errs.push({Field:f.BindField,Message:rule.Message});
        else if(rule.Rule==="Unique" && KEYFIELD && d[KEYFIELD]){ const dup=DB.find(x=>x[KEYFIELD]===d[KEYFIELD] && x[ROWKEY]!==d[ROWKEY] && x[STATUSFIELD]!=="0"); if(dup) errs.push({Field:f.BindField,Message:rule.Message}); }
        else if(rule.Rule==="JsonFormat" && v){ try{JSON.parse(v);}catch{errs.push({Field:f.BindField,Message:rule.Message});} }
      });
    });
    (DoInit.CustomMeta?.BusinessRules?.BusinessValidation||[]).forEach(bv=>{
      const v=d[bv.Field];
      if(bv.Rule==="NoSelfReference" && KEYFIELD && v && v===d[KEYFIELD]) errs.push({Field:bv.Field,Message:bv.Message});
      if(bv.Rule==="MaxCurrentYear" && v && +v>new Date().getFullYear()) errs.push({Field:bv.Field,Message:bv.Message});
    });
    const seen=new Set(); const uniq=errs.filter(e=>seen.has(e.Field)?false:(seen.add(e.Field),true));
    if(uniq.length) return {ReturnMsg:{IsSuccess:"N",Level:"Warning",ReturnCode:"E422",MsgID:"MSG_VALIDATION_FAILED",Message:"資料驗證未通過",AffectedCount:0},ReturnData:{Errors:uniq}};
    return CDE._ok({Valid:true},"OK","MSG_VERIFY_PASS",0);
  },

  /* —— 物化一筆完整資料列 (套用系統欄位 / 物化路徑) —— */
  _materialize(d: any, key: any, isNew: boolean, base?: any){
    const row = base ? {...base} : {};
    (DoInit.View.FormView?.FieldSpecs||[]).forEach(f=>{ if(f.BindField===ROWKEY) return; if(d[f.BindField]!==undefined) row[f.BindField]=d[f.BindField]; });
    row[ROWKEY]=key;
    row.EntityID=UserInfo.EntityID;
    if(!row[STATUSFIELD]) row[STATUSFIELD]=d[STATUSFIELD]||"1";
    if(PATHFIELD && KEYFIELD) row[PATHFIELD]=CDE._buildPath(d[PARENTFIELD], d[KEYFIELD]);
    const now=nowStr();
    if(isNew){ row.CreatedBy=UserInfo.UserAccount; row.CreatedAt=now; }
    row.UpdatedBy=UserInfo.UserAccount; row.UpdatedAt=now;
    return row;
  },

  /* —— DoInsert —— */
  _DoInsert(input){
    const v=CDE._DoVerify(input); if(v.ReturnMsg.IsSuccess==="N") return v;
    const guid=newGuid(); const row=CDE._materialize(input.Data, guid, true);
    DB.push(row);
    return CDE._ok({KeyValue:guid, Path:row[PATHFIELD]||null},"OK","MSG_INSERT_SUCCESS",1);
  },

  /* —— DoUpdate —— */
  _DoUpdate(input){
    const v=CDE._DoVerify(input); if(v.ReturnMsg.IsSuccess==="N") return v;
    const d=input.Data; const idx=DB.findIndex(x=>x[ROWKEY]===d[ROWKEY]);
    if(idx<0) return CDE._err("E404","ROW_NOT_FOUND");
    DB[idx]=CDE._materialize(d, d[ROWKEY], false, DB[idx]);
    return CDE._ok({KeyValue:d[ROWKEY], Path:DB[idx][PATHFIELD]||null},"OK","MSG_UPDATE_SUCCESS",1);
  },

  /* —— DoDelete:邏輯刪除 Status='0';若有物化路徑則連動下屬 —— */
  _DoDelete(input){
    let keys=input.KeyValue; keys=Array.isArray(keys)?keys:[keys];
    let affected=0; const cascaded=[];
    keys.forEach(k=>{
      const r=DB.find(x=>x[ROWKEY]===k); if(!r) return;
      let targets=[r];
      if(PATHFIELD && r[PATHFIELD]) targets=DB.filter(x=>x[STATUSFIELD]!=="0" && x[PATHFIELD] && String(x[PATHFIELD]).startsWith(r[PATHFIELD]));
      targets.forEach(x=>{ if(x[STATUSFIELD]==="0")return; x[STATUSFIELD]="0"; x.UpdatedBy=UserInfo.UserAccount; x.UpdatedAt=nowStr(); affected++; if(x[ROWKEY]!==k) cascaded.push(x[KEYFIELD]||x[ROWKEY]); });
    });
    return CDE._ok({DeletedKeys:keys,CascadedCodes:cascaded},"OK","MSG_DELETE_SUCCESS",affected);
  },

  /* —— DoImport:依 ImportColumns;DuplicateAction=Update;AtomicImport —— */
  _DoImport(input){
    const rows=input.Rows||[]; let ins=0,upd=0; const errs=[];
    const reqCols=(DoInit.Features?.ImportSpec?.ImportColumns||[]).filter(c=>c.Required).map(c=>c.FieldID);
    rows.forEach((d,i)=>{
      if(reqCols.some(c=>d[c]==null||d[c]==="")){ errs.push({Row:i+1,Message:"必填欄位缺漏"}); return; }
      const ex = KEYFIELD ? DB.find(x=>x[KEYFIELD]===d[KEYFIELD] && x[STATUSFIELD]!=="0") : null;
      if(ex){ const idx=DB.indexOf(ex); DB[idx]=CDE._materialize({...ex,...d}, ex[ROWKEY], false, ex); upd++; }
      else { DB.push(CDE._materialize(d, newGuid(), true)); ins++; }
    });
    if(errs.length && DoInit.Features?.ImportSpec?.ImportRules?.AtomicImport)
      return {ReturnMsg:{IsSuccess:"N",Level:"Error",ReturnCode:"E422",Message:"匯入驗證失敗，已整批回滾(AtomicImport)",AffectedCount:0},ReturnData:{Errors:errs}};
    return CDE._ok({Inserted:ins,Updated:upd,Errors:errs},"OK","MSG_IMPORT_SUCCESS",ins+upd);
  },

  /* —— DoExport:依 ExportColumns —— */
  _DoExport(input){
    const scope=input.Scope||"current";
    let data=DB.filter(r=>r.EntityID===UserInfo.EntityID && r[STATUSFIELD]!=="0");
    if(scope==="selected") data=data.filter(r=>(input.Keys||[]).includes(r[ROWKEY]));
    const cols=input.Columns||(DoInit.Features?.ExportSpec?.ExportColumns||[]).map(c=>c.DataKey);
    return CDE._ok({RowCount:data.length,Columns:cols,FileName:`${DoInit.FuncCode||"CDE"}_${Date.now()}.xlsx`,Rows:data},"OK","MSG_EXPORT_SUCCESS",data.length);
  },

  /* —— DoReport:依 ReportView.ReportTypes 之 GroupBy/Layout 統計 (通用) —— */
  _DoReport(input){
    const data=DB.filter(r=>r.EntityID===UserInfo.EntityID && r[STATUSFIELD]!=="0");
    const types=DoInit.View?.ReportView?.ReportTypes||[];
    const def = types.find(t=>t.Type===input.ReportType) || types[0] || {Type:"summary",Title:"彙總報表",Layout:"StatsAndTable"};
    // 分組維度:配置 GroupBy 優先,否則自動取第一個 Tag 類別維度
    const specs=DoInit.View.ListView.FieldSpecs||[];
    const isTag=k=>specs.some(s=>s.BindField===k && s.Formatter==="Tag");
    const isList=k=>specs.some(s=>s.BindField===k);
    const dim = def.GroupBy || Object.keys(CODE).find(isTag) || Object.keys(CODE).find(isList) || null;
    const groups={};
    if(dim && CODE[dim]) CODE[dim].forEach(c=>groups[c.CodeName]=data.filter(r=>String(r[dim])===String(c.CodeID)).length);
    return CDE._ok({ReportType:def.Type,Title:def.Title,Layout:def.Layout||"StatsAndTable",Dim:dim,Total:data.length,Groups:groups,Rows:data,GeneratedAt:nowStr()},"OK","MSG_REPORT_SUCCESS",data.length);
  },

  /* —— 物化路徑產生 (PathGeneration);無樹狀配置時回 null —— */
  _buildPath(parentKey, key){
    if(!PATHFIELD || !KEYFIELD) return null;
    const sep=getTreeCfg().Sep||"/";
    if(!parentKey) return `${sep}${key}${sep}`;
    const p=DB.find(x=>x[KEYFIELD]===parentKey && x[STATUSFIELD]!=="0");
    const pp=p&&p[PATHFIELD]?p[PATHFIELD]:`${sep}${parentKey}${sep}`;
    return `${pp}${key}${sep}`;
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   [4] 渲染引擎 — 全部由 DoInit 配置產生
   ═══════════════════════════════════════════════════════════════════════ */
const $ = (id: string): any => document.getElementById(id);
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* —— 啟動:DoInit → 渲染骨架 —— */
function bootstrap(){
  const r = CDE.dispatch("DoInit");
  const cfg = r.ReturnData;
  const pm = cfg.PageMeta;
  // 頁首
  $("phTitle").textContent = pm.PageTitle || cfg.FuncCode || "—";
  $("phIcon").className = pm.Icon || "ri-apps-2-line";
  { const _ft=$("cbFormType"); if(_ft) _ft.textContent = pm.FormType || "—"; }
  { const _wg=$("cbWidget"); if(_wg) _wg.textContent = cfg.CustomMeta?.CustomSchema?.WidgetType || "—"; }
  document.title = `${BRAND_NAME} — ${pm.PageTitle || cfg.FuncCode || ""}`;
  const ur=document.querySelector(".top-urole"); if(ur) ur.textContent=(UserInfo.RoleID==="SysAdmin"?"系統管理員":"使用者")+" · "+(cfg.EntityID||"");
  const un=document.querySelector(".top-uname"); if(un) un.textContent=UserInfo.UserName||"";
  const tpill=document.querySelector(".top-pill"); if(tpill) tpill.textContent=cfg.SystemCode||"";
  const av=document.querySelector(".top-avatar"); if(av) av.textContent=(UserInfo.UserName||"U").slice(0,2);
  const gt=$("gridTitle"); if(gt) gt.textContent=pm.PageTitle||"資料列表";
  const rct=$("rptCardTitle"); if(rct) rct.textContent=cfg.View?.ReportView?.Title || (pm.PageTitle?pm.PageTitle+" 報表":"報表");
  renderReportTypes();        // 報表類型由 ReportView.ReportTypes 產生
  highlightMenu();            // 依目前 FuncCode 高亮選單
  // 麵包屑
  $("phBreadcrumb").innerHTML = (pm.Breadcrumb||[]).map((b,i)=>{
    const sep = i>0?'<span class="ph-bc-sep">/</span>':'';
    const last = i===pm.Breadcrumb.length-1;
    return sep + (last?`<span class="ph-bc-cur">${esc(b.Title)}</span>`:`<a href="javascript:void(0)">${esc(b.Title)}</a>`);
  }).join("");
  // 工具列 (DataActions + ExtensionActions)
  if(pm.FormType==="SurveyForm"){ renderMeta(cfg); renderSurvey(cfg); return; }
  restoreGridCards();
  renderToolbar(cfg.AllowAction);
  // 查詢面板
  renderSearchPanel();
  // 表頭 (ListView.FieldSpecs)
  renderGridHead();
  // 匯出欄位 / 匯入說明
  renderExportCols();
  renderImportInstr();
  // Meta 檢視
  renderMeta(cfg);
  // 首次查詢
  doQuery(1);
}

/* —— 工具列:Type → 樣式;Position 含 Toolbar 才顯示 —— */
function renderToolbar(aa){
  const typeMap={Primary:"btn-pri",Danger:"btn-dan",Default:"btn-def",Success:"btn-suc"};
  const handler={Add:"openCreate",Query:"query",Delete:"deleteSelected",Import:"openImport",Export:"openExport"};
  const batch = DoInit.Resources?.FeatureFlags?.EnableBatchDelete !== false; // 勾選欄/批次刪除預設保留,僅 ===false 時關閉
  let html="";
  // 資料動作 (略過 Save:屬於表單內)
  aa.DataActions.filter(a=>a.Position!=="Form" && a.ActionID!=="Save").forEach(a=>{
    if(a.ActionID==="Query") return; // 查詢由查詢面板觸發
    if(a.ActionID==="Delete" && !batch) return; // 非批次模式:刪除改由列 Action 選單執行
    html += `<button class="btn ${typeMap[a.Type]||'btn-def'} btn-sm" data-act="${handler[a.ActionID]||''}"><i class="${a.Icon}"></i>${a.Label}</button>`;
  });
  html += `<span class="sp"></span>`;
  // 擴充動作 (AllowAction 第二群組)
  aa.ExtensionActions.forEach(a=>{
    html += `<button class="btn btn-def btn-sm" data-act="${handler[a.ActionID]||''}"><i class="${a.Icon}"></i>${a.Label}</button>`;
  });
  // 報表產生:屬擴充動作(AllowAction 第二群組),列於匯出按鈕之後;僅配置含 ReportView 時顯示
  if(DoInit.View?.ReportView){
    html += `<button class="btn btn-def btn-sm" data-act="goReport"><i class="ri-bar-chart-box-line"></i>報表產生</button>`;
  }
  // DoInit 配置:已移至右下角「開發者工具」FAB(devFab)
  html += `<button class="btn btn-ghost btn-sm" data-act="toggleColPicker" title="欄位顯示"><i class="ri-layout-column-line"></i></button>`;
  $("toolbar").innerHTML = html;
}

/* —— 查詢面板:由可查詢欄位 + 字典產生 —— */
function renderSearchPanel(){
  const listFields=new Set((DoInit.View.ListView.FieldSpecs||[]).map(s=>s.BindField));
  const dims=Object.keys(CODE).filter(k=>listFields.has(k));
  const sels=dims.map(key=>{
    const title=(DoInit.View.ListView.FieldSpecs.find(s=>s.BindField===key)|| {} as any).Title||key;
    return `<div class="fld"><span class="fld-lbl">${esc(title)}</span>
      <select class="sel" id="q_${key}"><option value="">全部</option>${CODE[key].map(c=>`<option value="${esc(c.CodeID)}">${esc(c.CodeName)}</option>`).join("")}</select></div>`;
  }).join("");
  $("searchGrid").innerHTML = `
    <div class="fld"><span class="fld-lbl"><i class="ri-search-line"></i>關鍵字</span>
      <input class="inp" id="q_Search1" placeholder="跨欄位模糊查詢"></div>${sels}`;
  $("q_Search1").addEventListener("keydown",e=>{if(e.key==="Enter")doQuery(1);});
}

/* —— 表頭:ListView.FieldSpecs(DefaultVisible) + 勾選欄 + 操作欄 —— */
let visibleCols = [];   // 配置載入後由 initDerived() 指派
function renderGridHead(){
  const specs = DoInit.View.ListView.FieldSpecs.filter(f=>visibleCols.includes(f.BindField));
  const batch = DoInit.Resources?.FeatureFlags?.EnableBatchDelete !== false; // 勾選欄預設保留,僅 EnableBatchDelete===false 時不顯示
  let th = "";
  // 選取欄(僅批次刪除模式;預設關閉,不影響固定欄位序)
  if(batch) th += `<th style="width:38px" class="col-center"><input type="checkbox" class="chk" id="chkAll" data-change="toggleAll"></th>`;
  // ★ 固定欄 1：Action(menu) — 由產生器固定產生,JSON 不含此欄資料
  th += `<th style="width:72px" class="col-center">Action</th>`;
  // ★ 固定欄 2：No(badge) — 由產生器固定產生,JSON 不含此欄資料
  th += `<th style="width:62px" class="col-center">No</th>`;
  specs.forEach(f=>{
    const al = f.Align==="Center"?"col-center":(f.Align==="Right"?"text-align:right":"");
    const sort = f.Sorter?`<i class="ri-arrow-up-down-line" style="font-size:11px;opacity:.5;margin-left:3px;cursor:pointer" data-act="sortBy" data-arg="${f.BindField}"></i>`:"";
    th += `<th class="${al}" style="min-width:${f.Width||100}px">${esc(f.Title)}${sort}</th>`;
  });
  $("gridHead").innerHTML = `<tr>${th}</tr>`;
}

/* —— 格式化器 —— */
function fmt(field, row){
  const spec=((DoInit!.View.ListView.FieldSpecs||[]).find((f:any)=>f.BindField===field)||{}) as any;
  const v=row[field]; const blank='<span class="muted">—</span>'; const key=row[ROWKEY];
  switch(spec.Formatter){
    case "Link":
    case "TreeNode":
      return (v!=null&&v!=="")?`<span class="link" style="font-weight:500" data-act="openEdit" data-arg="${key}">${esc(v)}</span>`:blank;
    case "Tag":
      return (v!=null&&v!=="")?`<span class="tag ${esc(v)}">${esc(codeName(field,v))}</span>`:blank;
    case "StatusTag":{
      const on=["1","Y","TRUE","ACTIVE","A","ENABLED"].includes(String(v).toUpperCase());
      return `<span class="tag ${on?"on":"off"}"><i class="ri-circle-fill" style="font-size:7px"></i>${esc(codeName(field,v)||v||"")}</span>`;
    }
    case "ParentName":{
      if(!v) return '<span class="muted">— 最上層 —</span>';
      const tc=getTreeCfg(); const p=DB.find(x=>x[tc.Key]===v && x[STATUSFIELD]!=="0");
      return p?`${esc(p[tc.Title])}<span class="muted" style="margin-left:4px">（${esc(v)}）</span>`:esc(v);
    }
    case "DateTime": return v?esc(v):blank;
    default: return (v!=null&&v!=="")?esc(v):blank;
  }
}

/* —— ListView 渲染:平面列表(依 DoQuery 回傳順序) —— */
function renderGrid(){
  const rows = RT.rows;
  const batch = DoInit.Resources?.FeatureFlags?.EnableBatchDelete !== false; // 勾選欄預設保留,僅 ===false 時不顯示
  const specs = DoInit.View.ListView.FieldSpecs.filter(f=>visibleCols.includes(f.BindField));
  const fixedCount = (batch?1:0) + 2; // [選取] + Action + No
  let html=""; let visibleCount=0;
  rows.forEach((r,idx)=>{
    const no = (RT.page-1)*RT.pageSize + idx + 1;
    const selCls = RT.selected.has(r.RowGuid)?"sel":"";
    let tds = "";
    // 選取欄(僅批次刪除模式)
    if(batch)
      tds += `<td class="col-center"><input type="checkbox" class="chk" ${RT.selected.has(r.RowGuid)?"checked":""} data-change="toggleSel" data-arg="${r.RowGuid}"></td>`;
    // ★ 固定欄 1：Action 選單(kebab → 編輯 / 檢視 / 刪除)
    tds += `<td class="col-center"><button class="kebab" id="kb_${r.RowGuid}" data-act="openRowMenu" data-arg="${r.RowGuid}"><i class="ri-more-2-fill"></i></button></td>`;
    // ★ 固定欄 2：No 序號(badge)
    tds += `<td class="col-center"><span class="badge-no">${no}</span></td>`;
    specs.forEach(f=>{
      const al = f.Align==="Center"?"col-center":"";
      tds += `<td class="${al}">${fmt(f.BindField,r)}</td>`;
    });
    html += `<tr class="${selCls}" data-key="${esc(r[KEYFIELD]||r[ROWKEY]||"")}">${tds}</tr>`;
    visibleCount++;
  });
  if(visibleCount===0){
    html = `<tr><td colspan="${specs.length+fixedCount}"><div class="empty"><i class="ri-inbox-line"></i><p>${DoInit.View.ListView.ListSpec.EmptyText}</p></div></td></tr>`;
  }
  $("gridBody").innerHTML = html;
  renderPager();
  renderBatchBar();
  { const _tc=$("tabCount"); if(_tc) _tc.textContent = RT.total; }
  syncChkAll();
}

/* —— Action 欄選單 (kebab → 編輯 Update / 檢視 View / 刪除 Delete) —— */
let _menuGuid=null;
function openRowMenu(ev: any, guid: string, srcEl?: any){
  ev.stopPropagation();
  const btnEl = srcEl || ev.currentTarget || ev.target;
  const menu = $("rowMenu");
  if(_menuGuid===guid && menu.classList.contains("open")){ closeRowMenu(); return; }
  _menuGuid = guid;
  menu.innerHTML = `
    <button data-act="rowEdit" data-arg="${guid}"><i class="ri-edit-line"></i>編輯 Update</button>
    <button data-act="rowView" data-arg="${guid}"><i class="ri-eye-line"></i>檢視 View</button>
    <button class="del" data-act="rowDel" data-arg="${guid}"><i class="ri-delete-bin-line"></i>刪除 Delete</button>`;
  menu.classList.add("open"); // 先顯示以量測尺寸
  const b = btnEl.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = b.left, top = b.bottom + 4;
  if(left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  if(top + mh > window.innerHeight - 8) top = b.top - mh - 4; // 下方空間不足則往上開
  menu.style.left = Math.max(8,left) + "px";
  menu.style.top = Math.max(8,top) + "px";
  document.querySelectorAll(".kebab.active").forEach(x=>x.classList.remove("active"));
  btnEl.classList.add("active");
}
function closeRowMenu(){
  const menu = $("rowMenu");
  if(menu) menu.classList.remove("open");
  document.querySelectorAll(".kebab.active").forEach(x=>x.classList.remove("active"));
  _menuGuid = null;
}
document.addEventListener("click", e=>{ if(!(e.target as any).closest(".row-menu") && !(e.target as any).closest(".kebab")) closeRowMenu(); });
window.addEventListener("scroll", closeRowMenu, true);
window.addEventListener("resize", closeRowMenu);

/* —— 分頁 (整頁底部全寬:Previous / 頁碼 / … / Last Page / Next) —— */
function renderPager(){
  const tp = RT.totalPage, cur = RT.page;
  const start = RT.total===0?0:(cur-1)*RT.pageSize+1;
  const end = Math.min(cur*RT.pageSize, RT.total);
  let ctrl = `<button class="pg txt" ${cur<=1?"disabled":""} data-act="goPage" data-arg="${cur-1}">Previous</button>`;
  const win=5; let s=Math.max(1,cur-2), e=Math.min(tp,s+win-1); s=Math.max(1,e-win+1);
  if(s>1){ ctrl+=`<button class="pg" data-act="query">1</button>`; if(s>2) ctrl+=`<span class="pg-gap">…</span>`; }
  for(let p=s;p<=e;p++) ctrl+=`<button class="pg ${p===cur?'active':''}" data-act="goPage" data-arg="${p}">${p}</button>`;
  if(e<tp && e<tp-1) ctrl+=`<span class="pg-gap">…</span>`;
  ctrl += `<button class="pg txt" ${cur>=tp?"disabled":""} data-act="goPage" data-arg="${tp}">Last Page</button>`;
  ctrl += `<button class="pg txt" ${cur>=tp?"disabled":""} data-act="goPage" data-arg="${cur+1}">Next</button>`;
  $("pager").innerHTML = `<div class="pager-info">顯示 <b>${start}</b>–<b>${end}</b> 筆,共 <b>${RT.total}</b> 筆 · 第 ${cur}/${tp} 頁</div><div class="pager-ctrl">${ctrl}</div>`;
}

/* —— 批次操作列 (多筆勾選 → DoDelete) —— */
function renderBatchBar(){
  const n = RT.selected.size;
  if(n===0){ $("batchBar").innerHTML=""; $("batchBar").style.padding="0"; return; }
  $("batchBar").style.padding="10px 0";
  $("batchBar").innerHTML = `<div style="display:flex;align-items:center;gap:10px;background:var(--pril);border-radius:7px;padding:8px 14px">
    <i class="ri-checkbox-multiple-line" style="color:var(--pri);font-size:17px"></i>
    <span style="font-size:12.5px">已選取 <b style="color:var(--pri)">${n}</b> 筆資料</span>
    <span style="flex:1"></span>
    <button class="btn btn-dan btn-xs" data-act="deleteSelected"><i class="ri-delete-bin-line"></i>批次刪除</button>
    <button class="btn btn-def btn-xs" data-act="exportSelected"><i class="ri-file-excel-line"></i>匯出選取</button>
    <button class="btn btn-ghost btn-xs" data-act="clearSel">取消選取</button>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   [5] 互動處理
   ═══════════════════════════════════════════════════════════════════════ */
/* —— DoQuery —— */
function doQuery(page){
  const filter={Search1:$("q_Search1")?.value.trim()||""};
  Object.keys(CODE).forEach(key=>{ const el=$("q_"+key); if(el) filter[key]=el.value||""; });
  RT.filter=filter;
  const res=CDE.dispatch("DoQuery",{Filter:filter,Pagination:{Page:page,PageSize:RT.pageSize},Sort:RT.sort});
  if(res.ReturnMsg.IsSuccess!=="Y"){ toast("err","查詢失敗",res.ReturnMsg.Message); return; }
  RT.rows=res.ReturnData.Data; RT.page=res.ReturnData.Pagination.Page; RT.total=res.ReturnData.Pagination.TotalCount; RT.totalPage=res.ReturnData.Pagination.TotalPage;
  renderGrid();
  const hasFilter=filter.Search1||Object.keys(CODE).some(k=>filter[k]);
  if(hasFilter) toast("suc","查詢完成",`共 ${RT.total} 筆符合條件`);
}
function resetSearch(){ const ids=["q_Search1",...Object.keys(CODE).map(k=>"q_"+k)]; ids.forEach(id=>{const e=$(id);if(e)e.value="";}); doQuery(1); }
function toggleSearch(){ const b=$("searchBody"); const c=$("searchCaret"); const h=b.style.display==="none"; b.style.display=h?"":"none"; c.className=h?"ri-arrow-up-s-line":"ri-arrow-down-s-line"; }
function sortBy(field){ RT.sort={Column:field,Direction:RT.sort.Column===field&&RT.sort.Direction==="asc"?"desc":"asc"}; doQuery(RT.page); }

/* —— 勾選 (多筆) —— */
function toggleSel(guid,el){ if(el.checked)RT.selected.add(guid);else RT.selected.delete(guid); renderBatchBar(); syncChkAll();
  document.querySelector(`tr[data-code]`); renderGrid(); }
function toggleAll(el){ if(el.checked)RT.rows.forEach(r=>RT.selected.add(r.RowGuid)); else RT.selected.clear(); renderGrid(); }
function syncChkAll(){ const all=$("chkAll"); if(!all)return; const total=RT.rows.length; const sel=RT.rows.filter(r=>RT.selected.has(r.RowGuid)).length; all.checked=total>0&&sel===total; all.indeterminate=sel>0&&sel<total; }
function clearSel(){ RT.selected.clear(); renderGrid(); }

/* —— 欄位顯示切換 (簡易) —— */
function toggleColPicker(){
  const optional = DoInit.View.ListView.FieldSpecs.filter(f=>!f.DefaultVisible);
  const sortNo = visibleCols.includes("SortNo"); 
  // 切換 SortNo / UpdatedAt 兩個非預設欄位
  if(visibleCols.includes("UpdatedAt")){ visibleCols=visibleCols.filter(c=>c!=="UpdatedAt"&&c!=="SortNo"); toast("info","欄位調整","已隱藏 排序／更新時間 欄"); }
  else { visibleCols=[...visibleCols,"SortNo","UpdatedAt"]; toast("info","欄位調整","已顯示 排序／更新時間 欄"); }
  renderGridHead(); renderGrid();
}

/* ═══ 表單抽屜 (FormView 驅動) ═══ */
function openCreate(){ openForm("create",null); }
function openEdit(guid){ openForm("edit",guid); }
function openView(guid){ openForm("view",guid); }

function openForm(mode, guid){
  RT.drawerMode = mode;
  let data;
  if(mode==="create"){
    data = {};
    DoInit.View.FormView.FieldSpecs.forEach(f=>{ if(f.DefaultValue!==undefined) data[f.BindField]=f.DefaultValue; });
    data.RowKey = ""; 
  } else {
    const r = CDE.dispatch("DoGet",{KeyValue:guid});
    if(r.ReturnMsg.IsSuccess!=="Y"){ toast("err","載入失敗",r.ReturnMsg.Message); return; }
    data = {...r.ReturnData.Data, RowKey:r.ReturnData.Data.RowGuid};
  }
  RT.curRow = data;
  // Master-Detail:依主鍵載入既有明細到工作緩衝 (create 模式為空)
  RT.detailWorking = {};
  RT.detailUI = { active: DETAIL_DEFS[0]?.DetailID || null, editing: {} };
  const mkv = mode==="create" ? "" : String(data[KEYFIELD] ?? "");
  DETAIL_DEFS.forEach((dv:any)=>{
    const rk = dv.RelationKey || KEYFIELD;
    RT.detailWorking[dv.DetailID] = (mode==="create") ? []
      : JSON.parse(JSON.stringify((DETAIL_DB[dv.DetailID]||[]).filter(r=> String(r[rk])===mkv && r[STATUSFIELD]!=="0")));
    RT.detailUI.editing[dv.DetailID] = null;
  });
  const titleMap={create:["新增","CREATE","ri-add-box-line"],edit:["修改","UPDATE","ri-edit-box-line"],view:["檢視","READONLY","ri-eye-line"]};
  const [t,m,ic] = titleMap[mode];
  $("drawerTitle").textContent = t;
  $("drawerMode").textContent = m;
  $("drawerSave").style.display = mode==="view"?"none":"";
  $("drawer").classList.toggle("has-detail", DETAIL_DEFS.length>0);
  const fh=$("drawerFootHint");
  if(fh) fh.innerHTML = (DETAIL_DEFS.length && mode!=="view")
    ? `<i class="ri-stack-line"></i>明細資料將於儲存主檔時一併寫入`
    : "";
  renderForm(data, mode);
  $("drawerMask").classList.add("open");
  $("drawer").classList.add("open");
}

/* —— 區段是否屬機敏資料(顯式 Sensitive 旗標,或標題含「機敏」自動判定;向後相容) —— */
function isSensitiveSection(sec){
  if(sec.Sensitive===true) return true;
  return /機敏|敏感|機密|sensitive/i.test(String(sec.Title||""));
}

/* —— 由 Sections + FieldSpecs 產生表單 ——
   無明細:單欄堆疊區段;有明細:左欄主檔(可捲動) + 右欄明細(detailHost)雙欄分割 */
function renderForm(data, mode){
  const fv = DoInit.View.FormView;
  const hasDetail = DETAIL_DEFS.length>0;
  let secHtml="";
  fv.FormSpec.Sections.forEach(sec=>{
    const fields = fv.FieldSpecs.filter(f=>f.Section===sec.SectionID && f.Mode!=="Hidden");
    if(fields.length===0) return;
    const open = sec.DefaultOpen;
    const sensitive = isSensitiveSection(sec);
    const sub = sec.Subtitle || sec.Description || "";
    secHtml += `<div class="sec${sensitive?' sec-sensitive':''}"><div class="sec-head" data-act="toggleSec" data-arg="${sec.SectionID}">
        <span class="st">
          <span class="sec-ic"><i class="${sec.Icon||'ri-folder-line'}"></i></span>
          <span class="sec-tt"><span class="sec-title">${esc(sec.Title)}${sensitive?'<i class="ri-lock-2-line sec-lock" title="機敏資料"></i>':''}</span>${sub?`<span class="sec-sub">${esc(sub)}</span>`:''}</span>
        </span>
        ${sec.IsCollapsible?`<i class="caret ri-arrow-down-s-line ${open?'':'closed'}" id="caret_${sec.SectionID}"></i>`:''}
      </div>
      <div class="sec-body ${open?'':'closed'}" id="secbody_${sec.SectionID}">`;
    fields.forEach(f=>{ secHtml += renderField(f, data, mode); });
    secHtml += `</div></div>`;
  });
  let html;
  if(hasDetail){
    const pm = DoInit.PageMeta||{};
    html = `<div class="form-split">
        <div class="form-master-col">
          <div class="fm-cap"><i class="${pm.Icon||'ri-profile-line'}"></i>主檔 Master<span class="fm-cap-sub">${esc(pm.PageTitle||DoInit.FuncCode||"")}</span></div>
          ${secHtml}
        </div>
        <div class="form-detail-col" id="detailHost"></div>
      </div>`;
  } else {
    html = secHtml;
  }
  $("drawerBody").innerHTML = html;
  // 套用 FormLogic (依配置之觸發欄位)
  applyFormLogic();
  // 繪製明細 (頁籤 + 子表格 + 行內編輯器)
  if(hasDetail) paintDetails(mode);
}

/* ═══════════════════════════════════════════════════════════════════════
   Master-Detail 渲染與互動 (由 DoInit.View.DetailViews 驅動)
   ─ 主檔抽屜內以頁籤呈現各子表;每子表為獨立子表格 + 行內編輯器
   ─ 編輯緩衝於 RT.detailWorking;儲存主檔 (DoInsert/DoUpdate) 成功後 commitDetails
   ═══════════════════════════════════════════════════════════════════════ */
function paintDetails(mode){
  const host=$("detailHost"); if(!host) return;
  if(!DETAIL_DEFS.length){ host.innerHTML=""; return; }
  if(!RT.detailUI.active) RT.detailUI.active = DETAIL_DEFS[0].DetailID;
  const active = RT.detailUI.active;
  const total = DETAIL_DEFS.reduce((s,dv:any)=>s+(RT.detailWorking[dv.DetailID]||[]).length,0);
  const tabs = DETAIL_DEFS.map((dv:any)=>{
    const n=(RT.detailWorking[dv.DetailID]||[]).length;
    return `<button class="dt-tab ${dv.DetailID===active?'active':''}" data-act="detailTab" data-arg="${dv.DetailID}">
      <i class="${dv.Icon||'ri-list-check-2'}"></i><span class="dt-tab-tx">${esc(dv.Title)}</span><span class="dt-badge ${n?'':'zero'}">${n}</span></button>`;
  }).join("");
  host.innerHTML = `
    <div class="fd-head">
      <div class="fd-h-main"><i class="ri-stack-line"></i>明細資料 <span class="fd-h-count">${total}</span></div>
      <div class="fd-h-note"><i class="ri-information-line"></i>明細於主檔儲存時一併寫入</div>
    </div>
    <div class="dt-tabs" role="tablist">${tabs}</div>
    <div class="dt-panel" id="dtPanel"></div>`;
  paintDetailPanel(mode);
}

function paintDetailPanel(mode){
  const dv=detailDef(RT.detailUI.active); const panel=$("dtPanel"); if(!dv||!panel) return;
  const rows = RT.detailWorking[dv.DetailID]||[];
  const ro = mode==="view";
  const k = dv.RowKey||"RowGuid";
  const canAdd = dv.AllowAdd!==false && !ro;
  const cols = dv.Columns||[];
  const editing = RT.detailUI.editing[dv.DetailID];
  const editorHtml = (editing!=null && !ro) ? renderDetailEditor(dv, editing) : "";
  const bar = `<div class="dt-bar">
      <span class="dt-hint"><i class="ri-links-line"></i>${esc(dv.Entity||"")}<span class="dt-hint-rel">關聯鍵 <code>${esc(dv.RelationKey||KEYFIELD)}</code></span></span>
      <span style="flex:1"></span>
      ${canAdd?`<button class="btn btn-pri btn-xs" data-act="detailAdd" data-arg="${dv.DetailID}"><i class="ri-add-line"></i>新增明細</button>`:""}
    </div>`;
  const head = cols.map(c=>`<th class="${c.Align==='Center'?'col-center':''}" style="min-width:${c.Width||90}px">${esc(c.Title)}</th>`).join("");
  const actHead = ro?"":`<th class="col-center dt-acthead" style="width:84px">操作</th>`;
  let body;
  if(!rows.length){
    body = `<tr><td class="dt-empty" colspan="${cols.length+(ro?0:1)}">
      <div class="dt-empty-wrap"><i class="ri-inbox-2-line"></i><span>${esc(dv.EmptyText||"尚無明細資料")}</span>
      ${canAdd?`<button class="btn btn-def btn-xs" data-act="detailAdd" data-arg="${dv.DetailID}"><i class="ri-add-line"></i>立即新增</button>`:""}</div></td></tr>`;
  } else body = rows.map(r=>{
    const rk=r[k]; const isEd = editing!=null && String(editing)===String(rk);
    const tds=cols.map(c=>`<td class="${c.Align==='Center'?'col-center':''}">${detailFmt(dv,c,r)}</td>`).join("");
    const act = ro?"":`<td class="col-center dt-actcell">
        ${dv.AllowEdit!==false?`<button class="dt-ic" title="編輯" data-act="detailEdit" data-arg="${dv.DetailID}|${rk}"><i class="ri-edit-line"></i></button>`:""}
        ${dv.AllowDelete!==false?`<button class="dt-ic del" title="刪除" data-act="detailDel" data-arg="${dv.DetailID}|${rk}"><i class="ri-delete-bin-line"></i></button>`:""}
      </td>`;
    return `<tr class="${isEd?'dt-row-editing':''}">${tds}${act}</tr>`;
  }).join("");
  // 編輯器置於工具列下方、表格上方 → 新增/編輯時永遠可見
  panel.innerHTML = `${bar}${editorHtml}<div class="tbl-wrap dt-grid-wrap"><table class="grid dt-grid"><thead><tr>${head}${actHead}</tr></thead><tbody>${body}</tbody></table></div>`;
  panel.scrollTop = 0;
}

function detailFmt(dv,c,r){
  const v=r[c.BindField]; const blank='<span class="muted">—</span>';
  switch(c.Formatter){
    case "Tag": return (v!=null&&v!=="")?`<span class="tag def">${esc(detailCodeName(dv,c.OptionKey||c.BindField,v))}</span>`:blank;
    case "YesNo": return `<span class="tag ${String(v)==="1"?"on":"off"}">${String(v)==="1"?"是":"否"}</span>`;
    case "Date": return (v!=null&&v!=="")?esc(v):blank;
    default: return (v!=null&&v!=="")?esc(v):blank;
  }
}

function renderDetailEditor(dv, editing){
  const k=dv.RowKey||"RowGuid"; const isNew = editing==="__new__";
  const row = isNew ? {} : ((RT.detailWorking[dv.DetailID]||[]).find(r=>String(r[k])===String(editing))||{});
  const fields = (dv.FormFields||[]).map(f=>renderDetailField(dv,f,row[f.BindField])).join("");
  return `<div class="dt-editor">
      <div class="dt-editor-head">
        <span class="dt-eh-tt"><i class="${isNew?'ri-add-circle-line':'ri-edit-2-line'}"></i>${isNew?"新增":"編輯"}${esc(dv.Title)}明細</span>
        <button class="dt-eh-x" data-act="detailCancel" data-arg="${dv.DetailID}" title="取消"><i class="ri-close-line"></i></button>
      </div>
      <div class="dt-editor-grid">${fields}</div>
      <div class="dt-editor-foot">
        <button class="btn btn-def btn-xs" data-act="detailCancel" data-arg="${dv.DetailID}"><i class="ri-close-line"></i>取消</button>
        <button class="btn btn-pri btn-xs" data-act="detailSaveRow" data-arg="${dv.DetailID}"><i class="ri-check-line"></i>套用</button>
      </div>
    </div>`;
}

function renderDetailField(dv,f,val){
  const span=f.Span||12; const id=`df_${f.BindField}`;
  const v = (val!=null&&val!=="") ? val : (f.DefaultValue!==undefined?f.DefaultValue:"");
  const req=(f.Validations||[]).some(x=>x.Rule==="Required");
  let ctrl="";
  switch(f.Component){
    case "Select":{ const opts=detailCodeSet(dv,f.Props?.OptionKey||f.BindField);
      ctrl=`<select class="sel" id="${id}">${!req?'<option value="">請選擇</option>':''}${opts.map(o=>`<option value="${esc(o.CodeID)}" ${String(v)===String(o.CodeID)?'selected':''}>${esc(o.CodeName)}</option>`).join("")}</select>`; break; }
    case "YesNo":
      ctrl=`<select class="sel" id="${id}"><option value="0" ${String(v)!=="1"?'selected':''}>否</option><option value="1" ${String(v)==="1"?'selected':''}>是</option></select>`; break;
    case "TextArea":
      ctrl=`<textarea class="ta" id="${id}" rows="2">${esc(v)}</textarea>`; break;
    case "InputNumber":
      ctrl=`<input class="inp" id="${id}" type="number" value="${esc(v)}">`; break;
    case "DatePicker":
      ctrl=`<input class="inp" id="${id}" type="date" value="${esc(v)}">`; break;
    default:
      ctrl=`<input class="inp" id="${id}" value="${esc(v)}" placeholder="${esc(f.Props?.Placeholder||'')}">`;
  }
  return `<div class="fld" style="grid-column:span ${span}"><span class="fld-lbl">${esc(f.Title)}${req?'<span class="req">*</span>':''}</span>${ctrl}<span class="f-err" id="dferr_${f.BindField}"></span></div>`;
}

/* —— 明細互動：頁籤切換 / 新增 / 編輯 / 取消 / 刪除 / 套用 —— */
function detailTab(id){ RT.detailUI.active=id; paintDetails(RT.drawerMode); }
function detailAdd(id){ RT.detailUI.active=id; RT.detailUI.editing[id]="__new__"; paintDetails(RT.drawerMode); }
function detailEditRow(arg){ const [id,rk]=String(arg).split("|"); RT.detailUI.active=id; RT.detailUI.editing[id]=rk; paintDetails(RT.drawerMode); }
function detailCancelRow(id){ RT.detailUI.editing[id]=null; paintDetailPanel(RT.drawerMode); }
function detailDelRow(arg){
  const [id,rk]=String(arg).split("|"); const dv=detailDef(id); if(!dv) return; const k=dv.RowKey||"RowGuid";
  RT.detailWorking[id]=(RT.detailWorking[id]||[]).filter(r=>String(r[k])!==String(rk));
  RT.detailUI.editing[id]=null; paintDetails(RT.drawerMode);
  toast("info","已移除明細","儲存主檔後生效");
}
function detailSaveRow(id){
  const dv=detailDef(id); if(!dv) return; const k=dv.RowKey||"RowGuid";
  const editing=RT.detailUI.editing[id]; const isNew=editing==="__new__";
  const d:any={}; (dv.FormFields||[]).forEach(f=>{ const el=$("df_"+f.BindField); if(el) d[f.BindField]=el.value; });
  // 明細必填驗證
  let ok=true;
  (dv.FormFields||[]).forEach(f=>{ const er=$("dferr_"+f.BindField); if(er){er.classList.remove("show");}
    (f.Validations||[]).forEach(rule=>{
      if(rule.Rule==="Required" && (d[f.BindField]==null||d[f.BindField]==="")){ ok=false; if(er){er.textContent=rule.Message;er.classList.add("show");} }
    }); });
  if(!ok){ toast("warn","明細驗證未通過","請修正必填欄位"); return; }
  const list=RT.detailWorking[id]||(RT.detailWorking[id]=[]);
  if(isNew){ d[k]="dtl-"+newGuid(); d.EntityID=UserInfo.EntityID; if(!d[STATUSFIELD]) d[STATUSFIELD]="1"; list.push(d); }
  else { const idx=list.findIndex(r=>String(r[k])===String(editing)); if(idx>=0) list[idx]={...list[idx],...d}; }
  RT.detailUI.editing[id]=null; paintDetails(RT.drawerMode);
  toast("suc","明細已套用","儲存主檔後一併寫入");
}

/* —— 主檔儲存成功後，將明細工作區寫回持久層 (依關聯鍵綁定主鍵值) —— */
function commitDetails(masterKey){
  DETAIL_DEFS.forEach((dv:any)=>{
    const rk=dv.RelationKey||KEYFIELD;
    const store=DETAIL_DB[dv.DetailID]||(DETAIL_DB[dv.DetailID]=[]);
    const kept=store.filter(r=>String(r[rk])!==String(masterKey));   // 移除此主鍵舊明細
    const work=(RT.detailWorking[dv.DetailID]||[]).map(r=>{ const c={...r}; c[rk]=masterKey; c.EntityID=UserInfo.EntityID; if(!c[STATUSFIELD]) c[STATUSFIELD]="1"; return c; });
    DETAIL_DB[dv.DetailID]=kept.concat(work);
  });
}

/* —— 檢視模式之顯示值(解析字典 / 樹狀父層 / JSON) —— */
function formDisplayValue(f, data){
  const v = data[f.BindField];
  if(v==null||v==="") return '<span class="muted">—</span>';
  if(f.Component==="Select"){ const set=f.Props?.OptionKey; return esc(set&&CODE[set]?codeName(set,v):v); }
  if(f.Component==="TreeSelect"){ const p=f.Props||{}; const vf=p.ValueField||KEYFIELD||ROWKEY, tf=p.TitleField||TITLEFIELD||vf;
    const r=DB.find(x=>String(x[vf])===String(v)); return r?`${esc(r[tf])} <span class="muted">（${esc(v)}）</span>`:esc(v); }
  if(f.Component==="JsonEditor") return `<code class="fld-code">${esc(v)}</code>`;
  if(f.Component==="TextArea") return esc(v).replace(/\n/g,"<br>");
  return esc(v);
}

/* —— 單一欄位渲染 (依 Component) —— */
function renderField(f, data, mode){
  const span = f.Span||12;
  const colStyle = `grid-column:span ${span}`;
  // 檢視模式:以靜態值卡呈現,閱讀清晰且不可誤改
  if(mode==="view"){
    return `<div class="fld fld-ro" style="${colStyle}" id="fld_${f.BindField}">
      <span class="fld-lbl">${esc(f.Title)}</span>
      <div class="fld-static">${formDisplayValue(f,data)}</div>
    </div>`;
  }
  const val = data[f.BindField]??"";
  const ro = mode==="view" || f.Mode==="Readonly";
  const roAttr = ro?"disabled":"";
  const req = (f.Validations||[]).some(v=>v.Rule==="Required");
  let ctrl="";
  const id = `f_${f.BindField}`;
  switch(f.Component){
    case "Select":{
      const opts = CODE[f.Props?.OptionKey]||[];
      ctrl = `<select class="sel" id="${id}" ${roAttr} data-change="fieldChange" data-arg="${f.BindField}">
        ${!req?'<option value="">請選擇</option>':''}
        ${opts.map(o=>`<option value="${o.CodeID}" ${val==o.CodeID?'selected':''}>${o.CodeName}</option>`).join("")}</select>`;
      break;}
    case "TreeSelect":{
      // 自參照下拉:依 Props(ValueField/TitleField) 與物化路徑排除自身及下屬
      const p=f.Props||{};
      const vf=p.ValueField||KEYFIELD||ROWKEY, tf=p.TitleField||TITLEFIELD||vf;
      const selfKey=data[vf];
      const selfPath=(PATHFIELD&&selfKey)?((DB.find(r=>r[vf]===selfKey)||{})[PATHFIELD]):null;
      const cands=DB.filter(r=>r[STATUSFIELD]!=="0" && r[vf]!==selfKey
          && !(p.ExcludeSelfAndDescendants&&selfPath&&r[PATHFIELD]&&String(r[PATHFIELD]).startsWith(selfPath)))
        .sort((a,b)=>String(a[vf]).localeCompare(String(b[vf])));
      ctrl = `<select class="sel" id="${id}" ${roAttr} data-change="fieldChange" data-arg="${f.BindField}">
        <option value="">（無／最上層）</option>
        ${cands.map(r=>`<option value="${esc(r[vf])}" ${val==r[vf]?'selected':''}>${esc(r[tf])}（${esc(r[vf])}）</option>`).join("")}</select>`;
      break;}
    case "TextArea":
      ctrl = `<textarea class="ta" id="${id}" rows="${f.Props?.Rows||3}" ${roAttr}>${esc(val)}</textarea>`; break;
    case "JsonEditor":
      ctrl = `<textarea class="ta code" id="${id}" rows="4" ${roAttr} placeholder='{"key":"value"}'>${esc(val)}</textarea>`; break;
    case "InputNumber":
      ctrl = `<input class="inp" id="${id}" type="number" value="${esc(val)}" min="${f.Props?.Min||''}" max="${f.Props?.Max||''}" ${roAttr}>`; break;
    case "DatePicker":
      ctrl = `<input class="inp" id="${id}" value="${esc(val)}" ${roAttr} readonly>`; break;
    default:
      ctrl = `<input class="inp" id="${id}" value="${esc(val)}" placeholder="${esc(f.Props?.Placeholder||'')}" ${f.Mode==='Readonly'?'readonly':''} ${mode==='view'?'disabled':''}>`;
  }
  return `<div class="fld" style="${colStyle}" id="fld_${f.BindField}">
    <span class="fld-lbl">${esc(f.Title)}${req?'<span class="req">*</span>':''}</span>
    ${ctrl}
    <span class="f-err" id="err_${f.BindField}"></span>
  </div>`;
}

function toggleSec(secId){
  const b=$("secbody_"+secId); const c=$("caret_"+secId);
  const closed=b.classList.toggle("closed"); if(c)c.classList.toggle("closed",closed);
}
function onFieldChange(field){ applyFormLogic(); }

/* —— FormLogic:通用直譯器 (讀 FormSpec.FormLogic;支援 SetMode/ClearValue/SetRequired) —— */
function evalCond(val, cond){
  const m=String(cond||"").match(/^\s*(==|!=)\s*'?([^']*)'?\s*$/);
  if(!m) return false;
  return m[1]==="==" ? String(val)===m[2] : String(val)!==m[2];
}
function applyFormLogic(){
  const logic=DoInit.View?.FormView?.FormSpec?.FormLogic||[];
  if(!logic.length) return;
  const specs=DoInit.View.FormView.FieldSpecs||[];
  // 1) 先把所有 target 欄位重置為基準狀態
  const targets=new Set(); logic.forEach(r=>(r.TargetFields||[]).forEach(t=>targets.add(t)));
  targets.forEach(tf=>{
    const el=$("f_"+tf), fld=$("fld_"+tf), spec=(specs.find((f:any)=>f.BindField===tf)||{}) as any;
    if(el) el.disabled = (RT.drawerMode==="view")||spec.Mode==="Readonly";
    if(fld){ fld.style.opacity="1"; const lbl=fld.querySelector(".fld-lbl");
      const baseReq=(spec.Validations||[]).some(v=>v.Rule==="Required");
      if(lbl) lbl.innerHTML = esc(spec.Title||tf)+(baseReq?'<span class="req">*</span>':''); }
  });
  // 2) 套用符合條件之規則
  logic.forEach(rule=>{
    const trig=$("f_"+rule.TriggerField); if(!trig) return;
    if(!evalCond(trig.value, rule.Condition)) return;
    (rule.TargetFields||[]).forEach(tf=>{
      const el=$("f_"+tf), fld=$("fld_"+tf);
      if(rule.Action==="SetMode" && rule.Params?.Mode==="Readonly"){ if(el)el.disabled=true; if(fld)fld.style.opacity=".6"; }
      else if(rule.Action==="ClearValue"){ if(el)el.value=""; }
      else if(rule.Action==="SetRequired" && rule.Params?.Required){ if(fld){const lbl=fld.querySelector(".fld-lbl"); if(lbl&&!lbl.querySelector(".req")) lbl.innerHTML+='<span class="req">*</span>';} }
    });
  });
}

/* —— 收集表單值 —— */
function collectForm(){
  const d={};
  (DoInit.View.FormView.FieldSpecs||[]).forEach(f=>{ const el=$("f_"+f.BindField); if(el) d[f.BindField]=el.value; });
  d[ROWKEY] = RT.curRow[ROWKEY] || RT.curRow.RowKey || "";
  return d;
}

/* —— 前端驗證 (對應 Validations) —— */
function validateForm(d){
  let ok=true;
  document.querySelectorAll(".fld").forEach(f=>f.classList.remove("invalid"));
  document.querySelectorAll(".f-err").forEach(e=>e.classList.remove("show"));
  DoInit.View.FormView.FieldSpecs.forEach(f=>{
    const errs=[]; const v=d[f.BindField];
    (f.Validations||[]).forEach(rule=>{
      if(rule.Rule==="Required" && (!v||v==="")) errs.push(rule.Message);
      if(rule.Rule==="MaxLength" && v && v.length>rule.Value) errs.push(rule.Message);
      if(rule.Rule==="Email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errs.push(rule.Message);
      if(rule.Rule==="Range" && v && (+v<rule.Min||+v>rule.Max)) errs.push(rule.Message);
      if(rule.Rule==="JsonFormat" && v){ try{JSON.parse(v);}catch{errs.push(rule.Message);} }
    });
    if(errs.length){ ok=false; const fld=$("fld_"+f.BindField); const er=$("err_"+f.BindField);
      if(fld)fld.classList.add("invalid"); if(er){er.textContent=errs[0];er.classList.add("show");} }
  });
  return ok;
}

/* —— DoInsert / DoUpdate —— */
function doSave(){
  const d = collectForm();
  if(!validateForm(d)){ toast("warn","驗證未通過","請修正標示之欄位"); return; }
  const action = RT.drawerMode==="create"?"DoInsert":"DoUpdate";
  const res = CDE.dispatch(action,{Data:d});
  if(res.ReturnMsg.IsSuccess!=="Y"){
    // 後端業務驗證錯誤回填
    const errs=res.ReturnData?.Errors||[];
    errs.forEach(e=>{const fld=$("fld_"+e.Field);const er=$("err_"+e.Field);if(fld)fld.classList.add("invalid");if(er){er.textContent=e.Message;er.classList.add("show");}});
    toast("err","儲存失敗",res.ReturnMsg.Message); return;
  }
  toast("suc",RT.drawerMode==="create"?"新增成功":"修改成功",res.ReturnData?.Path?("路徑:"+res.ReturnData.Path):"");
  if(DETAIL_DEFS.length && KEYFIELD) commitDetails(d[KEYFIELD]);   // Master-Detail:明細隨主檔一併寫入
  closeDrawer(); doQuery(RT.page);
}

function closeDrawer(){ $("drawerMask").classList.remove("open"); $("drawer").classList.remove("open"); }

/* —— DoDelete:單筆 —— */
function deleteOne(guid){
  const r = DB.find(x=>x[ROWKEY]===guid)||{};
  const kids = PATHFIELD ? DB.filter(x=>x[STATUSFIELD]!=="0" && x[PATHFIELD]?.startsWith(r[PATHFIELD]) && x[ROWKEY]!==guid) : [];
  const da = (DoInit.AllowAction?.DataActions||[]).find(a=>a.ActionID==="Delete");
  const cf = da?.Confirm || "確定要刪除此筆資料嗎？";
  const detail = kids.length>0 ? `此節點下尚有 ${kids.length} 筆子資料,將一併停用。`
    : `${KEYFIELD?(esc(r[KEYFIELD])+"　"):""}${TITLEFIELD?esc(r[TITLEFIELD]||""):""}`;
  showConfirm(cf, detail, ()=>{
    const res = CDE.dispatch("DoDelete",{KeyValue:guid});
    const casc=res.ReturnData.CascadedCodes||[];
    toast("suc","刪除成功",`共影響 ${res.ReturnMsg.AffectedCount} 筆${casc.length?`(連動:${casc.join("、")})`:""}`);
    RT.selected.delete(guid); doQuery(RT.page);
  });
}

/* —— DoDelete:多筆 —— */
function deleteSelected(){
  if(RT.selected.size===0){ toast("warn","未選取資料","請先勾選欲刪除的資料"); return; }
  const keys=[...RT.selected];
  showConfirm(`確認批次刪除選取的 ${keys.length} 筆資料？`,`以邏輯刪除 (Status='0') 於資料層排除;若有物化路徑將連動下屬節點。`,()=>{
    const res = CDE.dispatch("DoDelete",{KeyValue:keys});
    toast("suc","批次刪除成功",`共影響 ${res.ReturnMsg.AffectedCount} 筆`);
    RT.selected.clear(); doQuery(RT.page);
  });
}

function showConfirm(txt, sub, onOk){
  $("confirmTxt").textContent = txt||"確認執行此操作？";
  $("confirmSub").textContent = sub||"";
  $("confirmMask").classList.add("open");
  $("confirmOk").onclick = ()=>{ closeModal("confirmMask"); onOk(); };
}
function closeModal(id){ $(id).classList.remove("open"); }

/* ═══ DoImport ═══ */
function openImport(){
  const spec = DoInit.Features.ImportSpec;
  $("tplName").textContent = spec.TemplateMeta.FileName;
  $("dupAction").textContent = spec.ImportRules.DuplicateAction==="Update"?"更新":"略過";
  $("maxRows").textContent = spec.ImportRules.MaxRowCount;
  $("importPreview").style.display="none";
  $("dropTitle").textContent="點此選擇 Excel 檔,或拖曳檔案至此";
  $("importRun").disabled=true;
  RT.importRows=null;
  $("importMask").classList.add("open");
}
function renderImportInstr(){
  const ins = DoInit.Features?.ImportSpec?.TemplateMeta?.Instructions;
  if(!ins){ $("importInstr").innerHTML=""; return; }
  $("importInstr").innerHTML = `<div class="instr-t"><i class="ri-information-line"></i>匯入須知</div><ul>${ins.map(i=>`<li>${esc(i)}</li>`).join("")}</ul>`;
}
function downloadTemplate(){
  const spec=DoInit.Features?.ImportSpec; if(!spec) return;
  const cols=spec.ImportColumns||[];
  const header=cols.map(c=>c.ExcelHeader).join(",");
  const sampleVal=(c,i)=> c.OptionKey&&CODE[c.OptionKey]?.length ? CODE[c.OptionKey][i%CODE[c.OptionKey].length].CodeID
                    : c.DataType==="Number" ? (2020+i) : `${c.ExcelHeader}${i+1}`;
  const sample=[0,1].map(i=>cols.map(c=>sampleVal(c,i)).join(","));
  const fn=(spec.TemplateMeta?.FileName||DoInit.FuncCode||"匯入樣板");
  const csv="\uFEFF"+header+"\n"+sample.join("\n");
  downloadFile(csv, fn+".csv","text/csv");
  toast("suc","樣板已下載",fn+".csv");
}
/* 模擬選檔:載入內建示範資料 */
function simulateFilePick(){
  const cols=DoInit.Features?.ImportSpec?.ImportColumns||[];
  const sampleVal=(c,i)=> c.OptionKey&&CODE[c.OptionKey]?.length ? CODE[c.OptionKey][i%CODE[c.OptionKey].length].CodeID
                    : c.DataType==="Number" ? (2020+i) : `${c.ExcelHeader}${i+1}`;
  RT.importRows=[0,1].map(i=>{const row={}; cols.forEach(c=>row[c.FieldID]=sampleVal(c,i)); return row;});
  $("dropTitle").textContent=`已選擇:示範匯入資料（${RT.importRows.length} 列）`;
  $("importRun").disabled=false;
  const rows=RT.importRows; const show=cols.slice(0,5);
  let html=`<div class="card-sub" style="margin-bottom:8px">解析預覽(共 ${rows.length} 列;重複鍵值將依規則「更新」)</div>
    <div class="tbl-wrap" style="max-height:180px;border:1px solid var(--bdr);border-radius:8px">
    <table class="grid"><thead><tr>${show.map(c=>`<th>${esc(c.ExcelHeader)}</th>`).join("")}</tr></thead><tbody>`;
  rows.forEach(r=>{
    const dup = KEYFIELD && DB.find(x=>x[KEYFIELD]===r[KEYFIELD] && x[STATUSFIELD]!=="0");
    html += `<tr>${show.map((c,ci)=>`<td>${ci===0?`${esc(r[c.FieldID])} ${dup?'<span class="tag warn" style="background:var(--warnl);color:#a06d12">更新</span>':'<span class="tag on">新增</span>'}`:esc(c.OptionKey?codeName(c.OptionKey,r[c.FieldID]):r[c.FieldID])}</td>`).join("")}</tr>`;
  });
  html += `</tbody></table></div>`;
  $("importPreview").innerHTML=html; $("importPreview").style.display="block";
}
function runImport(){
  const res = CDE.dispatch("DoImport",{Rows:RT.importRows});
  if(res.ReturnMsg.IsSuccess!=="Y"){ toast("err","匯入失敗",res.ReturnMsg.Message); return; }
  toast("suc","匯入完成",`新增 ${res.ReturnData.Inserted} 筆,更新 ${res.ReturnData.Updated} 筆`);
  closeModal("importMask");
  doQuery(1);
}

/* ═══ DoExport ═══ */
function renderExportCols(){
  const cols = DoInit.Features?.ExportSpec?.ExportColumns;
  if(!cols){ $("exportCols").innerHTML=""; return; }
  $("exportCols").innerHTML = cols.map((c,i)=>`<label style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer">
    <input type="checkbox" class="chk" data-key="${c.DataKey}" checked>${esc(c.Header)}</label>`).join("");
}
function openExport(){ $("exportScope").value="current"; $("exportMask").classList.add("open"); }
function exportSelected(){ openExport(); $("exportScope").value="selected"; }
function runExport(){
  const scope=$("exportScope").value;
  const cols=[...document.querySelectorAll("#exportCols input:checked")].map((c:any)=>c.dataset.key);
  const res = CDE.dispatch("DoExport",{Scope:scope,Columns:cols,Keys:[...RT.selected]});
  if(res.ReturnMsg.IsSuccess!=="Y"){ toast("err","匯出失敗",res.ReturnMsg.Message); return; }
  // 產生 CSV
  const colDefs = DoInit.Features.ExportSpec.ExportColumns.filter(c=>cols.includes(c.DataKey));
  const header = colDefs.map(c=>c.Header).join(",");
  const lines = res.ReturnData.Rows.map(r=>colDefs.map(c=>{
    let v=r[c.DataKey];
    if(c.Format?.startsWith("CodeName:")){ v=codeName(c.Format.split(":")[1],v); }
    return `"${String(v??"").replace(/"/g,'""')}"`;
  }).join(","));
  let csv = "\uFEFF"+header+"\n"+lines.join("\n");
  if(DoInit.Features.ExportSpec.ExportRules.AppendQuerySummary)
    csv += `\n\n"查詢摘要","匯出範圍:${scope}","筆數:${res.ReturnData.RowCount}","匯出時間:${nowStr()}"`;
  downloadFile(csv, res.ReturnData.FileName.replace(".xlsx",".csv"),"text/csv");
  toast("suc","匯出完成",`共 ${res.ReturnData.RowCount} 筆 · ${res.ReturnData.FileName}`);
  closeModal("exportMask");
}
function downloadFile(content,name,type){
  const blob=new Blob([content],{type:type+";charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
}

/* ═══ DoReport ═══ */
let RPT=null;
function dispatchReport(){ const res=CDE.dispatch("DoReport",{ReportType:$("rptType")?.value}); RPT=res.ReturnData; renderReport(); toast("suc","報表已產生",`資料時間 ${RPT.GeneratedAt}`); }
function colTitle(field){ return ((DoInit!.View.ListView.FieldSpecs.find((f:any)=>f.BindField===field)||{}) as any).Title||field; }
function reportCell(c,r){ const v=r[c.BindField]; if(CODE[c.BindField]) return codeName(c.BindField,v); return (v==null||v==="")?"—":v; }
/* —— 報表類型選單:由 ReportView.ReportTypes 產生 —— */
function renderReportTypes(){
  const sel=$("rptType"); if(!sel) return;
  const types=DoInit.View?.ReportView?.ReportTypes||[];
  sel.innerHTML = types.length
    ? types.map(t=>`<option value="${esc(t.Type)}">${esc(t.Title)}</option>`).join("")
    : `<option value="summary">彙總報表</option>`;
}
function renderReport(){
  if(!RPT){ const res=CDE.dispatch("DoReport",{ReportType:$("rptType")?.value}); RPT=res.ReturnData; }
  const title=DoInit.PageMeta?.PageTitle||DoInit.FuncCode||"資料";
  const sys=`${DoInit.SystemCode||""} / ${DoInit.ModuleCode||""} / ${DoInit.FuncCode||""}`;
  const head=`<div class="rpt-h"><h1>${esc(title)} — ${esc(RPT.Title||"報表")}</h1><div class="sub">配置驅動報表${RPT.Dim?`(依「${esc(colTitle(RPT.Dim))}」分組)`:""}</div></div>
    <div class="rpt-meta"><span>系統:${esc(sys)}　租戶:${esc(DoInit.EntityID||"")}</span><span>產製人:${esc(UserInfo.UserName)}　產製時間:${esc(RPT.GeneratedAt)}</span></div>`;
  let body="";
  if(RPT.Layout==="GroupTable" && RPT.Dim){
    const total=RPT.Total||0;
    body=`<table class="rpt-tbl"><thead><tr><th>${esc(colTitle(RPT.Dim))}</th><th>數量</th><th>占比</th></tr></thead><tbody>
      ${Object.entries(RPT.Groups).map(([k,v])=>{const pct=total?(Number(v)/total*100).toFixed(1):0;return `<tr><td>${esc(k)}</td><td>${v}</td><td>${pct}%　<span style="display:inline-block;height:8px;background:var(--pri);width:${(+pct)*1.5}px;border-radius:4px;vertical-align:middle"></span></td></tr>`;}).join("")}
      <tr style="font-weight:700"><td>合計</td><td>${total}</td><td>100%</td></tr></tbody></table>`;
  } else if(RPT.Layout==="PathTable" && PATHFIELD){
    const tc=getTreeCfg(); const sep=tc.Sep||"/";
    const rows=RPT.Rows.slice().sort((a,b)=>String(a[PATHFIELD]??"").localeCompare(String(b[PATHFIELD]??"")));
    body=`<table class="rpt-tbl"><thead><tr><th>路徑</th><th>${esc(TITLEFIELD?colTitle(TITLEFIELD):"名稱")}</th>${PARENTFIELD?"<th>上層</th>":""}</tr></thead><tbody>
      ${rows.map(r=>{const depth=Math.max(0,(String(r[PATHFIELD]).split(sep).length-3));return `<tr><td style="font-family:var(--mono);font-size:10px">${esc(r[PATHFIELD])}</td><td>${'　'.repeat(depth)}${esc(r[TITLEFIELD]||"")}</td>${PARENTFIELD?`<td>${esc(r[PARENTFIELD]||'—')}</td>`:""}</tr>`;}).join("")}
      </tbody></table>`;
  } else {
    let stats=`<div class="rpt-stats"><div class="rpt-stat"><div class="n">${RPT.Total}</div><div class="l">資料總數</div></div>`;
    Object.entries(RPT.Groups||{}).forEach(([k,v])=>{ stats+=`<div class="rpt-stat"><div class="n">${v}</div><div class="l">${esc(k)}</div></div>`; });
    stats+=`</div>`;
    const cols=(DoInit.View.ListView.FieldSpecs||[]).filter(f=>f.DefaultVisible).slice(0,6);
    const sf=(DoInit.View.ListView.ListSpec?.DefaultSort?.Field)||KEYFIELD||ROWKEY;
    const rows=RPT.Rows.slice().sort((a,b)=>String(a[sf]??"").localeCompare(String(b[sf]??""),undefined,{numeric:true}));
    body=`${stats}<table class="rpt-tbl"><thead><tr>${cols.map(c=>`<th>${esc(c.Title)}</th>`).join("")}</tr></thead><tbody>
      ${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(reportCell(c,r))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  $("rptPage").innerHTML = head + body + `<div class="rpt-foot"><span>兆聯 CDE V2.6 · 配置驅動報表引擎</span><span>第 1 頁 / 共 1 頁</span></div>`;
}
function exportReportPdf(){ toast("info","PDF 產製","報表已透過 DevExpress Web Document Viewer 產出（示範環境以列印替代）"); window.print(); }

/* ═══ Meta 檢視 ═══ */
function renderMeta(cfg){
  const pm=cfg.PageMeta||{}, ds=cfg.DataScope||{}, pg=cfg.CustomMeta?.BusinessRules?.PathGeneration||{};
  const dc=ds.DataConfig||{};
  $("metaKv").innerHTML = `
    <tr><td>功能代碼 FuncCode</td><td><code>${esc(cfg.FuncCode??"—")}</code></td></tr>
    <tr><td>系統 / 模組</td><td><b>${esc(cfg.SystemCode??"—")}</b> / ${esc(cfg.ModuleCode??"—")}</td></tr>
    <tr><td>租戶實體 EntityID</td><td><code>${esc(cfg.EntityID??"—")}</code> <span class="muted">(@UserInfo.EntityID 物理隔離)</span></td></tr>
    <tr><td>表單型態 FormType</td><td><code>${esc(pm.FormType??"—")}</code> · 編輯呈現 <code>${esc(pm.EditDisplayType??"—")}</code></td></tr>
    <tr><td>Widget</td><td><code>${esc(cfg.CustomMeta?.CustomSchema?.WidgetType??"—")}</code></td></tr>
    <tr><td>資料範圍 DefaultWhere</td><td><code>${esc(ds.DefaultWhere??"—")}</code></td></tr>
    <tr><td>排序 SortExp</td><td><code>${esc(ds.SortExp??"—")}</code></td></tr>
    <tr><td>權限層級 AuthLevel</td><td>${esc(ds.AuthLevel??"—")} · RowLimit ${esc(dc.RowLimit??"—")}</td></tr>
    <tr><td>路徑產生策略</td><td><code>${esc(pg.Strategy??"—")}</code> · 樣式 <code>${esc(pg.Pattern??"—")}</code></td></tr>
    <tr><td>ConfigHash</td><td class="mono" style="font-size:10px;word-break:break-all">${esc(cfg.ConfigHash??"—")}</td></tr>`;
  $("configDump").textContent = JSON.stringify(cfg, null, 2);
}
function copyConfig(){ navigator.clipboard?.writeText(JSON.stringify(DoInit,null,2)); toast("suc","已複製","DoInit JSON 配置已複製到剪貼簿"); }

/* ═══ 檢視切換(報表 / DoInit 配置 改由工具列按鈕觸發;列表為預設)═══ */
function switchView(v){
  if(!DoInit){ toast("warn","配置尚未載入","請先載入 JSON 配置"); return; }
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));
  const el=$("view-"+v); if(el) el.classList.add("active");
  if(v==="report"){ dispatchReport(); }
}

/* ═══ 派發日誌 (spf_cde_DoDispatch 封包) ═══ */
function logDispatch(req, res){
  RT.logSeq++;
  const entry={seq:RT.logSeq,ts:new Date().toLocaleTimeString("zh-TW",{hour12:false}),req,res};
  RT.logs.unshift(entry);
  if(RT.logs.length>30) RT.logs.pop();
  $("logCount").textContent = RT.logSeq;
  renderLog();
}
function renderLog(){
  if(RT.logs.length===0){ $("logBody").innerHTML=`<div style="color:rgba(255,255,255,.35);text-align:center;padding:30px 0">尚無派發紀錄</div>`; return; }
  $("logBody").innerHTML = RT.logs.map(e=>{
    const ok = e.res.ReturnMsg.IsSuccess==="Y";
    const inJson = JSON.stringify(e.req.InputData);
    const rm = e.res.ReturnMsg;
    const rdPreview = JSON.stringify(e.res.ReturnData).slice(0,260);
    return `<div class="log-entry ${ok?'':'err'}">
      <div class="log-act"><span class="pill">#${e.seq}</span>spf_cde_DoDispatch · @Action=${esc(e.req.Action)}<span class="ts">${e.ts}</span></div>
      <div class="log-kv">@UserInfo.EntityID = <b>${esc(e.req.UserInfo.EntityID)}</b> · AuthLevel=${e.req.UserInfo.AuthLevel}</div>
      <div class="log-kv">→ @InputData:</div>
      <div class="log-json in">${esc(inJson.length>260?inJson.slice(0,260)+' …':inJson)}</div>
      <div class="log-kv">← @ReturnMsg: <b>${rm.IsSuccess}</b> / ${esc(rm.ReturnCode)} / ${esc(rm.Message)} (Affected=${rm.AffectedCount})</div>
      <div class="log-kv">← @ReturnData:</div>
      <div class="log-json">${esc(rdPreview)}${JSON.stringify(e.res.ReturnData).length>260?' …':''}</div>
    </div>`;
  }).join("");
}
function toggleLog(){ $("logPanel").classList.toggle("open"); }
function clearLog(){ RT.logs=[]; RT.logSeq=0; $("logCount").textContent="0"; renderLog(); }

/* ═══ Toast ═══ */
function toast(type, title, sub){
  const icMap={suc:"ri-checkbox-circle-line",err:"ri-close-circle-line",warn:"ri-error-warning-line",info:"ri-information-line"};
  const el=document.createElement("div");
  el.className=`toast ${type}`;
  el.innerHTML=`<i class="${icMap[type]}"></i><div class="tx"><div class="tt">${esc(title)}</div>${sub?`<div class="ts">${esc(sub)}</div>`:''}</div>`;
  $("toastWrap").appendChild(el);
  setTimeout(()=>{el.style.transition="all .25s";el.style.opacity="0";el.style.transform="translateX(110%)";setTimeout(()=>el.remove(),250);},3200);
}

/* ═══════════════════════════════════════════════════════════════════════
   [9] 動態配置載入 — 換一份 JSON,畫面即重新渲染
   優先序：外部 CDE.DoInit.txt → (失敗) 提示以伺服器開啟或上傳；隨時可上傳/拖放覆寫
   ═══════════════════════════════════════════════════════════════════════ */

/* —— 基本結構驗證:至少要有 PageMeta 與 ListView.FieldSpecs —— */
/* ═══════════════════════════════════════════════════════════════════
   SurveyForm 渲染分支 — 題庫式問卷(Bank→Groups→Questions→Options)
   FormType=SurveyForm 時由 bootstrap 早退呼叫;作答經 @Action=DoSubmit 派發。
   ═══════════════════════════════════════════════════════════════════ */
function injectSurveyCSS(){
  if(document.getElementById("cde-survey-style")) return;
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
  const st=document.createElement("style"); st.id="cde-survey-style"; st.textContent=css; document.head.appendChild(st);
}
function svGradeOf(s){ var gr=(RT.surveySpec&&RT.surveySpec.Bank&&RT.surveySpec.Bank.GradeRule)||[{Grade:"S",Min:95},{Grade:"A",Min:85},{Grade:"B",Min:70},{Grade:"C",Min:60},{Grade:"D",Min:0}]; for(var i=0;i<gr.length;i++){ if(s>=gr[i].Min) return gr[i].Grade; } return "D"; }
function svAnswered(v){ if(v==null||v==="") return false; if(Array.isArray(v)) return v.length>0; if(typeof v==="object") return Object.keys(v).length>0; return true; }
function svVisible(){ var out=[],A=RT.surveyAns; (RT.surveySpec.Groups||[]).forEach(function(g){(g.Questions||[]).forEach(function(q){ if(q.Condition && A[q.Condition.QuestionCode]!==q.Condition.Equals) return; out.push({g:g,q:q}); });}); return out; }
function svQScore(q,v){ if(v==null) return null;
  if(q.QuestionType==="rating") return v/(q.Max||100)*(q.MaxScore||100);
  if(q.QuestionType==="yesno") return v==="Y"?(q.YesScore==null?100:q.YesScore):(q.NoScore==null?0:q.NoScore);
  if(q.QuestionType==="scale"||q.QuestionType==="single"){ var o=(q.Options||[]).filter(function(o){return o.OptionCode===v;})[0]; return o&&o.OptionScore!=null?o.OptionScore:null; }
  return null; }
function svRecalc(){ var spec=RT.surveySpec,A=RT.surveyAns; svUpdateProgress(); if(!spec||spec.Bank.ScoringMode!=="weighted") return null;
  var total=0,wsum=0;
  spec.Groups.forEach(function(g){ var gs=0,gw=0; g.Questions.forEach(function(q){ var s=svQScore(q,A[q.QuestionCode]); if(s!=null){ gs+=s*(q.QuestionWeight||0)/100; gw+=(q.QuestionWeight||0);} }); if(gw>0){ total+=gs*(100/gw)*(g.GroupWeight||0)/100; wsum+=(g.GroupWeight||0);} });
  var fin=wsum>0?total*(100/wsum):0;
  var all=svVisible().every(function(x){return svQScore(x.q,A[x.q.QuestionCode])!=null;});
  var ts=$("svTotal"); if(ts) ts.textContent=all?fin.toFixed(1):"\u2014";
  var gb=$("svGrade"); if(gb) gb.innerHTML=all?('<span class="tag '+svGradeOf(fin)+'">'+svGradeOf(fin)+'</span>'):'<span class="muted" style="font-size:13px">\u586B\u5BEB\u4E2D</span>';
  return fin; }
function svUpdateProgress(){ var vis=svVisible(),A=RT.surveyAns; var done=vis.filter(function(x){return svAnswered(A[x.q.QuestionCode]);}).length; var pct=vis.length?Math.round(done/vis.length*100):0; var p=$("svProg"); if(p)p.style.width=pct+"%"; var t=$("svProgTxt"); if(t)t.textContent=done+"/"+vis.length; }
function svApplyConditions(){ var A=RT.surveyAns; (RT.surveySpec.Groups||[]).forEach(function(g){(g.Questions||[]).forEach(function(q){ if(q.Condition){ var ok=A[q.Condition.QuestionCode]===q.Condition.Equals; var el=$("svq_"+q.QuestionCode); if(el) el.style.display=ok?"":"none"; }});}); }
function svRerender(){ renderSurvey(RT.surveyCfg); }
function svInput(q,val){
  var t=q.QuestionType,A=RT.surveyAns;
  if(t==="single"||t==="multiple"){ var multi=t==="multiple",arr=Array.isArray(val)?val:(val!=null?[val]:[]);
    return '<div class="sv-opts">'+(q.Options||[]).map(function(o){ var sel=arr.indexOf(o.OptionCode)>=0;
      return '<div class="sv-opt '+(multi?"multi ":"")+(sel?"sel":"")+'" data-svopt="'+o.OptionCode+'" data-svq="'+q.QuestionCode+'" data-svtype="'+t+'"><span class="mk"></span><span>'+esc(o.OptionText)+'</span>'+(o.OptionScore!=null?'<span class="sc">'+o.OptionScore+'\u5206</span>':'')+(o.AllowInput&&sel?'<input class="sv-other" placeholder="\u8ACB\u8AAA\u660E..." data-svother="'+q.QuestionCode+'" onclick="event.stopPropagation()">':'')+'</div>'; }).join("")+'</div>'; }
  if(t==="scale"){ return '<div class="sv-scale">'+(q.Options||[]).map(function(o){ return '<div class="s '+(val===o.OptionCode?"sel":"")+'" data-svopt="'+o.OptionCode+'" data-svq="'+q.QuestionCode+'" data-svtype="scale"><span class="v">'+esc(o.OptionCode)+'</span>'+esc(o.OptionText)+'</div>'; }).join("")+'</div>'; }
  if(t==="rating"){ var v=val==null?(q.Min||0):val; return '<div class="sv-rate"><input type="range" min="'+(q.Min||0)+'" max="'+(q.Max||100)+'" step="'+(q.Step||1)+'" value="'+v+'" data-svrange="'+q.QuestionCode+'"><input class="num" type="number" min="'+(q.Min||0)+'" max="'+(q.Max||100)+'" value="'+(val==null?"":val)+'" placeholder="\u2014" data-svnum="'+q.QuestionCode+'"></div>'; }
  if(t==="stars"){ var sv=val||0,mx=q.Max||5,s=""; for(var i=1;i<=mx;i++) s+='<i class="ri-star-'+(i<=sv?"fill":"line")+' '+(i<=sv?"on":"")+'" data-svstar="'+i+'" data-svq="'+q.QuestionCode+'"></i>'; return '<div class="sv-stars">'+s+'</div>'; }
  if(t==="yesno"){ return '<div class="sv-yn"><div class="b y '+(val==="Y"?"sel":"")+'" data-svyn="Y" data-svq="'+q.QuestionCode+'"><i class="ri-check-line"></i> \u662F</div><div class="b n '+(val==="N"?"sel":"")+'" data-svyn="N" data-svq="'+q.QuestionCode+'"><i class="ri-close-line"></i> \u5426</div></div>'; }
  if(t==="textarea") return '<textarea data-svtxt="'+q.QuestionCode+'" placeholder="'+esc(q.Placeholder||"")+'">'+esc(val||"")+'</textarea>';
  if(t==="text") return '<input class="t" data-svtxt="'+q.QuestionCode+'" placeholder="'+esc(q.Placeholder||"")+'" value="'+esc(val||"")+'">';
  if(t==="number") return '<input class="nm" type="number" data-svtxt="'+q.QuestionCode+'" placeholder="'+esc(q.Placeholder||"")+'" value="'+(val==null?"":val)+'">';
  if(t==="date") return '<input class="dt" type="date" data-svtxt="'+q.QuestionCode+'" value="'+esc(val||"")+'">';
  if(t==="matrix"){ var head='<tr><th></th>'+(q.Options||[]).map(function(o){return '<th>'+esc(o.OptionText)+'</th>';}).join("")+'</tr>';
    var rows=(q.SubQuestions||[]).map(function(sq){ var cur=(val||{})[sq.Code]; return '<tr><td class="sub">'+esc(sq.Text)+'</td>'+(q.Options||[]).map(function(o){ return '<td><span class="r '+(cur===o.OptionCode?"sel":"")+'" data-svmtx="'+q.QuestionCode+'" data-svsub="'+sq.Code+'" data-svopt="'+o.OptionCode+'"></span></td>'; }).join("")+'</tr>'; }).join("");
    return '<table class="sv-mtx"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table>'; }
  return '<div class="muted">\u672A\u652F\u63F4\u984C\u578B:'+esc(t)+'</div>';
}
function svBind(){
  var host=$("surveyHost"),A=RT.surveyAns;
  host.querySelectorAll(".sv-opt").forEach(function(el){ el.onclick=function(){ var q=el.getAttribute("data-svq"),opt=el.getAttribute("data-svopt"),multi=el.getAttribute("data-svtype")==="multiple"; if(multi){ var a=Array.isArray(A[q])?A[q].slice():[]; var i=a.indexOf(opt); i>=0?a.splice(i,1):a.push(opt); A[q]=a; } else A[q]=opt; svRerender(); }; });
  host.querySelectorAll(".sv-scale .s").forEach(function(el){ el.onclick=function(){ A[el.getAttribute("data-svq")]=el.getAttribute("data-svopt"); svRerender(); }; });
  host.querySelectorAll(".sv-yn .b").forEach(function(el){ el.onclick=function(){ A[el.getAttribute("data-svq")]=el.getAttribute("data-svyn"); svRerender(); }; });
  host.querySelectorAll(".sv-stars i").forEach(function(el){ el.onclick=function(){ A[el.getAttribute("data-svq")]=+el.getAttribute("data-svstar"); svRerender(); }; });
  host.querySelectorAll("input[data-svrange]").forEach(function(el){ el.oninput=function(){ var q=el.getAttribute("data-svrange"); A[q]=+el.value; var n=host.querySelector('input[data-svnum="'+q+'"]'); if(n)n.value=el.value; svRecalc(); }; });
  host.querySelectorAll("input[data-svnum]").forEach(function(el){ el.oninput=function(){ var q=el.getAttribute("data-svnum"); A[q]=el.value===""?null:+el.value; var r=host.querySelector('input[data-svrange="'+q+'"]'); if(r&&el.value!=="")r.value=el.value; svRecalc(); }; });
  host.querySelectorAll("[data-svtxt]").forEach(function(el){ el.oninput=function(){ A[el.getAttribute("data-svtxt")]=el.value; svUpdateProgress(); }; });
  host.querySelectorAll("[data-svother]").forEach(function(el){ el.oninput=function(){ A["_other_"+el.getAttribute("data-svother")]=el.value; }; });
  host.querySelectorAll(".sv-mtx .r").forEach(function(el){ el.onclick=function(){ var q=el.getAttribute("data-svmtx"); A[q]=A[q]||{}; A[q][el.getAttribute("data-svsub")]=el.getAttribute("data-svopt"); svRerender(); }; });
}
function svRequiredMissing(){ var A=RT.surveyAns; return svVisible().filter(function(x){return x.q.IsRequired && !svAnswered(A[x.q.QuestionCode]);}); }
function svSaveDraft(){ var spec=RT.surveySpec; CDE.dispatch("DoSaveDraft",{BankCode:spec.Bank.BankCode,Answers:svCollect()}); toast("info","\u5DF2\u66AB\u5B58","survResponse.DocStatus=0"); }
function svCollect(){ var spec=RT.surveySpec,A=RT.surveyAns,out=[]; spec.Groups.forEach(function(g){g.Questions.forEach(function(q){ var v=A[q.QuestionCode]; if(v==null||v==="")return; out.push({GroupCode:g.GroupCode,QuestionCode:q.QuestionCode,AnswerValue:Array.isArray(v)?v.join(","):(typeof v==="object"?JSON.stringify(v):String(v)),AnswerText:A["_other_"+q.QuestionCode]||null}); });}); return out; }
function svSubmit(){
  var miss=svRequiredMissing();
  document.querySelectorAll(".sv-q").forEach(function(e){e.classList.remove("invalid");});
  if(miss.length){ miss.forEach(function(x){ var el=$("svq_"+x.q.QuestionCode); if(el)el.classList.add("invalid"); }); var f=$("svq_"+miss[0].q.QuestionCode); if(f&&f.scrollIntoView)f.scrollIntoView({behavior:"smooth",block:"center"}); toast("warn","\u5FC5\u586B\u672A\u5B8C\u6210",miss.length+" \u984C\u5FC5\u586B\u672A\u4F5C\u7B54"); return; }
  var spec=RT.surveySpec,total=null,grade=null;
  if(spec.Bank.ScoringMode==="weighted"){ total=svRecalc(); grade=svGradeOf(total); }
  var res=CDE.dispatch("DoSubmit",{BankCode:spec.Bank.BankCode,Answers:svCollect(),TotalScore:total,Grade:grade});
  if(res.ReturnMsg.IsSuccess==="Y") toast("suc","\u5DF2\u9001\u51FA", spec.Bank.ScoringMode==="weighted"?("\u52A0\u6B0A\u7E3D\u5206 "+total.toFixed(1)+" \u00B7 \u7B49\u7D1A "+grade):("ResponseNo "+res.ReturnData.ResponseNo));
  else toast("err","\u9001\u51FA\u5931\u6557",res.ReturnMsg.Message);
}
function renderSurvey(cfg){
  injectSurveyCSS();
  RT.surveyCfg=cfg; RT.surveySpec=cfg.SurveySpec; RT.surveyAns=RT.surveyAns||{};
  var spec=RT.surveySpec, b=spec.Bank, A=RT.surveyAns;
  var vg=$("view-grid");
  Array.prototype.forEach.call(vg.children,function(c){ if(c.classList&&c.classList.contains("card")) c.style.display="none"; });
  var host=$("surveyHost"); if(!host){ host=document.createElement("div"); host.id="surveyHost"; vg.appendChild(host); }
  host.style.display="";
  var seq=0,gi=0,html="";
  (spec.Groups||[]).forEach(function(g){ gi++; var qh="";
    (g.Questions||[]).forEach(function(q){ seq++;
      qh+='<div class="sv-q" id="svq_'+q.QuestionCode+'"><div class="sv-qt"><span class="seq">'+seq+'.</span>'+esc(q.QuestionText)+(q.IsRequired?'<span class="rq">*</span>':'')+'</div>'+(q.HelpText?'<div class="sv-help">'+esc(q.HelpText)+'</div>':'')+svInput(q,A[q.QuestionCode])+(q.Condition?'<div class="sv-cond"><i class="ri-git-branch-line"></i> \u689D\u4EF6\u984C\uFF1A\u7576\u300C'+esc(q.Condition.QuestionCode)+'='+esc(q.Condition.Equals)+'\u300D\u6642\u986F\u793A</div>':'')+'</div>';
    });
    html+='<div class="sv-grp"><div class="sv-ghd"><div style="display:flex;align-items:center"><span class="gi">'+gi+'</span><div><div class="gn">'+esc(g.GroupName)+'</div>'+(g.GroupDesc?'<div class="gd">'+esc(g.GroupDesc)+'</div>':'')+'</div></div>'+(g.GroupWeight?'<div class="gw">\u7FA4\u7D44\u6B0A\u91CD <b>'+g.GroupWeight+'%</b></div>':'')+'</div>'+qh+'</div>';
  });
  var scoring=b.ScoringMode==="weighted";
  host.innerHTML='<div class="sv-hd"><div class="bar"><h2><i class="ri-survey-line"></i> '+esc(b.BankName)+' <span class="tag '+esc(b.BankType)+'">'+esc(b.BankType)+'</span></h2><div class="meta">'+(b.Respondent?'<span><i class="ri-user-line"></i> '+esc(b.Respondent)+'</span>':'')+(b.Period?'<span><i class="ri-calendar-line"></i> '+esc(b.Period)+'</span>':'')+'<span><i class="ri-price-tag-3-line"></i> '+esc(b.BankCode)+' \u00B7 v'+esc(b.Version||"1.0")+'</span>'+(b.Anonymous?'<span><i class="ri-spy-line"></i> \u533F\u540D</span>':'')+'</div></div>'+(b.Intro?'<div class="intro">'+esc(b.Intro)+'</div>':'')+'<div class="sv-prog"><i id="svProg" style="width:0%"></i></div></div><div id="svForm">'+html+'</div><div class="sv-foot"><div class="calc"><div><div class="k">\u4F5C\u7B54\u9032\u5EA6</div><div class="v"><span id="svProgTxt">0/0</span></div></div>'+(scoring?'<div><div class="k">\u52A0\u6B0A\u7E3D\u5206</div><div class="v"><span id="svTotal">\u2014</span></div></div><div><div class="k">\u7B49\u7D1A</div><div class="v"><span id="svGrade">\u2014</span></div></div>':'')+'</div><div class="acts"><button class="btn btn-def" data-act="surveyDraft"><i class="ri-save-line"></i>\u66AB\u5B58</button><button class="btn btn-pri" data-act="surveySubmit"><i class="ri-send-plane-line"></i>\u9001\u51FA</button></div></div>';
  svBind(); svApplyConditions(); svRecalc();
}
function restoreGridCards(){ var vg=$("view-grid"); if(!vg) return; var sh=$("surveyHost"); if(sh) sh.style.display="none"; Array.prototype.forEach.call(vg.children,function(c){ if(c.classList&&c.classList.contains("card")) c.style.display=""; }); }

function validateConfig(cfg: any): string | null {
  if(!cfg || typeof cfg!=="object") return "配置不是有效的 JSON 物件";
  if(!cfg.PageMeta) return "缺少 PageMeta 區段";
  const __ft = cfg.PageMeta?.FormType;
  if(__ft==="SurveyForm" || __ft==="SurveyBank"){
    if(!cfg.SurveySpec?.Bank) return "缺少 SurveySpec.Bank";
    if(!Array.isArray(cfg.SurveySpec?.Groups)) return "缺少 SurveySpec.Groups";
  } else {
    if(!cfg.View?.ListView?.FieldSpecs) return "缺少 View.ListView.FieldSpecs";
  }
  if(!cfg.Resources?.CodeSets) return "缺少 Resources.CodeSets";
  return null; // 通過
}

/* —— 套用一份配置並整頁重渲染 —— */
function applyConfig(cfg: DoInitContract, source: string, label?: string){
  const err = validateConfig(cfg);
  if(err){ toast("err","配置不符合 CDE 結構", err); return false; }
  DoInit = cfg;                 // 取代當前配置
  __configSource = source;      // embedded | external | upload
  initDerived();                // 重算 CODE / pageSize / visibleCols / sort
  bootstrap();                  // 依新配置重渲染:頁首、工具列、查詢、表頭、Meta…再 doQuery(1)
  setConfigSource(source, label);
  return true;
}

/* —— 配置來源指示 —— */
function setConfigSource(source: string, label?: string){
  const url = configUrlFor(CURRENT_FUNC);
  const el = $("cfgSrc");
  const mini = $("cfgSrcMini");
  let cls = "cfg-src fallback", html = "";
  if(source==="external"){
    cls="cfg-src live";
    html=`<i class="ri-link"></i>配置來源：${esc(label||url)} (動態讀取)`;
  } else if(source==="upload"){
    cls="cfg-src upload";
    html=`<i class="ri-file-upload-line"></i>配置來源：已上傳 ${esc(label||"JSON")}`;
  } else if(source==="loading"){
    cls="cfg-src fallback";
    html=`<i class="ri-loader-4-line"></i>配置來源：讀取中…`;
  } else {
    cls="cfg-src fallback";
    html=`<i class="ri-error-warning-line"></i>尚未載入配置${label?`（${esc(label)}）`:""}`;
  }
  if(el){ el.className=cls; el.innerHTML=html; }
  if(mini){ mini.className=cls; mini.innerHTML=html; }   // 收合列同步顯示來源
  const dot=$("devFabSrcDot"); if(dot){ dot.className="devfab-srcdot "+(source==="external"?"live":source==="upload"?"upload":source==="loading"?"loading":"fallback"); }
}

/* —— 嘗試讀取外部配置檔 (HTTP 環境可用;file:// 因瀏覽器限制通常會失敗) —— */
async function tryLoadExternal(silent, funcCode = CURRENT_FUNC, folder?: string){
  CURRENT_FUNC = funcCode;                         // 記住目前功能,供重新讀取 / 來源指示
  CURRENT_FOLDER = folder != null ? folder : folderForFunc(funcCode);   // 記住所屬資料夾
  const url = configUrlFor(funcCode, CURRENT_FOLDER);
  try{
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const txt = await res.text();
    const cfg = JSON.parse(txt);
    const ok = applyConfig(cfg, "external", url);
    return ok;
  }catch(e){
    if(!silent) toast("warn","無法讀取外部配置",`${url}:${e.message}。可改用「載入 JSON 配置」上傳或拖放。`);
    return false;
  }
}
function reloadExternalConfig(){ tryLoadExternal(false, CURRENT_FUNC, CURRENT_FOLDER); }

/* —— 使用者選檔 / 拖放讀取任一份 JSON —— */
function loadConfigFromFile(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    let cfg;
    try{ cfg = JSON.parse(String((ev.target as any).result)); }
    catch(e){ toast("err","JSON 解析失敗", e.message); return; }
    const ok = applyConfig(cfg, "upload", file.name);
    void ok;
  };
  reader.onerror = ()=> toast("err","讀檔失敗", file.name);
  reader.readAsText(file, "utf-8");
}
function onConfigFilePicked(inp){ loadConfigFromFile(inp.files[0]); inp.value=""; }

/* —— 橫幅拖放 JSON(改綁定至配置 popup modal) —— */
function bindDropZone(){
  const bz = $("cfgModalMask") || $("cfgBanner"); if(!bz) return;
  ["dragenter","dragover"].forEach(t=>bz.addEventListener(t,e=>{e.preventDefault();bz.classList.add("drag");}));
  ["dragleave","drop"].forEach(t=>bz.addEventListener(t,e=>{e.preventDefault();bz.classList.remove("drag");}));
  bz.addEventListener("drop",e=>{ const f=(e as DragEvent).dataTransfer?.files?.[0]; if(f) loadConfigFromFile(f); });
}

/* —— 尚無配置時的提示 (讀檔失敗 / file:// 限制) —— */
function showNoConfigPrompt(){
  const url = configUrlFor(CURRENT_FUNC);
  setConfigSource("none","外部檔不可讀");
  const gb = $("gridBody");
  if(gb) gb.innerHTML = `<tr><td colspan="20"><div class="empty">
    <i class="ri-folder-open-line"></i>
    <p style="font-weight:600">尚未載入配置 ${esc(url)}</p>
    <p style="font-size:12px;color:var(--muted);max-width:540px;margin:6px auto 0;line-height:1.7">
      多檔架構需透過 HTTP 伺服器開啟 (例如 VS Code Live Server / IIS),瀏覽器才能讀取同目錄的 JSON。
      若以 file:// 直接開啟,請改用上方「載入 JSON 配置」按鈕,或將 JSON 檔拖放到上方橫幅。
    </p></div></td></tr>`;
}

/* ═══ 左側選單 (讀取 menu.txt 動態產生) ═══ */
async function loadMenu(){
  try{ const r=await fetch(MENU_URL,{cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); MENU=JSON.parse(await r.text()); }
  catch(e){ MENU=null; }
  renderMenu();
}
function renderBrand(){
  const b=(MENU&&MENU.Brand)||{};
  const mark=$("sbLogoMark"), name=$("sbLogoName"), sub=$("sbLogoSub");
  if(mark&&b.Mark) mark.textContent=b.Mark;
  if(name&&b.Name){ name.textContent=b.Name; BRAND_NAME=b.Name; }
  if(sub &&b.Sub ) sub.textContent =b.Sub;
  if(b.Name) document.title=b.Name;
}
function renderMenu(){
  renderBrand();
  const nav=$("sidebarNav"); if(!nav) return;
  if(!MENU||!Array.isArray(MENU.Groups)){
    nav.innerHTML=`<div class="muted" style="padding:14px 18px;font-size:11px;line-height:1.7">選單未載入<br>(menu.txt 需經 HTTP 伺服器讀取)</div>`;
    return;
  }
  // 目前功能(啟動時尚無 DoInit,改用預設功能);用來決定預設展開哪一組
  const curFc=(typeof DoInit==="object"&&DoInit&&DoInit.FuncCode)?DoInit.FuncCode:DEFAULT_FUNC;
  nav.innerHTML = MENU.Groups.map((g,gi)=>{
    const items=g.Items||[];
    const cnt=items.length;
    const isOpen=items.some((it:any)=>it.FuncCode===curFc);   // 含目前功能的模組預設展開,其餘收合
    return `
    <div class="nb-group${isOpen?"":" collapsed"}" data-grp="${gi}">
      <div class="nb-hdr" data-act="toggleNavGroup" data-arg="${gi}">
        <i class="nb-hdr-ic ${esc(g.Icon||"ri-folder-line")}"></i>
        <span class="nb-hdr-t">${esc(g.Header||"")}</span>
        <span class="nb-hdr-cnt">${cnt}</span>
        <i class="nb-hdr-caret ri-arrow-down-s-line"></i>
      </div>
      <div class="nb-items">
        ${items.map((it:any)=>`<div class="nb-item" data-func="${esc(it.FuncCode||"")}" data-folder="${esc(it.Folder || g.Folder || menuDefaultFolder())}" data-act="selectMenu"><i class="nb-icon ${esc(it.Icon||"ri-circle-line")}"></i><span>${esc(it.Label||"")}</span></div>`).join("")}
      </div>
    </div>`;
  }).join("");
  highlightMenu();
}
function highlightMenu(){
  const fc=(typeof DoInit==="object"&&DoInit)?DoInit.FuncCode:null; if(!fc) return;
  document.querySelectorAll("#sidebarNav .nb-item").forEach((el:any)=>{
    const on=el.dataset.func===fc;
    el.classList.toggle("active", on);
    if(on){ const grp=el.closest(".nb-group"); if(grp) grp.classList.remove("collapsed"); } // 切換功能時自動展開所屬模組
  });
}
/* —— 模組分組展開 / 收合(可縮放式選單) —— */
function toggleNavGroup(idx){
  const grp=document.querySelector(`#sidebarNav .nb-group[data-grp="${idx}"]`);
  if(grp) grp.classList.toggle("collapsed");
}
function selectMenu(el){
  const fc = el?.dataset?.func;
  if(!fc) return;
  const folder = el?.dataset?.folder ?? folderForFunc(fc);
  document.querySelectorAll("#sidebarNav .nb-item").forEach(x=>x.classList.remove("active"));
  el.classList.add("active");
  loadFuncConfig(fc, folder);             // 依該選單 FuncCode + Folder 載入 <Folder>/<FuncCode>.txt
}

/* —— 依 FuncCode 載入對應配置檔(選單點選 / 切換功能) —— */
async function loadFuncConfig(fc: string, folder: string = folderForFunc(fc)){
  setConfigSource("loading");
  const ok = await tryLoadExternal(false, fc, folder);
  if(!ok) showNoConfigPrompt();           // 該功能配置檔不存在 / 不可讀時顯示提示
}

/* —— 開發者工具 FAB:浮動鈕 → 選單 → popup modal —— */
function toggleDevFab(){
  const f=$("devFab"); if(!f) return;
  f.classList.toggle("open");
}
function closeDevFab(){ $("devFab")?.classList.remove("open"); }
function openCfgModal(){
  closeDevFab();
  $("cfgModalMask")?.classList.add("open");
}
/* 舊橫幅切換保留為相容用(元素已移除時為無作用) */
function toggleCfgBanner(){
  $("cfgBanner")?.classList.toggle("collapsed");
}

/* startup 已移至檔末 init() — 見事件委派層 */


/* ════════════════════════════════════════════════════════════════════
   事件委派層 — HTML 以 data-act / data-change 宣告,於此集中分派
   (取代原本散落於 HTML/生成字串的 inline onclick/onchange)
   ════════════════════════════════════════════════════════════════════ */
type Handler = (arg?: string, el?: HTMLElement, ev?: Event) => void;

const ACTIONS: Record<string, Handler> = {
  // 無參數
  query:           () => doQuery(1),
  resetSearch,
  toggleSearch,
  toggleLog,
  clearLog,
  copyConfig,
  toggleColPicker,
  toggleCfgBanner,
  toggleDevFab,
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
  pickImport:    () => simulateFilePick(),
  reloadConfig:  () => reloadExternalConfig(),
  surveyDraft:   () => svSaveDraft(),
  surveySubmit:  () => svSubmit(),
  exportPdf:     () => exportReportPdf(),
  pickConfig:    () => ($('cfgFileInput') as HTMLInputElement | null)?.click(),
  printInfo:     () => toast('info', '列印中', '已送至瀏覽器列印對話框'),
  // 字串參數
  goPage:        (a) => doQuery(+(a || 1) || 1),
  toggleSec:     (a) => toggleSec(a!),
  sortBy:        (a) => sortBy(a!),
  openEdit:      (a) => openEdit(a!),
  closeModal:    (a) => closeModal(a!),
  openRowMenu:   (a, el, ev) => openRowMenu(ev!, a!, el!),
  rowView:       (a) => { closeRowMenu(); openView(a!); },
  rowEdit:       (a) => { closeRowMenu(); openEdit(a!); },
  rowDel:        (a) => { closeRowMenu(); deleteOne(a!); },
  selectMenu:    (_a, el) => selectMenu(el!),
  toggleNavGroup:(a) => toggleNavGroup(a!),
  goGrid:        () => switchView("grid"),
  goReport:      () => switchView("report"),
  goMeta:        () => switchView("meta"),
  // Master-Detail 明細操作
  detailTab:     (a) => detailTab(a!),
  detailAdd:     (a) => detailAdd(a!),
  detailEdit:    (a) => detailEditRow(a!),
  detailDel:     (a) => detailDelRow(a!),
  detailCancel:  (a) => detailCancelRow(a!),
  detailSaveRow: (a) => detailSaveRow(a!),
};

const CHANGES: Record<string, Handler> = {
  fieldChange:    (a) => onFieldChange(a!),
  dispatchReport: () => dispatchReport(),
  toggleSel:      (a, el) => toggleSel(a!, el as HTMLInputElement),
  toggleAll:      (_a, el) => toggleAll(el as HTMLInputElement),
  configFile:     (_a, el) => loadConfigFromFile((el as HTMLInputElement).files?.[0]),
};

function bindDelegation() {
  document.addEventListener('click', (ev) => {
    // 開發者工具 FAB:點選單項目或點外部時收合(toggle 鈕本身除外)
    const fab = $("devFab");
    if (fab && fab.classList.contains("open")) {
      const onToggle = (ev.target as any)?.closest?.('[data-act="toggleDevFab"]');
      if (!onToggle) closeDevFab();
    }
    const t = (ev.target as any)?.closest?.('[data-act]') as HTMLElement | null;
    if (!t) return;
    const fn = ACTIONS[t.dataset.act!];
    if (fn) { ev.preventDefault(); fn(t.dataset.arg, t, ev); }
  });
  document.addEventListener('change', (ev) => {
    const t = (ev.target as any)?.closest?.('[data-change]') as HTMLElement | null;
    if (!t) return;
    const fn = CHANGES[t.dataset.change!];
    if (fn) fn(t.dataset.arg, t, ev);
  });
}

/* ═══ 啟動 ═══ */
async function init() {
  bindDelegation();
  await loadMenu();           // 先讀取 menu.txt(含資料夾對應),再據以解析預設功能所屬資料夾
  bindDropZone();
  setConfigSource('loading');
  CURRENT_FOLDER = folderForFunc(DEFAULT_FUNC);              // 預設功能資料夾(如 hrm)
  const ok = await tryLoadExternal(true, DEFAULT_FUNC, CURRENT_FOLDER);   // 啟動載入 <folder>/hrmCompany.txt
  if (!ok) showNoConfigPrompt();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
