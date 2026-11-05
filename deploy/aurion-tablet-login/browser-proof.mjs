// Disposable browser fixtures only. This never logs in to real Aurion.
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
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
} finally { await browser.close(); }
