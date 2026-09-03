// =============================================================
// APP SHELL: navigation + bootstrap
// =============================================================

const VIEW_TITLES = {
  dashboard:['Tổng quan','Bức tranh dòng tiền toàn công ty'],
};

function switchView(view){
  document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=> v.classList.toggle('active', v.id==='view-'+view));
  closeMobileSidebar();
  // re-render on view switch to ensure charts sized correctly
  if(view==='dashboard' && window.renderDashboard) renderDashboard();
  if(view==='reports' && window.renderReports) renderReports();
  if(view==='pnl' && window.renderPnl) renderPnl();
}

document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click', ()=> switchView(item.dataset.view));
});

// ---------------- Menu trượt (drawer) trên điện thoại/tablet đứng ----------------
function closeMobileSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
}
document.getElementById('menu-toggle').addEventListener('click', ()=>{
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop')?.classList.toggle('open');
});
document.getElementById('sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

// ---------------- Các nút "+ Tạo mới" — mỗi trang có nút riêng, không còn dùng chung 1 nút "+" nổi nữa ----------------
document.getElementById('btn-add-tx')?.addEventListener('click', ()=> openTxModal(null));
document.getElementById('btn-add-employee')?.addEventListener('click', ()=> openEmployeeModal());
document.getElementById('btn-add-timesheet')?.addEventListener('click', ()=> openTimesheetModal());
document.getElementById('btn-add-income')?.addEventListener('click', ()=> openOrderModal(null, 'income'));
// "+ Thêm dự án" (js/projects.js), "+ Tạo lệnh chi"/"+ Tạo lệnh tạm ứng" (js/orders.js) đã tự gắn sự kiện ở file riêng.

// ---------------- Định dạng các ô nhập tiền có dấu phẩy ----------------
['project-contract-value','project-cost-budget','project-revenue-budget',
 'order-amount','emp-contract-salary','emp-effective-rate',
 'pa-bhxh','pa-tamung','pa-ungtuan','pa-thuong','pa-khactamung','pa-khaunghi'].forEach(bindMoneyInput);
// tx-unitprice và tx-amount đã có listener riêng (auto-calc thành tiền) trong transactions.js

let __appInitialized = false;
window.__initApp = function(){
  if(__appInitialized) return; // avoid duplicate listeners across auth state flickers
  __appInitialized = true;
  listenProjects();
  listenTransactions();
  listenFixedCosts();
  listenOrders();
  listenPayroll();
  listenApprovers();
  listenActivityLog();
  listenOcrSettings();
};

// ---------------- Theme (sáng / tối) ----------------
function applyTheme(theme){
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.getElementById('theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
  document.getElementById('theme-label').textContent = theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối';
  localStorage.setItem('t75-theme', theme);
}
(function initTheme(){
  const saved = localStorage.getItem('t75-theme') || 'light';
  applyTheme(saved);
})();
document.getElementById('theme-toggle').addEventListener('click', ()=>{
  const isDark = document.documentElement.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
});

// ---------------- Lời chào real-time ----------------
// Cập nhật lại mỗi phút để câu chào (sáng/trưa/chiều/tối) luôn đúng thời điểm
// dù người dùng để app mở lâu không thao tác gì.
setInterval(()=>{
  const dashView = document.getElementById('view-dashboard');
  if(dashView && dashView.classList.contains('active') && window.renderWelcomeCard) renderWelcomeCard();
}, 60000);
