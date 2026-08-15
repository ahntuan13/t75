// =============================================================
// ONEDRIVE / SHAREPOINT INTEGRATION (Microsoft Graph API + MSAL.js)
// File đính kèm (hợp đồng, hóa đơn...) được upload thẳng vào
// thư viện tài liệu của SharePoint site dùng chung của công ty.
// =============================================================

const MS_CONFIG = {
  clientId: '9fbdc930-0171-4b8a-93b5-01479b67f715',
  tenantId: 'efda045b-e7a0-4c15-8b5e-d9a143a40275',
  siteHostname: 'tuan75insulation.sharepoint.com',
  sitePath: '/sites/T75-CashflowApp',
};
const MS_SCOPES = ['Files.ReadWrite.All', 'Sites.ReadWrite.All'];

const msalInstance = new msal.PublicClientApplication({
  auth: {
    clientId: MS_CONFIG.clientId,
    authority: `https://login.microsoftonline.com/${MS_CONFIG.tenantId}`,
    redirectUri: window.location.origin + window.location.pathname,
  },
  cache: {
    cacheLocation: 'localStorage', // giữ đăng nhập qua các lần mở lại app
    storeAuthStateInCookie: false,
  },
});

let msInitPromise = null;
function msEnsureInit(){
  if(!msInitPromise) msInitPromise = msalInstance.initialize();
  return msInitPromise;
}

let msCachedSiteId = null;

function msGetAccount(){
  const accounts = msalInstance.getAllAccounts();
  return accounts.length ? accounts[0] : null;
}

async function msLogin(){
  await msEnsureInit();
  const result = await msalInstance.loginPopup({ scopes: MS_SCOPES });
  msalInstance.setActiveAccount(result.account);
  return result.account;
}

async function msGetToken(){
  await msEnsureInit();
  let account = msGetAccount();
  if(!account){
    account = await msLogin();
  }
  try{
    const res = await msalInstance.acquireTokenSilent({ scopes: MS_SCOPES, account });
    return res.accessToken;
  }catch(err){
    const res = await msalInstance.acquireTokenPopup({ scopes: MS_SCOPES, account });
    return res.accessToken;
  }
}

async function msGetSiteId(){
  if(msCachedSiteId) return msCachedSiteId;
  const token = await msGetToken();
  const url = `https://graph.microsoft.com/v1.0/sites/${MS_CONFIG.siteHostname}:${MS_CONFIG.sitePath}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if(!res.ok) throw new Error('Không truy cập được SharePoint site (mã lỗi ' + res.status + '). Kiểm tra lại quyền truy cập site.');
  const data = await res.json();
  msCachedSiteId = data.id;
  return msCachedSiteId;
}

/**
 * Upload 1 file lên thư mục chỉ định trong SharePoint site dùng chung.
 * @param {File} file
 * @param {string} folderPath vd: 'Projects/BALTICA'
 * @returns {Promise<{webUrl:string, name:string, id:string}>}
 */
async function msUploadFile(file, folderPath){
  if(!file) return null;
  if(file.size > 4 * 1024 * 1024){
    throw new Error('File quá lớn (>4MB). Vui lòng nén nhỏ lại (ảnh) hoặc chia nhỏ file PDF trước khi tải lên.');
  }
  const token = await msGetToken();
  const siteId = await msGetSiteId();
  const safeName = file.name.replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, '_');
  const path = `${folderPath}/${Date.now()}_${safeName}`;
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${path.split('/').map(encodeURIComponent).join('/')}:/content`;
  const buf = await file.arrayBuffer();
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: buf,
  });
  if(!res.ok){
    const txt = await res.text().catch(()=> '');
    throw new Error('Upload thất bại (mã lỗi ' + res.status + '). ' + txt.slice(0, 200));
  }
  const data = await res.json();
  return { webUrl: data.webUrl, name: data.name, id: data.id };
}

function msIsLoggedIn(){
  return !!msalInstance.getAllAccounts().length;
}

async function msSignOut(){
  await msEnsureInit();
  const account = msGetAccount();
  if(account) await msalInstance.logoutPopup({ account });
}
