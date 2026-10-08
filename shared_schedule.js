(function(root){
  function backendApiBaseUrl(value){
    const reference=String(value||'').trim();
    if(!reference)return '';
    let url;
    try{
      url=new URL(reference);
    }catch(error){
      throw Error('Enter a valid HTTPS backend API base URL.');
    }
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'&&url.pathname!==''){
      throw Error('Enter a backend API base URL without credentials, a path, query parameters, or a fragment.');
    }
    return url.origin;
  }

  function backendUrl(baseUrl,path){
    const base=backendApiBaseUrl(baseUrl);
    if(!base)throw Error('Enter a backend API base URL first.');
    return base+path;
  }

  function backendScheduleUrl(baseUrl){
    return backendUrl(baseUrl,'/api/schedule');
  }

  function backendLoginUrl(baseUrl){
    return backendUrl(baseUrl,'/api/admin/login');
  }

  function backendAdminScheduleUrl(baseUrl){
    return backendUrl(baseUrl,'/api/admin/schedule');
  }

  function backendSafetyBadgesUrl(baseUrl){
    return backendUrl(baseUrl,'/api/safety-badges');
  }

  function backendAdminSafetyBadgesUrl(baseUrl){
    return backendUrl(baseUrl,'/api/admin/safety-badges');
  }

  function backendRegisterUrl(baseUrl){
    return backendUrl(baseUrl,'/api/auth/register');
  }

  function backendUserLoginUrl(baseUrl){
    return backendUrl(baseUrl,'/api/auth/login');
  }

  function backendMeUrl(baseUrl){
    return backendUrl(baseUrl,'/api/auth/me');
  }

  function backendAdminUsersUrl(baseUrl){
    return backendUrl(baseUrl,'/api/admin/users');
  }

  function backendAdminUserUrl(baseUrl,id){
    return backendUrl(baseUrl,'/api/admin/users/'+encodeURIComponent(id));
  }

  function backendPersonUrl(baseUrl,name){
    return backendUrl(baseUrl,'/api/people/'+encodeURIComponent(name));
  }

  function backendAdminDisplayCredentialsUrl(baseUrl){
    return backendUrl(baseUrl,'/api/admin/display-credentials');
  }

  function backendAdminDisplayCredentialUrl(baseUrl,id){
    return backendUrl(baseUrl,'/api/admin/display-credentials/'+encodeURIComponent(id));
  }

  function backendDisplayCredentialExchangeUrl(baseUrl){
    return backendUrl(baseUrl,'/api/display-credentials/exchange');
  }

  async function responseJson(response,label){
    if(!response||!response.ok){
      const error=Error(label+' (HTTP '+(response&&response.status||'unknown')+').');
      error.status=response&&response.status||0;
      throw error;
    }
    return response.json();
  }

  function authHeaders(token){
    return token?{Accept:'application/json',Authorization:'Bearer '+token}:{Accept:'application/json'};
  }

  async function fetchBackendSchedule(baseUrl,fetchFn,token){
    const request=fetchFn||root.fetch;
    if(typeof request!=='function')throw Error('This browser cannot request the shared schedule.');
    const payload=await responseJson(await request(backendScheduleUrl(baseUrl),{headers:authHeaders(token),cache:'no-store'}),'The schedule backend could not load the shared schedule');
    if(!payload||typeof payload!=='object'||!Array.isArray(payload.rows))throw Error('The schedule backend returned an invalid schedule response.');
    return payload.rows;
  }

  function normaliseSafetyBadges(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Safety badges must be an object.');
    const normaliseNames=(names,label)=>{
      if(!Array.isArray(names))throw Error('Safety badges must include a '+label+' list.');
      return [...new Set(names.map(name=>String(name||'').trim()).filter(Boolean))];
    };
    return {
      firstAid:normaliseNames(value.firstAid,'first aid'),
      fireMarshal:normaliseNames(value.fireMarshal,'fire marshal'),
      workingAtHeight:normaliseNames(value.workingAtHeight,'working at height')
    };
  }

  function safetyNameKeys(value){
    const tokens=[...new Set(String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean))],keys=[];
    for(let left=0;left<tokens.length;left++)for(let right=left+1;right<tokens.length;right++)keys.push([tokens[left],tokens[right]].sort().join('|'));
    return keys;
  }

  function safetyBadgesFor(badges,name){
    const normalised=normaliseSafetyBadges(badges),keys=new Set(safetyNameKeys(name));
    return [
      ['firstAid','first-aid','First aider','✚'],
      ['fireMarshal','fire-marshal','Fire marshal','🔥'],
      ['workingAtHeight','working-at-height','Working at height (scissor lift)','↕']
    ].filter(([property])=>normalised[property].some(safetyName=>safetyNameKeys(safetyName).some(key=>keys.has(key)))).map(([,className,label,symbol])=>({className,label,symbol}));
  }

  async function fetchBackendSafetyBadges(baseUrl,fetchFn,token){
    const request=fetchFn||root.fetch;
    if(typeof request!=='function')throw Error('This browser cannot request the shared safety badges.');
    const payload=await responseJson(await request(backendSafetyBadgesUrl(baseUrl),{headers:authHeaders(token),cache:'no-store'}),'The schedule backend could not load the shared safety badges');
    if(!payload||typeof payload!=='object'||!payload.badges)throw Error('The schedule backend returned an invalid safety badge response.');
    return normaliseSafetyBadges(payload.badges);
  }

  function cardViewUrl(path,options){
    const settings=options||{},query=new URLSearchParams({team:settings.team});
    if(settings.search)query.set('search',settings.search);
    (settings.roles||[]).forEach(role=>query.append('role',role));
    if(settings.api)query.set('api',backendApiBaseUrl(settings.api));
    if(settings.api&&!query.get('api'))throw Error('The saved backend API base URL is invalid.');
    return path+'?'+query.toString();
  }

  function dashboardShareUrl(location,baseUrl){
    const dashboardUrl=new URL(String(location));
    if(dashboardUrl.protocol!=='http:'&&dashboardUrl.protocol!=='https:')throw Error('Open the dashboard from an HTTP or HTTPS URL before creating a share link.');
    const query=new URLSearchParams({api:backendApiBaseUrl(baseUrl)});
    return dashboardUrl.origin+dashboardUrl.pathname+'?'+query.toString();
  }

  root.SharedSchedule={backendApiBaseUrl,backendScheduleUrl,backendLoginUrl,backendAdminScheduleUrl,backendSafetyBadgesUrl,backendAdminSafetyBadgesUrl,backendRegisterUrl,backendUserLoginUrl,backendMeUrl,backendAdminUsersUrl,backendAdminUserUrl,backendPersonUrl,backendAdminDisplayCredentialsUrl,backendAdminDisplayCredentialUrl,backendDisplayCredentialExchangeUrl,fetchBackendSchedule,fetchBackendSafetyBadges,normaliseSafetyBadges,safetyBadgesFor,cardViewUrl,dashboardShareUrl};
})(typeof window!=='undefined'?window:globalThis);
