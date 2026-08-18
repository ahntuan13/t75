// =============================================================
// CHUÔNG THÔNG BÁO 🔔 — dành cho cả 3 vai trò (Admin / Sub-admin GĐ / User)
// Vì app không có server chạy nền (cron), thông báo được TÍNH ĐỘNG
// mỗi khi dữ liệu thay đổi (không lưu "đã đọc/chưa đọc" riêng) —
// luôn hiển thị đúng những gì đang thực sự cần bạn chú ý lúc này.
//
// Phân luồng theo vai trò:
// - Admin: nhận ĐẦY ĐỦ mọi thông báo trong toàn công ty (từ User lẫn GĐ), không giới hạn theo email cá nhân.
// - Sub-admin (GĐ): chỉ nhận thông báo "đang chờ mình duyệt" (do Admin/User gửi tới đúng email GĐ).
// - User: chỉ nhận thông báo "đã có kết quả duyệt" cho đúng khoản mình tạo, và nhắc hóa đơn quá hạn của mình.
// =============================================================

const NOTIF_RECENT_DECISION_DAYS = 3;
const NOTIF_INVOICE_OVERDUE_DAYS = 7;

function daysSince(date){
  if(!date) return null;
  const d = (date && typeof date.toDate === 'function') ? date.toDate() : new Date(date);
  if(isNaN(d)) return null;
  return (Date.now() - d.getTime()) / 86400000;
}

function computeNotifications(){
  const myEmail = (auth.currentUser && auth.currentUser.email || '').toLowerCase();
  if(!myEmail) return { pendingForMe: [], decidedForMe: [], invoiceOverdue: [] };

  const amAdmin = typeof isAdmin==='function' && isAdmin();
  const isGD = typeof APPROVERS !== 'undefined' && APPROVERS.gdEmail && APPROVERS.gdEmail.toLowerCase() === myEmail;

  // 1) Đang chờ duyệt: Admin thấy TOÀN BỘ (mọi yêu cầu, dù gửi cho ai); GĐ chỉ thấy đúng cái gửi cho mình.
  const pendingForMe = [];
  if(amAdmin){
    TRANSACTIONS.filter(t=> t.type==='OUT' && t.approvalStatus==='pending')
      .forEach(t=> pendingForMe.push({ label: `Chi: ${t.content}`, amount: t.amount, view: 'transactions' }));
    (typeof ORDERS!=='undefined' ? ORDERS : []).filter(o=> o.approvalStatus==='pending')
      .forEach(o=> pendingForMe.push({ label: `Lệnh chi: ${o.reason}`, amount: o.amount, view: (typeof isAdvanceOrder==='function' && isAdvanceOrder(o)) ? 'advance' : 'orders' }));
  } else if(isGD){
    TRANSACTIONS.filter(t=> t.type==='OUT' && t.approvalStatus==='pending' && (t.approverEmail||'').toLowerCase()===myEmail)
      .forEach(t=> pendingForMe.push({ label: `Chi: ${t.content}`, amount: t.amount, view: 'transactions' }));
    (typeof ORDERS!=='undefined' ? ORDERS : []).filter(o=> o.approvalStatus==='pending' && (o.approverEmail||'').toLowerCase()===myEmail)
      .forEach(o=> pendingForMe.push({ label: `Lệnh chi: ${o.reason}`, amount: o.amount, view: (typeof isAdvanceOrder==='function' && isAdvanceOrder(o)) ? 'advance' : 'orders' }));
  }

  // 2) Đã có kết quả duyệt: Admin thấy TOÀN BỘ (toàn công ty, trong N ngày gần đây);
  //    User/GĐ chỉ thấy đúng khoản CHÍNH MÌNH đã tạo.
  const decidedForMe = [];
  TRANSACTIONS.filter(t=> t.type==='OUT' && (t.approvalStatus==='approved' || t.approvalStatus==='rejected')
      && (amAdmin || (t.createdBy||'').toLowerCase()===myEmail))
    .forEach(t=>{
      const days = daysSince(t.approvedAt);
      if(days!==null && days <= NOTIF_RECENT_DECISION_DAYS){
        decidedForMe.push({ label: `Chi: ${t.content}`, amount: t.amount, status: t.approvalStatus, view: 'transactions' });
      }
    });
  (typeof ORDERS!=='undefined' ? ORDERS : []).filter(o=> (o.approvalStatus==='approved' || o.approvalStatus==='rejected')
      && (amAdmin || (o.createdBy||'').toLowerCase()===myEmail))
    .forEach(o=>{
      const days = daysSince(o.approvedAt);
      if(days!==null && days <= NOTIF_RECENT_DECISION_DAYS){
        decidedForMe.push({ label: `Lệnh chi: ${o.reason}`, amount: o.amount, status: o.approvalStatus, view: (typeof isAdvanceOrder==='function' && isAdvanceOrder(o)) ? 'advance' : 'orders' });
      }
    });

  // 3) Hóa đơn quá hạn: Admin thấy TOÀN BỘ công ty; User chỉ thấy đúng khoản mình nhập.
  const invoiceOverdue = TRANSACTIONS.filter(t=>{
    if(!amAdmin && (t.createdBy||'').toLowerCase() !== myEmail) return false;
    const days = daysSince(t.createdAt);
    if(days===null || days < NOTIF_INVOICE_OVERDUE_DAYS) return false;
    const notIssued = (t.invoiceStatus||'pending') !== 'issued';
    const missingInfo = !t.invoiceNumber || !t.invoiceDate;
    return notIssued || missingInfo;
  }).map(t=> ({ label: `${t.content} (${t.projectName||'—'})`, amount: t.amount, view: 'invoices' }));

  return { pendingForMe, decidedForMe, invoiceOverdue };
}

