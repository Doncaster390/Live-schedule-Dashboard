(function(root){
  const API_BASE_KEY='scheduleSharedBackendApiBase';
  const ACCOUNT_KEY='scheduleAccountToken';
  const DISPLAY_KEY='scheduleDisplayCredential';

  class ApiError extends Error{
    constructor(message,status){
      super(message);
      this.name='ApiError';
      this.status=status||0;
    }
  }

  function getApiBase(){
    return localStorage.getItem(API_BASE_KEY)||'';
  }

  function setApiBase(reference){
    const base=root.SharedSchedule.backendApiBaseUrl(reference);
    if(!base)throw Error('Enter a backend API base URL.');
    localStorage.setItem(API_BASE_KEY,base);
    return base;
  }

  function clearApiBase(){
    localStorage.removeItem(API_BASE_KEY);
  }

  function getAccount(){
    try{
      const stored=localStorage.getItem(ACCOUNT_KEY);
      const parsed=stored?JSON.parse(stored):null;
      return parsed&&typeof parsed==='object'&&parsed.token?parsed:null;
    }catch(error){
      return null;
    }
  }

  function setAccount(token,user){
    if(!token)throw Error('The backend did not return an account token.');
    localStorage.setItem(ACCOUNT_KEY,JSON.stringify({token,user:user||null}));
  }

  function clearAccount(){
    localStorage.removeItem(ACCOUNT_KEY);
  }

  function accountToken(){
    const account=getAccount();
    return account?account.token:'';
  }

  function accountUser(){
    const account=getAccount();
    return account?account.user:null;
  }

  function isAdmin(){
    const user=accountUser();
    return Boolean(user&&user.role==='admin');
  }

  function getDisplayCredential(){
    try{
      const stored=localStorage.getItem(DISPLAY_KEY);
      const parsed=stored?JSON.parse(stored):null;
      return parsed&&typeof parsed==='object'&&parsed.token?parsed:null;
    }catch(error){
      return null;
    }
  }

  function setDisplayCredential(token,displayId,apiBase){
    localStorage.setItem(DISPLAY_KEY,JSON.stringify({token,displayId:displayId||null,apiBase:apiBase||''}));
  }

  function clearDisplayCredential(){
    localStorage.removeItem(DISPLAY_KEY);
  }

  async function apiFetch(path,options){
    const settings=options||{};
    const base=settings.apiBase||getApiBase();
    if(!base)throw new ApiError('No backend API base URL is configured.',0);
    const token=settings.token!==undefined?settings.token:accountToken();
    const headers=Object.assign({Accept:'application/json'},settings.headers||{});
    if(settings.body!==undefined)headers['Content-Type']='application/json';
    if(token)headers.Authorization='Bearer '+token;
    const request=settings.fetchFn||root.fetch;
    if(typeof request!=='function')throw new ApiError('This browser cannot reach the backend.',0);
    let response;
    try{
      response=await request(base+path,{
        method:settings.method||'GET',
        headers,
        cache:'no-store',
        body:settings.body!==undefined?JSON.stringify(settings.body):undefined
      });
    }catch(error){
      throw new ApiError('The backend could not be reached from this browser. Confirm the API base URL, network access, and CORS settings.',0);
    }
    let payload=null;
    let text='';
    try{
      text=await response.text();
    }catch(error){
      text='';
    }
    if(text){
      try{
        payload=JSON.parse(text);
      }catch(error){
        payload=null;
      }
    }
    if(!response.ok){
      const message=(payload&&(payload.error||payload.message))||('The backend rejected the request (HTTP '+response.status+').');
      throw new ApiError(message,response.status);
    }
    return payload;
  }

  async function register(email,password){
    return apiFetch('/api/auth/register',{method:'POST',body:{email,password},token:''});
  }

  async function login(email,password){
    const result=await apiFetch('/api/auth/login',{method:'POST',body:{email,password},token:''});
    setAccount(result&&result.token,result&&result.user);
    return result;
  }

  async function adminLogin(username,password){
    const result=await apiFetch('/api/admin/login',{method:'POST',body:{username,password},token:''});
    setAccount(result&&result.token,result&&result.user);
    return result;
  }

  async function me(){
    return apiFetch('/api/auth/me');
  }

  function logout(){
    clearAccount();
  }

  async function listUsers(){
    return apiFetch('/api/admin/users');
  }

  async function updateUser(id,patch){
    return apiFetch('/api/admin/users/'+encodeURIComponent(id),{method:'PATCH',body:patch});
  }

  async function patchPerson(name,patch){
    return apiFetch('/api/people/'+encodeURIComponent(name),{method:'PATCH',body:patch});
  }

  async function deletePerson(name){
    return apiFetch('/api/people/'+encodeURIComponent(name),{method:'DELETE'});
  }

  async function listDisplayCredentials(){
    return apiFetch('/api/admin/display-credentials');
  }

  async function createDisplayCredential(name){
    return apiFetch('/api/admin/display-credentials',{method:'POST',body:{name}});
  }

  async function revokeDisplayCredential(id){
    return apiFetch('/api/admin/display-credentials/'+encodeURIComponent(id),{method:'DELETE'});
  }

  async function exchangeDisplayCode(code,apiBase){
    return apiFetch('/api/display-credentials/exchange',{method:'POST',body:{code},token:'',apiBase});
  }

  root.Auth={
    ApiError,
    getApiBase,setApiBase,clearApiBase,
    getAccount,setAccount,clearAccount,accountToken,accountUser,isAdmin,
    getDisplayCredential,setDisplayCredential,clearDisplayCredential,
    apiFetch,
    register,login,adminLogin,me,logout,
    listUsers,updateUser,
    patchPerson,deletePerson,
    listDisplayCredentials,createDisplayCredential,revokeDisplayCredential,exchangeDisplayCode
  };
})(typeof window!=='undefined'?window:globalThis);
