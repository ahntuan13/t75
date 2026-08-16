// =============================================================
// UTILITIES
// =============================================================

function fmtVND(n){
  n = Math.round(Number(n) || 0);
  return n.toLocaleString('vi-VN', {maximumFractionDigits:0}) + ' đ';
}
function fmtNum(n){
  n = Math.round(Number(n) || 0);
  return n.toLocaleString('vi-VN', {maximumFractionDigits:0});
}
function fmtDate(d){
  if(!d) return '—';
  let dt;
  if(d instanceof Date){
    dt = d;
  } else if(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)){
    // Chuỗi ngày dạng "YYYY-MM-DD" (không có giờ) — dựng Date theo giờ ĐỊA PHƯƠNG (không qua mốc UTC).
    // QUAN TRỌNG: new Date("YYYY-MM-DD") bị JS hiểu ngầm là UTC midnight, nên khi hiển thị lại theo
    // giờ địa phương có thể bị lùi mất 1 ngày (y hệt lỗi đã gặp lúc đọc Excel) — dựng thủ công theo
    // từng phần năm/tháng/ngày để tránh hoàn toàn việc này, luôn ra đúng ngày bất kể múi giờ máy nào.
    const [y, m, day] = d.split('-').map(Number);
    dt = new Date(y, m - 1, day);
  } else {
    dt = new Date(d);
  }
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

// ---------------- Định dạng ô nhập tiền có dấu phẩy (VD: 1,000,000) ----------------
function formatMoneyInput(el){
  const raw = el.value.replace(/[^\d]/g,'');
  el.value = raw ? Number(raw).toLocaleString('vi-VN') : '';
}
function parseMoneyInput(el){
  return Math.round(Number((el.value||'').replace(/[^\d]/g,'')) || 0);
}
function setMoneyInputValue(el, num){
  const n = Math.round(Number(num)||0);
  el.value = n ? n.toLocaleString('vi-VN') : '';
}
function bindMoneyInput(id){
  const elm = document.getElementById(id);
  if(!elm) return;
  elm.setAttribute('inputmode','numeric');
  elm.addEventListener('input', ()=> formatMoneyInput(elm));
}

// ---------------- Nén ảnh (hóa đơn / chuyển khoản) thành base64 để lưu vào Firestore ----------------
// Firestore giới hạn 1MB/document nên ảnh cần nén nhỏ trước khi lưu.
function compressImageFile(file, maxWidth=900, quality=0.65){
  return new Promise((resolve, reject)=>{
    if(!file){ resolve(''); return; }
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > maxWidth){ h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = ()=> reject(new Error('Không đọc được ảnh'));
      img.src = e.target.result;
    };
    reader.onerror = ()=> reject(new Error('Không đọc được file'));
    reader.readAsDataURL(file);
  });
}

// Color palette used across charts
const CHART_COLORS = {
  teal:'#12B8A6', tealDim:'rgba(18,184,166,.15)',
  red:'#F5455C', redDim:'rgba(245,69,92,.15)',
  gold:'#F5A524', blue:'#4F6EF7', purple:'#8B5CF6',
  grid:'#E9ECF5', text:'#6B7280'
};
