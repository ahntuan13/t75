// =============================================================
// UTILITIES
// =============================================================

function fmtVND(n){
  n = Number(n) || 0;
  return n.toLocaleString('vi-VN') + ' đ';
}
function fmtNum(n){
  n = Number(n) || 0;
  return n.toLocaleString('vi-VN');
}
function fmtDate(d){
  if(!d) return '—';
  const dt = (d instanceof Date) ? d : new Date(d);
  if(isNaN(dt)) return '—';
  return dt.toLocaleDateString('vi-VN');
}
function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function monthKey(dateStr){
  if(!dateStr) return '—';
  return String(dateStr).slice(0,7); // YYYY-MM
}
function yearKey(dateStr){
  if(!dateStr) return '—';
  return String(dateStr).slice(0,4); // YYYY
}
function dayKey(dateStr){
  return dateStr || '—';
}
function quarterOf(dateStr){
  if(!dateStr) return null;
  const m = Number(String(dateStr).slice(5,7));
  return Math.ceil(m/3);
}
function quarterKey(dateStr){
  const q = quarterOf(dateStr);
  if(!q) return '—';
  return `Q${q}/${yearKey(dateStr)}`;
}

function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=> el.classList.remove('show'), 2600);
}

function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', (e)=>{
  if(e.target.matches('[data-close]')){
    const backdrop = e.target.closest('.modal-backdrop');
    if(backdrop) backdrop.classList.remove('open');
  }
  // Lưu ý: KHÔNG đóng modal khi bấm vào vùng nền (backdrop) ngoài ý muốn,
  // chỉ đóng qua nút "Hủy" hoặc nút "✕" để tránh mất dữ liệu đang nhập dở.
});

function el(html){
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

function confirmDelete(msg){
  return window.confirm(msg || 'Bạn chắc chắn muốn xóa mục này?');
}

// Sort helper: array of {key, label, in, out, net...} by key ascending
function sortByKeyAsc(arr){
  return arr.sort((a,b)=> a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

// Tạo 1 thẻ KPI có icon màu (dùng trong Dashboard, Báo cáo, Hóa đơn...)
// color: 'blue' | 'teal' | 'gold' | 'red' | 'purple' | 'pink'
function kpiCard(icon, color, label, valueHtml, deltaHtml){
  return `<div class="kpi-card">
    <div class="top-row">
      <div class="icon-badge c-${color}">${icon}</div>
    </div>
    <div class="lbl">${label}</div>
    <div class="val">${valueHtml}</div>
    ${deltaHtml ? `<div class="delta">${deltaHtml}</div>` : ''}
  </div>`;
}

// Color palette used across charts
const CHART_COLORS = {
  teal:'#12B8A6', tealDim:'rgba(18,184,166,.15)',
  red:'#F5455C', redDim:'rgba(245,69,92,.15)',
  gold:'#F5A524', blue:'#4F6EF7', purple:'#8B5CF6',
  grid:'#E9ECF5', text:'#6B7280'
};
