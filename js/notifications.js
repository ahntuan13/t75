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
  const isGD = typeof isAuthorizedApprover==='function' && isAuthorizedApprover(myEmail);
  const isAdv = (typeof isAdvanceOrder==='function') ? isAdvanceOrder : ()=>false;

  // 1) Đang chờ duyệt: Admin thấy TOÀN BỘ (mọi yêu cầu, dù gửi cho ai); người duyệt (GĐ/phụ) thấy TẤT CẢ
  // yêu cầu đang chờ (vì bất kỳ ai trong danh sách người duyệt đều duyệt được, không riêng ai).
  const pendingForMe = [];
  if(amAdmin || isGD){
    TRANSACTIONS.filter(t=> t.type==='OUT' && t.approvalStatus==='pending')
      .forEach(t=> pendingForMe.push({ id:`pending-tx-${t.id}`, label: t.content, amount: t.amount, view: 'transactions', section: 'Thu Chi' }));
    (typeof ORDERS!=='undefined' ? ORDERS : []).filter(o=> o.approvalStatus==='pending')
      .forEach(o=> pendingForMe.push({ id:`pending-ord-${o.id}`, label: o.reason, amount: o.amount,
        view: isAdv(o) ? 'advance' : 'orders', section: isAdv(o) ? 'Lệnh tạm ứng' : 'Lệnh chi' }));
  }

  // 2) Đã có kết quả duyệt: Admin thấy TOÀN BỘ (toàn công ty, trong N ngày gần đây);
  //    User/GĐ chỉ thấy đúng khoản CHÍNH MÌNH đã tạo.
  const decidedForMe = [];
  TRANSACTIONS.filter(t=> t.type==='OUT' && (t.approvalStatus==='approved' || t.approvalStatus==='rejected')
      && (amAdmin || (t.createdBy||'').toLowerCase()===myEmail))
    .forEach(t=>{
      const days = daysSince(t.approvedAt);
      if(days!==null && days <= NOTIF_RECENT_DECISION_DAYS){
        decidedForMe.push({ id:`decided-tx-${t.id}`, label: `Chi: ${t.content}`, amount: t.amount, status: t.approvalStatus, view: 'transactions' });
      }
    });
  (typeof ORDERS!=='undefined' ? ORDERS : []).filter(o=> (o.approvalStatus==='approved' || o.approvalStatus==='rejected')
      && (amAdmin || (o.createdBy||'').toLowerCase()===myEmail))
    .forEach(o=>{
      const days = daysSince(o.approvedAt);
      if(days!==null && days <= NOTIF_RECENT_DECISION_DAYS){
        decidedForMe.push({ id:`decided-ord-${o.id}`, label: `Lệnh chi: ${o.reason}`, amount: o.amount, status: o.approvalStatus, view: (typeof isAdvanceOrder==='function' && isAdvanceOrder(o)) ? 'advance' : 'orders' });
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
  }).map(t=> ({ id:`overdue-${t.id}`, label: `${t.content} (${t.projectName||'—'})`, amount: t.amount, view: 'invoices' }));

  return { pendingForMe, decidedForMe, invoiceOverdue };
}

// ---------------- Đánh dấu "đã xem" (lưu cục bộ trên trình duyệt, theo từng thông báo) ----------------
// Thông báo CHƯA có trong danh sách "đã xem" -> hiển thị đậm + nằm trên. Sau khi mở bảng thông báo 1 lần,
// toàn bộ thông báo đang hiển thị được đánh dấu "đã xem" -> lần mở sau sẽ hiện xám đi (trừ khi có gì mới).
function getSeenNotifIds(){
  try{ return new Set(JSON.parse(localStorage.getItem('t75_seen_notifs') || '[]')); }
  catch(e){ return new Set(); }
}
function markNotifsSeen(ids){
  const seen = getSeenNotifIds();
  ids.forEach(id=> seen.add(id));
  try{ localStorage.setItem('t75_seen_notifs', JSON.stringify([...seen].slice(-500))); }catch(e){}
}

