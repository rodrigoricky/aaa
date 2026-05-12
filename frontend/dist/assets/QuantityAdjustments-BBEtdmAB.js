import{J as e,r as i,T as ot,Q as lt}from"./vendor-Bj3SGaWR.js";import{B as p}from"./Button-BXzV3f8g.js";import{S as ct,I as dt}from"./Input-H4oNdnbP.js";import{M as F}from"./Modal-B4hgWgnp.js";import{N as mt}from"./Notification-BERJFdXS.js";import{u as ut,g as P,b as pt}from"./index-BjlPnbHo.js";import{g as ht}from"./inventory.service-BTXDHEcn.js";import{g as ft,a as xt,u as jt,c as yt,p as gt,r as wt,b as Nt}from"./quantity-adjustments.service-DdcokBDH.js";const de=`
  @page {
    size: 8.5in 5.5in;
    margin: 0.2in 0.24in;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
  }

  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    font-size: 10px;
    line-height: 1.12;
    letter-spacing: 0;
    -webkit-font-smoothing: none;
    text-rendering: geometricPrecision;
  }

  .qa-print-sheet,
  .qa-print-sheet * {
    box-sizing: border-box;
  }

  .qa-print-sheet {
    width: 100%;
    min-height: 5.1in;
    margin: 0;
    color: #000;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    line-height: 1.12;
    letter-spacing: 0;
    display: flex;
    flex-direction: column;
  }

  .qa-print-header {
    display: grid;
    grid-template-columns: 1fr 2.25in;
    align-items: start;
  }

  .qa-print-store,
  .qa-print-title {
    margin: 0;
  }

  .qa-print-store {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.05;
  }

  .qa-print-title {
    margin-top: 1px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.05;
  }

  .qa-print-date-block {
    justify-self: end;
    min-width: 2.2in;
    margin-top: 13px;
    font-size: 10.5px;
    line-height: 1.25;
  }

  .qa-print-date-line {
    display: flex;
    gap: 5px;
    white-space: nowrap;
  }

  .qa-print-date-label {
    min-width: 0.78in;
  }

  .qa-print-number-row {
    margin-top: 4px;
    margin-bottom: 12px;
    font-size: 11px;
    line-height: 1.1;
    white-space: nowrap;
  }

  .qa-print-number-value {
    display: inline-block;
    min-width: 1.35in;
    padding: 0 3px 1px;
    border-bottom: 1px solid #000;
  }

  .qa-print-label {
    font-weight: 700;
  }

  .qa-print-number-red {
    color: #c00000;
    font-weight: 700;
  }

  .qa-print-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin: 0;
    flex: none;
  }

  .qa-print-table,
  .qa-print-table th,
  .qa-print-table td {
    border: 1px solid #000;
  }

  .qa-print-table th {
    height: 17px;
    padding: 1px 3px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.05;
    background: #fff;
    text-align: left;
    vertical-align: middle;
  }

  .qa-print-table td {
    padding: 1px 3px;
    font-size: 10px;
    line-height: 1.05;
    vertical-align: middle;
  }

  .qa-print-table .ta-center {
    text-align: center;
  }

  .qa-print-table .ta-right {
    text-align: right;
  }

  .qa-print-line-number {
    text-align: center;
    vertical-align: middle;
  }

  .qa-print-qty {
    text-align: center;
    vertical-align: middle;
  }

  .qa-print-item-row td {
    height: 17px;
  }

  .qa-print-reason-row td {
    height: 13px;
    padding: 0 3px;
    font-size: 9px;
    line-height: 1.05;
  }

  .qa-print-reason-label {
    text-align: right;
    font-style: normal;
    white-space: nowrap;
  }

  .qa-print-reason-text {
    font-style: italic;
    overflow-wrap: anywhere;
  }

  .qa-print-footer {
    margin-top: 11px;
    padding-top: 0;
    font-size: 10.5px;
    font-weight: 400;
    line-height: 1.2;
  }

  .qa-print-footer-line {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 0.35in;
    min-height: 18px;
    align-items: end;
  }

  .qa-print-footer-line + .qa-print-footer-line {
    margin-top: 4px;
  }

  .qa-print-footer-field {
    white-space: nowrap;
  }

  .qa-print-footer-right {
    justify-self: start;
  }

  .qa-print-preview-shell {
    display: flex;
    justify-content: center;
    padding: 12px;
    background: #fff;
    overflow: auto;
  }

  .qa-print-preview-sheet {
    width: 8.5in;
    min-height: 5.5in;
    padding: 0.2in 0.24in;
    background: #fff;
    box-shadow: 0 0 0 1px #000;
  }

  @media print {
    .qa-print-preview-shell {
      display: block;
      padding: 0;
      background: #fff;
      overflow: visible;
    }

    .qa-print-preview-sheet {
      width: auto;
      min-height: 0;
      padding: 0;
      box-shadow: none;
    }
  }
`;function Qe(n){if(!n)return"-";const s=new Date(n);return Number.isNaN(s.getTime())?"-":s.toLocaleDateString("en-US",{year:"numeric",month:"numeric",day:"numeric"})}function Te(n){return typeof n!="number"||!Number.isFinite(n)?"":Number.isInteger(n)?String(n):n.toFixed(2).replace(/\.?0+$/,"")}function bt(n){const s=Te(n);return!s||s==="0"?s:typeof n=="number"&&n>0?`+${s}`:s}function N(n,s="-"){const l=n?.trim();return l||s}function vt(n){const s=N(n.refType,"").toUpperCase();return s==="DM"||s==="CM"?s:"QA"}function _t(n,s){const l=s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");return n.replace(new RegExp(`^${l}\\s*[-:]?\\s*`,"i"),"").trim()}function St(n){const s=n.match(/^(.*?)(\d+)(\D*)$/);return s?{before:s[1],number:s[2],after:s[3]}:{before:n,number:"",after:""}}function Ct(n){const s=vt(n),l=N(s==="QA"?n.qaNo:n.refNo,""),d=s==="QA"?l:`${s} ${_t(l,s)||l}`,h=St(d);return{label:`${s} No.:`,...h}}function qt({documentData:n,preview:s=!1}){const l=Ct(n),d=N(n.createdBy,""),h=N(n.updatedBy,""),f=N(n.postedBy,""),D=e.jsxs("div",{className:"qa-print-sheet",children:[e.jsxs("div",{className:"qa-print-header",children:[e.jsxs("div",{children:[e.jsx("p",{className:"qa-print-store",children:"G&P Convenience Store"}),e.jsx("p",{className:"qa-print-title",children:"QUANTITY ADJUSTMENTS"})]}),e.jsxs("div",{className:"qa-print-date-block",children:[e.jsxs("div",{className:"qa-print-date-line",children:[e.jsx("span",{className:"qa-print-label qa-print-date-label",children:"Create Date:"}),e.jsx("span",{children:Qe(n.createdAt??n.transDate)})]}),e.jsxs("div",{className:"qa-print-date-line",children:[e.jsx("span",{className:"qa-print-label qa-print-date-label",children:"Posted Date:"}),e.jsx("span",{children:Qe(n.postedAt)})]})]})]}),e.jsxs("div",{className:"qa-print-number-row",children:[e.jsx("span",{className:"qa-print-label",children:l.label})," ",e.jsxs("span",{className:"qa-print-number-value",children:[l.before,l.number?e.jsx("span",{className:"qa-print-number-red",children:l.number}):null,l.after]})]}),e.jsxs("table",{className:"qa-print-table",children:[e.jsxs("colgroup",{children:[e.jsx("col",{style:{width:"5%"}}),e.jsx("col",{style:{width:"25%"}}),e.jsx("col",{style:{width:"47%"}}),e.jsx("col",{style:{width:"11.5%"}}),e.jsx("col",{style:{width:"11.5%"}})]}),e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{className:"ta-center",children:"#"}),e.jsx("th",{children:"Barcode"}),e.jsx("th",{children:"Item Description"}),e.jsx("th",{className:"ta-center",children:"Adjust Qty"}),e.jsx("th",{className:"ta-center",children:"Final Qty"})]})}),e.jsx("tbody",{children:n.lines.slice(0,8).map((j,J)=>e.jsxs(i.Fragment,{children:[e.jsxs("tr",{className:"qa-print-item-row",children:[e.jsx("td",{className:"qa-print-line-number",rowSpan:2,children:J+1}),e.jsx("td",{children:N(j.itemcode,"")}),e.jsx("td",{children:N(j.itemname,"")}),e.jsx("td",{className:"qa-print-qty",children:bt(j.adjustQty)}),e.jsx("td",{className:"qa-print-qty",children:Te(j.newQty)})]}),e.jsxs("tr",{className:"qa-print-reason-row",children:[e.jsx("td",{className:"qa-print-reason-label",children:"Reason:"}),e.jsx("td",{className:"qa-print-reason-text",colSpan:3,children:N(j.itemRemark,"-")})]})]},j.id))})]}),e.jsxs("div",{className:"qa-print-footer",children:[e.jsxs("div",{className:"qa-print-footer-line",children:[e.jsxs("div",{className:"qa-print-footer-field",children:[e.jsx("span",{className:"qa-print-label",children:"Encoded by:"})," ",d]}),e.jsx("div",{})]}),e.jsxs("div",{className:"qa-print-footer-line",children:[e.jsxs("div",{className:"qa-print-footer-field",children:[e.jsx("span",{className:"qa-print-label",children:"Checked by:"})," ",h]}),e.jsxs("div",{className:"qa-print-footer-field qa-print-footer-right",children:[e.jsx("span",{className:"qa-print-label",children:"Posted by:"})," ",f]})]})]})]});return s?e.jsxs(e.Fragment,{children:[e.jsx("style",{children:de}),e.jsx("div",{className:"qa-print-preview-shell",children:e.jsx("div",{className:"qa-print-preview-sheet",children:D})})]}):e.jsxs(e.Fragment,{children:[e.jsx("style",{children:de}),D]})}const Pt="_page_1ta0w_1",Et="_screenHeader_1ta0w_7",At="_screenTitle_1ta0w_14",Qt="_screenDash_1ta0w_23",Dt="_statusOpen_1ta0w_27",kt="_statusSaved_1ta0w_28",Rt="_statusPosted_1ta0w_29",Tt="_statusPendingCancellation_1ta0w_30",Lt="_statusCancelled_1ta0w_31",Bt="_card_1ta0w_55",Ft="_docGrid_1ta0w_63",It="_docField_1ta0w_71",Mt="_docLabel_1ta0w_77",$t="_docValue_1ta0w_85",Ot="_errorBanner_1ta0w_91",Vt="_cancellationPanel_1ta0w_101",zt="_searchStrip_1ta0w_121",Ut="_searchState_1ta0w_132",Gt="_searchResults_1ta0w_138",Ht="_gridWrapper_1ta0w_142",Yt="_table_1ta0w_148",Wt="_empty_1ta0w_182",Jt="_emptyInline_1ta0w_189",Xt="_resultRow_1ta0w_196",Kt="_mono_1ta0w_200",Zt="_itemName_1ta0w_206",en="_cellInput_1ta0w_212",tn="_cellInputError_1ta0w_230",nn="_cellError_1ta0w_234",an="_removeBtn_1ta0w_240",sn="_footerBar_1ta0w_257",rn="_summaryBlock_1ta0w_267",on="_actionButtons_1ta0w_276",ln="_confirmText_1ta0w_283",cn="_staleStockPanel_1ta0w_289",dn="_staleStockTable_1ta0w_295",mn="_cancelReasonField_1ta0w_323",un="_cancelReasonError_1ta0w_352",pn="_maxLines_1ta0w_358",hn="_modeSelect_1ta0w_363",fn="_modeBadge_1ta0w_381",xn="_previewPos_1ta0w_391",jn="_previewNeg_1ta0w_396",yn="_previewEmpty_1ta0w_401",gn="_printPreviewBody_1ta0w_405",wn="_printPreviewState_1ta0w_411",Nn="_printMarkupFrame_1ta0w_422",a={page:Pt,screenHeader:Et,screenTitle:At,screenDash:Qt,statusOpen:Dt,statusSaved:kt,statusPosted:Rt,statusPendingCancellation:Tt,statusCancelled:Lt,card:Bt,docGrid:Ft,docField:It,docLabel:Mt,docValue:$t,errorBanner:Ot,cancellationPanel:Vt,searchStrip:zt,searchState:Ut,searchResults:Gt,gridWrapper:Ht,table:Yt,empty:Wt,emptyInline:Jt,resultRow:Xt,mono:Kt,itemName:Zt,cellInput:en,cellInputError:tn,cellError:nn,removeBtn:an,footerBar:sn,summaryBlock:rn,actionButtons:on,confirmText:ln,staleStockPanel:cn,staleStockTable:dn,cancelReasonField:mn,cancelReasonError:un,maxLines:pn,modeSelect:hn,modeBadge:fn,previewPos:xn,previewNeg:jn,previewEmpty:yn,printPreviewBody:gn,printPreviewState:wn,printMarkupFrame:Nn},Q=8,me="Maximum of 8 items per Quantity Adjustment.",De=999999999;function Le(){return typeof crypto<"u"&&"randomUUID"in crypto?crypto.randomUUID():`row-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}function ke(n){return new Date(n).toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"})}function bn(n){return n==="PENDING_CANCELLATION"?"Pending Cancellation":n==="CANCELLED"?"Cancelled Entry":n==="OPEN"?"OPEN":n}function vn(n){return n==="POSTED"?a.statusPosted:n==="SAVED"?a.statusSaved:n==="PENDING_CANCELLATION"?a.statusPendingCancellation:n==="CANCELLED"?a.statusCancelled:a.statusOpen}function W(n){return n?n.lines.map(s=>({rowId:Le(),itemcode:s.itemcode,itemname:s.itemname,oldQty:s.oldQty,entryMode:s.entryMode??"DELTA",inputValue:s.entryMode==="SET"?String(s.requestedQty):(s.adjustQty>=0,String(s.adjustQty)),itemComment:s.itemRemark??""})):[]}function Re(n){const s=n.inputValue.trim();if(!s)return{adjustQty:null,newQty:null};if(n.entryMode==="DELTA"){const l=Number(s);return Number.isFinite(l)?{adjustQty:l,newQty:n.oldQty+l}:{adjustQty:null,newQty:null}}else{const l=Number(s);return!Number.isFinite(l)||l<0?{adjustQty:null,newQty:null}:{adjustQty:l-n.oldQty,newQty:l}}}function _n(n){const s={byRow:{}};return n.length===0&&(s.lines="Add at least one item."),n.length>Q&&(s.lines=me),n.forEach(l=>{const d={},h=l.inputValue.trim();if(!h)d.adjustQty="Required";else if(l.entryMode==="DELTA"){const f=Number(h);Number.isFinite(f)?Math.abs(f)>De&&(d.adjustQty="Too large"):d.adjustQty="Enter a number (e.g. +5 or -4)"}else{const f=Number(h);Number.isFinite(f)?f<0?d.adjustQty="Cannot be negative":f>De&&(d.adjustQty="Too large"):d.adjustQty="Enter a valid quantity (e.g. 10)"}l.itemComment.length>500&&(d.itemComment="Max 500"),(d.adjustQty||d.itemComment)&&(s.byRow[l.rowId]=d)}),s}function Sn(n){return!!(n.lines||Object.keys(n.byRow).length>0)}function Cn(n){const s=n?.response?.status,l=pt(n);return s!==409||!l?.items?.length?null:{message:P(n,"Stock changed after this adjustment was saved. Please reload and review before posting."),items:l.items}}function Tn(){const{hasPermission:n,hasRole:s}=ut(),[l,d]=ot(),h=n("adjustmentPageAccess"),f=n("adjustmentSave"),D=n("adjustmentEdit"),j=n("adjustmentPost"),J=n("adjustmentPrint"),[X,Be]=i.useState(null),[o,E]=i.useState(null),[K,I]=i.useState("DM"),[x,b]=i.useState([]),[Z,A]=i.useState({byRow:{}}),[ue,y]=i.useState(""),[k,M]=i.useState(!1),[pe,he]=i.useState(!1),[R,fe]=i.useState(null),[Fe,T]=i.useState(!1),[ee,g]=i.useState(null),[Ie,L]=i.useState(!1),[$,O]=i.useState(""),[xe,v]=i.useState(""),[B,je]=i.useState(!1),[Me,V]=i.useState(!1),[$e,_]=i.useState(!1),[z,U]=i.useState(""),[G,S]=i.useState([]),[Oe,ye]=i.useState(!1),[Ve,te]=i.useState(!1),[ge,H]=i.useState(""),[C,we]=i.useState(null),[ze,Ne]=i.useState(!1),be=i.useRef(null),ne=i.useRef(null),[ae,w]=i.useState(null),q=l.get("open"),ve=!!o?.id,se=o?.status==="SAVED",Ue=o?.status==="POSTED",re=o?.status==="PENDING_CANCELLATION",_e=!!o?.id&&se&&s("Admin","Supervisor","Encoder"),Ge=!!o?.id&&re&&j&&s("Admin","Supervisor"),He=!!o?.id&&se&&j,Se=!!o?.id&&Ue&&J,m=ve?!!(se&&D):f,Ce=o?.status??"OPEN",Ye=bn(Ce),We=o?.qaNo||X?.nextQaNo||"Auto",Je=o?.transDate||X?.serverDate||new Date().toISOString(),qe=o?.refType||K,Xe=o?.refNo||X?.nextRefNumbers[K]||"Auto",ie=i.useCallback(()=>{const t=be.current;!m||!t||t.disabled||document.querySelector('[role="dialog"]')||t.focus()},[m]),Pe=i.useMemo(()=>x.reduce((t,r)=>{const u=Re(r);return t+(u.adjustQty??0)},0),[x]),Y=i.useCallback(async()=>{const t=await ft();Be(t)},[]),oe=i.useCallback(async t=>{fe(t),y("");try{const r=await xt(t);E(r),I(r.refType),b(W(r)),A({byRow:{}}),_(!1),U(""),S([]),g(null)}catch{w({message:"Failed to load adjustment",type:"error"})}finally{fe(null)}},[]);if(i.useEffect(()=>{h&&Y().catch(()=>{})},[h,Y]),i.useEffect(()=>{!h||!q||o?.id===q||R===q||oe(q).catch(()=>{})},[h,o?.id,oe,R,q]),i.useEffect(()=>{if(!m){S([]);return}const t=z.trim();if(t.length<1){S([]);return}const r=window.setTimeout(()=>{ye(!0),ht({page:1,limit:8,search:t}).then(u=>S(u.data)).catch(()=>{S([])}).finally(()=>{ye(!1)})},150);return()=>window.clearTimeout(r)},[m,z]),i.useEffect(()=>{if(!m)return;const t=window.requestAnimationFrame(()=>{ie()});return()=>window.cancelAnimationFrame(t)},[ie,m,R]),!h)return e.jsx(lt,{to:"/dashboard",replace:!0});const Ke=()=>{$e?V(!0):Ee()},Ee=()=>{E(null),I("DM"),b([]),A({byRow:{}}),y(""),U(""),S([]),L(!1),g(null),O(""),v(""),d({},{replace:!0}),_(!1),Y().catch(()=>{})},Ae=t=>{if(x.length>=Q){w({message:me,type:"info"});return}if(x.some(r=>r.itemcode===t.itemcode)){w({message:`${t.itemcode} already added`,type:"info"});return}b(r=>[...r,{rowId:Le(),itemcode:t.itemcode,itemname:t.name,oldQty:t.quantity,entryMode:"DELTA",inputValue:"",itemComment:""}]),_(!0),A(r=>({...r,lines:void 0})),U(""),S([]),window.requestAnimationFrame(()=>{ie()})},le=(t,r,u)=>{b(c=>c.map(ce=>ce.rowId===t?{...ce,[r]:u}:ce)),_(!0),r!=="entryMode"&&A(c=>c.byRow[t]?{...c,byRow:{...c.byRow,[t]:{...c.byRow[t],adjustQty:void 0,itemComment:void 0}}}:c)},Ze=t=>{b(r=>r.filter(u=>u.rowId!==t)),_(!0)},et=async()=>{if(!o?.id?!f:!D){y("You do not have permission to perform this action.");return}const r=_n(x);if(A(r),y(""),Sn(r))return;const u={lines:x.map(c=>({itemcode:c.itemcode,entryMode:c.entryMode,requestedQty:Number(c.inputValue),itemRemark:c.itemComment.trim()||void 0}))};M(!0);try{const c=o?.id?await jt(o.id,u):await yt({refType:K,lines:u.lines});E(c),I(c.refType),b(W(c)),A({byRow:{}}),_(!1),g(null),d({open:c.id},{replace:!0}),await Y().catch(()=>{}),w({message:o?.id?"Saved changes.":"Adjustment saved.",type:"success"})}catch(c){y(P(c,"Failed to save adjustment"))}finally{M(!1)}},tt=async()=>{if(j&&o?.id){M(!0),y("");try{const t=await gt(o.id);E(t),b(W(t)),T(!1),g(null),w({message:t.status==="CANCELLED"?"Cancellation posted.":"Adjustment posted.",type:"success"})}catch(t){const r=Cn(t);r?(T(!1),g(r),y(r.message)):y(P(t,"Failed to post adjustment"))}finally{M(!1)}}},nt=async()=>{if(!o?.id){g(null);return}await oe(o.id),g(null)},at=()=>{O(""),v(""),L(!0)},st=async()=>{if(!o?.id||!_e)return;const t=$.trim();if(!t){v("Cancellation reason is required.");return}je(!0),v(""),y("");try{const r=await wt(o.id,t);E(r),b(W(r)),L(!1),O(""),_(!1),w({message:"Cancellation requested.",type:"success"})}catch(r){v(P(r,"Failed to request cancellation"))}finally{je(!1)}},rt=async()=>{if(Se&&o?.id){te(!0),he(!0),H(""),we(null);try{const t=await Nt(o.id);E(t),we(t)}catch(t){H(P(t,"Failed to generate print preview")),w({message:P(t,"Failed to print adjustment"),type:"error"})}finally{he(!1)}}},it=i.useCallback(async()=>{if(!(!C||!ne.current)){Ne(!0);try{const t=window.open("","_blank","width=900,height=700");if(!t)throw new Error("Popup blocked");t.document.open(),t.document.write(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${C.qaNo||"Quantity Adjustment"}</title>
    <style>${de}</style>
  </head>
  <body>${ne.current.innerHTML}</body>
</html>`),t.document.close(),t.focus(),t.onload=()=>{t.focus(),t.print(),window.setTimeout(()=>{t.close()},300)}}catch(t){w({message:P(t,"Failed to print document"),type:"error"})}finally{Ne(!1)}}},[C]);return e.jsxs("div",{className:a.page,children:[ae&&e.jsx(mt,{message:ae.message,type:ae.type,onClose:()=>w(null)}),e.jsxs("div",{className:a.screenHeader,children:[e.jsxs("h2",{className:a.screenTitle,children:["QUANTITY ADJUSTMENT ",e.jsx("span",{className:a.screenDash,children:"-"})," ",e.jsx("span",{className:vn(Ce),children:Ye})]}),f&&e.jsx(p,{variant:"secondary",size:"md",onClick:Ke,children:"New"})]}),e.jsxs("div",{className:a.card,children:[e.jsxs("div",{className:a.docGrid,children:[e.jsxs("div",{className:a.docField,children:[e.jsx("span",{className:a.docLabel,children:"Quantity Adj#"}),e.jsx("strong",{className:a.docValue,children:q&&R===q?"Loading...":We})]}),e.jsxs("div",{className:a.docField,children:[e.jsx("span",{className:a.docLabel,children:"Type"}),e.jsxs(ct,{id:"qa-ref-type",value:qe,disabled:ve||!f,onChange:t=>I(t.target.value),children:[e.jsx("option",{value:"DM",children:"DM"}),e.jsx("option",{value:"CM",children:"CM"})]})]}),e.jsxs("div",{className:a.docField,children:[e.jsxs("span",{className:a.docLabel,children:[qe," No"]}),e.jsx("strong",{className:a.docValue,children:Xe})]}),e.jsxs("div",{className:a.docField,children:[e.jsx("span",{className:a.docLabel,children:"Date"}),e.jsx("strong",{className:a.docValue,children:ke(Je)})]})]}),ue&&e.jsx("div",{className:a.errorBanner,children:ue}),Z.lines&&e.jsx("div",{className:a.errorBanner,children:Z.lines}),o?.cancellationReason&&e.jsxs("div",{className:a.cancellationPanel,children:[e.jsx("span",{className:a.docLabel,children:"Cancellation Reason"}),e.jsx("p",{children:o.cancellationReason}),e.jsxs("span",{children:["Requested by ",o.cancellationRequestedBy??"—",o.cancellationRequestedAt?` on ${ke(o.cancellationRequestedAt)}`:"",o.cancelledBy?` · Posted by ${o.cancelledBy}`:""]})]}),m&&e.jsxs("div",{className:a.searchStrip,children:[e.jsx(dt,{id:"qa-item-search",ref:be,value:z,onChange:t=>U(t.target.value),onKeyDown:t=>{t.key==="Enter"&&G[0]&&x.length<Q&&(t.preventDefault(),Ae(G[0]))},placeholder:"Barcode / description",autoComplete:"off",disabled:x.length>=Q}),x.length>=Q&&e.jsx("span",{className:a.searchState,children:me}),Oe&&e.jsx("span",{className:a.searchState,children:"Searching..."})]}),m&&z.trim().length>=1&&e.jsx("div",{className:a.searchResults,children:e.jsxs("table",{className:a.table,children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Barcode / Item"}),e.jsx("th",{children:"Description"}),e.jsx("th",{children:"Qty"})]})}),e.jsx("tbody",{children:G.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:3,className:a.emptyInline,children:"No items found"})}):G.map(t=>e.jsxs("tr",{className:a.resultRow,onClick:()=>Ae(t),children:[e.jsx("td",{className:a.mono,children:t.itemcode}),e.jsx("td",{children:t.name}),e.jsx("td",{children:t.quantity.toFixed(2)})]},t.id))})]})}),e.jsx("div",{className:a.gridWrapper,children:e.jsxs("table",{className:a.table,children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Barcode / Item"}),e.jsx("th",{children:"Description"}),e.jsx("th",{children:"Current Stock"}),e.jsx("th",{children:"Mode"}),e.jsx("th",{children:"Adjustment Qty"}),e.jsx("th",{children:"Final Stock"}),e.jsx("th",{children:"Comment"}),m&&e.jsx("th",{})]})}),e.jsx("tbody",{children:x.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:m?8:7,className:a.empty,children:"No items"})}):x.map(t=>{const r=Z.byRow[t.rowId],u=Re(t);return e.jsxs("tr",{children:[e.jsx("td",{className:a.mono,children:t.itemcode}),e.jsx("td",{className:a.itemName,children:t.itemname}),e.jsx("td",{children:t.oldQty.toFixed(2)}),e.jsx("td",{children:m?e.jsxs("select",{className:a.modeSelect,value:t.entryMode,onChange:c=>le(t.rowId,"entryMode",c.target.value),title:"Adjust adds to or subtracts from current stock. Set exact replaces it.",children:[e.jsx("option",{value:"DELTA",children:"Adjust (+/−)"}),e.jsx("option",{value:"SET",children:"Set exact qty"})]}):e.jsx("span",{className:a.modeBadge,children:t.entryMode==="SET"?"Set exact":"Adjust"})}),e.jsx("td",{children:m?e.jsxs(e.Fragment,{children:[e.jsx("input",{className:`${a.cellInput} ${r?.adjustQty?a.cellInputError:""}`,type:"text",inputMode:"decimal",value:t.inputValue,placeholder:t.entryMode==="DELTA"?"e.g. +5, 0, or -4":"e.g. 10",onChange:c=>le(t.rowId,"inputValue",c.target.value)}),r?.adjustQty&&e.jsx("div",{className:a.cellError,children:r.adjustQty})]}):e.jsx("span",{className:a.mono,children:t.entryMode==="SET"?t.inputValue:Number(t.inputValue)>=0?`+${t.inputValue}`:t.inputValue})}),e.jsx("td",{children:u.newQty!=null?e.jsx("span",{className:u.adjustQty>0?a.previewPos:u.adjustQty<0?a.previewNeg:"",children:u.newQty.toFixed(2)}):e.jsx("span",{className:a.previewEmpty,children:"—"})}),e.jsx("td",{children:m?e.jsxs(e.Fragment,{children:[e.jsx("input",{className:`${a.cellInput} ${r?.itemComment?a.cellInputError:""}`,type:"text",value:t.itemComment,onChange:c=>le(t.rowId,"itemComment",c.target.value),maxLength:500}),r?.itemComment&&e.jsx("div",{className:a.cellError,children:r.itemComment})]}):t.itemComment||"—"}),m&&e.jsx("td",{children:e.jsx("button",{className:a.removeBtn,type:"button",onClick:()=>Ze(t.rowId),"aria-label":`Remove ${t.itemcode}`,children:"×"})})]},t.rowId)})})]})}),e.jsxs("div",{className:a.footerBar,children:[e.jsxs("div",{className:a.summaryBlock,children:[e.jsxs("span",{children:["Lines: ",x.length,x.length>=Q?e.jsx("span",{className:a.maxLines,children:" (max)"}):null]}),e.jsxs("span",{children:["Net Adjust: ",Pe>=0?"+":"",Pe.toFixed(2)]})]}),e.jsxs("div",{className:a.actionButtons,children:[m&&e.jsx(p,{onClick:et,loading:k,children:"Save"}),_e&&e.jsx(p,{variant:"secondary",onClick:at,disabled:k||B,children:"Cancel"}),(He||Ge)&&e.jsx(p,{variant:"danger",onClick:()=>T(!0),disabled:k,children:"Post"}),Se&&e.jsx(p,{variant:"secondary",onClick:rt,loading:pe,children:"Print"})]})]})]}),e.jsx(F,{open:Ve,onClose:()=>{te(!1),H("")},title:`Print Preview — ${C?.qaNo??o?.qaNo??"Quantity Adjustment"}`,size:"lg",footer:e.jsxs("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"},children:[e.jsx(p,{variant:"secondary",onClick:()=>{te(!1),H("")},children:"Close"}),C&&e.jsx(p,{variant:"secondary",onClick:it,loading:ze,children:"Print"})]}),children:e.jsx("div",{className:a.printPreviewBody,children:pe?e.jsx("div",{className:a.printPreviewState,children:"Generating 8.5 x 5.5 print preview..."}):ge?e.jsx("div",{className:a.printPreviewState,children:ge}):C?e.jsx("div",{ref:ne,className:a.printMarkupFrame,children:e.jsx(qt,{documentData:C,preview:!0})}):e.jsx("div",{className:a.printPreviewState,children:"No records to print."})})}),e.jsx(F,{open:Me,onClose:()=>V(!1),title:"Discard Changes",size:"sm",footer:e.jsxs("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"},children:[e.jsx(p,{variant:"secondary",onClick:()=>V(!1),children:"Keep Editing"}),e.jsx(p,{variant:"danger",onClick:()=>{V(!1),Ee()},children:"Discard"})]}),children:e.jsx("p",{className:a.confirmText,children:"You have unsaved changes. Discard this draft and start a new quantity adjustment?"})}),e.jsx(F,{open:Fe,onClose:()=>T(!1),title:re?"Post Cancellation":"Post Adjustment",size:"sm",footer:e.jsxs("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"},children:[e.jsx(p,{variant:"secondary",onClick:()=>T(!1),disabled:k,children:"Cancel"}),e.jsx(p,{variant:"danger",onClick:tt,loading:k,children:"Post"})]}),children:e.jsx("p",{className:a.confirmText,children:re?e.jsxs(e.Fragment,{children:["Post this cancellation? The entry will become ",e.jsx("strong",{children:"Cancelled Entry"})," and remain visible as a historical record."]}):e.jsxs(e.Fragment,{children:["Post this quantity adjustment? This will make the inventory changes ",e.jsx("strong",{children:"live"})," and update the actual stock records. The document will be locked and cannot be edited after posting."]})})}),e.jsx(F,{open:!!ee,onClose:()=>g(null),title:"Stock Changed",size:"md",footer:e.jsxs("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"},children:[e.jsx(p,{variant:"secondary",onClick:()=>g(null),children:"Close"}),e.jsx(p,{onClick:nt,loading:R===o?.id,children:"Reload Adjustment"})]}),children:e.jsxs("div",{className:a.staleStockPanel,children:[e.jsx("p",{className:a.confirmText,children:ee?.message}),e.jsxs("table",{className:a.staleStockTable,children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Item Code"}),e.jsx("th",{children:"Saved Qty"}),e.jsx("th",{children:"Live Qty"}),e.jsx("th",{children:"Difference"})]})}),e.jsx("tbody",{children:ee?.items.map(t=>e.jsxs("tr",{children:[e.jsx("td",{className:a.mono,children:t.itemcode}),e.jsx("td",{children:t.savedQty.toFixed(2)}),e.jsx("td",{children:t.liveQty.toFixed(2)}),e.jsx("td",{children:t.difference.toFixed(2)})]},t.itemcode))})]})]})}),e.jsx(F,{open:Ie,onClose:()=>{B||L(!1)},title:"Cancel Adjustment",size:"sm",footer:e.jsxs("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"},children:[e.jsx(p,{variant:"secondary",onClick:()=>L(!1),disabled:B,children:"Close"}),e.jsx(p,{variant:"danger",onClick:st,loading:B,disabled:!$.trim(),children:"Confirm"})]}),children:e.jsxs("div",{className:a.cancelReasonField,children:[e.jsx("label",{htmlFor:"qa-cancellation-reason",children:"Cancellation Reason"}),e.jsx("textarea",{id:"qa-cancellation-reason",required:!0,value:$,onChange:t=>{O(t.target.value),t.target.value.trim()&&v("")},onBlur:()=>{$.trim()||v("Cancellation reason is required.")},placeholder:"Enter reason for cancellation",rows:5,disabled:B}),xe&&e.jsx("p",{className:a.cancelReasonError,children:xe})]})})]})}export{Tn as default};
