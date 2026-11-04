/* ============================================================
 * 椅座·红乡 · 红色乡村数字研学平台 · 逻辑层
 * 模块：路由 / 人物叙事 / 物件观察 / 史料阅读 / 排序 / 测验 /
 *       开放关联 / 进度(localStorage) / 报告与打印
 * ============================================================ */
(function(){
"use strict";
const { SOURCES, CHAIRS, QUIZZES, SORTS, OPENS, MEMORY_ITEMS, STORE_KEY, STORE_VER, ROUTES, AGRI } = window.RRX;

const root=document.getElementById('view-root');
const crumbs=document.getElementById('crumbs');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* HTML 转义：所有用户输入（姓名/开放题/感悟）插入 DOM 前统一调用，防 XSS */
function esc(s){
  if(s==null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* 序号与乱序：排序题初始顺序随机，且保证不等于正确顺序；提交前不显示年份 */
const ORDINAL=['①','②','③','④','⑤','⑥','⑦','⑧'];
function shuffleOrder(so){
  const n=so.items.length;
  let a=so.items.map((_,i)=>i);
  for(let round=0; round<20; round++){
    for(let i=n-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; }
    if(JSON.stringify(a)!==JSON.stringify(so.order)) return a;
  }
  return a;
}

/* ---------- 图标 ---------- */
function icSprout(){return '<svg viewBox="0 0 24 24" fill="none"><path d="M12 21V11M12 11C12 7 9 5 4 5c0 5 3 8 8 8M12 11c0-4 3-6 8-6 0 5-3 8-8 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
function icShield(){return '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12l2.2 2.2L15.5 9.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
function icScale(){return '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M5 7h14M12 5l-7 9h14l-7-9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.5 16.5l3.5 4.5 3.5-4.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';}
function icArrowL(){return '<svg viewBox="0 0 24 24" class="arr"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
function icArrowR(){return '<svg viewBox="0 0 24 24" class="arr"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
function icRestart(){return '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
function icEnter(){return '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
function spiritIcon(t){if(/民生|当家|人民/.test(t))return icScale();if(/守|苦|迎难/.test(t))return icShield();return icSprout();}

/* ---------- 进度存储（容错） ---------- */
function defaultState(){
  return { v:STORE_VER, name:"", startedLines:{}, observed:{}, sourcesViewed:{},
           quiz:{}, sort:{}, open:{}, routeCheck:{}, completedLines:{}, reportAt:"",
           pledge:{}, memoryCard:null, letterSeen:{} };
}
function loadState(){
  try{
    const raw=localStorage.getItem(STORE_KEY);
    if(!raw) return defaultState();
    const o=JSON.parse(raw);
    if(!o || o.v!==STORE_VER) return defaultState();
    // 兜底补齐字段
    const d=defaultState();
    return Object.assign(d,o);
  }catch(e){ return defaultState(); }
}
function saveState(){
  recomputeCompleted();
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch(e){ /* 存储不可用：静默降级，本次仍可在页面内使用 */ }
  cloudSync(); // 若已登录，同步进度到服务端
}

/* ---------- 服务端进度同步（已登录时启用：节流上传 + 状态可观测 + 失败重试） ---------- */
const SYNC={ timer:null, retry:null, tries:0, lastPayload:"", lastAt:0, state:"idle", error:"", listeners:[] };
function syncStatus(){
  return { state:SYNC.state, error:SYNC.error, lastAt:SYNC.lastAt,
           pending:(JSON.stringify(state)!==SYNC.lastPayload) };
}
function syncEmit(){
  const st=syncStatus();
  SYNC.listeners.slice().forEach(fn=>{ try{ fn(st); }catch(e){} });
}
function syncErrText(e){
  const m=(e&&e.message)||"同步失败";
  return (/Failed to fetch|NetworkError|Load failed|Network request failed/i.test(m)) ? "无法连接后端服务" : m;
}
function cloudSync(immediate){
  try{
    if(!(window.RRX_API && window.RRX_API.isLoggedIn())) return;
    const payload=JSON.stringify(state);
    if(payload===SYNC.lastPayload){ SYNC.state="ok"; syncEmit(); return; }
    syncEmit();
    clearTimeout(SYNC.timer);
    SYNC.timer=setTimeout(()=>pushCloud(payload), immediate?0:1200);
  }catch(e){ /* 忽略 */ }
}
function pushCloud(payload){
  clearTimeout(SYNC.timer); SYNC.timer=null;
  payload=payload||JSON.stringify(state);
  SYNC.state="syncing"; SYNC.error=""; syncEmit();
  window.RRX_API.saveLineProgress("__all__", payload).then(()=>{
    SYNC.lastPayload=payload; SYNC.lastAt=Date.now(); SYNC.tries=0; SYNC.state="ok"; SYNC.error="";
    clearTimeout(SYNC.retry); SYNC.retry=null; syncEmit();
  }).catch(e=>{
    SYNC.state="error"; SYNC.error=syncErrText(e); syncEmit();
    clearTimeout(SYNC.retry);
    if(SYNC.tries<2){ SYNC.tries++; SYNC.retry=setTimeout(()=>pushCloud(),5000); }
  });
}
window.RRX_SYNC={
  status:syncStatus,
  flush:function(){ if(window.RRX_API && window.RRX_API.isLoggedIn()) pushCloud(); },
  reset:function(){
    clearTimeout(SYNC.timer); clearTimeout(SYNC.retry);
    SYNC.timer=SYNC.retry=null; SYNC.tries=0; SYNC.lastPayload=""; SYNC.lastAt=0;
    SYNC.state="idle"; SYNC.error=""; syncEmit();
  },
  subscribe:function(fn){
    SYNC.listeners.push(fn);
    return function(){ SYNC.listeners=SYNC.listeners.filter(f=>f!==fn); };
  }
};
window.addEventListener("rrx:unauthorized", function(){ window.RRX_SYNC.reset(); });
/* 判定一条故事线是否“研学完成”：所有客观题已提交 + 排序已提交 + 开放题已填写 */
function lineCompleted(line){
  const qs=QUIZZES.filter(q=>q.line===line);
  const allQ=qs.length>0 && qs.every(q=>state.quiz[q.id] && state.quiz[q.id].submitted);
  const so=SORTS.find(s=>s.line===line);
  const sortDone=!so || (state.sort[so.id] && state.sort[so.id].submitted);
  const op=OPENS.find(o=>o.line===line);
  const openDone=!op || (state.open[op.id] && state.open[op.id].text && state.open[op.id].text.trim().length>0);
  return allQ && sortDone && openDone;
}
function recomputeCompleted(){
  CHAIRS.forEach(c=>{
    if(state.startedLines[c.id] && lineCompleted(c.id)) state.completedLines[c.id]=true;
    else delete state.completedLines[c.id];
  });
}
let state=loadState();

function markStarted(line){ state.startedLines[line]=true; saveState(); }
function markObserved(line, idx){
  if(!state.observed[line]) state.observed[line]=[];
  if(!state.observed[line].includes(idx)) state.observed[line].push(idx);
  saveState();
}
function markSource(line, sid){
  if(!state.sourcesViewed[line]) state.sourcesViewed[line]=[];
  if(!state.sourcesViewed[line].includes(sid)) state.sourcesViewed[line].push(sid);
  saveState();
}

/* ---------- 渲染：首页 ---------- */
const DEMO = !!(window.RRX && window.RRX.DEMO);
function renderProgressChip(){
  const lines=CHAIRS.length;
  const done=Object.keys(state.completedLines).length;
  const answered=Object.values(state.quiz).filter(q=>q.submitted).length;
  const cloud=!!(window.RRX_API && window.RRX_API.isLoggedIn());
  return `<div class="progress-note">研学进度：已进入 ${Object.keys(state.startedLines).length}/${lines} 条故事线 · 已完成 ${done}/${lines} 条研学 · 已作答客观题 ${answered} 道。${
    DEMO ? '' : `<span class="storage-note">${cloud
      ? '已登录账号：进度与报告会保存到服务端数据库，换设备登录后可恢复。'
      : '未登录：进度暂存在当前浏览器，登录后会保存到服务端数据库。'}</span>`}</div>`;
}

function viewHome(){
  const hotspots=CHAIRS.slice().sort((a,b)=>a.hot-b.hot).map(c=>
    `<div class="hot" data-hot="${c.hot}" data-go="${c.id}" role="button" tabindex="0" aria-label="进入${c.name}">
       <span class="pill"><b>${c.name}</b><span class="who"> · ${c.person}</span><span class="go">${icEnter()}</span></span>
     </div>`).join('');
  const knots=CHAIRS.slice().sort((a,b)=>a.hot-b.hot).map(c=>`<button class="knot" data-knot="${c.id}"><span class="dot"></span><span class="lab">${c.name}</span></button>`).join('');
  return `
  <section class="hero">
    <span class="kicker">红色乡村数字研学平台 · 2026 四川省大学生农业创意设计大赛</span>
    <h1>椅座 · <span class="red">红乡</span></h1>
    <p class="sub-line">一把椅子，一段故事，一程乡村</p>
    <p class="sub">坐下读懂三把椅子，起身留下助农行动</p>
    <div class="seq">
      <span class="seq-step"><b>坚守</b>焦裕禄</span><span class="seq-arrow"></span>
      <span class="seq-step"><b>富民</b>邓小平</span><span class="seq-arrow"></span>
      <span class="seq-step"><b>当家</b>申纪兰</span>
    </div>
    <p class="sub" style="margin-top:10px;font-size:12.5px;opacity:.85">坚守是初心（为谁）· 富民是路径（怎么富）· 当家是主体（谁来振兴）</p>
    <div class="cta-row hero-cta">
      <button class="btn btn-primary" data-go="jianshou">走进红乡 ${icEnter()}</button>
      <button class="btn btn-ghost" data-open-report>乡村行动档案</button>
    </div>
    ${renderProgressChip()}
  </section>

  <div class="pano-wrap">
    <div class="pano" id="pano">
      <div class="bg-pano" role="img" aria-label="金色麦田与乡村画卷，三把椅子分别立于左中右"></div>
      <div class="dynscene" aria-hidden="true"><canvas id="dynCanvas"></canvas></div>
      <div class="pano-vig" aria-hidden="true"></div>
      <div class="veil-b"></div>
      ${hotspots}
    </div>
    <p class="pano-cap">图为 AI 概念化示意，非历史照片 · 点击椅子进入对应故事</p>
  </div>

  <div class="chair-cards">
    ${CHAIRS.slice().sort((a,b)=>a.hot-b.hot).map(c=>`<button class="ccard" data-go="${c.id}" aria-label="进入${c.name}">
      <span class="cc-bg ${c.img}"></span>
      <span class="cc-tx"><b>${c.name}</b><i>${c.person}</i><em>${c.tag}</em></span>
      <span class="cc-go">${icEnter()}</span>
    </button>`).join('')}
    <p class="cc-note">图为 AI 概念化示意，非历史照片 · 点击卡片进入对应故事</p>
  </div>
  <div class="river"><div class="rope"><div class="line"></div>${knots}</div></div>
  <p class="river-hint">点击画卷上的椅子，或沿着红绸的节点，走进每一段红色乡村故事</p>
  <div class="tour-wrap"><button class="tour" data-tour>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h13"/><path d="M12 6l6 6-6 6"/><path d="M20 3v18"/></svg> <span>自动巡游 · 沿红绸依次点亮三把椅子</span></button></div>

  <details class="about">
    <summary>关于本项目 · 研学导览（为什么是“椅子”）</summary>
    <div class="intro-card">
      <p>这是一个面向农业农村主题的数字研学项目。我们以「一把椅子」为叙事入口，通过焦裕禄（兰考·治沙）、邓小平（广安·农村改革）、申纪兰（西沟·人民当家）三段人物故事与物象探索，理解历史实践与<strong>农业生产、农村发展、农民主体地位</strong>之间的联系。</p>
      <p><strong>为什么是椅子？</strong>三把椅子不是三件展品，而是三种「坐下来的位置」：坐到群众中间，才懂得坚守；坐到农家院里，才想明白富民；坐到村民当中，才明白乡村振兴要让农民自己当家。从焦裕禄的「坚守」到邓小平的「富民」，再到申纪兰的「当家」，是一条中国乡村从守住乡土、到小康之家、再到农业农村现代化的历史逻辑——<strong>乡土情怀是根，小康之家是路，农民当家是魂</strong>。研学的终点不是一份报告，而是把「坐下来的感动」变成「站起来的行动」。</p>
      <div class="intro-grid">
        <div class="intro-item"><b>① 物件观察</b><span>观察椅子细节，区分「有史料依据的事实」与「为帮助理解的设计表达」。</span></div>
        <div class="intro-item"><b>② 史料阅读</b><span>阅读人物背景、关键事件，并查看每条史料的来源与核验状态。</span></div>
        <div class="intro-item"><b>③ 任务闯关</b><span>历史事件排序、农业农村关联思考、知识小测。</span></div>
        <div class="intro-item"><b>④ 行动档案</b><span>回答「椅子与我的关系」三问，生成乡村行动档案与你的行动宣言。</span></div>
      </div>
    </div>
  </details>
  <div style="height:44px"></div>`;
}

/* ---------- 史料来源列表组件 ---------- */
/* 只显示人类可读内容：机构、标题、可点击链接、核验状态；前 3 条常显，其余折叠 */
function srcName(sid){
  const s=SOURCES[sid];
  return s ? (s.org+'《'+s.name+'》') : '未标注来源';
}
function srcOrg(sid){
  const s=SOURCES[sid];
  return s ? s.org : '未标注来源';
}
function srcList(line){
  const allIds=CHAIRS.find(c=>c.id===line).sources;
  const row=(sid,i)=>{
    const s=SOURCES[sid]; if(!s) return '';
    return `<div class="src-item">
      <span class="sid">${String(i+1).padStart(2,'0')}</span>
      <span class="sname">${s.name}</span>
      <span class="org">${s.org}</span>
      <a href="${s.url}" target="_blank" rel="noopener" data-src-open="${s.id}">查看来源 ↗</a>
      <span class="badge ${s.status==='已核实'?'ok':'pending'}">${s.status==='已核实'?'已核实':'待核验'}</span>
    </div>`;
  };
  const first=allIds.slice(0,3).map(row).join('');
  const rest=allIds.slice(3).map((sid,i)=>row(sid,i+3)).join('');
  return `<div class="src-list src-main">
    <div class="src-title">史料来源（共 ${allIds.length} 条，均逐条打开原文核对；点击“查看来源”可打开权威原文）</div>
    ${first}
    ${allIds.length>3?`<details class="src-more"><summary>展开其余 ${allIds.length-3} 条来源</summary>${rest}</details>`:''}
  </div>`;
}

/* ---------- 椅子与我：每条故事线末尾问一问（第六步） ---------- */
const MEMORY_ICONS={"一张老照片":"🖼","一件旧农具":"🌾","一句方言":"🗣","一首村歌":"🎵","一棵老树":"🌳","一口老井":"💧"};
function mcIcon(item){ return MEMORY_ICONS[item]||"📌"; }
function chairPledgeAnswered(line){
  const q=PLEDGE_QS.find(x=>x.chair===line);
  return !!(q && state.pledge && state.pledge[q.key]);
}
function chairPledgeCard(line){
  const q=PLEDGE_QS.find(x=>x.chair===line); if(!q) return '';
  const p=state.pledge||{};
  const opts=q.opts.map(o=>`<button class="pl-opt ${p[q.key]===o?'on':''}" data-pledge="${q.key}:${esc(o)}">${esc(o)}</button>`).join('');
  const done=!!p[q.key];
  return `<div class="chair-pledge ${done?'done':''}">
    <div class="cp-h"><span class="cp-k">⑥ 椅子与我</span><b>${q.dim}</b><span class="cp-note">这一步不打分，只问你的选择</span></div>
    <div class="cp-q">${q.q}</div>
    <div class="pl-opts">${opts}</div>
    ${done?`<div class="cp-done">已选：<b>${esc(p[q.key])}</b>　三问合成后会写进「研学落点」的行动宣言与乡村行动档案。</div>`
           :`<div class="cp-hint">选一个就好——它不会判对错，但会写进你的行动档案。</div>`}
  </div>`;
}

/* ---------- 研学任务区 ---------- */
function studySection(line){
  const qs=QUIZZES.filter(q=>q.line===line);
  const so=SORTS.find(s=>s.line===line);
  const op=OPENS.find(o=>o.line===line);

  const quizHtml=qs.map((q,qi)=>{
    const st=state.quiz[q.id]||{};
    const opts=q.opts.map((o,i)=>{
      let cls='opt';
      if(st.submitted){
        if(i===q.ans) cls+=' correct';
        else if(st.sel===i) cls+=' wrong';
      }else if(st.sel===i){ cls+=' sel'; }
      return `<label class="${cls}" data-qopt="${q.id}:${i}">
        <input type="radio" name="${q.id}" ${st.sel===i?'checked':''} ${st.submitted?'disabled':''}>
        <span>${o}</span></label>`;
    }).join('');
    let fb='';
    if(st.submitted){
      const ok=st.sel===q.ans;
      fb=`<div class="q-feedback show ${ok?'ok':'no'}">${ok?'✓ 回答正确。':'✗ 回答有误，正确答案已标出。'}
        <div class="exp">${q.exp}<br><span style="color:#8a765a">依据：${srcName(q.src)}</span></div></div>`;
    }
    const actions=st.submitted
      ? `<button class="mini-btn ghost" data-qretry="${q.id}">重新作答</button>`
      : `<button class="mini-btn" data-qsubmit="${q.id}">提交作答</button>`;
    return `<div class="q-block" data-qblock="${q.id}">
      <div class="q-head">
        <span class="badge ${q.diff==='基础'?'ok':'pending'}">${q.diff}</span>
        <span class="badge ok">${q.tag}</span>
        <span class="q-prog">第 ${qi+1}/${qs.length} 题</span></div>
      <div class="q-text">${q.q}</div>
      <div class="opts">${opts}</div>
      ${fb}
      <div class="q-actions">${actions}</div>
    </div>`;
  }).join('');

  let sortHtml='';
  if(so){
    let st=state.sort[so.id];
    if(!st || !Array.isArray(st.order) || st.order.length!==so.items.length){
      const keepFirst=st&&st.first;
      st={ order:shuffleOrder(so), submitted:false };
      if(keepFirst) st.first=keepFirst;
      state.sort[so.id]=st;
      try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }catch(e){}
    }
    const submitted=!!st.submitted;
    const order=st.order;
    const items=order.map((itemIdx,pos)=>{
      const it=so.items[itemIdx];
      const label=submitted?it.y:ORDINAL[pos%ORDINAL.length];
      return `<div class="sort-item" data-sortrow="${so.id}:${pos}">
        <span class="si-y ${submitted?'':'pending-y'}">${label}</span>
        <span class="si-t">${it.t}</span>
        <span class="si-btns">
          <button data-sortmove="${so.id}:${pos}:-1" ${pos===0?'disabled':''} aria-label="上移">↑</button>
          <button data-sortmove="${so.id}:${pos}:1" ${pos===order.length-1?'disabled':''} aria-label="下移">↓</button>
        </span></div>`;
    }).join('');
    let fb='';
    if(st.submitted){
      const ok=JSON.stringify(st.order)===JSON.stringify(so.order);
      st.correct=ok;
      const firstLine=st.first?`<div class="exp">首答：${st.first.correct?'✓ 正确':'✗ 错误'}${st.first.at?'（'+new Date(st.first.at).toLocaleString('zh-CN')+'）':''}${st.first&&st.submitted&&st.first.correct!==ok?'；终答：'+(ok?'✓ 正确':'✗ 错误'):''}</div>`:'';
      fb=`<div class="q-feedback show ${ok?'ok':'no'}">${ok?'✓ 顺序正确。':'✗ 顺序有误，参考正确顺序：'+so.order.map(i=>so.items[i].y).join(' → ')}
        ${firstLine}
        <div class="exp">${so.exp}<br><span style="color:#8a765a">依据：${srcName(so.src)}</span></div></div>`;
    } else if(st.first){
      fb=`<div class="q-feedback show ${st.first.correct?'ok':'no'}"><div class="exp">首答：${st.first.correct?'✓ 正确':'✗ 错误'}${st.first.at?'（'+new Date(st.first.at).toLocaleString('zh-CN')+'）':''}。可重新排序后再次提交。</div></div>`;
    }
    sortHtml=`<div class="q-block">
      <div class="q-head"><span class="badge pending">历史事件排序</span><span class="badge ok">不做提示 · 凭史实判断</span></div>
      <div class="q-text">${so.title}</div>
      <div class="q-tip">操作：点右侧 ↑↓ 调整位置，越靠上＝越早发生；提交前不会显示年份，排完点「提交排序」。</div>
      <div class="sort-list">${items}</div>
      ${fb}
      <div class="q-actions">
        ${st.submitted?`<button class="mini-btn ghost" data-sortretry="${so.id}">重新排序</button>`
                     :`<button class="mini-btn" data-sortsubmit="${so.id}">提交排序</button>`}
      </div>
    </div>`;
  }

  let openHtml='';
  if(op){
    const st=state.open[op.id]||{};
    const ref=op.ref.map(r=>`<li>${r}</li>`).join('');
    openHtml=`<div class="q-block">
      <div class="q-head"><span class="badge ok">农业农村关联 · 开放题</span><span class="badge pending">不自动评分 · 自我对照</span></div>
      <div class="q-text">${op.q}</div>
      <textarea data-open-text="${op.id}" placeholder="写下你的看法（两三句话即可）…">${esc(st.text)}</textarea>
      <div class="q-actions">
        <button class="mini-btn" data-openhint="${op.id}">对照参考要点</button>
        <button class="mini-btn ghost" data-opensave="${op.id}">保存我的回答</button>
      </div>
      <div class="selfnote">系统不做语义自动评分，请对照参考要点自我评价。依据：${srcName(op.src)}</div>
      <div class="open-ref" data-openref="${op.id}"><h6>参考要点（自我对照）</h6><ul>${ref}</ul></div>
    </div>`;
  }

  // 进度小结
  const answered=qs.filter(q=>state.quiz[q.id]&&state.quiz[q.id].submitted).length;
  const correct=qs.filter(q=>state.quiz[q.id]&&state.quiz[q.id].submitted&&state.quiz[q.id].sel===q.ans).length;
  const rate=answered?Math.round(correct/answered*100):0;
  const sum=`<div class="study-summary">
    本条线进度：已观察物件细节 ${(state.observed[line]||[]).length}/3 · 已查看史料 ${(state.sourcesViewed[line]||[]).length}/${CHAIRS.find(c=>c.id===line).sources.length}
    · 客观题作答 <b>${answered}/${qs.length}</b>（正确 ${correct}，正确率 ${rate}%）${answered?'':'（未作答不计分）'}。
  </div>`;

  return `<div class="study-box" data-study="${line}">
    <h4 class="study-h">研学任务</h4>
    <p class="study-sub">按顺序完成六项：观察 → 读史料 → 排事件 → 想关联 → 做小测 → 答「椅子与我」。全部完成后可生成乡村行动档案。</p>
    <div class="study-flow">
      <span class="flow-step ${(state.observed[line]||[]).length?'done':''}"><b>①</b> 物件观察</span>
      <span class="flow-step ${(state.sourcesViewed[line]||[]).length?'done':''}"><b>②</b> 史料阅读</span>
      <span class="flow-step ${so&&state.sort[so.id]&&state.sort[so.id].submitted?'done':''}"><b>③</b> 事件排序</span>
      <span class="flow-step ${op&&state.open[op.id]&&state.open[op.id].text?'done':''}"><b>④</b> 农业关联</span>
      <span class="flow-step ${answered?'done':''}"><b>⑤</b> 知识小测</span>
      <span class="flow-step ${chairPledgeAnswered(line)?'done':''}"><b>⑥</b> 椅子与我</span>
    </div>
    ${quizHtml}
    ${sortHtml}
    ${openHtml}
    ${chairPledgeCard(line)}
    ${sum}
    <div class="q-actions">
      <button class="btn btn-green" data-open-report>生成 / 查看乡村行动档案</button>
    </div>
  </div>`;
}

/* ---------- 渲染：走线研学 + 农产品产业 ---------- */
function routeSection(line){
  const route=(ROUTES||[]).find(r=>r.line===line);
  const agri=(AGRI||[]).filter(a=>a.line===line);
  if(!route && !agri.length) return '';
  const checked=state.routeCheck[line]||[];
  const spots=(route&&route.spots)?route.spots.map((s,i)=>{
    const on=checked.indexOf(i)>=0;
    return `<div class="spot-card ${on?'on':''}">
      <div class="spot-dot">${on?'✓':(i+1)}</div>
      <div class="spot-meta">
        <h6>${esc(s.name)}</h6>
        <div class="spot-place">${esc(s.place||'')}${s.open_time?(' · '+esc(s.open_time)):''}</div>
        <p>${esc(s.summary||'')}</p>
        ${s.tips?`<div class="spot-tip">研学提示：${esc(s.tips)}</div>`:''}
      </div>
      <button class="mini-btn ${on?'ghost':''}" data-check="${line}:${i}">${on?'已打卡':'打卡'}</button>
    </div>`;
  }).join('') : '';
  const agriHtml=agri.length?`<div class="agri-grid">${agri.map(a=>`<div class="agri-card">
      <span class="spot-region">${esc(a.region||'')}</span>
      <h6>${esc(a.product)}</h6>
      <p><b>与红色乡村的关联：</b>${esc(a.story)}</p>
      <p><b>今日产业：</b>${esc(a.today)}</p>
    </div>`).join('')}</div>`:'';
  return `<div class="route-box">
    ${route?`<div class="route-head"><div><h5>${esc(route.title)}</h5><p>${esc(route.lead||'')}</p></div>
      <div class="route-act"><span class="route-count">已打卡 ${checked.length}/${route.spots?route.spots.length:0}</span>
      <button class="mini-btn ghost" data-share-route="${line}">分享我的走线</button></div></div>
      <div class="spot-list">${spots}</div>`:
      '<p class="route-missing">当前未配置研学路线，可在管理后台「研学路线」中新增。</p>'}
    ${agriHtml}
  </div>`;
}

/* ---------- 渲染：故事页 ---------- */
function viewStory(id){
  const c=CHAIRS.find(x=>x.id===id); if(!c) return viewHome();
  markStarted(id);
  const all=CHAIRS.map(x=>x.id); const i=all.indexOf(id);
  const prev=CHAIRS[(i-1+CHAIRS.length)%CHAIRS.length];
  const next=CHAIRS[(i+1)%CHAIRS.length];

  const obs=c.obs.map((o,j)=>`<div class="obs-card" data-obs="${id}:${j}">
    <span class="tag ${o.kind==='史实'?'fact':'design'}">${o.kind==='史实'?'有史料依据':'设计细节'}</span>
    <h6>${o.t}</h6><div class="pre">点击查看说明</div>
    <div class="full">${o.d}<br><span class="org" style="color:#8a765a">出处：${esc(srcOrg(o.src))}</span></div>
  </div>`).join('');

  const relics=c.relic.map((r,j)=>`<div class="relic-card" data-rel="${j}"><div class="dot">${j+1}</div><h5>${r.t}</h5><div class="pre">${r.pre}</div><div class="full">${r.d}</div><span class="more">点击展开</span></div>`).join('');
  const tlNav=c.tl.map((n,j)=>`<button class="tl-node ${j===0?'on':''}" data-tl="${j}"><div class="y">${n.y}</div><div class="tt">${n.t}</div></button>`).join('');
  const tlPane=c.tl.map((n,j)=>`<div class="tl-pane ${j===0?'on':''}" data-tlpan="${j}"><span class="y-badge">${n.y}</span><h6>${n.t}</h6><p>${n.d}</p></div>`).join('');
  const stats=c.stat.map(s=>`<div class="stat-card"><div class="v">${s.v}<small>${s.u}</small></div><div class="d">${s.d}</div></div>`).join('');
  const spirits=c.spirit.map(s=>`<div class="sp-card"><div class="ic" style="background:${s.c}1f;color:${s.c}">${spiritIcon(s.t)}</div><h5>${s.t}</h5><p>${s.d}</p></div>`).join('');

  const routeHtml=routeSection(id);

  return `
  <section class="story">
    <div class="story-hero">
      <div class="frame">
        <div class="cmp" data-cmp>
          <div class="${c.img} cmp-bg" role="img" aria-label="${c.name}今日场景（AI概念示意）"></div>
          <div class="${c.img}-past cmp-over" data-cmp-over role="img" aria-label="${c.name}昔日场景（AI概念示意）"></div>
          <div class="cmp-handle" data-cmp-handle><span class="cmp-knob"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7L4 12l5 5"/><path d="M15 7l5 5-5 5"/></svg></span></div>
          <div class="cmp-tag l">昔 · 回望</div>
          <div class="cmp-tag r">今 · 见证</div>
          <div class="cmp-note">点击画面，自动切换今昔</div>
        </div>
        <div class="veil"></div>
        <div class="titles">
          <span class="tag">${c.idx} · ${c.tag} · ${c.period}</span>
          <h2>${c.name}</h2>
          <div class="subline">${c.person} —— ${c.subline}</div>
          <button class="letter-again" data-letter-again="${c.id}">✉ 再读一次这把椅子的来信</button>
        </div>
      </div>
    </div>
    <div class="story-body">

      <div class="sec">
        <div class="sec-h"><span class="num">01</span><div><h4>物件观察</h4><div class="sub">先认识这把椅子：哪些是史实，哪些是设计表达</div></div><div class="rule"></div></div>
        <div class="id-card ${c.identity.cat==='A'?'cat-a':''}">
          <h5>${c.identity.title}</h5>
          <div class="row"><b>物件性质：</b>${c.identity.catLabel}</div>
          <div class="cat-gloss">${c.identity.cat==='A'
            ? 'A 类＝真的文物：原件在纪念馆里，本页图片是示意图。'
            : 'C 类＝不是文物：为了把故事讲清楚而做的意象，别把它当历史实物。'}</div>
          <div class="line">${c.identity.desc}</div>
          <div class="facts"><b>有史料依据的事实：</b>${c.identity.facts}</div>
          <div class="descexp"><b>设计说明：</b>${c.identity.designNote} ${c.identity.designExp}</div>
          <div class="src-list"><b>史料来源：</b>本节共引用 ${(c.sources||[]).length} 条权威来源。<a href="javascript:;" class="jump-src" data-jump="src">跳到下方史料来源 ↓</a></div>
        </div>
        <div class="obs-grid">${obs}</div>
      </div>

      <div class="sec">
        <div class="sec-h"><span class="num">02</span><div><h4>人物与历史背景</h4><div class="sub">人物简介、关键事件与史料来源</div></div><div class="rule"></div></div>
        <p class="sec-note">下面每条事实都挂了来源：点「查看来源」可打开党报 / 政府官网原文。共 ${(c.sources||[]).length} 条，前 3 条常显，其余可展开。</p>
        ${c.intro.map(p=>`<p>${p}</p>`).join('')}
        <div class="quote"><div class="q">${c.quote.q}</div><div class="q-src">${c.quote.src}</div></div>
        <div class="relic" data-relic>${relics}</div>
        ${srcList(id)}
      </div>

      <div class="sec">
        <div class="sec-h"><span class="num">03</span><div><h4>相关治理 / 改革实践</h4><div class="sub">点击节点，查看每个关键时间点</div></div><div class="rule"></div></div>
        <div class="tl" data-tl>${tlNav}<div>${tlPane}</div></div>
        <div style="margin-top:16px" class="stats">${stats}</div>
      </div>

      <div class="sec">
        <div class="sec-h"><span class="num">04</span><div><h4>当地农业农村背景</h4><div class="sub">顶部画布左右拖动滑块 —— 回望昔日，见证今朝</div></div><div class="rule"></div></div>
        <div class="duo-grid">
          <div class="duo-card duo-past"><div class="where">${c.duo.past.where}</div><h5>${c.duo.past.t}</h5><p>${c.duo.past.d}</p></div>
          <div class="duo-card duo-now"><div class="where">${c.duo.now.where}</div><h5>${c.duo.now.t}</h5><p>${c.duo.now.d}</p></div>
        </div>
      </div>

      <div class="sec">
        <div class="sec-h"><span class="num">05</span><div><h4>当代启示</h4><div class="sub">${c.spiritName} · 从历史实践到今天的农业农村</div></div><div class="rule"></div></div>
        <div class="spirit">${spirits}</div>
        <div class="echo"><div class="where">${c.echo.where}</div><h5>${c.echo.t}</h5><p>${c.echo.d}</p></div>
      </div>

      ${routeHtml?`<div class="sec">
        <div class="sec-h"><span class="num">06</span><div><h4>走线研学与乡村产业</h4><div class="sub">沿线打卡、了解当地农产品与产业，再把这段走线分享给同学</div></div><div class="rule"></div></div>
        ${routeHtml}
      </div>`:''}

      <div class="sec">
        ${studySection(id)}
      </div>
    </div>
    <div class="story-nav">
      <button class="snav-btn" data-go="${prev.id}">${icArrowL()}<span><div class="dir">上一把</div><div class="nm">${prev.name}</div></span></button>
      <button class="snav-btn next" data-go="${next.id}"><span><div class="dir">下一把</div><div class="nm">${next.name}</div></span>${icArrowR()}</button>
    </div>
  </section>`;
}

/* ---------- 椅子与我的关系：三问 → 行动宣言 ---------- */
const PLEDGE_QS=[
  { key:"q1", chair:"jianshou", dim:"乡土情怀", q:"坐进「坚守之椅」：如果这把椅子就在你村里，你愿意为谁守住什么？",
    opts:["留守老人助餐","古树保护","村史记录","农产品包装"] },
  { key:"q2", chair:"fumin", dim:"小康之家", q:"坐进「富民之椅」：一户农家眼下最需要的是什么？",
    opts:["销路","技术","冷链","品牌","游客"] },
  { key:"q3", chair:"dangjia", dim:"农民主体", q:"坐进「当家之椅」：这件事，该由谁来决定？",
    opts:["村民点单、我来接单","村民议事会商议决定","返乡青年牵头","老农与村支书把关"] }
];
function pledgeText(){
  const p=state.pledge||{};
  const parts=[];
  if(p.q1) parts.push('愿为村里守住「'+p.q1+'」');
  if(p.q2) parts.push('认为一户农家眼下最需要「'+p.q2+'」');
  if(p.q3) parts.push('相信这件事应由「'+p.q3+'」');
  if(parts.length<3) return "";
  return '我'+parts.join('，')+'。';
}
/* 三问解锁条件：必须先走进对应那把椅子，才能回答那一问 */
function pledgeUnlocked(q){ return !!state.startedLines[q.chair]; }
function pledgeMissing(){
  const p=state.pledge||{};
  return PLEDGE_QS.filter(q=>!p[q.key]).map(q=>({key:q.key, name:(CHAIRS.find(c=>c.id===q.chair)||{}).name||'',
    locked:!pledgeUnlocked(q)}));
}

/* ---------- 第一人称信件：点击画卷上的椅子，先“坐下去”，再进入故事 ----------
 * force=true 时忽略「已读过」标记，用于故事页的「再读一次」按钮 */
function openLetter(line, force){
  const c=CHAIRS.find(x=>x.id===line);
  if(!c){ navTo(line); return; }
  if(state.letterSeen[line] && !force){ navTo(line); return; }
  const L=c.letter||{};
  const ov=document.createElement('div'); ov.className='letter-overlay show';
  ov.innerHTML=`<div class="letter-card" role="dialog" aria-label="${esc(c.name)}的一封信">
    <div class="lt-tag">${esc(c.name)} · ${esc(c.person)}</div>
    <h3>${esc(L.title||'')}</h3>
    <p class="lt-body">${esc(L.body||'')}</p>
    <div class="lt-from">${esc(L.from||'')}</div>
    <div class="lt-note">以上为据权威史料的情景化改写，物件细节以纪念馆实物与说明为准。</div>
    <div class="lt-actions">
      <button class="btn btn-primary" data-lt-go>坐下，开始这段研学</button>
      <button class="btn btn-ghost" data-lt-skip>跳过，直接进入</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const go=()=>{ state.letterSeen[line]=true; saveState(); ov.remove(); navTo(line); };
  ov.querySelector('[data-lt-go]').onclick=go;
  ov.querySelector('[data-lt-skip]').onclick=go;
  ov.addEventListener('click',e=>{ if(e.target===ov) go(); });
}

/* ---------- 渲染：落点页 ---------- */
function viewFinal(){
  const started=CHAIRS.filter(c=>state.startedLines[c.id]);
  const done=CHAIRS.filter(c=>state.completedLines[c.id]);
  const names=started.map(c=>c.name).join('、');
  let lead;
  if(!started.length){
    lead='三把椅子，三段旅程。你还没有走进任何一段——任选一把坐下，从这里开始。';
  }else if(done.length===CHAIRS.length){
    lead='三把椅子，三段旅程，你已全部走完。五项研学任务都已完成，这里是旅程的落点：生成你的乡村行动档案，或回到首页再看一遍。';
  }else if(started.length===CHAIRS.length){
    lead=`三把椅子，三段旅程，你已走过：${names}。其中 ${done.length}/3&nbsp;条完成了全部研学任务——把剩下的题目做完，档案才算完整。`;
  }else{
    lead=`三把椅子，三段旅程，你已走过 ${started.length} 段：${names}。还有 ${3-started.length} 段没走——继续走完，档案里才会记录一段完整的研学。`;
  }
  const chips=CHAIRS.map((c,i)=>{
    const on=!!state.startedLines[c.id], fin=!!state.completedLines[c.id];
    return `<div class="m-chip ${on?'on':''}"><div class="c-ic" style="background:${i===0?'rgba(200,68,42,.12)':i===1?'rgba(217,154,43,.16)':'rgba(95,143,74,.12)'};color:${i===0?'#c8442a':i===1?'#c07f1d':'#5f8f4a'}">${i===0?icShield():i===1?icSprout():icScale()}</div><b>${c.name}</b><span>${c.person}</span><span class="chip-state">${fin?'已完成':on?'进行中':'未走进'}</span></div>`;
  }).join('');
  const p=state.pledge||{};
  const pledgeQs=PLEDGE_QS.map((q,i)=>{
    const open=pledgeUnlocked(q);
    const chairName=(CHAIRS.find(c=>c.id===q.chair)||{}).name||'';
    const opts=q.opts.map(o=>`<button class="pl-opt ${p[q.key]===o?'on':''}${open?'':' locked'}"
        ${open?'':'disabled aria-disabled="true"'} data-pledge="${q.key}:${esc(o)}">${esc(o)}</button>`).join('');
    const lockNote=open?'':`<div class="pl-lock">先走进「${chairName}」，才能回答这一问</div>`;
    return `<div class="pledge-q ${open?'':'is-locked'}">
      <div class="pl-h"><span class="pl-num">${['壹','贰','叁'][i]}</span><div class="pl-t"><b>${q.q}</b><span>${q.dim}</span></div></div>
      <div class="pl-opts">${opts}</div>
      ${lockNote}
    </div>`;
  }).join('');
  const decl=pledgeText();
  const missing=pledgeMissing();
  const missingTxt=missing.map(m=>m.name+(m.locked?'（未走进）':'（已走进，尚未回答）')).join('、');
  const declBlock=decl
    ? `<div class="declare-card">
         <div class="dc-tag">我的乡村行动宣言</div>
         <p class="dc-text">“${esc(decl)}”</p>
         <div class="dc-foot">坚守是初心，富民是路径，当家是主体 —— 从坐下来的感动，到站起来的行动。</div>
         <button class="btn btn-green" data-share-pledge>分享我的宣言</button>
       </div>`
    : `<div class="declare-hint">${missingTxt?`还差：${esc(missingTxt)}。三问答完才能生成宣言——它写的是你的选择，不是一句口号。`:'回答上面三个问题，即可生成你的「乡村行动宣言」，并写入行动档案首页。'}</div>`;
  const mc=state.memoryCard;
  const mcOpts=(MEMORY_ITEMS||[]).map(m=>`<option ${mc&&mc.item===m?'selected':''}>${m}</option>`).join('');
  const mcCard=mc
    ? `<div class="memory-card">
         <div class="mc-tag">乡村记忆卡</div>
         <div class="mc-icon">${mcIcon(mc.item)}</div>
         <div class="mc-item">${esc(mc.item)}</div>
         <p class="mc-text">我替村里记住——“${esc(mc.text)}”</p>
         <div class="mc-foot">${esc(state.name||'研学同学')} · ${esc(mc.at||'')}</div>
         <button class="btn btn-ghost" data-mc-share>分享记忆卡</button>
       </div>`
    : '';
  return `
  <section class="final">
    <span class="badge">红色乡村数字研学 · 赓续红色血脉，设计赋能乡村</span>
    <h2>三把椅子，<span class="gold">一程</span><span class="red">红乡</span></h2>
    <p class="lead">舍不得群众，才懂得坚守；让群众富起来，才是富民；让群众自己说了算，才是当家。助农不是附加任务，而是三把椅子的当代续写——现在，轮到你回答「椅子与我的关系」。</p>
    <div class="merge">${chips}</div>
    <p style="text-align:center;font-size:13px;color:var(--soil);margin-top:10px">${lead}</p>

    <div class="pledge-block">
      <h3 class="pl-title">三椅接力 · 椅子与我的关系</h3>
      <div class="pledge-grid">${pledgeQs}</div>
      ${declBlock}
    </div>

    <div class="pledge-block">
      <h3 class="pl-title">乡村记忆卡 · 我替村里记住什么</h3>
      <div class="memory-form">
        <select id="mcItem" aria-label="选择记忆素材">${mcOpts}</select>
        <input type="text" id="mcText" maxlength="40" placeholder="写一句你想替村里记住的话（40 字内）" value="${mc?esc(mc.text):''}">
        <button class="btn btn-primary" data-mc-gen>生成记忆卡</button>
      </div>
      ${mcCard}
    </div>

    <div class="slogan">赓续红色血脉 · 设计赋能乡村<small>椅座·红乡 —— 坐下读懂三把椅子，起身留下助农行动</small></div>
    <div class="final-cta">
      <button class="btn btn-primary" data-open-report>生成 / 查看乡村行动档案</button>
      <button class="btn btn-green" data-nav="passport">领取助农护照</button>
      <button class="restart" data-nav="home">${icRestart()} 回到首页继续研学</button>
    </div>
  </section>`;
}

/* ---------- 顶部导航 ---------- */
function renderCrumbs(cur){
  const items=[`<button class="crumb" data-nav="home">首页</button>`];
  items.push(...CHAIRS.map(c=>`<button class="crumb ${c.id===(cur||'')?'on':''}" data-nav="${c.id}">${c.name}</button>`));
  items.push(`<button class="crumb ${cur==='final'?'on':''}" data-nav="final">研学落点</button>`);
  crumbs.innerHTML=items.join('');
}

/* ---------- Canvas 动态引擎（reduced-motion 时不启动） ---------- */
let _dyn=null;
function initDyn(){
  const canv=document.getElementById('dynCanvas');
  if(!canv||_dyn||reduceMotion) return;
  const ctx=canv.getContext('2d');
  const dpr=Math.min(window.devicePixelRatio||1,2);
  let W=0,H=0;
  function size(){const r=canv.getBoundingClientRect();W=r.width;H=r.height;canv.width=Math.round(W*dpr);canv.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  size(); window.addEventListener('resize',size);
  const grains=[];
  function spawn(){return {x:Math.random()*W*0.95,y:H*(0.55+Math.random()*0.45),vx:0.2+Math.random()*0.7,vy:-(0.12+Math.random()*0.45),s:0.6+Math.random()*1.7,a:0.16+Math.random()*0.4};}
  for(let i=0;i<180;i++)grains.push(spawn());
  function drawTrees(t,b){[ [0.085,0.24,0.105],[0.16,0.30,0.085],[0.235,0.21,0.11],[0.12,0.37,0.07],[0.27,0.31,0.075] ].forEach((d,i)=>{
      const sway=Math.sin(t*0.8+i*2.3)*4*b; const cx=W*d[0]+sway, cy=H*d[1], r=Math.min(W,H)*d[2];
      const br=0.5+0.5*Math.sin(t*1.2+i*1.7);
      const g=ctx.createRadialGradient(cx,cy-r*0.4,r*0.12,cx,cy,r);
      g.addColorStop(0,`rgba(104,150,66,${(0.15+0.11*b*br).toFixed(3)})`);
      g.addColorStop(0.72,`rgba(78,116,50,${(0.09+0.07*b*br).toFixed(3)})`);
      g.addColorStop(1,'rgba(78,116,50,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,6.2832);ctx.fill();});}
  function drawGrains(t,bL,bM,bR){grains.forEach(g=>{const b=g.x<W*0.335?bL:(g.x<W*0.665?bM:bR);
      g.x+=g.vx*b;g.y+=g.vy*b;
      if(g.y<H*0.04||g.x>W*0.99||Math.random()<0.006){const s=spawn();g.x=s.x;g.y=s.y;g.vx=s.vx;g.vy=s.vy;g.s=s.s;g.a=s.a;}
      ctx.fillStyle=`rgba(242,205,120,${g.a.toFixed(3)})`;ctx.beginPath();ctx.arc(g.x,g.y,g.s,0,6.2832);ctx.fill();});}
  /* 细碎麦穗颗粒动效已统一覆盖全部画卷（drawGrains 全域绘制），麦浪与红旗波浪动效移除 */
  function tick(t){
    const pano=document.getElementById('pano');
    const hover=pano?pano.dataset.hover||'':'';
    const bL=hover==='jianshou'?1.7:1, bM=hover==='fumin'?1.7:1, bR=hover==='dangjia'?1.7:1;
    ctx.clearRect(0,0,W,H);
    drawTrees(t,bL);drawGrains(t,bL,bM,bR);
    _dyn=requestAnimationFrame(tick);
  }
  _dyn=requestAnimationFrame(tick);
}

/* ---------- 今昔滑块 ---------- */
function initCompare(){
  const cmp=document.querySelector('[data-cmp]'); if(!cmp) return;
  const over=cmp.querySelector('[data-cmp-over]');
  const handle=cmp.querySelector('[data-cmp-handle]');
  // 点击画面即自动切换今/昔（替代原手动拖动），带平滑过渡
  over.style.transition='clip-path .6s ease';handle.style.transition='left .6s ease';
  let showNow=true;
  const apply=p=>{over.style.clipPath='inset(0 '+(100-p)+'% 0 0)';handle.style.left=Math.min(96,Math.max(4,p))+'%';};
  apply(62);
  cmp.addEventListener('click',e=>{
    if(e.target.closest('a')) return;
    showNow=!showNow;
    apply(showNow?100:0);
  });
}

/* ---------- 自动巡游：沿红绸依次点亮三把椅子，再进入第一把 ---------- */
const PLAY_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h13"/><path d="M12 6l6 6-6 6"/><path d="M20 3v18"/></svg>';
function initTour(){
  const btn=document.querySelector('[data-tour]'); if(!btn) return;
  btn.onclick=()=>{
    const knots=[...document.querySelectorAll('.river .knot')];
    const hots=[...document.querySelectorAll('.hot')];
    if(!knots.length || reduceMotion){ navTo('jianshou'); return; }
    if(btn.disabled) return;
    btn.disabled=true;
    let i=0;
    const step=()=>{
      knots.forEach(k=>k.classList.remove('on'));
      hots.forEach(h=>h.classList.remove('active'));
      if(knots[i]) knots[i].classList.add('on');
      if(hots[i]) hots[i].classList.add('active');
      i++;
      if(i<knots.length) setTimeout(step, 850);
      else setTimeout(()=>{ navTo('jianshou'); }, 600);
    };
    step();
  };
}

/* ---------- 报告弹层 ---------- */
function reportHTML(){
  const name=state.name||'';
  const lines=CHAIRS.filter(c=>state.startedLines[c.id]);
  const answeredAll=Object.entries(state.quiz).filter(([,v])=>v.submitted);
  // 逐题对照正确答案计算实际正确数
  let correctCnt=0; answeredAll.forEach(([qid,v])=>{const q=QUIZZES.find(x=>x.id===qid); if(q&&v.sel===q.ans) correctCnt++;});
  const totalAnswered=answeredAll.length;
  const rate=totalAnswered?Math.round(correctCnt/totalAnswered*100):0;
  const date=new Date().toLocaleString('zh-CN');

  const rows=CHAIRS.map(c=>{
    const qs=QUIZZES.filter(q=>q.line===c.id);
    const an=qs.filter(q=>state.quiz[q.id]&&state.quiz[q.id].submitted).length;
    const co=qs.filter(q=>state.quiz[q.id]&&state.quiz[q.id].submitted&&state.quiz[q.id].sel===q.ans).length;
    const started=state.startedLines[c.id]?'已进入':'未进入';
    return `<tr><td>${c.name}（${c.person}）</td><td>${started}</td><td>${an}/${qs.length}</td><td>${co}</td></tr>`;
  }).join('');

  const openRows=OPENS.map(o=>{
    const t=state.open[o.id]&&state.open[o.id].text;
    const lineName=(CHAIRS.find(c=>c.id===o.line)||{}).name||'';
    const short=o.q.length>28?o.q.slice(0,28)+'…':o.q;
    return `<div class="row"><b>${esc(lineName)} · ${esc(short)}</b><br><span class="${t?'':'muted'}">${t?esc(t):'（未作答）'}</span></div>`;
  }).join('');

  // 只列“本次实际点开查看过”的史料，绝不把全部来源当作已查看
  const viewedIds=[];
  CHAIRS.forEach(c=>{ (state.sourcesViewed[c.id]||[]).forEach(sid=>{ if(viewedIds.indexOf(sid)<0) viewedIds.push(sid); }); });
  const srcAll=viewedIds.map(sid=>{
    const s=SOURCES[sid]; if(!s) return '';
    return `<li>${esc(s.org)}《${esc(s.name)}》 · <a href="${s.url}" target="_blank" rel="noopener">原文</a> · 已核实</li>`;
  }).join('');

  // S2：按已进入的故事线统计 5 项研学任务完成情况
  const startedLines=CHAIRS.filter(c=>state.startedLines[c.id]);
  const taskDefs=[
    {key:'obs', name:'物件观察',  ok:l=>(state.observed[l]||[]).length>0},
    {key:'src', name:'史料阅读',  ok:l=>(state.sourcesViewed[l]||[]).length>0},
    {key:'quiz',name:'知识测验',  ok:l=>QUIZZES.filter(q=>q.line===l).every(q=>state.quiz[q.id]&&state.quiz[q.id].submitted)},
    {key:'sort',name:'事件排序',  ok:l=>{const s=SORTS.find(x=>x.line===l);return !s||(state.sort[s.id]&&state.sort[s.id].submitted);}},
    {key:'open', name:'农业关联',  ok:l=>{const o=OPENS.find(x=>x.line===l);return !o||(state.open[o.id]&&state.open[o.id].text&&state.open[o.id].text.trim().length>0);}}
  ];
  let totalTasks=0, doneTasks=0; const missingList=[]; const missingTasks=[];
  startedLines.forEach(c=>{
    taskDefs.forEach(t=>{
      totalTasks++;
      if(t.ok(c.id)) doneTasks++;
      else { missingList.push(`${c.name}·${t.name}`); if(missingTasks.indexOf(t.name)<0) missingTasks.push(t.name); }
    });
  });
  const allDone=totalTasks>0 && doneTasks===totalTasks;
  const banner = totalTasks===0
    ? `<div class="report-banner warn">你尚未进入任何故事线。本档案仅记录已进入故事线的实际作答情况。</div>`
    : allDone
      ? `<div class="report-banner ok">本次研学任务已全部完成（${doneTasks}/${totalTasks} 项）。</div>`
      : `<div class="report-banner warn">本次研学为部分完成：已完成 ${doneTasks}/${totalTasks} 项任务，还差 ${missingList.length} 项（${missingTasks.join('、')}）。未完成的部分不显示成绩，也不默认完成。</div>`;

  // S3：已进入故事线的物件身份说明
  const idBlocks = startedLines.map(c=>{
    const id=c.identity||{};
    return `<div class="row"><b>${esc(c.name)} · 物件身份：</b>${esc(id.catLabel||'')}。${esc(id.desc||'')} ${esc(id.designNote||'')}</div>`;
  }).join('');

  const pDecl=pledgeText();
  const p=state.pledge||{};
  const pAction=(p.q1&&p.q2&&p.q3)
    ? `<div class="row"><b>我为村里留下的动作：</b>把「${esc(p.q1)}」这件事，用「${esc(p.q2)}」的办法，交给「${esc(p.q3)}」——它对应一个具体的村、一件具体的事，而不是一句口号。</div>`
    : '';
  const pledgeBlock=pDecl
    ? `<div class="pledge-in-report"><div class="pr-tag">我的乡村行动宣言</div><p>“${esc(pDecl)}”</p><div class="pr-foot">坚守是初心，富民是路径，当家是主体 —— 乡土情怀是根，小康之家是路，农民当家是魂。</div></div>${pAction}`
    : '';
  const mcRow=state.memoryCard
    ? `<div class="row"><b>乡村记忆卡：</b>${esc(state.memoryCard.item)} —— “${esc(state.memoryCard.text)}”</div>`
    : '';

  return `
  <h3>乡村行动档案</h3>
  <div class="r-sub">椅座·红乡 · 红色乡村数字研学平台 · 生成时间 ${date}</div>
  ${banner}
  <label for="rname">你的姓名 / 昵称（必填，登录后随报告保存到服务端）</label>
  <input type="text" id="rname" value="${esc(name)}" placeholder="例如：研学学员" maxlength="30">
  <div class="field-err" id="rnameErr">请填写姓名或昵称后再生成报告。</div>
  <div class="report-doc" id="reportDoc">
    <div class="row"><b>研学学员：</b>${name?esc(name):'（未填写）'}</div>
    <div class="row"><b>研学日期：</b>${date}</div>
    ${pledgeBlock}${mcRow}
    <div class="row"><b>已进入故事线：</b>${lines.length?lines.map(c=>c.name).join('、'):'（尚未进入任何故事线）'}</div>
    <h4>物件身份说明</h4>
    ${idBlocks||'<div class="row muted">（尚未进入任何故事线）</div>'}
    <h4>客观题作答情况（未作答不计分）</h4>
    <table><colgroup><col style="width:40%"><col style="width:20%"><col style="width:20%"><col style="width:20%"></colgroup>
      <tr><th>故事线</th><th>状态</th><th>已答</th><th>正确</th></tr>${rows}</table>
    <div class="row">实际作答 <b>${totalAnswered}</b> 道，正确 <b>${correctCnt}</b> 道，实际正确率 <b>${rate}%</b>。</div>
    <h4>农业农村关联 · 开放题自我总结</h4>
    ${openRows}
    <h4>研学过程中查看过的史料来源</h4>
    <ul style="margin-left:18px;font-size:13px;line-height:1.9;color:#3a2c1f">${srcAll||'<li>（尚未查看史料来源）</li>'}</ul>
    <div class="storage-note">本档案由系统根据你的实际作答记录生成：未作答的任务不显示成绩、不默认完成；未填写的感悟不会自动补写。行动宣言与记忆卡来自你在「三椅接力」中的真实选择。${DEMO?'':'未登录时暂存于当前浏览器，登录后保存到服务端数据库。'}</div>
  </div>
  <div class="report-actions">
    <button class="btn btn-primary" data-gen-report>生成 / 更新报告</button>
    <button class="btn btn-green" data-print-report>打印 / 保存为 PDF</button>
    <button class="btn btn-ghost" data-share-report>分享报告</button>
    <button class="btn btn-ghost" data-close-report>返回继续学习</button>
  </div>`;
}

function openReport(){
  let ov=document.querySelector('.report-overlay');
  if(!ov){
    ov=document.createElement('div'); ov.className='report-overlay';
    ov.innerHTML='<div class="report-modal" role="dialog" aria-label="乡村行动档案"></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',e=>{ if(e.target===ov) closeReport(); });
  }
  ov.querySelector('.report-modal').innerHTML=reportHTML();
  ov.classList.add('show');
  bindReportModal(ov);
}
function closeReport(){ const ov=document.querySelector('.report-overlay'); if(ov) ov.classList.remove('show'); }
function bindReportModal(ov){
  ov.querySelector('[data-gen-report]').onclick=()=>{
    const inp=ov.querySelector('#rname'); const v=inp.value.trim();
    const err=ov.querySelector('#rnameErr');
    if(!v){ err.classList.add('show'); inp.focus(); return; }
    err.classList.remove('show');
    state.name=v; state.reportAt=new Date().toLocaleString('zh-CN'); saveState();
    // 报告留存到服务端（已登录时）
    try{
      if(window.RRX_API && window.RRX_API.isLoggedIn()){
        window.RRX_API.saveReport(v, { name:v, reportAt:state.reportAt, state:state }).catch(function(){});
      }
    }catch(e){}
    ov.querySelector('.report-modal').innerHTML=reportHTML();
    bindReportModal(ov);
  };
  ov.querySelector('[data-print-report]').onclick=()=>window.print();
  ov.querySelector('[data-share-report]').onclick=()=>shareReport();
  const c=ov.querySelector('[data-close-report]'); if(c) c.onclick=closeReport;
}

/* ---------- 事件绑定 ---------- */
function navTo(v){ location.hash=v; }

/* 分享走线：优先调用系统分享面板，其次复制文案 */
function shareRoute(line){
  const route=(ROUTES||[]).find(r=>r.line===line);
  const count=(state.routeCheck[line]||[]).length;
  const text='我在「椅座·红乡」完成'+((route&&route.title)||'红色乡村研学走线')+'，已打卡 '+count+' 个点位。';
  shareText('椅座·红乡 · 走线研学',text,location.href.split('#')[0]+'#'+line);
}
/* 分享报告：与走线分享共用同一套降级逻辑（系统分享 → 复制 → 手动复制） */
function shareReport(){
  const name=state.name||'研学同学';
  const done=Object.keys(state.completedLines).length;
  const decl=pledgeText();
  const text=name+' 在「椅座·红乡」坐过三把椅子，已走完 '+done+'/'+CHAIRS.length+' 条故事线，生成了乡村行动档案。'+(decl?'我的行动宣言：'+decl:'');
  shareText('椅座·红乡 · 乡村行动档案',text,location.href.split('#')[0]+'#final');
}
function shareText(title,text,url){
  if(navigator.share){
    navigator.share({title:title,text:text,url:url}).catch(()=>{});
    return;
  }
  const content=text+'\n'+url;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(content)
      .then(()=>alert('分享文案已复制，可粘贴给同学。'))
      .catch(()=>window.prompt('复制分享文案：',content));
  }else{
    window.prompt('复制分享文案：',content);
  }
}
function bind(){
  // 导航
  document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>navTo(el.dataset.nav==='home'?'':el.dataset.nav));
  document.querySelectorAll('[data-go]').forEach(el=>{
    const go=el.dataset.go;
    // 故事内的「上一把/下一把」不打断叙事，直接跳转；其余入口统一先"坐下"（弹第一人称信件）
    if(el.closest('.story-nav')){ el.onclick=()=>navTo(go); }
    else el.onclick=()=>openLetter(go);
  });
  document.querySelectorAll('[data-open-report]').forEach(el=>el.onclick=openReport);

  // 走线研学：打卡 / 分享
  document.querySelectorAll('[data-check]').forEach(btn=>{
    btn.onclick=()=>{
      const [line,idx]=btn.dataset.check.split(':');
      const i=parseInt(idx,10);
      if(!state.routeCheck[line]) state.routeCheck[line]=[];
      const arr=state.routeCheck[line];
      const was=arr.indexOf(i)>=0;
      if(was) arr.splice(arr.indexOf(i),1); else arr.push(i);
      saveState();
      const now=!was;
      btn.textContent=now?'已打卡':'打卡';
      btn.classList.toggle('ghost',now);
      const card=btn.closest('.spot-card'); if(card) card.classList.toggle('on',now);
      const dot=card?card.querySelector('.spot-dot'):null; if(dot) dot.textContent=now?'✓':String(i+1);
      const cnt=document.querySelector('.route-count');
      if(cnt){
        const route=(ROUTES||[]).find(r=>r.line===line);
        cnt.textContent='已打卡 '+arr.length+'/'+(route&&route.spots?route.spots.length:0);
      }
    };
  });
  document.querySelectorAll('[data-share-route]').forEach(btn=>{
    btn.onclick=()=>shareRoute(btn.dataset.shareRoute);
  });

  document.querySelectorAll('.hot').forEach(el=>{
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openLetter(el.dataset.go);}};
  });
  document.querySelectorAll('.river .knot').forEach(k=>{ k.onclick=()=>openLetter(k.dataset.knot); });
  // 故事页「再读一次来信」：忽略已读标记，强制弹出
  document.querySelectorAll('[data-letter-again]').forEach(b=>{
    b.onclick=e=>{ e.stopPropagation(); openLetter(b.dataset.letterAgain, true); };
  });
  // 「跳到史料来源」
  document.querySelectorAll('[data-jump="src"]').forEach(a=>{
    a.onclick=e=>{ e.preventDefault(); const t=document.querySelector('.src-main'); if(t) t.scrollIntoView({behavior:'smooth',block:'center'}); };
  });

  // 三椅接力：三问选择 → 行动宣言
  document.querySelectorAll('[data-pledge]').forEach(btn=>{
    btn.onclick=()=>{
      const sep=btn.dataset.pledge.indexOf(':');
      const k=btn.dataset.pledge.slice(0,sep), v=btn.dataset.pledge.slice(sep+1);
      state.pledge[k]=v; saveState(); render();
    };
  });
  const spBtn=document.querySelector('[data-share-pledge]');
  if(spBtn) spBtn.onclick=()=>{
    shareText('椅座·红乡 · 我的乡村行动宣言',
      pledgeText()+' 从坐下来的感动，到站起来的行动。',
      location.href.split('#')[0]+'#final');
  };
  // 乡村记忆卡
  const mcGen=document.querySelector('[data-mc-gen]');
  if(mcGen) mcGen.onclick=()=>{
    const sel=document.getElementById('mcItem'), inp=document.getElementById('mcText');
    const t=(inp.value||'').trim();
    if(!t){ inp.focus(); return; }
    state.memoryCard={ item:sel.value, text:t, at:new Date().toLocaleString('zh-CN') };
    saveState(); render();
  };
  const mcShare=document.querySelector('[data-mc-share]');
  if(mcShare) mcShare.onclick=()=>{
    const m=state.memoryCard; if(!m) return;
    shareText('椅座·红乡 · 乡村记忆卡',
      '【乡村记忆卡】'+m.item+' —— 我替村里记住：“'+m.text+'”',
      location.href.split('#')[0]);
  };

  const pano=document.getElementById('pano');
  if(pano){
    document.querySelectorAll('.hot').forEach(el=>{
      el.addEventListener('mouseenter',()=>pano.dataset.hover=el.dataset.go);
      el.addEventListener('mouseleave',()=>delete pano.dataset.hover);
    });
  }

  // 物件观察卡 / relic 展开
  document.querySelectorAll('.obs-card').forEach(card=>{
    card.onclick=()=>{ card.classList.toggle('open'); const [line,idx]=card.dataset.obs.split(':'); markObserved(line, idx); };
  });
  document.querySelectorAll('.relic-card').forEach(card=>{ card.onclick=()=>card.classList.toggle('open'); });

  // 史料来源点击：外部链接强制新窗口打开；阻止当前页面被外部站点导航带走，保证随时可返回本页继续研学
  document.querySelectorAll('[data-src-open]').forEach(a=>{
    a.onclick=(ev)=>{
      ev.preventDefault();
      const line=(location.hash.replace('#',''));
      markSource(line, a.dataset.srcOpen);
      const w=window.open(a.href,'_blank','noopener');
      if(!w) window.prompt('未能自动打开外部来源，请复制此链接在浏览器新标签粘贴打开：', a.href);
    };
  });

  // 时间线
  const tl=document.querySelector('.tl');
  if(tl){
    tl.querySelectorAll('.tl-node').forEach(n=>{
      n.onclick=()=>{
        tl.querySelectorAll('.tl-node').forEach(x=>x.classList.remove('on'));
        tl.querySelectorAll('.tl-pane').forEach(p=>p.classList.remove('on'));
        n.classList.add('on');
        tl.querySelector('.tl-pane[data-tlpan="'+n.dataset.tl+'"]').classList.add('on');
      };
    });
  }

  // 客观题：选择 / 提交 / 重做
  document.querySelectorAll('[data-qopt]').forEach(lb=>{
    lb.onclick=()=>{
      if(lb.querySelector('input').disabled) return;
      const [qid,idx]=lb.dataset.qopt.split(':');
      if(!state.quiz[qid]) state.quiz[qid]={};
      state.quiz[qid].sel=parseInt(idx,10); state.quiz[qid].submitted=false;
      saveState(); refreshStudy();
    };
  });
  document.querySelectorAll('[data-qsubmit]').forEach(b=>{
    b.onclick=()=>{
      const qid=b.dataset.qsubmit;
      if(state.quiz[qid]==null||state.quiz[qid].sel==null){ alert('请先选择一个答案。'); return; }
      state.quiz[qid].submitted=true; saveState(); refreshStudy();
    };
  });
  document.querySelectorAll('[data-qretry]').forEach(b=>{
    b.onclick=()=>{ delete state.quiz[b.dataset.qretry]; saveState(); refreshStudy(); };
  });

  // 排序题：移动 / 提交 / 重做
  document.querySelectorAll('[data-sortmove]').forEach(btn=>{
    btn.onclick=()=>{
      const [sid,pos,dir]=btn.dataset.sortmove.split(':');
      const so=SORTS.find(s=>s.id===sid);
      if(!so) return;
      if(!state.sort[sid]||!state.sort[sid].order) state.sort[sid]={ order:shuffleOrder(so) };
      const arr=state.sort[sid].order.slice();
      const p=parseInt(pos,10), d=parseInt(dir,10);
      const q=p+d; if(q<0||q>=arr.length) return;
      [arr[p],arr[q]]=[arr[q],arr[p]];
      state.sort[sid].order=arr; state.sort[sid].submitted=false;
      saveState(); refreshStudy();
    };
  });
  document.querySelectorAll('[data-sortsubmit]').forEach(b=>{
    b.onclick=()=>{
      const sid=b.dataset.sortsubmit;
      const so=SORTS.find(s=>s.id===sid);
      if(!so) return;
      if(!state.sort[sid]||!state.sort[sid].order) state.sort[sid]={ order:shuffleOrder(so) };
      const ok=JSON.stringify(state.sort[sid].order)===JSON.stringify(so.order);
      state.sort[sid].submitted=true; state.sort[sid].correct=ok;
      if(!state.sort[sid].first) state.sort[sid].first={correct:ok, at:Date.now()};
      saveState(); refreshStudy();
    };
  });
  document.querySelectorAll('[data-sortretry]').forEach(b=>{
    b.onclick=()=>{
      const sid=b.dataset.sortretry; const so=SORTS.find(s=>s.id===sid); if(!so) return;
      const first=state.sort[sid]&&state.sort[sid].first;
      state.sort[sid]={ order:shuffleOrder(so), submitted:false, first };
      saveState(); refreshStudy();
    };
  });

  // 开放题
  document.querySelectorAll('[data-openhint]').forEach(b=>{
    b.onclick=()=>{ document.querySelector(`[data-openref="${b.dataOpenHint||b.dataset.openhint}"]`)?.classList.toggle('show'); };
  });
  document.querySelectorAll('[data-opensave]').forEach(b=>{
    b.onclick=()=>{
      const oid=b.dataset.opensave;
      const ta=document.querySelector(`[data-open-text="${oid}"]`);
      if(!state.open[oid]) state.open[oid]={};
      state.open[oid].text=ta?ta.value:''; saveState(); refreshStudy();
    };
  });

  initDyn(); initCompare(); initTour();
}

/* 仅刷新研学区（避免整页重渲染打断滑块/巡游） */
function refreshStudy(){
  const line=location.hash.replace('#','');
  const box=document.querySelector(`[data-study="${line}"]`);
  if(box) box.outerHTML=studySection(line);
  // 重新绑定研学区事件
  rebindStudyOnly(line);
}
function rebindStudyOnly(line){
  // 报告入口（重渲染后需重新绑定）
  document.querySelectorAll(`[data-study="${line}"] [data-open-report]`).forEach(el=>el.onclick=openReport);
  // 复用 bind 中研学相关逻辑：直接对当前 DOM 重新调用子集
  document.querySelectorAll(`[data-study="${line}"] [data-qopt]`).forEach(lb=>{
    if(lb.querySelector('input').disabled) return;
    lb.onclick=()=>{ const [qid,idx]=lb.dataset.qopt.split(':');
      if(!state.quiz[qid]) state.quiz[qid]={};
      state.quiz[qid].sel=parseInt(idx,10); state.quiz[qid].submitted=false; saveState(); refreshStudy(); };
  });
  document.querySelectorAll(`[data-study="${line}"] [data-qsubmit]`).forEach(b=>{
    b.onclick=()=>{ const qid=b.dataset.qsubmit;
      if(state.quiz[qid]==null||state.quiz[qid].sel==null){ alert('请先选择一个答案。'); return; }
      state.quiz[qid].submitted=true; saveState(); refreshStudy(); };
  });
  document.querySelectorAll(`[data-study="${line}"] [data-qretry]`).forEach(b=>{
    b.onclick=()=>{ delete state.quiz[b.dataset.qretry]; saveState(); refreshStudy(); };
  });
  document.querySelectorAll(`[data-study="${line}"] [data-sortmove]`).forEach(btn=>{
    btn.onclick=()=>{ const [sid,pos,dir]=btn.dataset.sortmove.split(':'); const so=SORTS.find(s=>s.id===sid); if(!so) return;
      if(!state.sort[sid]||!state.sort[sid].order) state.sort[sid]={ order:shuffleOrder(so) };
      const arr=state.sort[sid].order.slice(); const p=parseInt(pos,10), d=parseInt(dir,10); const q=p+d;
      if(q<0||q>=arr.length) return; [arr[p],arr[q]]=[arr[q],arr[p]];
      state.sort[sid].order=arr; state.sort[sid].submitted=false; saveState(); refreshStudy(); };
  });
  document.querySelectorAll(`[data-study="${line}"] [data-sortsubmit]`).forEach(b=>{
    b.onclick=()=>{ const sid=b.dataset.sortsubmit; const so=SORTS.find(s=>s.id===sid); if(!so) return;
      if(!state.sort[sid]||!state.sort[sid].order) state.sort[sid]={ order:shuffleOrder(so) };
      const ok=JSON.stringify(state.sort[sid].order)===JSON.stringify(so.order);
      state.sort[sid].submitted=true; state.sort[sid].correct=ok;
      if(!state.sort[sid].first) state.sort[sid].first={correct:ok, at:Date.now()};
      saveState(); refreshStudy(); };
  });
  document.querySelectorAll(`[data-study="${line}"] [data-sortretry]`).forEach(b=>{
    b.onclick=()=>{ const sid=b.dataset.sortretry; const so=SORTS.find(s=>s.id===sid); if(!so) return;
      const first=state.sort[sid]&&state.sort[sid].first;
      state.sort[sid]={ order:shuffleOrder(so), submitted:false, first };
      saveState(); refreshStudy(); };
  });
  document.querySelectorAll(`[data-study="${line}"] [data-openhint]`).forEach(b=>{
    b.onclick=()=>{ document.querySelector(`[data-openref="${b.dataset.openhint}"]`)?.classList.toggle('show'); };
  });
  document.querySelectorAll(`[data-study="${line}"] [data-opensave]`).forEach(b=>{
    b.onclick=()=>{ const oid=b.dataset.opensave; const ta=document.querySelector(`[data-open-text="${oid}"]`);
      if(!state.open[oid]) state.open[oid]={}; state.open[oid].text=ta?ta.value:''; saveState(); refreshStudy(); };
  });
}

/* ---------- 路由渲染 ---------- */
/* ===== 开场序章（仅首页首次进入播放一次） ===== */
function initIntro(){
  const ov=document.getElementById('intro-overlay');
  if(!ov) return;
  // 跳过条件：本会话已播过 / reduced-motion / 窄屏弱设备（给简化版但仍可播）
  let played=false;
  try{ played=sessionStorage.getItem('chairIntroPlayed')==='1'; }catch(e){}
  if(played){ ov.remove(); return; }
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    try{ sessionStorage.setItem('chairIntroPlayed','1'); }catch(e){}
    ov.remove(); return;
  }
  // 序章文案（确认版三层：引导语 / 标题 / 阐释）
  const chairSvg=`<svg width="40" height="44" viewBox="0 0 40 44" fill="none" stroke="#e8b64c" stroke-width="2" stroke-linecap="round">
    <path d="M12 30 L12 14 Q12 10 16 10 L24 10 Q28 10 28 14 L28 30 M12 18 L28 18 M12 25 L28 25 M10 38 L14 30 M30 38 L26 30 M8 40 L32 40"/></svg>`;
  ov.innerHTML=`
    <div class="in-pano" aria-hidden="true"></div>
    <div class="in-mask" aria-hidden="true"></div>
    <div class="in-stage">
      <div class="in-guide">一段乡村记忆，从这里开始</div>
      <div class="in-chairs" aria-hidden="true">
        <div class="in-chair c1">${chairSvg}</div>
        <div class="in-chair c2">${chairSvg}</div>
        <div class="in-chair c3">${chairSvg}</div>
      </div>
      <svg class="in-line" viewBox="0 0 260 40" aria-hidden="true"><path d="M10 30 Q 80 5 130 20 T 250 12"/></svg>
      <h2>椅座·红乡</h2>
      <div class="in-sub">一把椅子，一段故事，一程乡村。</div>
      <div class="in-actions">
        <button class="in-btn" data-into-main>走进红乡</button>
        <button class="in-btn ghost" data-into-skip>跳过片头</button>
      </div>
    </div>`;
  // 强制重排后再 show，触发 CSS 过渡
  void ov.offsetWidth;
  ov.classList.add('show');
  document.body.style.overflow='hidden';
  const done=()=>{
    try{ sessionStorage.setItem('chairIntroPlayed','1'); }catch(e){}
    ov.classList.add('leaving');
    setTimeout(()=>{ ov.remove(); document.body.style.overflow=''; },600);
  };
  ov.querySelector('[data-into-main]').onclick=done;
  ov.querySelector('[data-into-skip]').onclick=done;
  // 自动播完兜底（约 6s）
  setTimeout(done,6000);
}

/* ---------- 助农护照：三条线 + 三问 + 记忆卡，合成一页可截图/可打印的凭证 ---------- */
function viewPassport(){
  const p=state.pledge||{};
  const mc=state.memoryCard;
  const doneN=CHAIRS.filter(c=>state.completedLines[c.id]).length;
  const startN=CHAIRS.filter(c=>state.startedLines[c.id]).length;
  const rows=CHAIRS.map((c,i)=>{
    const st=state.startedLines[c.id], fin=state.completedLines[c.id];
    const ok=fin?'已完成':(st?'进行中':'未走进');
    const stamp=fin?'✓':(st?'·':'');
    return `<div class="pp-row ${fin?'on':st?'half':''}">
      <div class="pp-stamp">${stamp}</div>
      <div class="pp-line">
        <b>${c.name}</b><i>${c.person}</i>
      </div>
      <div class="pp-state">${ok}</div>
    </div>`;
  }).join('');
  const qs=PLEDGE_QS.map((q,i)=>{
    const v=p[q.key];
    return `<div class="pp-q"><span>${['壹','贰','叁'][i]}</span><div><b>${q.dim}</b><em>${v?esc(v):'（未回答）'}</em></div></div>`;
  }).join('');
  const decl=pledgeText();
  return `
  <section class="passport-page">
    <div class="passport" id="passportCard">
      <div class="pp-top">
        <div class="pp-brand">椅座 · 红乡</div>
        <div class="pp-title">助 农 护 照</div>
        <div class="pp-sub">一条红色乡村研学线 · 一份可以带走的凭证</div>
      </div>
      <div class="pp-meta">
        <span>持照人：<b>${esc(state.name||'研学学员')}</b></span>
        <span>签发：${new Date().toLocaleDateString('zh-CN')}</span>
        <span>线路：兰考 / 广安 / 西沟</span>
      </div>
      <div class="pp-body">
        <div class="pp-left">
          <div class="pp-h">三椅足迹</div>
          ${rows}
          <div class="pp-progress">已走进 ${startN}/3 · 已完成 ${doneN}/3</div>
        </div>
        <div class="pp-right">
          <div class="pp-h">三问与我的行动</div>
          ${qs}
          ${decl?`<div class="pp-decl">${esc(decl)}</div>`:'<div class="pp-decl muted">三问答完后，这里会出现你的行动宣言。</div>'}
        </div>
      </div>
      <div class="pp-bottom">
        <div class="pp-mc">
          <div class="pp-h">我替村里记住</div>
          ${mc?`<div class="pp-mc-item">${mcIcon(mc.item)} ${esc(mc.item)}</div><div class="pp-mc-text">“${esc(mc.text)}”</div>`
              :'<div class="pp-mc-text muted">还没有生成乡村记忆卡（在「研学落点」里可以写一张）</div>'}
        </div>
        <div class="pp-seal">
          <div class="seal-ring"><span>椅座<br>红乡</span></div>
          <div class="pp-seal-note">本护照由系统按真实作答生成<br>未完成的部分如实标注</div>
        </div>
      </div>
    </div>
    <div class="pp-actions">
      <button class="btn btn-primary" onclick="window.print()">打印 / 存为 PDF</button>
      <button class="btn btn-ghost" data-nav="final">返回研学落点</button>
      <button class="btn btn-ghost" data-nav="home">回到首页</button>
    </div>
  </section>`;
}

function render(){
  const h=location.hash.replace('#','');
  root.innerHTML='';
  if(_dyn){ cancelAnimationFrame(_dyn); _dyn=null; }
  if(h==='final'){ root.innerHTML=viewFinal(); renderCrumbs('final'); }
  else if(h==='passport'){ root.innerHTML=viewPassport(); renderCrumbs('final'); }
  else if(h&&CHAIRS.some(c=>c.id===h)){ root.innerHTML=viewStory(h); renderCrumbs(h); }
  else{ root.innerHTML=viewHome(); renderCrumbs(''); initIntro(); }
  bind();
}
window.addEventListener('hashchange',render);
render();
})();
