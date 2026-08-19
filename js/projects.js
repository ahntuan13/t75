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
    {sel:'#adv-filter-project', withAll:true},
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
      <td><strong>${escapeHtml(p.name)}</strong><div class="helper-text">${escapeHtml(p.customer||'')}${p.taxCode? ' • MST: '+escapeHtml(p.taxCode):''}${p.contractNumber? ' • HĐ: '+escapeHtml(p.contractNumber):''}</div></td>
      <td>${escapeHtml(p.code||'—')}${(Array.isArray(p.contractFiles)&&p.contractFiles.length) ? ` <a href="${p.contractFiles[0].url}" target="_blank" class="tag tag-blue" title="Xem file hợp đồng (${p.contractFiles.length} file)">📎 HĐ${p.contractFiles.length>1?' ×'+p.contractFiles.length:''}</a>` : ((p.contractFileUrl||p.contractFile||p.contractLink) ? ` <a href="${p.contractFileUrl||p.contractFile||p.contractLink}" target="_blank" class="tag tag-blue" title="Xem file hợp đồng">📎 HĐ</a>` : '')}</td>
      <td>${statusTag}</td>
      <td class="num">${fmtVND(p.contractValue)}</td>
      <td class="num">${fmtVND(p.costBudget)}</td>
      <td class="num">${fmtVND(p.revenueBudget)}</td>
      <td class="num" style="color:var(--teal)">${fmtVND(revenue)}</td>
      <td class="num" style="color:var(--red)">${fmtVND(spend)}</td>
      <td class="num"><strong>${fmtVND(revenue-spend)}</strong></td>
      <td>
        <div class="row-actions">
          ${!isSubAdmin() ? `<button class="icon-btn" data-edit-project="${p.id}" title="Sửa / Đính kèm hồ sơ">✎</button>` : ''}
          ${isAdmin() ? `<button class="icon-btn" data-del-project="${p.id}" title="Xóa">🗑</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  const totalContractValue = PROJECTS.reduce((s,p)=>s+Number(p.contractValue||0),0);
  const totalRevenue = (TRANSACTIONS||[]).filter(t=>t.type==='IN' && t.projectId).reduce((s,t)=>s+Number(t.amount||0),0);
  const totalSpend = (TRANSACTIONS||[]).filter(t=>t.type==='OUT' && t.projectId).reduce((s,t)=>s+Number(t.amount||0),0);
  const totalsRow = `<tr style="background:var(--bg-soft);font-weight:700;">
      <td colspan="3">TỔNG CỘNG (${PROJECTS.length} dự án)</td>
      <td class="num">${fmtVND(totalContractValue)}</td>
      <td class="num">${fmtVND(PROJECTS.reduce((s,p)=>s+Number(p.costBudget||0),0))}</td>
      <td class="num">${fmtVND(PROJECTS.reduce((s,p)=>s+Number(p.revenueBudget||0),0))}</td>
      <td class="num" style="color:var(--teal)">${fmtVND(totalRevenue)}</td>
      <td class="num" style="color:var(--red)">${fmtVND(totalSpend)}</td>
      <td class="num">${fmtVND(totalRevenue-totalSpend)}</td>
      <td></td>
    </tr>`;
  table.innerHTML = `<thead><tr>
    <th>Dự án</th><th>Mã</th><th>Trạng thái</th><th>Giá trị HĐ</th><th>Chi phí dự toán</th><th>Doanh thu dự toán</th><th>Đã thu (thực tế)</th><th>Đã chi (thực tế)</th><th>Chênh lệch</th><th></th>
  </tr></thead><tbody>${totalsRow}${rows}</tbody>`;
}

let currentContractFiles = []; // [{url, name, uploadedAt}]

function renderContractFileStatus(){
  const el = document.getElementById('project-files-list');
  if(!el) return;
  if(currentContractFiles.length === 0){
    el.innerHTML = `<span class="helper-text">Chưa có file đính kèm nào.</span>`;
    return;
  }
  el.innerHTML = currentContractFiles.map((f, idx)=>
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <a href="${f.url}" target="_blank" class="tag tag-blue">📎 Đính kèm ${idx+1}: ${escapeHtml(f.name || 'Xem file')}</a>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-contract-file="${idx}">Xóa</button>
    </div>`
  ).join('');
  el.querySelectorAll('[data-remove-contract-file]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      currentContractFiles.splice(Number(btn.dataset.removeContractFile), 1);
      renderContractFileStatus();
    });
  });
}

