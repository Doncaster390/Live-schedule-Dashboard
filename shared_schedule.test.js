const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function makeLocalStorage(){
  const store=new Map();
  return {
    getItem:key=>store.has(key)?store.get(key):null,
    setItem:(key,value)=>{store.set(key,String(value));},
    removeItem:key=>{store.delete(key);},
    clear:()=>{store.clear();}
  };
}

function loadSharedSchedule(){
  const context={URL,URLSearchParams,console,fetch:undefined};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('shared_schedule.js','utf8'),context);
  return {context,shared:context.SharedSchedule};
}

function loadAuth(fetchImpl){
  const context={URL,URLSearchParams,console,localStorage:makeLocalStorage(),fetch:fetchImpl,window:undefined};
  context.window=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('shared_schedule.js','utf8'),context);
  vm.runInContext(fs.readFileSync('auth.js','utf8'),context);
  return context;
}

const backendBase='https://schedule.example.test';

function testSharedScheduleUrlBuilders(){
  const {shared}=loadSharedSchedule();
  assert.equal(shared.backendApiBaseUrl(backendBase+'/'),backendBase);
  assert.throws(()=>shared.backendApiBaseUrl('http://schedule.example.test'),/without credentials/);
  assert.throws(()=>shared.backendApiBaseUrl('https://user:pass@schedule.example.test'),/without credentials/);
  assert.throws(()=>shared.backendApiBaseUrl('https://schedule.example.test/api'),/without credentials/);

  assert.equal(shared.backendScheduleUrl(backendBase),backendBase+'/api/schedule');
  assert.equal(shared.backendLoginUrl(backendBase),backendBase+'/api/admin/login');
  assert.equal(shared.backendAdminScheduleUrl(backendBase),backendBase+'/api/admin/schedule');
  assert.equal(shared.backendSafetyBadgesUrl(backendBase),backendBase+'/api/safety-badges');
  assert.equal(shared.backendAdminSafetyBadgesUrl(backendBase),backendBase+'/api/admin/safety-badges');
  assert.equal(shared.backendRegisterUrl(backendBase),backendBase+'/api/auth/register');
  assert.equal(shared.backendUserLoginUrl(backendBase),backendBase+'/api/auth/login');
  assert.equal(shared.backendMeUrl(backendBase),backendBase+'/api/auth/me');
  assert.equal(shared.backendAdminUsersUrl(backendBase),backendBase+'/api/admin/users');
  assert.equal(shared.backendAdminUserUrl(backendBase,'u 1'),backendBase+'/api/admin/users/u%201');
  assert.equal(shared.backendPersonUrl(backendBase,'Alex Smith'),backendBase+'/api/people/Alex%20Smith');
  assert.equal(shared.backendAdminDisplayCredentialsUrl(backendBase),backendBase+'/api/admin/display-credentials');
  assert.equal(shared.backendAdminDisplayCredentialUrl(backendBase,'d1'),backendBase+'/api/admin/display-credentials/d1');
  assert.equal(shared.backendDisplayCredentialExchangeUrl(backendBase),backendBase+'/api/display-credentials/exchange');

  const link=shared.cardViewUrl('card_view.html',{team:'CDC',search:'Alex',roles:['Cycles','Picking'],api:backendBase});
  const params=new URL(link,'https://dashboard.test/').searchParams;
  assert.equal(params.get('team'),'CDC');
  assert.equal(params.get('search'),'Alex');
  assert.deepEqual(params.getAll('role'),['Cycles','Picking']);
  assert.equal(params.get('api'),backendBase);
  assert.equal(params.has('gist'),false,'card view links must never include a gist reference');
  assert.equal(params.has('date'),false);
  assert.equal(params.has('token'),false);

  const dashboardLink=shared.dashboardShareUrl('https://dashboard.test/index.html?token=secret#private',backendBase+'/');
  assert.equal(dashboardLink,'https://dashboard.test/index.html?api=https%3A%2F%2Fschedule.example.test');
  assert.doesNotMatch(dashboardLink,/token|secret|private/);

  assert.equal(shared.gistIdFromReference,undefined,'Gist support must be removed from the frontend.');
  assert.equal(shared.fetchGistSchedule,undefined,'Gist support must be removed from the frontend.');
  console.log('shared_schedule URL builder tests passed');
}

