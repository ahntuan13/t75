// =============================================================
// APP SHELL: navigation + bootstrap
// =============================================================

const VIEW_TITLES = {
  dashboard:['Tổng quan','Bức tranh dòng tiền toàn công ty'],
};

function switchView(view){
  document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=> v.classList.toggle('active', v.id==='view-'+view));
  document.getElementById('sidebar').classList.remove('open');
  // re-render on view switch to ensure charts sized correctly
  if(view==='dashboard' && window.renderDashboard) renderDashboard();
  if(view==='reports' && window.renderReports) renderReports();
  if(view==='pnl' && window.renderPnl) renderPnl();
}

document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click', ()=> switchView(item.dataset.view));
});

document.getElementById('menu-toggle').addEventListener('click', ()=>{
  document.getElementById('sidebar').classList.toggle('open');
});

// ---------------- Modal "Tạo nhanh" (nút + nổi, dùng chung cho MỌI trang) ----------------
document.getElementById('fab-quick-create')?.addEventListener('click', ()=> openModal('modal-quickcreate'));
document.getElementById('btn-dash-quick-create')?.addEventListener('click', ()=> openModal('modal-quickcreate'));

document.getElementById('qc-add-project')?.addEventListener('click', ()=>{ closeModal('modal-quickcreate'); openProjectModal(null); });
document.getElementById('qc-add-tx')?.addEventListener('click', ()=>{ closeModal('modal-quickcreate'); openTxModal(null); });
document.getElementById('qc-add-order')?.addEventListener('click', ()=>{ closeModal('modal-quickcreate'); openOrderModal(null); });
document.getElementById('qc-add-advance-payment')?.addEventListener('click', ()=>{ closeModal('modal-quickcreate'); openOrderModal(null, 'advance_purchase'); });
document.getElementById('qc-add-advance-salary')?.addEventListener('click', ()=>{ closeModal('modal-quickcreate'); openOrderModal(null, 'advance_salary'); });
document.getElementById('qc-add-employee')?.addEventListener('click', ()=>{ closeModal('modal-quickcreate'); openEmployeeModal(); });
document.getElementById('qc-add-timesheet')?.addEventListener('click', ()=>{ closeModal('modal-quickcreate'); openTimesheetModal(); });
document.getElementById('qc-add-fc')?.addEventListener('click', ()=>{ closeModal('modal-quickcreate'); openTxModal(null, null, 'fixedCosts'); });

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
