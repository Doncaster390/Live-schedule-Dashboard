const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context={URL,URLSearchParams,console};
vm.createContext(context);
vm.runInContext(fs.readFileSync('shared_schedule.js','utf8'),context);
const shared=context.SharedSchedule;
const gistId='0123456789abcdef0123456789abcdef';
const backendBase='https://schedule.example.test';

assert.equal(shared.gistIdFromReference(gistId),gistId);
assert.equal(shared.gistIdFromReference('https://api.github.com/gists/'+gistId),gistId);
assert.equal(shared.gistIdFromReference('https://example.test/gists/'+gistId),'');
assert.equal(shared.backendApiBaseUrl(backendBase+'/'),backendBase);
assert.equal(shared.backendScheduleUrl(backendBase),backendBase+'/api/schedule');
assert.equal(shared.backendLoginUrl(backendBase),backendBase+'/api/admin/login');
assert.equal(shared.backendAdminScheduleUrl(backendBase),backendBase+'/api/admin/schedule');
assert.equal(shared.backendSafetyBadgesUrl(backendBase),backendBase+'/api/safety-badges');
assert.equal(shared.backendAdminSafetyBadgesUrl(backendBase),backendBase+'/api/admin/safety-badges');
assert.throws(()=>shared.backendApiBaseUrl('http://schedule.example.test'),/without credentials/);
assert.throws(()=>shared.backendApiBaseUrl('https://admin:secret@schedule.example.test'),/without credentials/);
assert.throws(()=>shared.backendApiBaseUrl('https://schedule.example.test/api'),/without credentials/);

const link=shared.cardViewUrl('card_view.html',{team:'CDC',search:'Alex',roles:['Cycles','Picking'],api:backendBase,gist:gistId});
const params=new URL(link,'https://dashboard.test/').searchParams;
assert.equal(params.get('team'),'CDC');
assert.equal(params.get('search'),'Alex');
assert.deepEqual(params.getAll('role'),['Cycles','Picking']);
assert.equal(params.get('api'),backendBase);
assert.equal(params.get('gist'),gistId);
assert.equal(params.has('date'),false);
assert.equal(params.has('token'),false);

const dashboardLink=shared.dashboardShareUrl('https://dashboard.test/index.html?token=secret#private',backendBase+'/');
assert.equal(dashboardLink,'https://dashboard.test/index.html?api=https%3A%2F%2Fschedule.example.test');
assert.doesNotMatch(dashboardLink,/token|secret|private/);
assert.throws(()=>shared.dashboardShareUrl('https://dashboard.test/index.html','https://user:password@schedule.example.test'),/without credentials/);

