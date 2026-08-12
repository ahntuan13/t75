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
