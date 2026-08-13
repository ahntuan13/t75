// =============================================================
// DASHBOARD + REPORTS (cashflow by period, P&L by quarter/year)
// =============================================================

let chartCashflowTrend, chartProjectRevenue, chartReport, chartPnl;

// ---------- WELCOME CARD (lời chào real-time + thông tin người dùng) ----------
function greetingByHour(){
  const h = new Date().getHours();
  if(h < 11) return 'Chào buổi sáng,';
  if(h < 13) return 'Chào buổi trưa,';
  if(h < 18) return 'Chào buổi chiều,';
  return 'Chào buổi tối,';
}

function renderWelcomeCard(){
  const nameEl = document.getElementById('welcome-name');
  if(!nameEl) return;
  const name = CURRENT_USER_NAME || (auth.currentUser ? auth.currentUser.email.split('@')[0] : 'bạn');
  document.getElementById('welcome-greet').textContent = greetingByHour();
  document.getElementById('welcome-name').textContent = name;
  document.getElementById('welcome-avatar').textContent = name.charAt(0).toUpperCase();
  const roleLabel = isAdmin() ? 'Quản trị viên' : 'Thành viên';
  const dateStr = new Date().toLocaleDateString('vi-VN', {weekday:'long', day:'2-digit', month:'2-digit', year:'numeric'});
  document.getElementById('welcome-sub').textContent = `${roleLabel} · ${dateStr}`;

  const today = todayISO();
  const txToday = TRANSACTIONS.filter(t=>t.date===today).length;
  const pendingOrders = (typeof ORDERS!=='undefined' ? ORDERS : []).filter(o=>o.status==='pending').length;
  const activeProjects = PROJECTS.filter(p=>p.status==='active').length;
  document.getElementById('welcome-pills').innerHTML = `
    <div class="welcome-pill">📌 Giao dịch hôm nay <b>${fmtNum(txToday)}</b></div>
    <div class="welcome-pill">📝 Lệnh chi chờ duyệt <b>${fmtNum(pendingOrders)}</b></div>
    <div class="welcome-pill">▣ Dự án đang chạy <b>${fmtNum(activeProjects)}</b></div>
  `;
}