document.getElementById('project-add-attachment-btn')?.addEventListener('click', ()=> document.getElementById('project-file-input').click());
document.getElementById('project-file-input')?.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  toast(`⏳ Đang tải "${file.name}" lên OneDrive công ty... (có thể hiện popup đăng nhập Microsoft 365 lần đầu)`);
  try{
    const projName = document.getElementById('project-name').value.trim() || 'KhongTenDuAn';
    const folder = 'Projects/' + projName.replace(/[^\w\-]+/g, '_');
    const result = await msUploadFile(file, folder);
    currentContractFiles.push({ url: result.webUrl, name: result.name, uploadedAt: new Date().toISOString() });
    toast('Đã thêm file đính kèm — bấm vào tên file để xem lại');
  }catch(err){
    toast('Lỗi tải lên OneDrive: ' + err.message);
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
  document.getElementById('project-tax-code').value = p.taxCode || '';
  document.getElementById('project-contract-number').value = p.contractNumber || '';
  document.getElementById('project-contract-link').value = p.contractLink || '';
  setMoneyInputValue(document.getElementById('project-contract-value'), p.contractValue);
  setMoneyInputValue(document.getElementById('project-cost-budget'), p.costBudget);
  setMoneyInputValue(document.getElementById('project-revenue-budget'), p.revenueBudget);
  document.getElementById('project-status').value = p.status || 'active';
  document.getElementById('project-sign-date').value = p.signDate || (id ? '' : todayISO());
  document.getElementById('project-completion-date').value = p.completionDate || '';
  document.getElementById('project-warranty-years').value = p.warrantyYears || '';
  document.getElementById('project-warranty-start').value = p.warrantyStartDate || '';
  document.getElementById('project-note').value = p.note || '';
  // ưu tiên mảng nhiều file mới (contractFiles); nếu dự án cũ chỉ có 1 file (contractFileUrl/contractFile) thì tự chuyển thành mảng 1 phần tử
  if(Array.isArray(p.contractFiles) && p.contractFiles.length){
    currentContractFiles = p.contractFiles.slice();
  } else if(p.contractFileUrl || p.contractFile){
    currentContractFiles = [{ url: p.contractFileUrl || p.contractFile, name: p.contractFileName || 'Hợp đồng' }];
  } else {
    currentContractFiles = [];
  }
  document.getElementById('project-file-input').value = '';
  renderContractFileStatus();
  openModal('modal-project');
}

document.getElementById('btn-add-project')?.addEventListener('click', ()=> openProjectModal(null));

// Tự ghi lại "Ngày bắt đầu tính bảo hành" đúng thời điểm chuyển Trạng thái sang "Còn giữ 5% bảo hành"
// (chỉ ghi 1 lần khi CHUYỂN SANG, không ghi đè lại nếu đã có sẵn từ trước).
document.getElementById('project-status')?.addEventListener('change', (e)=>{
  const warrantyStartEl = document.getElementById('project-warranty-start');
  if(e.target.value === 'warranty' && !warrantyStartEl.value){
    warrantyStartEl.value = todayISO();
  }
});

document.getElementById('save-project-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('project-id').value;
  const name = document.getElementById('project-name').value.trim();
  if(!name){ toast('Vui lòng nhập tên dự án'); return; }
  const data = {
    name,
    code: document.getElementById('project-code').value.trim(),
    customer: document.getElementById('project-customer').value.trim(),
    taxCode: document.getElementById('project-tax-code').value.trim(),
    contractNumber: document.getElementById('project-contract-number').value.trim(),
    contractLink: document.getElementById('project-contract-link').value.trim(),
    contractValue: parseMoneyInput(document.getElementById('project-contract-value')),
    costBudget: parseMoneyInput(document.getElementById('project-cost-budget')),
    revenueBudget: parseMoneyInput(document.getElementById('project-revenue-budget')),
    status: document.getElementById('project-status').value,
    signDate: document.getElementById('project-sign-date').value,
    completionDate: document.getElementById('project-completion-date').value,
    warrantyYears: document.getElementById('project-warranty-years').value,
    warrantyStartDate: document.getElementById('project-warranty-start').value,
    note: document.getElementById('project-note').value.trim(),
    contractFiles: currentContractFiles,
    // xóa field cũ (single-file) để tránh dữ liệu thừa/nhầm lẫn khi đọc lại
    contractFileUrl: firebase.firestore.FieldValue.delete(),
    contractFile: firebase.firestore.FieldValue.delete(),
    contractFileName: firebase.firestore.FieldValue.delete(),
    contractFileType: firebase.firestore.FieldValue.delete(),
  };
  try{
    if(id){
      await db.collection('projects').doc(id).update(data);
      toast('Đã cập nhật dự án');
      logActivity('update', {projectName: data.name, content: 'Sửa thông tin dự án', type:'OUT'});
    } else {
      delete data.contractFileUrl; delete data.contractFile; delete data.contractFileName; delete data.contractFileType;
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.email;
      await db.collection('projects').add(data);
      toast('Đã thêm dự án');
      logActivity('create', {projectName: data.name, content: 'Tạo dự án mới', type:'OUT'});
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
