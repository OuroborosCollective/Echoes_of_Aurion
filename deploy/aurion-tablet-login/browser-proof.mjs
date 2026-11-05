// Disposable browser fixtures only. This never logs in to real Aurion.
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
const root = process.env.AURION_TABLET_QA_ROOT || 'deploy/aurion-tablet-login';
const evidence = process.env.AURION_TABLET_QA_EVIDENCE || '.aurion-tablet-login-proof';
await mkdir(evidence, {recursive:true});
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  await context.setOffline(true);
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.route('**/*', async route => {
    const request = new URL(route.request().url());
    if (request.origin !== 'https://arelogic.space' || !request.pathname.startsWith('/fixture/')) {
      failures.push('Unexpected network destination blocked');
      return route.abort();
    }
    const name = request.pathname.slice('/fixture/'.length);
    if (!['tests.html','tests.js','aurion-login-core.js'].includes(name)) return route.abort();
    return route.fulfill({status:200, contentType:name.endsWith('.html')?'text/html':'text/javascript',body:await readFile(path.join(root,name),'utf8')});
  });
  await page.goto('https://arelogic.space/fixture/tests.html');
  await page.waitForFunction(() => /passed|FAILED/.test(document.querySelector('#result').textContent));
  const result = await page.locator('#result').textContent();
  await writeFile(path.join(evidence,'browser-fixture-results.txt'),result+'\n');
  await page.screenshot({path:path.join(evidence,'browser-fixture.png'),fullPage:true});
  if (!/^\d+\/\d+ passed/.test(result) || failures.length) throw new Error('Browser fixture failure: '+failures.join('; '));
  console.log(result);
  await context.close();

  // Exercise actual browser fetch, Origin, cookies, CSP and 303 handling. The
  // renderer and Origin guard are extracted from the unchanged canonical owner.
  // Every HTTP request is intercepted locally; there is no production login.
  const source = await readFile('server/nativeAuthHttp.ts','utf8');
  function functionSource(name,next) {
    const start=source.indexOf(`function ${name}(`), end=source.indexOf(`function ${next}(`,start);
    assert.ok(start>=0&&end>start,'canonical function missing');
    return stripTypeScriptTypes(source.slice(start,end));
  }
  const render=new Function(functionSource('browserPage','confirmOriginIsTrusted')+';return browserPage;')();
  const guard=new Function('const CANONICAL_BROWSER_ORIGIN="https://arelogic.space";'+functionSource('confirmOriginIsTrusted','refuseBrowser')+';return confirmOriginIsTrusted;')();
  const transaction='T'.repeat(43), csrf='X'.repeat(43);
  const login=`https://arelogic.space/api/native-auth/browser/${transaction}`;
  const callback='https://arelogic.space/app/auth/callback?code='+'C'.repeat(43)+'&state='+'S'.repeat(43);
  const policy="default-src 'self'; script-src 'self'; connect-src 'self' wss://arelogic.space; object-src 'none'; base-uri 'none'; form-action 'self'";
  const entry='<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><button id="confirm">Confirm</button><div id="phase"></div><script type="module" src="/fixture/real-flow.js"></script>';
  const script=`import {createLoginController} from '/fixture/aurion-login-core.js';
    window.deliveryCount=0;window.callbackMatches=false;
    const c=createLoginController({fetcher:(...args)=>fetch(...args),sendReturn:value=>{window.deliveryCount++;window.callbackMatches=value===${JSON.stringify(callback)};},status:value=>document.querySelector('#phase').textContent=value});
    document.querySelector('#confirm').addEventListener('click',()=>c.confirm());
    c.receive(${JSON.stringify(login)});`;
  for (const foreignRedirect of [false,true]) {
    const isolated=await browser.newContext();
    await isolated.setOffline(true);
    await isolated.addCookies([{name:'qa_web_session',value:'synthetic-only',domain:'arelogic.space',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
    let posts=0, acceptedOrigin=false, cookiePresent=false, foreignRequests=0, callbackRequests=0;
    const requestAudit=[];
    isolated.on('request', req=>{const u=new URL(req.url());requestAudit.push({method:req.method(),origin:u.origin,path:u.pathname,redirect:!!req.redirectedFrom()});});
    const p=await isolated.newPage();
    const cdp=await isolated.newCDPSession(p);
    let interceptionFailure=null;
    // Playwright's route API handles only the first URL of a redirect chain.
    // CDP pauses EVERY hop; offline mode independently prevents real egress.
    async function intercept(event) {
      const req=event.request, u=new URL(req.url);
      const fulfill=async ({status=200,contentType='text/html',headers={},body=''})=>cdp.send('Fetch.fulfillRequest',{
        requestId:event.requestId,responseCode:status,
        responseHeaders:Object.entries({'Content-Type':contentType,...headers}).map(([name,value])=>({name,value})),
        body:Buffer.from(body).toString('base64'),
      });
      if(u.origin!=='https://arelogic.space') {foreignRequests++;return cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});}
      if(u.pathname==='/fixture/entry.html') return fulfill({body:entry});
      if(u.pathname==='/fixture/real-flow.js') return fulfill({contentType:'text/javascript',body:script});
      if(u.pathname==='/fixture/aurion-login-core.js') return fulfill({contentType:'text/javascript',body:await readFile(path.join(root,'aurion-login-core.js'),'utf8')});
      if(req.url===login&&req.method==='GET') {
        const headers=Object.fromEntries(Object.entries(req.headers).map(([k,v])=>[k.toLowerCase(),v]));
        cookiePresent=String(headers.cookie).includes('qa_web_session=synthetic-only');
        return fulfill({headers:{'Cache-Control':'no-store','Set-Cookie':'qa_binding=synthetic-only; Secure; HttpOnly; SameSite=Lax; Path=/'},body:render(transaction,cookiePresent?csrf:null)});
      }
      if(req.url===login+'/confirm'&&req.method==='POST') {
        posts++;
        const headers=Object.fromEntries(Object.entries(req.headers).map(([k,v])=>[k.toLowerCase(),v]));
        acceptedOrigin=guard({headers});
        assert.equal(headers.referer,undefined,'callback workflow must not disclose a referrer');
        assert.equal(req.postData,'csrf='+csrf);
        assert.ok(String(headers.cookie).includes('qa_binding=synthetic-only'));
        return fulfill({status:acceptedOrigin?303:403,headers:acceptedOrigin?{Location:foreignRedirect?'https://unapproved.invalid/return':callback}:{},body:''});
      }
      if(req.url===callback) {callbackRequests++;return fulfill({headers:{'Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'},body:'<p>Return to Aurion</p>'});}
      if(u.pathname==='/favicon.ico') return fulfill({status:204});
      throw new Error('Unexpected fixture request');
    }
    cdp.on('Fetch.requestPaused', event=>{
      intercept(event).catch(async error=>{
        interceptionFailure=error;
        await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
      });
    });
    await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
    await p.goto('https://arelogic.space/fixture/entry.html');
    await p.waitForFunction(()=>document.querySelector('#phase').textContent==='ready');
    await p.locator('#confirm').click();
    await p.waitForFunction(()=>['delivered','failed'].includes(document.querySelector('#phase').textContent));
    const observed=await p.evaluate(()=>({phase:document.querySelector('#phase').textContent,deliveryCount:window.deliveryCount,callbackMatches:window.callbackMatches,localKeys:localStorage.length,sessionKeys:sessionStorage.length,queryInPage:document.body.textContent.includes('code=')}));
    console.log(JSON.stringify({fixtureOnly:true,foreignRedirect,posts,acceptedOrigin,cookiePresent,foreignRequests,callbackRequests,observed,requestAudit}));
    assert.equal(interceptionFailure,null);
    assert.equal(posts,1);assert.ok(acceptedOrigin&&cookiePresent);assert.equal(foreignRequests,0);
    assert.equal(observed.phase,foreignRedirect?'failed':'delivered');
    assert.equal(observed.deliveryCount,foreignRedirect?0:1);assert.equal(callbackRequests,foreignRedirect?0:1);
    if(!foreignRedirect) assert.ok(observed.callbackMatches);
    assert.equal(observed.localKeys,0);assert.equal(observed.sessionKeys,0);assert.equal(observed.queryInPage,false);
    assert.equal(p.url(),'https://arelogic.space/fixture/entry.html');
    await isolated.close();
    console.log('PASS actual Chromium '+(foreignRedirect?'foreign redirect blocked before dispatch':'canonical Origin, cookies, CSRF POST and callback delivery')+' (synthetic HTTP only)');
  }
  await realNovncAndBasic(browser, render, guard);
} finally { await browser.close(); }