(async()=>{
  const backendRows=await shared.fetchBackendSchedule(backendBase,async(url,options)=>{
    assert.equal(url,backendBase+'/api/schedule');
    assert.equal(options.cache,'no-store');
    assert.equal(options.headers.Accept,'application/json');
    return {ok:true,status:200,json:async()=>({version:3,updated_at:'2026-09-24T09:00:00Z',rows:[{name:'Alex',date:'2026-09-07'}]})};
  });
  assert.equal(backendRows[0].name,'Alex');

  const badges=await shared.fetchBackendSafetyBadges(backendBase,async(url,options)=>{
    assert.equal(url,backendBase+'/api/safety-badges');
    assert.equal(options.cache,'no-store');
    assert.equal(options.headers.Accept,'application/json');
    assert.equal(options.headers.Authorization,undefined);
    return {ok:true,status:200,json:async()=>({version:2,updated_at:'2026-09-24T09:00:00Z',badges:{firstAid:['Alex Smith','Alex Smith'],fireMarshal:['Sam Jones'],workingAtHeight:[]}})};
  });
  assert.deepEqual(JSON.parse(JSON.stringify(badges)),{firstAid:['Alex Smith'],fireMarshal:['Sam Jones'],workingAtHeight:[]});
  assert.deepEqual(JSON.parse(JSON.stringify(shared.safetyBadgesFor(badges,'Smith, Alex'))),[{className:'first-aid',label:'First aider',symbol:'✚'}]);
  assert.throws(()=>shared.normaliseSafetyBadges({firstAid:[],fireMarshal:[]}),/working at height/);

  const rows=await shared.fetchGistSchedule(gistId,async url=>{
    assert.equal(url,'https://api.github.com/gists/'+gistId);
    return {ok:true,status:200,json:async()=>({files:{'live-schedule.json':{content:'[{"name":"Alex","date":"2026-09-07"}]'}}})};
  });
  assert.equal(rows[0].name,'Alex');
  assert.equal(rows[0].date,'2026-09-07');
  assert.deepEqual(JSON.parse(JSON.stringify(rows)),[{name:'Alex',date:'2026-09-07'}]);

  const rawRows=await shared.fetchGistSchedule(gistId,async url=>{
    if(url==='https://api.github.com/gists/'+gistId)return {ok:true,status:200,json:async()=>({files:{'live-schedule.json':{truncated:true,raw_url:'https://gist.githubusercontent.com/example/'+gistId+'/raw/live-schedule.json'}}})};
    assert.equal(url,'https://gist.githubusercontent.com/example/'+gistId+'/raw/live-schedule.json');
    return {ok:true,status:200,text:async()=>'[{"name":"Sam","date":"2026-09-08"}]'};
  });
  assert.equal(rawRows[0].name,'Sam');

  const cardView=fs.readFileSync('card_view.html','utf8');
  const unattendedDisplay=fs.readFileSync('index_display.html','utf8');
  const dashboard=fs.readFileSync('dashboard.js','utf8');
  const dateValueSource=dashboard.match(/^function dateValue\(value\)\{.+\}$/m);
  const shiftDateLabelSource=dashboard.match(/^function shiftDateLabel\(value\)\{.+\}$/m);
  assert.ok(dateValueSource,'The dashboard should normalize shift dates.');
  assert.ok(shiftDateLabelSource,'The dashboard should format a human-readable shift date.');
  vm.runInContext(dateValueSource[0],context);
  vm.runInContext(shiftDateLabelSource[0],context);
  assert.equal(context.shiftDateLabel('07/09/2026'),'Mon, 7 Sept 2026');
  assert.match(cardView,/SharedSchedule\.fetchBackendSchedule\(backendSource\)/);
  assert.match(cardView,/SharedSchedule\.fetchBackendSafetyBadges\(backendSource\)/);
  assert.match(cardView,/SharedSchedule\.fetchGistSchedule\(sharedSource\)/);
  assert.match(unattendedDisplay,/SharedSchedule\.fetchBackendSchedule\(backendSource\)/);
  assert.match(unattendedDisplay,/SharedSchedule\.fetchBackendSafetyBadges\(backendSource\)/);
  assert.match(unattendedDisplay,/SharedSchedule\.fetchGistSchedule\(sharedSource\)/);
  assert.match(dashboard,/SharedSchedule\.backendApiBaseUrl\(reference\)/);
  assert.match(dashboard,/localStorage\.setItem\(SHARED_BACKEND_API_BASE_KEY,base\)/);
  assert.match(dashboard,/SharedSchedule\.dashboardShareUrl\(window\.location\.href,base\)/);
  assert.match(dashboard,/sharedBackendUrlError='The dashboard link has an invalid backend API base URL/);
  assert.match(dashboard,/initialiseSharedBackendFromUrl\(\);[\s\S]*refreshLiveRows\(\);/);
  assert.doesNotMatch(dashboard,/Public Gist|sharedGist|gistRequest|operatorToken|api\.github\.com/i);
  assert.doesNotMatch(cardView,/params\.get\('token'\)/);
  assert.doesNotMatch(unattendedDisplay,/params\.get\('token'\)/);
  assert.doesNotMatch(cardView,/Authorization/);
  assert.doesNotMatch(unattendedDisplay,/Authorization/);
  assert.match(dashboard,/backendAdminSafetyBadgesUrl\(base\)/);
  assert.match(dashboard,/fetchBackendSafetyBadges\(base\)/);
  assert.match(dashboard,/body:\{badges:SharedSchedule\.normaliseSafetyBadges\(badges\)\}/);
  assert.match(dashboard,/shared clearing failed/);
  assert.match(dashboard,/<div class="shift-date"><span>Shift date<\/span><time datetime="/);
  assert.match(dashboard,/shiftDateLabel\(row\.date\)/);
  assert.doesNotMatch(cardView,/shift-date/);
  assert.doesNotMatch(unattendedDisplay,/shift-date/);
  assert.match(dashboard,/downloadMonthlyHoursReport/);
  assert.match(dashboard,/hours-by-work-role-/);
  assert.match(dashboard,/Monthly hours/);
  assert.match(dashboard,/Weekly hours/);
  assert.match(dashboard,/weeklyHoursRows/);
  assert.match(dashboard,/blockIndex<blocks\.length-1\?\[''\]:\[\]/);
  assert.match(dashboard,/weeklyRows=weeklyHoursRows\(sourceRows,group\)/);
  assert.match(dashboard,/Scheduled hours/);

  const source=new Date(2026,8,8,2,30);
  const shiftDate=new Date(source);
  if(source.getHours()<5)shiftDate.setDate(shiftDate.getDate()-1);
  assert.equal(shiftDate.toISOString().slice(0,10),'2026-09-07');
  console.log('shared_schedule tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