function renderNotifications(){
  const badge = document.getElementById('notif-badge');
  const panel = document.getElementById('notif-panel');
  if(!badge || !panel || !auth.currentUser) return;

  const { pendingForMe, decidedForMe, invoiceOverdue } = computeNotifications();
  const total = pendingForMe.length + decidedForMe.length + invoiceOverdue.length;
  badge.textContent = total > 99 ? '99+' : String(total);

  const section = (title, items, renderItem) => items.length ? `
    <div class="notif-section">
      <div class="notif-section-title">${title}</div>
      ${items.map(renderItem).join('')}
    </div>` : '';

  let html = '';
  html += section('🟡 Đang chờ bạn duyệt', pendingForMe, (n)=> `
    <div class="notif-item" data-notif-view="${n.view}">
      <div class="notif-title">${escapeHtml(n.label)}</div>
      <div>${fmtVND(n.amount)}</div>
    </div>`);
  html += section('✅ Đã có kết quả duyệt', decidedForMe, (n)=> `
    <div class="notif-item" data-notif-view="${n.view}">
      <div class="notif-title">${n.status==='approved' ? '✅ Đã duyệt' : '❌ Từ chối'}: ${escapeHtml(n.label)}</div>
      <div>${fmtVND(n.amount)}</div>
    </div>`);
  html += section('⏰ Hóa đơn cần cập nhật (quá 7 ngày)', invoiceOverdue, (n)=> `
    <div class="notif-item" data-notif-view="${n.view}">
      <div class="notif-title">${escapeHtml(n.label)}</div>
      <div>${fmtVND(n.amount)} — chưa xuất/thiếu thông tin hóa đơn</div>
    </div>`);

  panel.innerHTML = html || `<div class="notif-empty">Không có thông báo nào.</div>`;
}

document.getElementById('notif-bell-btn')?.addEventListener('click', (e)=>{
  e.stopPropagation();
  const panel = document.getElementById('notif-panel');
  const isOpen = panel.style.display === 'block';
  if(!isOpen) renderNotifications();
  panel.style.display = isOpen ? 'none' : 'block';
});
document.getElementById('notif-panel')?.addEventListener('click', (e)=>{
  const item = e.target.closest('[data-notif-view]');
  if(item){
    document.getElementById('notif-panel').style.display = 'none';
    document.querySelector(`[data-view="${item.dataset.notifView}"]`)?.click();
  }
});
document.addEventListener('click', (e)=>{
  const panel = document.getElementById('notif-panel');
  const btn = document.getElementById('notif-bell-btn');
  if(panel && panel.style.display==='block' && !panel.contains(e.target) && e.target!==btn){
    panel.style.display = 'none';
  }
});

// Làm mới định kỳ để cập nhật đúng ngưỡng "quá 7 ngày" dù không có dữ liệu mới phát sinh
setInterval(()=>{ if(auth.currentUser) renderNotifications(); }, 5*60*1000);
