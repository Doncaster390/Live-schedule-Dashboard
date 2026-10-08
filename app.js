(function(){
  const byId=id=>document.getElementById(id);
  const ROLE_OPTIONS=['viewer','admin'];
  const STATUS_OPTIONS=['pending','approved','rejected','revoked'];

  function showAuthGateError(message){const error=byId('authGateError');if(!error)return;error.textContent=message||'';error.hidden=!message;}
  function showPending(message){const pending=byId('authGatePending');if(!pending)return;pending.hidden=!message;if(message)pending.textContent=message;}
  function showPanelError(id,message){const error=byId(id);if(!error)return;error.textContent=message||'';error.hidden=!message;}
  function showPanelSavedNote(message){const note=byId('usersSavedNote');if(!note)return;note.textContent=message||'';note.hidden=!message;}

  function setActiveTab(name){
    const tabs={signIn:'tabSignIn',requestAccess:'tabRequestAccess',adminSignIn:'tabAdminSignIn'};
    const forms={signIn:'signInForm',requestAccess:'requestAccessForm',adminSignIn:'adminSignInForm'};
    Object.keys(tabs).forEach(key=>{
      byId(tabs[key]).setAttribute('aria-selected',String(key===name));
      byId(forms[key]).hidden=key!==name;
    });
    showAuthGateError('');
    showPending('');
  }

  function showAuthGate(){
    byId('authGate').hidden=false;
    byId('appRoot').hidden=true;
  }

  function showApp(){
    byId('authGate').hidden=true;
    byId('appRoot').hidden=false;
  }

  function updateAccountLabel(){
    const user=Auth.accountUser();
    const label=byId('accountLabel');
    if(!label)return;
    if(!user){label.textContent='';return;}
    label.textContent=(user.email||'Admin')+' ('+user.role+')';
    const adminButton=byId('openAdminPanel');
    if(adminButton)adminButton.hidden=user.role!=='admin';
  }

  function onAuthExpired(message){
    Auth.clearAccount();
    showAuthGate();
    setActiveTab('signIn');
    showAuthGateError(message||'Your session is no longer valid. Please sign in again.');
  }
  window.onAuthExpired=onAuthExpired;

  async function enterApp(){
    updateAccountLabel();
    showApp();
    if(typeof window.initDashboard==='function'&&!window.__dashboardStarted){
      window.__dashboardStarted=true;
      window.initDashboard();
    }else if(typeof window.refreshSchedule==='function'){
      window.refreshSchedule();
    }
  }

  function applyUrlApiBase(){
    let currentUrl;
    try{currentUrl=new URL(window.location.href);}catch(error){return;}
    const reference=currentUrl.searchParams.get('api');
    if(reference===null)return;
    try{
      const base=Auth.setApiBase(reference);
      byId('apiBaseInput').value=base;
      if(window.history&&window.history.replaceState)window.history.replaceState(null,'',currentUrl.pathname);
    }catch(error){
      showAuthGateError('The dashboard link has an invalid backend API base URL.');
    }
  }

  async function boot(){
    applyUrlApiBase();
    const savedBase=Auth.getApiBase();
    if(savedBase)byId('apiBaseInput').value=savedBase;
    const account=Auth.getAccount();
    if(!account){showAuthGate();setActiveTab('signIn');return;}
    try{
      const me=await Auth.me();
      Auth.setAccount(account.token,me);
      await enterApp();
    }catch(error){
      Auth.clearAccount();
      showAuthGate();
      setActiveTab('signIn');
      if(error&&(error.status===401||error.status===403)){
        showAuthGateError('Your session is no longer valid. Please sign in again.');
      }
    }
  }

  function requireApiBase(){
    const base=byId('apiBaseInput').value.trim();
    return Auth.setApiBase(base);
  }

  async function handleSignIn(event){
    event.preventDefault();
    showAuthGateError('');
    showPending('');
    try{
      requireApiBase();
      const email=byId('signInEmail').value.trim(),password=byId('signInPassword').value;
      await Auth.login(email,password);
      byId('signInPassword').value='';
      await enterApp();
    }catch(error){
      if(error instanceof Auth.ApiError&&error.status===403){
        showPending('Your access request is '+(error.message||'pending')+'. An admin must approve your account before you can sign in.');
        return;
      }
      showAuthGateError('Could not sign in: '+error.message);
    }
  }

  async function handleRequestAccess(event){
    event.preventDefault();
    showAuthGateError('');
    try{
      requireApiBase();
      const email=byId('requestEmail').value.trim(),password=byId('requestPassword').value;
      const result=await Auth.register(email,password);
      byId('requestAccessForm').reset();
      showPending((result&&result.message)||'Your access request has been submitted and is pending admin approval.');
    }catch(error){
      showAuthGateError('Could not submit the access request: '+error.message);
    }
  }

  async function handleAdminSignIn(event){
    event.preventDefault();
    showAuthGateError('');
    try{
      requireApiBase();
      const username=byId('adminUsername').value.trim(),pin=byId('adminPin').value;
      await Auth.adminLogin(username,pin);
      byId('adminPin').value='';
      await enterApp();
    }catch(error){
      showAuthGateError('Could not sign in as admin: '+error.message);
    }
  }

  function signOut(){
    Auth.logout();
    showAuthGate();
    setActiveTab('signIn');
  }

  // ---- People directory ----

  function uniquePeople(){
    const names=new Map();
    const rows=typeof data!=='undefined'&&Array.isArray(data)?data:[];
    rows.forEach(row=>{
      const name=String(row&&row.name||'').trim();
      if(name&&!names.has(name))names.set(name,row.role||'');
    });
    return [...names.entries()].map(([name,role])=>({name,role})).sort((a,b)=>a.name.localeCompare(b.name));
  }

  function renderPeopleList(){
    const list=byId('peopleList');
    if(!list)return;
    const people=uniquePeople();
    if(!people.length){
      list.innerHTML='<p class="small">No people are currently in the loaded schedule.</p>';
      return;
    }
    list.innerHTML=people.map(person=>{
      const safeName=encodeURIComponent(person.name);
      return '<div class="data-note" style="justify-content:space-between;border-bottom:1px solid #e1e8f3;padding:8px 0">'
        +'<span>'+escapeText(person.name)+'</span>'
        +'<span style="display:flex;gap:6px;align-items:center">'
        +'<input type="text" class="modal-input" style="width:160px" data-skill-input="'+safeName+'" placeholder="Skill" value="'+escapeText(person.role||'')+'">'
        +'<button class="clear" type="button" data-save-skill="'+safeName+'">Save skill</button>'
        +'<button class="remove-btn" type="button" data-remove-person="'+safeName+'">Remove</button>'
        +'</span></div>';
    }).join('');
  }

  function escapeText(value){
    return String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  async function handlePeopleListClick(event){
    const saveButton=event.target.closest('[data-save-skill]');
    const removeButton=event.target.closest('[data-remove-person]');
    showPanelError('peopleError','');
    if(saveButton){
      const name=decodeURIComponent(saveButton.getAttribute('data-save-skill'));
      const input=byId('peopleList').querySelector('[data-skill-input="'+saveButton.getAttribute('data-save-skill')+'"]');
      const role=input?input.value.trim():'';
      try{
        await Auth.patchPerson(name,{role});
        if(typeof window.refreshSchedule==='function')await window.refreshSchedule();
        renderPeopleList();
      }catch(error){
        if(handleAuthFailureFromPanel(error))return;
        showPanelError('peopleError','Could not update '+name+': '+error.message);
      }
      return;
    }
    if(removeButton){
      const name=decodeURIComponent(removeButton.getAttribute('data-remove-person'));
      if(!confirm('Remove '+name+' from the shared roster? This cannot be undone.'))return;
      try{
        await Auth.deletePerson(name);
        if(typeof window.refreshSchedule==='function')await window.refreshSchedule();
        renderPeopleList();
      }catch(error){
        if(handleAuthFailureFromPanel(error))return;
        showPanelError('peopleError','Could not remove '+name+': '+error.message);
      }
    }
  }

  function handleAuthFailureFromPanel(error){
    if(error&&(error.status===401||error.status===403)){
      onAuthExpired('Your session is no longer valid. Please sign in again.');
      return true;
    }
    return false;
  }

  // ---- Admin: users ----

  const loadedUsersById=new Map();

  function buildUserPatch(original,nextStatus,nextRole){
    const patch={};
    if(!original||nextStatus!==original.status)patch.status=nextStatus;
    if(!original||nextRole!==original.role)patch.role=nextRole;
    return patch;
  }
  window.buildUserPatch=buildUserPatch;

  function renderUsersList(users){
    const list=byId('usersList');
    if(!list)return;
    loadedUsersById.clear();
    users.forEach(user=>loadedUsersById.set(String(user.id),user));
    if(!users.length){
      list.innerHTML='<p class="small">No access requests yet.</p>';
      return;
    }
    list.innerHTML=users.map(user=>{
      const id=escapeText(String(user.id));
      const statusOptions=STATUS_OPTIONS.map(status=>'<option value="'+status+'"'+(status===user.status?' selected':'')+'>'+status+'</option>').join('');
      const roleOptions=ROLE_OPTIONS.map(role=>'<option value="'+role+'"'+(role===user.role?' selected':'')+'>'+role+'</option>').join('');
      return '<div class="data-note" style="justify-content:space-between;flex-wrap:wrap;border-bottom:1px solid #e1e8f3;padding:8px 0">'
        +'<span>'+escapeText(user.email)+'</span>'
        +'<span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
        +'<select class="modal-input" data-user-status="'+id+'">'+statusOptions+'</select>'
        +'<select class="modal-input" data-user-role="'+id+'">'+roleOptions+'</select>'
        +'<button class="button" type="button" data-save-user="'+id+'">Save</button>'
        +'</span></div>';
    }).join('');
  }

  async function refreshUsersList(){
    try{
      const result=await Auth.listUsers();
      renderUsersList((result&&result.users)||[]);
    }catch(error){
      if(handleAuthFailureFromPanel(error))return;
      showPanelError('usersError','Could not load user access requests: '+error.message);
    }
  }

  async function handleUsersListClick(event){
    const saveButton=event.target.closest('[data-save-user]');
    if(!saveButton)return;
    const id=saveButton.getAttribute('data-save-user');
    const statusSelect=byId('usersList').querySelector('[data-user-status="'+id+'"]');
    const roleSelect=byId('usersList').querySelector('[data-user-role="'+id+'"]');
    showPanelError('usersError','');
    showPanelSavedNote('');
    const original=loadedUsersById.get(id);
    const patch=buildUserPatch(original,statusSelect.value,roleSelect.value);
    if(!Object.keys(patch).length){
      showPanelSavedNote('No changes to save for this user.');
      return;
    }
    saveButton.disabled=true;
    try{
      await Auth.updateUser(id,patch);
      await refreshUsersList();
      showPanelSavedNote('Saved.');
    }catch(error){
      if(handleAuthFailureFromPanel(error))return;
      showPanelError('usersError','Could not update user: '+error.message);
    }finally{
      saveButton.disabled=false;
    }
  }

  function wireEvents(){
    byId('tabSignIn').addEventListener('click',()=>setActiveTab('signIn'));
    byId('tabRequestAccess').addEventListener('click',()=>setActiveTab('requestAccess'));
    byId('tabAdminSignIn').addEventListener('click',()=>setActiveTab('adminSignIn'));
    byId('signInForm').addEventListener('submit',handleSignIn);
    byId('requestAccessForm').addEventListener('submit',handleRequestAccess);
    byId('adminSignInForm').addEventListener('submit',handleAdminSignIn);
    byId('signOutAccount').addEventListener('click',signOut);

    byId('openPeoplePanel').addEventListener('click',()=>{renderPeopleList();byId('peoplePanel').hidden=false;});
    byId('closePeoplePanel').addEventListener('click',()=>{byId('peoplePanel').hidden=true;});
    byId('peoplePanel').addEventListener('click',event=>{if(event.target===byId('peoplePanel'))byId('peoplePanel').hidden=true;});
    byId('peopleList').addEventListener('click',handlePeopleListClick);

    byId('openAdminPanel').addEventListener('click',()=>{byId('adminPanel').hidden=false;refreshUsersList();});
    byId('closeAdminPanel').addEventListener('click',()=>{byId('adminPanel').hidden=true;});
    byId('adminPanel').addEventListener('click',event=>{if(event.target===byId('adminPanel'))byId('adminPanel').hidden=true;});
    byId('usersList').addEventListener('click',handleUsersListClick);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{wireEvents();boot();});
  }else{
    wireEvents();
    boot();
  }
})();