async function testSharedScheduleFetchHelpers(){
  const {shared}=loadSharedSchedule();
  const rows=await shared.fetchBackendSchedule(backendBase,async(url,options)=>{
    assert.equal(url,backendBase+'/api/schedule');
    assert.equal(options.cache,'no-store');
    assert.equal(options.headers.Accept,'application/json');
    assert.equal(options.headers.Authorization,'Bearer tok-123');
    return {ok:true,status:200,json:async()=>({version:3,updated_at:'2026-09-24T09:00:00Z',rows:[{name:'Alex',date:'2026-09-07'}]})};
  },'tok-123');
  assert.equal(rows[0].name,'Alex');

  await assert.rejects(shared.fetchBackendSchedule(backendBase,async()=>({ok:false,status:403,json:async()=>({error:'forbidden'})}),'bad-token'),error=>{assert.equal(error.status,403);return true;});

  const badges=await shared.fetchBackendSafetyBadges(backendBase,async(url,options)=>{
    assert.equal(url,backendBase+'/api/safety-badges');
    assert.equal(options.headers.Authorization,'Bearer tok-123');
    return {ok:true,status:200,json:async()=>({version:2,updated_at:'2026-09-24T09:00:00Z',badges:{firstAid:['Alex Smith','Alex Smith'],fireMarshal:['Sam Jones'],workingAtHeight:[]}})};
  },'tok-123');
  assert.deepEqual(JSON.parse(JSON.stringify(badges)),{firstAid:['Alex Smith'],fireMarshal:['Sam Jones'],workingAtHeight:[]});
  assert.deepEqual(JSON.parse(JSON.stringify(shared.safetyBadgesFor(badges,'Smith, Alex'))),[{className:'first-aid',label:'First aider',symbol:'✚'}]);
  assert.throws(()=>shared.normaliseSafetyBadges({firstAid:[],fireMarshal:[]}),/working at height/);
  console.log('shared_schedule fetch helper tests passed');
}

async function testAuthRegisterLoginMe(){
  const calls=[];
  const context=loadAuth(async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/api/auth/register')){
      return {ok:true,status:201,text:async()=>JSON.stringify({status:'pending',message:'Your request is pending approval.'})};
    }
    if(url.endsWith('/api/auth/login')){
      const body=JSON.parse(options.body);
      if(body.password!=='correct-horse')return {ok:false,status:401,text:async()=>JSON.stringify({error:'Invalid email or password.'})};
      return {ok:true,status:200,text:async()=>JSON.stringify({token:'human-token',user:{id:'u1',email:body.email,role:'viewer',status:'approved'}})};
    }
    if(url.endsWith('/api/auth/me')){
      assert.equal(options.headers.Authorization,'Bearer human-token');
      return {ok:true,status:200,text:async()=>JSON.stringify({id:'u1',email:'a@test.com',role:'viewer',status:'approved',bootstrap:false})};
    }
    throw Error('unexpected url '+url);
  });
  context.Auth.setApiBase(backendBase);

  const registerResult=await context.Auth.register('a@test.com','p@ssword1');
  assert.equal(registerResult.status,'pending');
  assert.equal(context.Auth.getAccount(),null,'Registering must never store a token.');

  await assert.rejects(context.Auth.login('a@test.com','wrong'),error=>{assert.equal(error.status,401);return true;});
  assert.equal(context.Auth.getAccount(),null,'A failed login must not store a token.');

  const loginResult=await context.Auth.login('a@test.com','correct-horse');
  assert.equal(loginResult.token,'human-token');
  assert.equal(context.Auth.accountToken(),'human-token');
  assert.equal(context.Auth.accountUser().role,'viewer');
  assert.equal(context.Auth.isAdmin(),false);

  const me=await context.Auth.me();
  assert.equal(me.status,'approved');

  context.Auth.logout();
  assert.equal(context.Auth.getAccount(),null);

  const registerCall=calls.find(call=>call.url.endsWith('/api/auth/register'));
  assert.equal(registerCall.options.headers.Authorization,undefined,'Registration must never send an Authorization header.');
  console.log('auth register/login/me tests passed');
}