async function realNovncAndBasic(browser, render, guard) {
  const upstream=process.env.AURION_NOVNC_SOURCE, generated=process.env.AURION_NOVNC_GENERATED;
  assert.ok(upstream&&generated,'pinned noVNC sources are mandatory');
  const basic='Basic '+Buffer.from('fixture:synthetic-only').toString('base64');
  const login='https://arelogic.space/api/native-auth/browser/'+'T'.repeat(43);
  const callback='https://arelogic.space/app/auth/callback?code='+'C'.repeat(43)+'&state='+'S'.repeat(43);
  const csrf='X'.repeat(43);
  let probeAuthorization=false, cutCount=0, cutMatches=false;
  const sockets=[];
  const server=createServer(async (req,res)=>{
    try {
      const u=new URL(req.url,'http://fixture.invalid');
      if(u.pathname==='/api/native-auth/probe') {
        probeAuthorization=!!req.headers.authorization;
        res.writeHead(200,{'Content-Type':'application/json'}).end('{}');return;
      }
      if(req.headers.authorization!==basic) {
        res.writeHead(401,{'WWW-Authenticate':'Basic realm="aurion-fixture"'}).end();return;
      }
      if(u.pathname==='/auth.html'||u.pathname==='/godot-live/auth.html') {
        res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><p>Synthetic Basic authentication</p>');return;
      }
      assert.ok(u.pathname.startsWith('/godot-live/'));
      const rel=u.pathname.slice('/godot-live/'.length);
      assert.ok(!rel.includes('..'));
      const isGenerated=['aurion.html','app/aurion-login-ui.js','app/aurion-login-core.js','app/aurion-novnc-ui.js'].includes(rel);
      let body=await readFile(path.join(isGenerated?generated:upstream,rel));
      // Disposable HTTP loopback transport fixture only. Production output
      // stays untouched; its HTTPS CSP is tested in the canonical fixture.
      if(rel==='aurion.html') body=Buffer.from(body.toString().replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,''));
      res.writeHead(200,{'Content-Type':rel.endsWith('.js')?'text/javascript':rel.endsWith('.html')?'text/html':rel.endsWith('.css')?'text/css':'application/octet-stream'}).end(body);
    } catch (_) {res.writeHead(404).end();}
  });
  const wss=new WebSocketServer({noServer:true});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/godot-live/websockify') {socket.destroy();return;}
    if(req.headers.authorization!==basic) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="aurion-fixture"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');return;
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  function serverCut(text) { const b=Buffer.from(text), h=Buffer.alloc(8);h[0]=3;h.writeUInt32BE(b.length,4);return Buffer.concat([h,b]); }
  wss.on('connection',ws=>{
    sockets.push(ws);
    let phase=0, pending=Buffer.alloc(0);
    ws.send(Buffer.from('RFB 003.008\n'));
    ws.on('message',input=>{
      pending=Buffer.concat([pending,Buffer.from(input)]);
      if(phase===0&&pending.length>=12) {pending=pending.subarray(12);phase=1;ws.send(Buffer.from([1,1]));}
      if(phase===1&&pending.length>=1) {pending=pending.subarray(1);phase=2;ws.send(Buffer.alloc(4));}
      if(phase===2&&pending.length>=1) {
        pending=pending.subarray(1);phase=3;
        const name=Buffer.from('Synthetic noVNC fixture'),init=Buffer.alloc(24+name.length);
        init.writeUInt16BE(32,0);init.writeUInt16BE(32,2);Buffer.from([32,24,0,1]).copy(init,4);
        for(const offset of [8,10,12]) init.writeUInt16BE(255,offset);
        init[14]=16;init[15]=8;init.writeUInt32BE(name.length,20);name.copy(init,24);
        // Same message as ServerInit: exercise the earliest clipboard callback.
        ws.send(Buffer.concat([init,serverCut(callback),serverCut(login)]));
      }
      while(phase===3&&pending.length) {
        const type=pending[0];let length={0:20,3:10,4:8,5:6}[type];
        if(type===2) {if(pending.length<4)return;length=4+pending.readUInt16BE(2)*4;}
        if(type===6) {if(pending.length<8)return;length=8+pending.readUInt32BE(4);}
        if(!length||pending.length<length)return;
        if(type===6) {cutCount++;cutMatches=pending.subarray(8,length).toString()===callback;}
        pending=pending.subarray(length);
      }
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try {
    // Real HTTP challenge/cache behavior, never real user credentials.
    for(const scope of ['path','root']) {
      const c=await browser.newContext({httpCredentials:{username:'fixture',password:'synthetic-only',origin}});
      const p=await c.newPage();
      await p.goto(origin+(scope==='path'?'/godot-live/auth.html':'/auth.html'));
      probeAuthorization=false;
      await p.evaluate(()=>fetch('/api/native-auth/probe',{credentials:'same-origin'}));
      const canonicalAccepts=guard({headers:{origin:'https://arelogic.space',...(probeAuthorization?{authorization:'Basic synthetic'}:{})}});
      console.log(JSON.stringify({fixtureOnly:true,httpBasicScope:scope,apiAuthorizationPresent:probeAuthorization,canonicalAccepts}));
      assert.equal(canonicalAccepts,!probeAuthorization,'Authorization remains rejected by canonical guard');
      if(scope==='path') assert.equal(probeAuthorization,false,'viewer Basic credentials must not escape /godot-live/');
      await c.close();
    }
    for(const mode of ['writable','view-only','disconnect','replace','reconnect']) {
      cutCount=0;cutMatches=false;
      const c=await browser.newContext({httpCredentials:{username:'fixture',password:'synthetic-only',origin}});
      await c.addInitScript(()=>{
        window.clipboardRendered=false;
        const d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
        Object.defineProperty(HTMLTextAreaElement.prototype,'value',{...d,set(value){
          if(this.id==='noVNC_clipboard_text'&&value) window.clipboardRendered=true;
          return d.set.call(this,value);
        }});
      });
      await c.addInitScript(({login,callback,html})=>{
        // Only the consent adapter is mocked in this RFB transport test.
        // Real canonical fetch/Origin/CSRF/redirect behavior is tested above.
        const original=window.fetch.bind(window);
        window.syntheticCallbackCount=0;
        window.fetch=async(url,init={})=>{
          if(url!==login&&url!==login+'/confirm') return original(url,init);
          const response=new Response(init.method==='POST'?'':html,{status:200,headers:{'Content-Type':'text/html'}});
          Object.defineProperty(response,'url',{value:init.method==='POST'?callback:login});
          if(init.method==='POST') window.syntheticCallbackCount++;
          return response;
        };
      },{login,callback,html:render('T'.repeat(43),csrf)});
      // No real external endpoint can be contacted by this transport fixture.
      await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      const p=await c.newPage();
      let leaks=false, callbacks=0, error=null;
      const failedRequests=[];p.on('requestfailed',r=>failedRequests.push({path:new URL(r.url()).pathname,reason:r.failure()?.errorText}));
      p.on('console',m=>{if(m.text().includes('code=')||m.text().includes('T'.repeat(43)))leaks=true;});
      p.on('pageerror',e=>{error=e.message;});
      assert.equal((await p.goto(origin+'/godot-live/auth.html')).status(),200,'real Basic viewer challenge accepted');
      await p.goto(origin+'/godot-live/aurion.html?autoconnect=1&encrypt=0&host=127.0.0.1&port='+server.address().port+'&path=godot-live%2Fwebsockify');
      try { await p.waitForFunction(()=>document.querySelector('#aurion-login button')?.hidden===false); }
      catch(failure) {
        const state=await p.evaluate(async()=>{
          let result={phase:document.querySelector('#aurion-login [role=status]')?.textContent??'panel absent'};
          try {const {default:UI}=await import('./app/aurion-novnc-ui.js');Object.assign(result,{connected:UI.connected,rfbState:UI.rfb?._rfb_connection_state,viewOnly:UI.rfb?.viewOnly,socket:UI.rfb?._sock?._websocket?.readyState});}catch(_){result.uiImportFailed=true;}
          return result;
        });
        console.log(JSON.stringify({fixtureOnly:true,mode,state,error,failedRequests,socketCount:sockets.length}));
        throw failure;
      }
      assert.equal(await p.evaluate(()=>window.clipboardRendered),false,'clipboard must never render even at initial handshake');
      if(mode==='reconnect') {
        const before=sockets.length;
        await p.evaluate(async()=>{const {default:UI}=await import('./app/aurion-novnc-ui.js');UI.disconnect();});
        await p.waitForFunction(async()=>{const {default:UI}=await import('./app/aurion-novnc-ui.js');return UI.rfb===undefined;});
        await p.evaluate(async()=>{const {default:UI}=await import('./app/aurion-novnc-ui.js');UI.connect();});
        await p.waitForFunction(async()=>{const {default:UI}=await import('./app/aurion-novnc-ui.js');return UI.connected;});
        assert.equal(sockets.length,before+1);
        assert.equal(await p.evaluate(()=>window.clipboardRendered),false,'reconnect must not render early clipboard');
        assert.equal(await p.locator('#aurion-login button').first().isHidden(),true,'same transaction cannot resume on replaced connection');
        assert.equal(cutCount,0);assert.equal(callbacks,0);assert.equal(leaks,false);assert.equal(error,null);
        console.log(JSON.stringify({fixtureOnly:true,realNovnc:'1.0.0',mode,rfbCutTextCount:0,clipboardRendered:false,staleTransactionBlocked:true}));
        await c.close();continue;
      }
      await p.evaluate(async mode=>{
        const {default:UI}=await import('./app/aurion-novnc-ui.js');
        if(mode==='view-only') UI.rfb.viewOnly=true;
        if(mode==='disconnect') UI.rfb.disconnect();
        if(mode==='replace') UI.rfb={};
        document.querySelector('#aurion-login button').click();
      },mode);
      await p.waitForFunction(()=>/VNC-Kanal|konnte nicht|abgebrochen/.test(document.querySelector('#aurion-login [role=status]').textContent));
      if(mode==='writable') await new Promise((resolve,reject)=>{
        const until=Date.now()+3000;const poll=()=>cutCount?resolve():Date.now()>until?reject(new Error('no RFB clientCutText received')):setTimeout(poll,10);poll();
      });
      callbacks=await p.evaluate(()=>window.syntheticCallbackCount);
      assert.equal(cutCount,mode==='writable'?1:0);
      if(mode==='writable') assert.ok(cutMatches);
      assert.equal(await p.evaluate(()=>window.clipboardRendered),false);
      assert.equal(leaks,false);assert.equal(error,null);
      console.log(JSON.stringify({fixtureOnly:true,realNovnc:'1.0.0',mode,rfbCutTextCount:cutCount,syntheticConfirmResponses:callbacks,clipboardRendered:false,consoleLeak:false}));
      await c.close();
    }
  } finally {
    for(const ws of sockets) ws.terminate();
    await new Promise(resolve=>wss.close(resolve));
    await new Promise(resolve=>server.close(resolve));
  }
}
