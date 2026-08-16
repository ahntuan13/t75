// =============================================================
// ROLES & PERMISSIONS (admin / user)
// =============================================================

let CURRENT_ROLE = 'user'; // 'admin' | 'user' — mặc định an toàn là user
let CURRENT_USER_NAME = '';
let APP_USERS = [];

function isAdmin(){ return CURRENT_ROLE === 'admin'; }

// Gọi ngay sau khi đăng nhập thành công, TRƯỚC khi tải dữ liệu khác,
// để mọi bảng biểu render đúng quyền ngay từ đầu.
async function ensureUserRole(){
  const uid = auth.currentUser.uid;
  const email = auth.currentUser.email;
  const ref = db.collection('users').doc(uid);
  try{
    const snap = await ref.get();
    if(snap.exists){
      CURRENT_ROLE = snap.data().role === 'admin' ? 'admin' : 'user';
      CURRENT_USER_NAME = snap.data().name || email.split('@')[0];
    } else {
      // Tài khoản đăng nhập lần đầu -> tự tạo hồ sơ với quyền User (an toàn).
      // Quyền Admin phải được một Admin khác gán tay (hoặc admin đầu tiên tự
      // gán 1 lần qua Firestore Console, xem README).
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
  if(isAdmin()) listenAppUsers();
}

function applyRolePermissions(){
  const label = document.getElementById('user-role-label');
  if(label) label.textContent = isAdmin() ? 'Quản trị viên (Admin)' : 'Thành viên';
  // Chỉ Admin được xem: Dự án, Báo cáo (dòng tiền theo kỳ, lãi lỗ), quản trị người dùng, lịch sử chỉnh sửa.
  // "Tổng quan thu chi", "Hóa đơn", "Chuyển khoản": User VẪN xem được (chỉ không sửa/xóa — đã chặn ở nút + Firestore rules).
  const adminOnlyViews = ['users','activitylog','projects','reports','pnl'];
  adminOnlyViews.forEach(view=>{
    const nav = document.querySelector(`[data-view="${view}"]`);
    if(nav) nav.style.display = isAdmin() ? '' : 'none';
  });
  const activeView = document.querySelector('.nav-item.active');
  if(!isAdmin() && activeView && adminOnlyViews.includes(activeView.dataset.view)){
    document.querySelector('[data-view="dashboard"]')?.click();
  }
  const btnUploadThu = document.getElementById('btn-upload-thu');
  if(btnUploadThu) btnUploadThu.style.display = isAdmin() ? '' : 'none';
  const btnUploadChi = document.getElementById('btn-upload-chi');
  if(btnUploadChi) btnUploadChi.style.display = isAdmin() ? '' : 'none';
  const btnUploadFcThu = document.getElementById('btn-upload-fc-thu');
  if(btnUploadFcThu) btnUploadFcThu.style.display = isAdmin() ? '' : 'none';
  const btnUploadFcChi = document.getElementById('btn-upload-fc-chi');
  if(btnUploadFcChi) btnUploadFcChi.style.display = isAdmin() ? '' : 'none';
  if(window.renderDashboard) renderDashboard();
  if(window.renderNotifications) renderNotifications();
}

// ---------------- Người duyệt chi (Giám đốc) ----------------
let APPROVERS = { gdEmail: '' };

function listenApprovers(){
  db.collection('settings').doc('approvers').onSnapshot((snap)=>{
    APPROVERS = snap.exists ? (snap.data()||{}) : { gdEmail:'' };
    const gdEl = document.getElementById('approver-gd-email');
    if(gdEl) gdEl.value = APPROVERS.gdEmail || '';
    if(window.renderTxTable) renderTxTable();
    if(window.renderApprovalBanner) renderApprovalBanner();
    if(window.renderNotifications) renderNotifications();
  }, (err)=> console.error('approvers listen error', err));
}

document.getElementById('save-approvers-btn')?.addEventListener('click', async ()=>{
  const gdEmail = document.getElementById('approver-gd-email').value.trim().toLowerCase();
  try{
    await db.collection('settings').doc('approvers').set({ gdEmail }, {merge:true});
    toast('Đã lưu email duyệt chi');
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