async function testAuthAdminLoginAndUserManagement(){
  const context=loadAuth(async(url,options)=>{
    if(url.endsWith('/api/admin/login')){
      return {ok:true,status:200,text:async()=>JSON.stringify({token:'admin-token',user:{id:null,email:'admin',role:'admin',status:'approved',bootstrap:true}})};
    }
    if(url.endsWith('/api/admin/users')&&(options.method||'GET')==='GET'){
      assert.equal(options.headers.Authorization,'Bearer admin-token');
      return {ok:true,status:200,text:async()=>JSON.stringify({users:[{id:'u1',email:'a@test.com',role:'viewer',status:'pending',created_at:'2026-01-01',updated_at:'2026-01-01'}]})};
    }
    if(url.endsWith('/api/admin/users/u1')&&options.method==='PATCH'){
      assert.deepEqual(JSON.parse(options.body),{status:'approved',role:'viewer'});
      return {ok:true,status:200,text:async()=>JSON.stringify({id:'u1',email:'a@test.com',role:'viewer',status:'approved',created_at:'2026-01-01',updated_at:'2026-01-02'})};
    }
    throw Error('unexpected url '+url+' '+(options&&options.method));
  });
  context.Auth.setApiBase(backendBase);
  await context.Auth.adminLogin('admin','1234');
  assert.equal(context.Auth.isAdmin(),true);
  const {users}=await context.Auth.listUsers();
  assert.equal(users.length,1);
  const updated=await context.Auth.updateUser('u1',{status:'approved',role:'viewer'});
  assert.equal(updated.status,'approved');
  console.log('auth admin login/user management tests passed');
}

async function testAuthPeopleAndDisplayCredentials(){
  const context=loadAuth(async(url,options)=>{
    if(url.endsWith('/api/people/Alex%20Smith')&&options.method==='PATCH'){
      assert.deepEqual(JSON.parse(options.body),{role:'Cycles'});
      return {ok:true,status:200,text:async()=>JSON.stringify({version:4,updated_at:'2026-01-01',rows_updated:2})};
    }
    if(url.endsWith('/api/people/Alex%20Smith')&&options.method==='DELETE'){
      return {ok:true,status:200,text:async()=>JSON.stringify({version:5,updated_at:'2026-01-02',rows_removed:2})};
    }
    if(url.endsWith('/api/admin/display-credentials')&&options.method==='POST'){
      assert.deepEqual(JSON.parse(options.body),{name:'Breakroom TV'});
      return {ok:true,status:201,text:async()=>JSON.stringify({id:'d1',name:'Breakroom TV',scope:'dashboard:read',created_at:'2026-01-01',setup_expires_at:'2026-01-01T00:10:00Z',revoked_at:null,setup_code:'ABC123'})};
    }
    if(url.endsWith('/api/admin/display-credentials')&&(options.method||'GET')==='GET'){
      return {ok:true,status:200,text:async()=>JSON.stringify({credentials:[{id:'d1',name:'Breakroom TV',scope:'dashboard:read',created_at:'2026-01-01',revoked_at:null,activated:false,setup_pending:true}]})};
    }
    if(url.endsWith('/api/admin/display-credentials/d1')&&options.method==='DELETE'){
      return {ok:true,status:200,text:async()=>JSON.stringify({id:'d1',name:'Breakroom TV',scope:'dashboard:read',revoked_at:'2026-01-02'})};
    }
    if(url.endsWith('/api/display-credentials/exchange')&&options.method==='POST'){
      assert.deepEqual(JSON.parse(options.body),{code:'ABC123'});
      assert.equal(options.headers.Authorization,undefined,'Exchanging a setup code must not send a bearer token.');
      return {ok:true,status:200,text:async()=>JSON.stringify({token:'display-token',scope:'dashboard:read',displayId:'d1'})};
    }
    throw Error('unexpected url '+url+' '+(options&&options.method));
  });
  context.Auth.setApiBase(backendBase);
  context.Auth.setAccount('human-token',{id:'u1',email:'a@test.com',role:'viewer',status:'approved'});

  const patchResult=await context.Auth.patchPerson('Alex Smith',{role:'Cycles'});
  assert.equal(patchResult.rows_updated,2);
  const deleteResult=await context.Auth.deletePerson('Alex Smith');
  assert.equal(deleteResult.rows_removed,2);

  const created=await context.Auth.createDisplayCredential('Breakroom TV');
  assert.equal(created.setup_code,'ABC123');
  const {credentials}=await context.Auth.listDisplayCredentials();
  assert.equal(credentials[0].setup_pending,true);
  const revoked=await context.Auth.revokeDisplayCredential('d1');
  assert.ok(revoked.revoked_at);

  const exchange=await context.Auth.exchangeDisplayCode('ABC123',backendBase);
  assert.equal(exchange.token,'display-token');
  context.Auth.setDisplayCredential(exchange.token,exchange.displayId,backendBase);
  assert.equal(context.Auth.getDisplayCredential().token,'display-token');
  context.Auth.clearDisplayCredential();
  assert.equal(context.Auth.getDisplayCredential(),null);
  console.log('auth people/display-credential tests passed');
}