function renderNotifications(){
  const badge = document.getElementById('notif-badge');
  const panel = document.getElementById('notif-panel');
  if(!badge || !panel || !auth.currentUser) return;

  const { pendingForMe, decidedForMe, invoiceOverdue } = computeNotifications();
  // Số trên chuông CHỈ đếm những gì còn cần xử lý (chờ duyệt + hóa đơn quá hạn chưa cập nhật).
  // "Đã có kết quả duyệt" chỉ mang tính thông báo/thông tin, không tính là việc còn tồn đọng nữa
  // — vd 10 thông báo, duyệt xong 4 thì số hiện trên chuông phải giảm còn 6, không giữ nguyên 10.
  const total = pendingForMe.length + invoiceOverdue.length;
  badge.textContent = total > 99 ? '99+' : String(total);

  const seenIds = getSeenNotifIds();
  // Thông báo CHƯA xem nằm lên trên (đậm), đã xem nằm dưới (xám) — sắp riêng trong từng nhóm.
  const sortUnreadFirst = (arr) => arr.slice().sort((a,b)=> (seenIds.has(a.id)?1:0) - (seenIds.has(b.id)?1:0));
  const allIds = [...pendingForMe, ...decidedForMe, ...invoiceOverdue].map(n=>n.id);

  const section = (title, items, renderItem) => items.length ? `
    <div class="notif-section">
      <div class="notif-section-title">${title}</div>
      ${sortUnreadFirst(items).map(n=> renderItem(n, seenIds.has(n.id))).join('')}
    </div>` : '';

  let html = '';
  html += section('🟡 Đang chờ bạn duyệt', pendingForMe, (n, seen)=> `
    <div class="notif-item ${seen ? 'notif-item-read' : 'notif-item-unread'}" data-notif-view="${n.view}">
      <div class="notif-title">[${escapeHtml(n.section)}] ${escapeHtml(n.label)}</div>
      <div>${fmtVND(n.amount)}</div>
    </div>`);
  html += section('✅ Đã có kết quả duyệt', decidedForMe, (n, seen)=> `
    <div class="notif-item ${seen ? 'notif-item-read' : 'notif-item-unread'}" data-notif-view="${n.view}">
      <div class="notif-title">${n.status==='approved' ? '✅ Đã duyệt' : '❌ Từ chối'}: ${escapeHtml(n.label)}</div>
      <div>${fmtVND(n.amount)}</div>
    </div>`);
  html += section('⏰ Hóa đơn cần cập nhật (quá 7 ngày)', invoiceOverdue, (n, seen)=> `
    <div class="notif-item ${seen ? 'notif-item-read' : 'notif-item-unread'}" data-notif-view="${n.view}">
      <div class="notif-title">${escapeHtml(n.label)}</div>
      <div>${fmtVND(n.amount)} — chưa xuất/thiếu thông tin hóa đơn</div>
    </div>`);

  panel.innerHTML = html || `<div class="notif-empty">Không có thông báo nào.</div>`;
  // Mở bảng ra xem 1 lần là coi như đã xem hết — lần mở sau các mục này sẽ hiện xám đi (trừ khi có mục mới).
  markNotifsSeen(allIds);
}

// Định vị bảng thông báo cạnh nút chuông — dùng position:fixed + tính toạ độ bằng JS, không phụ thuộc
// vào bất kỳ khung cha nào có overflow:hidden (trước đây bị nhốt trong sidebar 240px nên bị cắt chữ).
function positionNotifPanel(){
  const btn = document.getElementById('notif-bell-btn');
  const panel = document.getElementById('notif-panel');
  if(!btn || !panel) return;
  const rect = btn.getBoundingClientRect();
  const panelWidth = Math.min(380, window.innerWidth - 24);
  let left = rect.left;
  if(left + panelWidth > window.innerWidth - 12) left = window.innerWidth - panelWidth - 12;
  if(left < 12) left = 12;
  panel.style.left = left + 'px';
  panel.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  panel.style.top = 'auto';
}

document.getElementById('notif-bell-btn')?.addEventListener('click', (e)=>{
  e.stopPropagation();
  const panel = document.getElementById('notif-panel');
  const isOpen = panel.style.display === 'block';
  if(!isOpen){
    renderNotifications();
    positionNotifPanel();
  }
  panel.style.display = isOpen ? 'none' : 'block';
});
window.addEventListener('resize', ()=>{
  const panel = document.getElementById('notif-panel');
  if(panel && panel.style.display === 'block') positionNotifPanel();
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
