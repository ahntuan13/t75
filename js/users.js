// =============================================================
// ROLES & PERMISSIONS (admin / user)
// =============================================================

// =============================================================
// ROLES & PERMISSIONS (admin / subadmin / user)
// - admin: toàn quyền (xem, sửa, xóa mọi mục, quản trị người dùng)
// - subadmin (Giám đốc): xem đầy đủ mọi mục ở chế độ VIEW-ONLY (không sửa/xóa),
//   chỉ được Duyệt/Từ chối các yêu cầu gửi tới (theo đúng email được gán)
// - user (Kế toán): nhập liệu, sửa được phần lớn, KHÔNG được xóa 1 số mục nhạy cảm
// =============================================================

let CURRENT_ROLE = 'user'; // 'admin' | 'subadmin' | 'user' — mặc định an toàn là user
let CURRENT_USER_NAME = '';
let APP_USERS = [];

function isAdmin(){ return CURRENT_ROLE === 'admin'; }
function isSubAdmin(){ return CURRENT_ROLE === 'subadmin'; }
// Được XEM đầy đủ các mục quản trị/báo cáo (Admin hoặc Sub-admin) — nhưng KHÔNG đồng nghĩa được sửa/xóa
function canView(){ return isAdmin() || isSubAdmin(); }

// Gọi ngay sau khi đăng nhập thành công, TRƯỚC khi tải dữ liệu khác,
// để mọi bảng biểu render đúng quyền ngay từ đầu.
async function ensureUserRole(){
  const uid = auth.currentUser.uid;
  const email = auth.currentUser.email;
  const ref = db.collection('users').doc(uid);
  try{
    const snap = await ref.get();
    if(snap.exists){
      const r = snap.data().role;
      CURRENT_ROLE = (r === 'admin' || r === 'subadmin') ? r : 'user';
      CURRENT_USER_NAME = snap.data().name || email.split('@')[0];
    } else {
      // Tài khoản đăng nhập lần đầu -> tự tạo hồ sơ với quyền User (an toàn).
      // Quyền Admin/Sub-admin phải được một Admin khác gán tay (xem README).
      CURRENT_USER_NAME = email.split('@')[0];
      await ref.set({
        email, role:'user', name: CURRENT_USER_NAME,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      CURRENT_ROLE = 'user';
    }
  }catch(err){
    console.error('ensureUserRole error', err);
    CURRENT_ROLE = 'user';
    CURRENT_USER_NAME = email.split('@')[0];
  }
  applyRolePermissions();
  if(isAdmin()){
    listenAppUsers();
  }
}

const ROLE_LABELS = {
  admin: 'Quản trị viên (Admin)',
  subadmin: 'Sub-admin (Giám đốc)',
  user: 'Thành viên',
};

function applyRolePermissions(){
  const label = document.getElementById('user-role-label');
  if(label) label.textContent = ROLE_LABELS[CURRENT_ROLE] || 'Thành viên';
  // Admin và Sub-admin (GĐ) đều được XEM: Dự án, Báo cáo (dòng tiền theo kỳ, lãi lỗ).
  // Quản trị người dùng & Lịch sử chỉnh sửa: CHỈ Admin.
  // "Tổng quan thu chi", "Hóa đơn", "Chuyển khoản": User VẪN xem được (chỉ không sửa/xóa — đã chặn ở nút + Firestore rules).
  const adminOnlyViews = ['users','activitylog'];           // chỉ Admin
  const viewOnlyForSubAdmin = ['projects','reports','pnl'];  // Admin + Sub-admin (GĐ) xem được
  adminOnlyViews.forEach(view=>{
    const nav = document.querySelector(`[data-view="${view}"]`);
    if(nav) nav.style.display = isAdmin() ? '' : 'none';
  });
  viewOnlyForSubAdmin.forEach(view=>{
    const nav = document.querySelector(`[data-view="${view}"]`);
    if(nav) nav.style.display = canView() ? '' : 'none';
  });
  const allRestrictedViews = adminOnlyViews.concat(viewOnlyForSubAdmin);
  const activeView = document.querySelector('.nav-item.active');
  if(activeView && allRestrictedViews.includes(activeView.dataset.view)){
    const stillAllowed = adminOnlyViews.includes(activeView.dataset.view) ? isAdmin() : canView();
    if(!stillAllowed) document.querySelector('[data-view="dashboard"]')?.click();
  }
  // Kế toán (User) giờ CHỈ ĐƯỢC XEM ở mục "Dòng tiền" (Chi phí gián tiếp + Thu chi dự án) — không tạo/sửa/xóa/
  // đổi trạng thái gì được nữa. Khoản Chi cần ghi nhận phải đi qua "Lệnh chi" (có luồng gửi duyệt riêng),
  // hệ thống tự tạo Thu Chi khi GĐ duyệt xong — không tạo trực tiếp ở đây nữa.
  const qcAddTx = document.getElementById('qc-add-tx');
  if(qcAddTx) qcAddTx.style.display = isAdmin() ? '' : 'none';
  const btnUploadThu = document.getElementById('btn-upload-thu');
  if(btnUploadThu) btnUploadThu.style.display = isAdmin() ? '' : 'none';
  const btnUploadChi = document.getElementById('btn-upload-chi');
  if(btnUploadChi) btnUploadChi.style.display = isAdmin() ? '' : 'none';
  const btnUploadFcThu = document.getElementById('btn-upload-fc-thu');
  if(btnUploadFcThu) btnUploadFcThu.style.display = isAdmin() ? '' : 'none';
  const btnUploadFcChi = document.getElementById('btn-upload-fc-chi');
  if(btnUploadFcChi) btnUploadFcChi.style.display = isAdmin() ? '' : 'none';
  // Sub-admin (GĐ) chỉ xem + duyệt, không có quyền tạo mới bất cứ gì -> ẩn cả 2 điểm vào "Tạo nhanh".
  const fabBtn = document.getElementById('fab-quick-create');
  if(fabBtn) fabBtn.style.display = isSubAdmin() ? 'none' : '';
  const dashQcBtn = document.getElementById('btn-dash-quick-create');
  if(dashQcBtn) dashQcBtn.style.display = isSubAdmin() ? 'none' : '';
  const btnExportTx = document.getElementById('btn-export-tx');
  if(btnExportTx) btnExportTx.style.display = isAdmin() ? '' : 'none';
  const btnExportFc = document.getElementById('btn-export-fc');
  if(btnExportFc) btnExportFc.style.display = isAdmin() ? '' : 'none';
  // GĐ (Sub-admin) chỉ xem + duyệt -> ẩn nút quét hóa đơn AI ngay tại trang Hóa đơn.
  document.querySelectorAll('label[for="ocr-invoice-pdf-input"]').forEach(el=>{
    el.style.display = isSubAdmin() ? 'none' : '';
  });
  if(window.renderDashboard) renderDashboard();
  if(window.renderNotifications) renderNotifications();
}

// ---------------- Người duyệt chi (Giám đốc + có thể thêm người duyệt phụ) ----------------
// APPROVERS.approverEmails: mảng TẤT CẢ email được phép Duyệt/Từ chối — bất kỳ ai trong danh sách
// đều duyệt được, không chỉ 1 người duy nhất như trước. gdEmail giữ lại để tương thích ngược
// (vẫn dùng làm email hiển thị mặc định khi gửi duyệt).
let APPROVERS = { gdEmail: '', approverEmails: [] };

function isAuthorizedApprover(email){
  const e = (email||'').toLowerCase();
  if(!e) return false;
  return (APPROVERS.approverEmails||[]).map(x=>x.toLowerCase()).includes(e);
}

function listenApprovers(){
  db.collection('settings').doc('approvers').onSnapshot((snap)=>{
    const data = snap.exists ? (snap.data()||{}) : {};
    APPROVERS = { gdEmail: data.gdEmail || '', approverEmails: Array.isArray(data.approverEmails) ? data.approverEmails : (data.gdEmail ? [data.gdEmail] : []) };
    const el = document.getElementById('approver-emails');
    if(el) el.value = (APPROVERS.approverEmails||[]).join(', ');
    if(window.renderTxTable) renderTxTable();
    if(window.renderOrdersTable) renderOrdersTable();
    if(window.renderAdvanceTable) renderAdvanceTable();
    if(window.renderApprovalBanner) renderApprovalBanner();
    if(window.renderNotifications) renderNotifications();
  }, (err)=> console.error('approvers listen error', err));
}

document.getElementById('save-approvers-btn')?.addEventListener('click', async ()=>{
  const raw = document.getElementById('approver-emails').value.trim();
  const emails = raw.split(/[,;\n]+/).map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(emails.length === 0){ toast('Vui lòng nhập ít nhất 1 email'); return; }
  try{
    await db.collection('settings').doc('approvers').set({ gdEmail: emails[0], approverEmails: emails }, {merge:true});
    toast(`Đã lưu ${emails.length} người có quyền duyệt chi`);
  }catch(err){ toast('Lỗi: '+err.message); }
});
function listenAppUsers(){
  db.collection('users').orderBy('createdAt','desc').onSnapshot((snap)=>{
    APP_USERS = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderUsersTable();
  }, (err)=> console.error('users listen error', err));
}

function renderUsersTable(){
  const table = document.getElementById('users-table');
  if(!table) return;
  if(APP_USERS.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🔐</div>Chưa có ai trong danh sách phân quyền.</div></td></tr>`;
    return;
  }
  table.innerHTML = `<thead><tr><th>Email</th><th>Tên hiển thị</th><th>Vai trò</th><th>UID</th><th></th></tr></thead><tbody>
    ${APP_USERS.map(u=>`<tr>
      <td><strong>${escapeHtml(u.email)}</strong></td>
      <td>${escapeHtml(u.name||'—')}</td>
      <td>${u.role==='admin' ? '<span class="tag tag-gold">Quản trị viên</span>' : '<span class="tag tag-gray">Thành viên</span>'}</td>
      <td class="mono" style="font-size:11px;color:var(--ink-faint);">${escapeHtml(u.id)}</td>
      <td><div class="row-actions">
        <button class="icon-btn" data-edit-user="${u.id}" title="Sửa quyền">✎</button>
      </div></td>
    </tr>`).join('')}</tbody>`;
}

function openUserRoleModal(id){
  document.getElementById('user-modal-title').textContent = id ? 'Sửa quyền người dùng' : 'Gán quyền người dùng';
  document.getElementById('user-uid').value = id || '';
  document.getElementById('user-uid').disabled = !!id;
  const u = id ? APP_USERS.find(x=>x.id===id) : {};
  document.getElementById('user-email-input').value = u.email || '';
  document.getElementById('user-name').value = u.name || '';
  document.getElementById('user-role').value = u.role || 'user';
  openModal('modal-user');
}

document.getElementById('btn-add-user')?.addEventListener('click', ()=> openUserRoleModal(null));

document.getElementById('save-user-btn')?.addEventListener('click', async ()=>{
  const uid = document.getElementById('user-uid').value.trim();
  const email = document.getElementById('user-email-input').value.trim();
  const name = document.getElementById('user-name').value.trim();
  const role = document.getElementById('user-role').value;
  if(!uid){ toast('Vui lòng nhập UID (copy từ Firebase Console > Authentication > Users)'); return; }
  if(!email){ toast('Vui lòng nhập email'); return; }
  try{
    await db.collection('users').doc(uid).set({
      email, name, role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
    toast('Đã lưu quyền người dùng');
    closeModal('modal-user');
  }catch(err){ toast('Lỗi: '+err.message); }
});

document.getElementById('users-table')?.addEventListener('click', (e)=>{
  const editId = e.target.closest('[data-edit-user]')?.dataset.editUser;
  if(editId) openUserRoleModal(editId);
});
