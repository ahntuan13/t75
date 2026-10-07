// =============================================================
// AUTH
// =============================================================

document.getElementById('login-form').addEventListener('submit', (e)=>{
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errBox = document.getElementById('login-err');
  errBox.textContent = '';

  auth.signInWithEmailAndPassword(email, password)
    .catch((err)=>{
      const map = {
        'auth/invalid-credential':'Email hoặc mật khẩu không đúng.',
        'auth/user-not-found':'Tài khoản không tồn tại.',
        'auth/wrong-password':'Mật khẩu không đúng.',
        'auth/invalid-email':'Email không hợp lệ.',
        'auth/too-many-requests':'Bạn đã thử quá nhiều lần, vui lòng thử lại sau.'
      };
      errBox.textContent = map[err.code] || ('Lỗi đăng nhập: ' + err.message);
    });
});

document.getElementById('logout-btn').addEventListener('click', ()=>{
  auth.signOut();
});

auth.onAuthStateChanged(async (user)=>{
  if(user){
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('user-avatar').textContent = (user.email||'?').charAt(0).toUpperCase();
    if(window.ensureUserRole) await ensureUserRole();
    if(window.__initApp) window.__initApp();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display = 'none';
  }
});


// ---------------- QUÊN MẬT KHẨU (màn hình đăng nhập) ----------------
// Firebase gửi email chứa link đặt lại mật khẩu về đúng địa chỉ email của tài khoản.
const AUTH_ERR_VI = {
  'auth/invalid-credential':'Mật khẩu hiện tại không đúng.',
  'auth/wrong-password':'Mật khẩu hiện tại không đúng.',
  'auth/weak-password':'Mật khẩu mới quá yếu — cần ít nhất 6 ký tự.',
  'auth/too-many-requests':'Bạn đã thử quá nhiều lần, vui lòng chờ ít phút rồi thử lại.',
  'auth/requires-recent-login':'Phiên đăng nhập đã lâu — vui lòng đăng xuất, đăng nhập lại rồi đổi mật khẩu.',
  'auth/network-request-failed':'Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.',
  'auth/invalid-email':'Email không hợp lệ.',
  'auth/user-not-found':'Không có tài khoản nào dùng email này.',
  'auth/missing-email':'Vui lòng nhập email.',
};
document.getElementById('forgot-password-link')?.addEventListener('click', async (e)=>{
  e.preventDefault();
  const errBox = document.getElementById('login-err');
  const infoBox = document.getElementById('login-info');
  errBox.textContent = ''; infoBox.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  if(!email){ errBox.textContent = 'Nhập email của bạn vào ô Email ở trên, rồi bấm lại "Quên mật khẩu?".'; document.getElementById('login-email').focus(); return; }
  if(!confirm(`Gửi email đặt lại mật khẩu tới ${email}?`)) return;
  try{
    await auth.sendPasswordResetEmail(email);
    infoBox.textContent = `Đã gửi email đặt lại mật khẩu tới ${email} (nếu email này có tài khoản). Mở hộp thư — xem cả mục Spam — bấm link trong email để đặt mật khẩu mới.`;
  }catch(err){
    errBox.textContent = AUTH_ERR_VI[err.code] || ('Không gửi được email: ' + err.message);
  }
});

// ---------------- NGƯỜI DÙNG TỰ ĐỔI MẬT KHẨU ----------------
// Bấm vào tên mình ở góc trái dưới -> nhập mật khẩu hiện tại + mật khẩu mới. Firebase xác minh mật khẩu
// hiện tại (reauthenticate) đúng thì mới cho đổi.
function openChangePasswordModal(){
  if(!auth.currentUser) return;
  document.getElementById('cp-email').textContent = auth.currentUser.email || '';
  ['cp-current','cp-new','cp-confirm'].forEach(id=>{ const el = document.getElementById(id); el.value = ''; el.type = 'password'; });
  document.getElementById('cp-show').checked = false;
  document.getElementById('cp-error').textContent = '';
  openModal('modal-change-password');
  setTimeout(()=> document.getElementById('cp-current').focus(), 50);
}
document.getElementById('user-chip-who')?.addEventListener('click', openChangePasswordModal);
document.getElementById('cp-show')?.addEventListener('change', (e)=>{
  ['cp-current','cp-new','cp-confirm'].forEach(id=> document.getElementById(id).type = e.target.checked ? 'text' : 'password');
});
document.getElementById('cp-save-btn')?.addEventListener('click', async ()=>{
  const errBox = document.getElementById('cp-error');
  const cur = document.getElementById('cp-current').value;
  const next = document.getElementById('cp-new').value;
  const confirmPw = document.getElementById('cp-confirm').value;
  errBox.textContent = '';
  if(!cur){ errBox.textContent = 'Vui lòng nhập mật khẩu hiện tại.'; return; }
  if(next.length < 6){ errBox.textContent = 'Mật khẩu mới cần ít nhất 6 ký tự.'; return; }
  if(next !== confirmPw){ errBox.textContent = 'Hai lần nhập mật khẩu mới không giống nhau.'; return; }
  if(next === cur){ errBox.textContent = 'Mật khẩu mới phải khác mật khẩu hiện tại.'; return; }
  const btn = document.getElementById('cp-save-btn');
  btn.disabled = true; btn.textContent = '⏳ Đang đổi...';
  try{
    const user = auth.currentUser;
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, cur);
    await user.reauthenticateWithCredential(cred); // sai mật khẩu hiện tại -> dừng ở đây
    await user.updatePassword(next);
    closeModal('modal-change-password');
    toast('✅ Đã đổi mật khẩu — lần đăng nhập sau dùng mật khẩu mới');
    if(typeof logActivity === 'function') logActivity('update', {projectName:'Tài khoản', content:'Đổi mật khẩu', type:'OUT'});
  }catch(err){
    errBox.textContent = AUTH_ERR_VI[err.code] || ('Không đổi được mật khẩu: ' + err.message);
  }finally{
    btn.disabled = false; btn.textContent = 'Đổi mật khẩu';
  }
});
['cp-current','cp-new','cp-confirm'].forEach(id=>{
  document.getElementById(id)?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') document.getElementById('cp-save-btn').click(); });
});