function testStaticFilesHaveNoPublicFallback(){
  assert.equal(fs.existsSync('schedule.json'),false,'schedule.json must not be published alongside the dashboard.');

  const indexHtml=fs.readFileSync('index.html','utf8');
  assert.doesNotMatch(indexHtml,/initialData/,'index.html must not embed any roster of shift rows.');
  assert.match(indexHtml,/let data=\[\]/,'index.html should start with an empty, server-loaded data array.');
  assert.doesNotMatch(indexHtml,/schedule\.json/,'index.html must not reference schedule.json.');
  assert.match(indexHtml,/<script src="shared_schedule\.js"><\/script>/);
  assert.match(indexHtml,/<script src="auth\.js"><\/script>/);
  assert.match(indexHtml,/<script src="app\.js[^"]*"><\/script>/);
  assert.match(indexHtml,/<script src="dashboard\.js[^"]*"><\/script>/);
  assert.match(indexHtml,/id="authGate"/);
  assert.match(indexHtml,/id="appRoot" hidden/);
  assert.match(indexHtml,/id="signInForm"/);
  assert.match(indexHtml,/id="requestAccessForm" hidden/);
  assert.match(indexHtml,/id="adminSignInForm" hidden/);
  assert.match(indexHtml,/id="peoplePanel"/);
  assert.match(indexHtml,/id="adminPanel"/);
  assert.match(indexHtml,/id="usersSavedNote"/,'the admin panel must show a saved/no-change confirmation note.');
  assert.doesNotMatch(indexHtml,/id="createDisplayForm"|id="displayList"|id="displaySetupCode"|id="displaysError"/,'the admin panel no longer needs a display-credential setup UI now that kiosk reads are public.');

  const dashboard=fs.readFileSync('dashboard.js','utf8');
  assert.doesNotMatch(dashboard,/schedule\.json/,'dashboard.js must not fall back to schedule.json.');
  assert.doesNotMatch(dashboard,/api\.github\.com|gist/i,'dashboard.js must not read from a public Gist.');
  assert.match(dashboard,/^function initDashboard\(\)\{/m);
  assert.match(dashboard,/window\.initDashboard=initDashboard;/);
  assert.doesNotMatch(dashboard,/\}\s*initDashboard\(\);/,'dashboard.js must not auto-run before login.');
  assert.match(dashboard,/Auth\.accountToken\(\)/);
  assert.match(dashboard,/Auth\.isAdmin\(\)/);
  assert.match(dashboard,/window\.onAuthExpired/);

  const cardView=fs.readFileSync('card_view.html','utf8');
  const unattendedDisplay=fs.readFileSync('index_display.html','utf8');
  for(const [name,html] of [['card_view.html',cardView],['index_display.html',unattendedDisplay]]){
    assert.match(html,/<meta name="referrer" content="no-referrer">/,name+' must send a no-referrer policy.');
    assert.doesNotMatch(html,/schedule\.json/,name+' must not fall back to schedule.json.');
    assert.doesNotMatch(html,/api\.github\.com|gist/i,name+' must not read from a public Gist.');
    assert.doesNotMatch(html,/<script src="auth\.js">/,name+' kiosk pages read the public schedule/badge endpoints and no longer need the Auth client.');
    assert.match(html,/function currentApiBase\(\)/,name+' must resolve the backend API base from ?api= (or a cached value).');
    assert.match(html,/fetchBackendSchedule\(base\)/,name+' must read the public schedule endpoint without a bearer token.');
    assert.match(html,/fetchBackendSafetyBadges\(base\)/,name+' must read the public safety-badges endpoint without a bearer token.');
    assert.doesNotMatch(html,/exchangeDisplayCode|setupCode|Auth\.getDisplayCredential|Auth\.accountToken/,name+' must not require a display-credential setup flow for public reads.');
    assert.doesNotMatch(html,/[?&]code=|setupCode=/,name+' must never read a setup code from the URL.');
  }
  console.log('static file regression tests passed');
}

