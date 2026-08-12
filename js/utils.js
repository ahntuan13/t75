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
  if(e.target.classList && e.target.classList.contains('modal-backdrop')){
    e.target.classList.remove('open');
  }
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

// Color palette used across charts
const CHART_COLORS = {
  teal:'#0E7C66', tealDim:'rgba(14,124,102,.15)',
  red:'#B23B3B', redDim:'rgba(178,59,59,.15)',
  gold:'#B8863A', blue:'#2E5AAC',
  grid:'#E2E5EA', text:'#5B6472'
};
