// =============================================================
// PROJECTS MODULE
// =============================================================

let PROJECTS = []; // cache: [{id, name, code, customer, contractValue, costBudget, revenueBudget, status, note}]

function listenProjects(){
  db.collection('projects').orderBy('createdAt','desc').onSnapshot((snap)=>{
    PROJECTS = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderProjectsTable();
    fillProjectSelects();
    if(window.renderDashboard) renderDashboard();
    if(window.renderReports) renderReports();
    if(window.renderPnl) renderPnl();
  }, (err)=> console.error('projects listen error', err));
}

function projectById(id){
  return PROJECTS.find(p=>p.id===id);
}

function fillProjectSelects(){
  const selectors = [
    {sel:'#tx-filter-project', withAll:true},
    {sel:'#inv-filter-project', withAll:true},
    {sel:'#tr-filter-project', withAll:true},
    {sel:'#rp-filter-project', withAll:true},
    {sel:'#pnl-filter-project', withAll:true, allLabel:'Tất cả dự án (tổng công ty)'},
    {sel:'#ord-filter-project', withAll:true},
    {sel:'#tx-project', withAll:false},
    {sel:'#order-project', withAll:false, noneLabel:'— Không thuộc dự án —'}
  ];
  selectors.forEach(({sel, withAll, allLabel, noneLabel})=>{
    const node = document.querySelector(sel);
    if(!node) return;
    const currentVal = node.value;
    let html = '';
    if(withAll) html += `<option value="">${allLabel || 'Tất cả dự án'}</option>`;
    else if(noneLabel) html += `<option value="">${noneLabel}</option>`;
    html += PROJECTS.map(p=> `<option value="${p.id}">${escapeHtml(p.name)}${p.code? ' ('+escapeHtml(p.code)+')':''}</option>`).join('');
    node.innerHTML = html;
    if(currentVal) node.value = currentVal;
  });
}

function renderProjectsTable(){
  const table = document.getElementById('projects-table');
  if(!table) return;
  if(PROJECTS.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">▣</div>Chưa có dự án nào. Bấm "+ Thêm dự án" để bắt đầu.</div></td></tr>`;
    return;
  }
  const rows = PROJECTS.map(p=>{
    const spend = (TRANSACTIONS||[]).filter(t=>t.projectId===p.id && t.type==='OUT').reduce((s,t)=>s+Number(t.amount||0),0);
    const revenue = (TRANSACTIONS||[]).filter(t=>t.projectId===p.id && t.type==='IN').reduce((s,t)=>s+Number(t.amount||0),0);
    const statusTag = p.status==='done' ? '<span class="tag tag-blue">Hoàn thành</span>'
      : p.status==='paused' ? '<span class="tag tag-gray">Tạm dừng</span>'
      : '<span class="tag tag-in">Đang thực hiện</span>';
    return `<tr>
      <td><strong>${escapeHtml(p.name)}</strong><div class="helper-text">${escapeHtml(p.customer||'')}</div></td>
      <td>${escapeHtml(p.code||'—')}</td>
      <td>${statusTag}</td>
      <td class="num">${fmtVND(p.contractValue)}</td>
      <td class="num" style="color:var(--teal)">${fmtVND(revenue)}</td>
      <td class="num" style="color:var(--red)">${fmtVND(spend)}</td>
      <td class="num"><strong>${fmtVND(revenue-spend)}</strong></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit-project="${p.id}" title="Sửa">✎</button>
          ${isAdmin() ? `<button class="icon-btn" data-del-project="${p.id}" title="Xóa">🗑</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  table.innerHTML = `<thead><tr>
    <th>Dự án</th><th>Mã</th><th>Trạng thái</th><th>Giá trị HĐ</th><th>Đã thu (thực tế)</th><th>Đã chi (thực tế)</th><th>Chênh lệch</th><th></th>
  </tr></thead><tbody>${rows}</tbody>`;
}

function openProjectModal(id){
  document.getElementById('project-modal-title').textContent = id ? 'Sửa dự án' : 'Thêm dự án';
  document.getElementById('project-id').value = id || '';
  const p = id ? projectById(id) : {};
  document.getElementById('project-name').value = p.name || '';
  document.getElementById('project-code').value = p.code || '';
  document.getElementById('project-customer').value = p.customer || '';
  document.getElementById('project-contract-value').value = p.contractValue || '';
  document.getElementById('project-cost-budget').value = p.costBudget || '';
  document.getElementById('project-revenue-budget').value = p.revenueBudget || '';
  document.getElementById('project-status').value = p.status || 'active';
  document.getElementById('project-note').value = p.note || '';
  openModal('modal-project');
}

document.getElementById('btn-add-project').addEventListener('click', ()=> openProjectModal(null));

document.getElementById('save-project-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('project-id').value;
  const name = document.getElementById('project-name').value.trim();
  if(!name){ toast('Vui lòng nhập tên dự án'); return; }
  const data = {
    name,
    code: document.getElementById('project-code').value.trim(),
    customer: document.getElementById('project-customer').value.trim(),
    contractValue: Number(document.getElementById('project-contract-value').value)||0,
    costBudget: Number(document.getElementById('project-cost-budget').value)||0,
    revenueBudget: Number(document.getElementById('project-revenue-budget').value)||0,
    status: document.getElementById('project-status').value,
    note: document.getElementById('project-note').value.trim(),
  };
  try{
    if(id){
      await db.collection('projects').doc(id).update(data);
      toast('Đã cập nhật dự án');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.email;
      await db.collection('projects').add(data);
      toast('Đã thêm dự án');
    }
    closeModal('modal-project');
  }catch(err){ toast('Lỗi: '+err.message); }
});

document.getElementById('projects-table').addEventListener('click', (e)=>{
  const editId = e.target.closest('[data-edit-project]')?.dataset.editProject;
  const delId = e.target.closest('[data-del-project]')?.dataset.delProject;
  if(editId) openProjectModal(editId);
  if(delId){
    if(confirmDelete('Xóa dự án này? Các giao dịch liên quan sẽ không bị xóa nhưng mất liên kết dự án.')){
      db.collection('projects').doc(delId).delete().then(()=>toast('Đã xóa dự án'));
    }
  }
});
