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

let __appInitialized = false;
window.__initApp = function(){
  if(__appInitialized) return; // avoid duplicate listeners across auth state flickers
  __appInitialized = true;
  listenProjects();
  listenTransactions();
  listenOrders();
  listenPayroll();
};