// ---------- DASHBOARD ----------
function renderDashboard(){
  renderWelcomeCard();
  const kpiBox = document.getElementById('dash-kpis');
  if(!kpiBox) return;

  const totalIn = TRANSACTIONS.filter(t=>t.type==='IN').reduce((s,t)=>s+Number(t.amount||0),0);
  const totalOut = TRANSACTIONS.filter(t=>t.type==='OUT').reduce((s,t)=>s+Number(t.amount||0),0);
  const net = totalIn - totalOut;

  const thisMonth = todayISO().slice(0,7);
  const monthIn = TRANSACTIONS.filter(t=>t.type==='IN' && monthKey(t.date)===thisMonth).reduce((s,t)=>s+Number(t.amount||0),0);
  const monthOut = TRANSACTIONS.filter(t=>t.type==='OUT' && monthKey(t.date)===thisMonth).reduce((s,t)=>s+Number(t.amount||0),0);

  kpiBox.innerHTML =
    kpiCard('💰','teal','Tổng thu (lũy kế)', `<span class="pos">${fmtVND(totalIn)}</span>`) +
    kpiCard('💸','red','Tổng chi (lũy kế)', `<span class="neg">${fmtVND(totalOut)}</span>`) +
    kpiCard('📊','blue','Dòng tiền ròng', `<span class="${net>=0?'pos':'neg'}">${fmtVND(net)}</span>`) +
    kpiCard('▣','purple','Số dự án đang chạy', fmtNum(PROJECTS.filter(p=>p.status==='active').length)) +
    kpiCard('📈','teal','Thu tháng này', `<span class="pos">${fmtVND(monthIn)}</span>`) +
    kpiCard('📉','gold','Chi tháng này', `<span class="neg">${fmtVND(monthOut)}</span>`);

  // 12-month trend
  const months = [];
  const d = new Date();
  for(let i=11;i>=0;i--){
    const dt = new Date(d.getFullYear(), d.getMonth()-i, 1);
    months.push(dt.toISOString().slice(0,7));
  }
  const inSeries = months.map(m=> TRANSACTIONS.filter(t=>t.type==='IN' && monthKey(t.date)===m).reduce((s,t)=>s+Number(t.amount||0),0));
  const outSeries = months.map(m=> TRANSACTIONS.filter(t=>t.type==='OUT' && monthKey(t.date)===m).reduce((s,t)=>s+Number(t.amount||0),0));

  const ctx1 = document.getElementById('chart-cashflow-trend');
  if(chartCashflowTrend) chartCashflowTrend.destroy();
  chartCashflowTrend = new Chart(ctx1, {
    type:'bar',
    data:{ labels: months.map(m=>m.slice(5)+'/'+m.slice(2,4)),
      datasets:[
        {label:'Thu', data:inSeries, backgroundColor:CHART_COLORS.teal, borderRadius:4},
        {label:'Chi', data:outSeries, backgroundColor:CHART_COLORS.red, borderRadius:4}
      ]},
    options:{responsive:true, maintainAspectRatio:false,
      scales:{ x:{grid:{display:false}}, y:{grid:{color:CHART_COLORS.grid}, ticks:{callback:v=>fmtNum(v)}} },
      plugins:{legend:{position:'bottom', labels:{boxWidth:10}}}}
  });

  // revenue by project
  const projRev = PROJECTS.map(p=>({
    name: p.name,
    val: TRANSACTIONS.filter(t=>t.projectId===p.id && t.type==='IN').reduce((s,t)=>s+Number(t.amount||0),0)
  })).filter(p=>p.val>0).sort((a,b)=>b.val-a.val).slice(0,8);

  const ctx2 = document.getElementById('chart-project-revenue');
  if(chartProjectRevenue) chartProjectRevenue.destroy();
  chartProjectRevenue = new Chart(ctx2, {
    type:'bar',
    data:{ labels: projRev.map(p=>p.name), datasets:[{label:'Doanh thu', data:projRev.map(p=>p.val), backgroundColor:CHART_COLORS.gold, borderRadius:4}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
      scales:{ x:{grid:{color:CHART_COLORS.grid}, ticks:{callback:v=>fmtNum(v)}}, y:{grid:{display:false}} },
      plugins:{legend:{display:false}}}
  });

  // recent transactions
  const recent = TRANSACTIONS.slice(0,8);
  const rt = document.getElementById('dash-recent-table');
  if(recent.length===0){
    rt.innerHTML = `<tr><td><div class="empty-state"><div class="big">⇄</div>Chưa có giao dịch nào.</div></td></tr>`;
  } else {
    rt.innerHTML = `<thead><tr><th>Ngày</th><th>Loại</th><th>Dự án</th><th>Nội dung</th><th>Số tiền</th></tr></thead><tbody>
      ${recent.map(t=>`<tr>
        <td>${fmtDate(t.date)}</td>
        <td>${t.type==='IN'?'<span class="tag tag-in">Thu</span>':'<span class="tag tag-out">Chi</span>'}</td>
        <td>${escapeHtml(t.projectName||'—')}</td>
        <td>${escapeHtml(t.content)}</td>
        <td class="num" style="color:${t.type==='IN'?'var(--teal)':'var(--red)'}"><strong>${fmtVND(t.amount)}</strong></td>
      </tr>`).join('')}</tbody>`;
  }
}

// ---------- CASHFLOW REPORT (day/month/year) ----------
function renderReports(){
  const table = document.getElementById('rp-table');
  if(!table) return;
  const groupBy = document.getElementById('rp-groupby').value;
  const project = document.getElementById('rp-filter-project').value;
  const year = document.getElementById('rp-filter-year').value;

  let rows = TRANSACTIONS.slice();
  if(project) rows = rows.filter(t=>t.projectId===project);
  if(year) rows = rows.filter(t=> yearKey(t.date)===String(year));

  const keyFn = groupBy==='day' ? dayKey : groupBy==='month' ? monthKey : yearKey;
  const map = {};
  rows.forEach(t=>{
    const k = keyFn(t.date);
    if(!map[k]) map[k] = {key:k, in:0, out:0};
    if(t.type==='IN') map[k].in += Number(t.amount||0); else map[k].out += Number(t.amount||0);
  });
  const data = sortByKeyAsc(Object.values(map));

  const totalIn = rows.filter(t=>t.type==='IN').reduce((s,t)=>s+Number(t.amount||0),0);
  const totalOut = rows.filter(t=>t.type==='OUT').reduce((s,t)=>s+Number(t.amount||0),0);
  document.getElementById('rp-kpis').innerHTML =
    kpiCard('💰','teal','Tổng thu', `<span class="pos">${fmtVND(totalIn)}</span>`) +
    kpiCard('💸','red','Tổng chi', `<span class="neg">${fmtVND(totalOut)}</span>`) +
    kpiCard('📊','blue','Dòng tiền ròng', `<span class="${totalIn-totalOut>=0?'pos':'neg'}">${fmtVND(totalIn-totalOut)}</span>`) +
    kpiCard('🗓','purple','Số kỳ có phát sinh', fmtNum(data.length));

  const ctx = document.getElementById('chart-report');
  if(chartReport) chartReport.destroy();
  chartReport = new Chart(ctx, {
    type:'bar',
    data:{ labels: data.map(d=>d.key), datasets:[
      {label:'Thu', data:data.map(d=>d.in), backgroundColor:CHART_COLORS.teal, borderRadius:4},
      {label:'Chi', data:data.map(d=>d.out), backgroundColor:CHART_COLORS.red, borderRadius:4}
    ]},
    options:{responsive:true, maintainAspectRatio:false,
      scales:{ x:{grid:{display:false}}, y:{grid:{color:CHART_COLORS.grid}, ticks:{callback:v=>fmtNum(v)}} },
      plugins:{legend:{position:'bottom', labels:{boxWidth:10}}}}
  });

  if(data.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">📊</div>Không có dữ liệu phù hợp.</div></td></tr>`;
    return;
  }
  table.innerHTML = `<thead><tr><th>Kỳ</th><th>Thu</th><th>Chi</th><th>Dòng tiền ròng</th></tr></thead><tbody>
    ${data.slice().reverse().map(d=>`<tr>
      <td><strong>${d.key}</strong></td>
      <td class="num" style="color:var(--teal)">${fmtVND(d.in)}</td>
      <td class="num" style="color:var(--red)">${fmtVND(d.out)}</td>
      <td class="num"><strong>${fmtVND(d.in-d.out)}</strong></td>
    </tr>`).join('')}</tbody>`;
}

// ---------- P&L REPORT (quarter/year) ----------
function renderPnl(){
  const table = document.getElementById('pnl-table');
  if(!table) return;
  const groupBy = document.getElementById('pnl-groupby').value;
  const project = document.getElementById('pnl-filter-project').value;
  const year = document.getElementById('pnl-filter-year').value;

  let rows = TRANSACTIONS.slice();
  if(project) rows = rows.filter(t=>t.projectId===project);
  if(year) rows = rows.filter(t=> yearKey(t.date)===String(year));

  const keyFn = groupBy==='quarter' ? quarterKey : yearKey;
  const map = {};
  rows.forEach(t=>{
    const k = keyFn(t.date);
    if(!map[k]) map[k] = {key:k, revenue:0, cost:0};
    if(t.type==='IN') map[k].revenue += Number(t.amount||0); else map[k].cost += Number(t.amount||0);
  });
  const data = Object.values(map).map(d=>({...d, lntt: d.revenue-d.cost}));
  // sort: for quarter labels like Q1/2026, sort by year then quarter
  data.sort((a,b)=>{
    const pa = a.key.match(/Q(\d)\/(\d+)/), pb = b.key.match(/Q(\d)\/(\d+)/);
    if(pa && pb){ return pa[2]-pb[2] || pa[1]-pb[1]; }
    return a.key.localeCompare(b.key);
  });

  const totalRevenue = data.reduce((s,d)=>s+d.revenue,0);
  const totalCost = data.reduce((s,d)=>s+d.cost,0);
  const totalLntt = totalRevenue-totalCost;
  const margin = totalRevenue ? (totalLntt/totalRevenue*100) : 0;
  document.getElementById('pnl-kpis').innerHTML =
    kpiCard('💰','teal','Tổng doanh thu', `<span class="pos">${fmtVND(totalRevenue)}</span>`) +
    kpiCard('💸','red','Tổng chi phí', `<span class="neg">${fmtVND(totalCost)}</span>`) +
    kpiCard('📈','blue','Lợi nhuận trước thuế', `<span class="${totalLntt>=0?'pos':'neg'}">${fmtVND(totalLntt)}</span>`) +
    kpiCard('🎯','gold','Biên lợi nhuận', `${margin.toFixed(1)}%`);

  const ctx = document.getElementById('chart-pnl');
  if(chartPnl) chartPnl.destroy();
  chartPnl = new Chart(ctx, {
    type:'bar',
    data:{ labels: data.map(d=>d.key), datasets:[
      {label:'Doanh thu', data:data.map(d=>d.revenue), backgroundColor:CHART_COLORS.teal, borderRadius:4},
      {label:'Chi phí', data:data.map(d=>d.cost), backgroundColor:CHART_COLORS.red, borderRadius:4},
      {label:'LNTT', data:data.map(d=>d.lntt), backgroundColor:CHART_COLORS.gold, borderRadius:4}
    ]},
    options:{responsive:true, maintainAspectRatio:false,
      scales:{ x:{grid:{display:false}}, y:{grid:{color:CHART_COLORS.grid}, ticks:{callback:v=>fmtNum(v)}} },
      plugins:{legend:{position:'bottom', labels:{boxWidth:10}}}}
  });

  if(data.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">📈</div>Không có dữ liệu phù hợp.</div></td></tr>`;
    return;
  }
  table.innerHTML = `<thead><tr><th>Kỳ</th><th>Doanh thu</th><th>Chi phí</th><th>LNTT</th><th>Biên LN</th></tr></thead><tbody>
    ${data.map(d=>`<tr>
      <td><strong>${d.key}</strong></td>
      <td class="num" style="color:var(--teal)">${fmtVND(d.revenue)}</td>
      <td class="num" style="color:var(--red)">${fmtVND(d.cost)}</td>
      <td class="num"><strong style="color:${d.lntt>=0?'var(--teal)':'var(--red)'}">${fmtVND(d.lntt)}</strong></td>
      <td class="num">${d.revenue ? (d.lntt/d.revenue*100).toFixed(1) : '0.0'}%</td>
    </tr>`).join('')}</tbody>`;
}

['rp-groupby','rp-filter-project','rp-filter-year'].forEach(id=>{
  document.getElementById(id).addEventListener('input', renderReports);
});
['pnl-groupby','pnl-filter-project','pnl-filter-year'].forEach(id=>{
  document.getElementById(id).addEventListener('input', renderPnl);
});
