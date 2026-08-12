// =============================================================
// ROLES & PERMISSIONS (admin / user)
// =============================================================

let CURRENT_ROLE = 'user'; // 'admin' | 'user' — mặc định an toàn là user
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
    } else {
      // Tài khoản đăng nhập lần đầu -> tự tạo hồ sơ với quyền User (an toàn).
      // Quyền Admin phải được một Admin khác gán tay (hoặc admin đầu tiên tự
      // gán 1 lần qua Firestore Console, xem README).
      await ref.set({
        email, role:'user', name: email.split('@')[0],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      CURRENT_ROLE = 'user';
    }
  }catch(err){
    console.error('ensureUserRole error', err);
    CURRENT_ROLE = 'user';
  }
  applyRolePermissions();
  if(isAdmin()) listenAppUsers();
}

function applyRolePermissions(){
  const label = document.getElementById('user-role-label');
  if(label) label.textContent = isAdmin() ? 'Quản trị viên (Admin)' : 'Thành viên';
  const navUsers = document.querySelector('[data-view="users"]');
  if(navUsers) navUsers.style.display = isAdmin() ? '' : 'none';
  const btnAddEmp = document.getElementById('btn-add-employee');
  if(btnAddEmp) btnAddEmp.style.display = isAdmin() ? '' : 'none';
}

// ---------------- User management (Admin only) ----------------
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