function loadApp(){
  const document={
    readyState:'loading',
    addEventListener:()=>{}
  };
  const context={URL,URLSearchParams,console,window:undefined,document};
  context.window=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  return context;
}

function testAdminUserSaveOnlyPatchesChangedFields(){
  const {buildUserPatch}=loadApp();
  const same=(actual,expected)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected));
  // Regression test: a pending user's Save button must not resend the
  // unmodified 'pending' status when only the role is changed - doing so
  // previously made legitimate role-only saves fail against stricter
  // backend validation of the status field, making the change appear to
  // "not persist" even though the admin never touched status.
  const pendingUser={id:'1',email:'a@test.com',role:'viewer',status:'pending'};
  same(buildUserPatch(pendingUser,'pending','admin'),{role:'admin'});
  same(buildUserPatch(pendingUser,'approved','viewer'),{status:'approved'});
  same(buildUserPatch(pendingUser,'approved','admin'),{status:'approved',role:'admin'});
  same(buildUserPatch(pendingUser,'pending','viewer'),{});
  same(buildUserPatch(null,'approved','admin'),{status:'approved',role:'admin'});
  console.log('admin user save patch tests passed');
}

function testAdminSaveShowsFeedback(){
  const appSrc=fs.readFileSync('app.js','utf8');
  assert.match(appSrc,/showPanelSavedNote\('No changes to save for this user\.'\)/,'Save must tell the admin explicitly when there is nothing to change, instead of doing nothing silently.');
  assert.match(appSrc,/showPanelSavedNote\('Saved\.'\)/,'Save must confirm a successful update so admins are not left guessing whether it persisted.');
  assert.doesNotMatch(appSrc,/handleCreateDisplay|handleDisplayListClick|refreshDisplayList|renderDisplayList/,'the admin screen no longer needs the display-credential setup UI now that kiosk reads are public.');
  console.log('admin save feedback UI tests passed');
}

(async()=>{
  testSharedScheduleUrlBuilders();
  await testSharedScheduleFetchHelpers();
  await testAuthRegisterLoginMe();
  await testAuthAdminLoginAndUserManagement();
  await testAuthPeopleAndDisplayCredentials();
  testStaticFilesHaveNoPublicFallback();
  testAdminUserSaveOnlyPatchesChangedFields();
  testAdminSaveShowsFeedback();
  console.log('all tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
