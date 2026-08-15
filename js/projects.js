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
      : p.status==='warranty' ? '<span class="tag tag-gold">Còn 5% bảo hành</span>'
      : '<span class="tag tag-in">Đang thực hiện</span>';
    return `<tr>
      <td><strong>${escapeHtml(p.name)}</strong><div class="helper-text">${escapeHtml(p.customer||'')}${p.contractNumber? ' • HĐ: '+escapeHtml(p.contractNumber):''}</div></td>
      <td>${escapeHtml(p.code||'—')}${(p.contractFileUrl||p.contractFile||p.contractLink) ? ` <a href="${p.contractFileUrl||p.contractFile||p.contractLink}" target="_blank" class="tag tag-blue" title="Xem file hợp đồng">📎 HĐ</a>` : ''}</td>
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

let currentContractFileUrl = '';
let currentContractFileName = '';

function renderContractFileStatus(){
  const el = document.getElementById('project-contract-file-status');
  if(!el) return;
  if(currentContractFileUrl){
    el.innerHTML = `<a href="${currentContractFileUrl}" target="_blank" class="tag tag-blue">📎 ${escapeHtml(currentContractFileName || 'Xem file trên OneDrive')}</a> <button type="button" class="btn btn-ghost btn-sm" id="project-contract-file-remove">Xóa liên kết</button>`;
    document.getElementById('project-contract-file-remove').addEventListener('click', ()=>{
      currentContractFileUrl = ''; currentContractFileName = '';
      document.getElementById('project-contract-file').value = '';
      renderContractFileStatus();
    });
  } else {
    el.innerHTML = `<span class="helper-text">Chưa có file đính kèm.</span>`;
  }
}

document.getElementById('project-contract-file').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const el = document.getElementById('project-contract-file-status');
  el.innerHTML = `<span class="helper-text">⏳ Đang tải lên OneDrive công ty... (có thể hiện popup đăng nhập Microsoft 365 lần đầu)</span>`;
  try{
    const projName = document.getElementById('project-name').value.trim() || 'KhongTenDuAn';
    const folder = 'Projects/' + projName.replace(/[^\w\-]+/g, '_');
    const result = await msUploadFile(file, folder);
    currentContractFileUrl = result.webUrl;
    currentContractFileName = result.name;
    toast('Đã tải file lên OneDrive');
  }catch(err){
    toast('Lỗi tải lên OneDrive: ' + err.message);
    el.innerHTML = `<span class="helper-text" style="color:var(--red)">Tải lên thất bại: ${escapeHtml(err.message)}</span>`;
    e.target.value = '';
    return;
  }
  renderContractFileStatus();
});

function openProjectModal(id){
  document.getElementById('project-modal-title').textContent = id ? 'Sửa dự án' : 'Thêm dự án';
  document.getElementById('project-id').value = id || '';
  const p = id ? projectById(id) : {};
  document.getElementById('project-name').value = p.name || '';
  document.getElementById('project-code').value = p.code || '';
  document.getElementById('project-customer').value = p.customer || '';
  document.getElementById('project-contract-number').value = p.contractNumber || '';
  document.getElementById('project-contract-link').value = p.contractLink || '';
  setMoneyInputValue(document.getElementById('project-contract-value'), p.contractValue);
  setMoneyInputValue(document.getElementById('project-cost-budget'), p.costBudget);
  setMoneyInputValue(document.getElementById('project-revenue-budget'), p.revenueBudget);
  document.getElementById('project-status').value = p.status || 'active';
  document.getElementById('project-note').value = p.note || '';
  // ưu tiên file mới (contractFileUrl trên OneDrive), fallback file cũ lưu base64 nếu có từ trước
  currentContractFileUrl = p.contractFileUrl || p.contractFile || '';
  currentContractFileName = p.contractFileName || '';
  document.getElementById('project-contract-file').value = '';
  renderContractFileStatus();
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
    contractNumber: document.getElementById('project-contract-number').value.trim(),
    contractLink: document.getElementById('project-contract-link').value.trim(),
    contractValue: parseMoneyInput(document.getElementById('project-contract-value')),
    costBudget: parseMoneyInput(document.getElementById('project-cost-budget')),
    revenueBudget: parseMoneyInput(document.getElementById('project-revenue-budget')),
    status: document.getElementById('project-status').value,
    note: document.getElementById('project-note').value.trim(),
    contractFileUrl: currentContractFileUrl,
    contractFileName: currentContractFileName,
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
