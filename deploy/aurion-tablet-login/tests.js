import { createLoginController } from './aurion-login-core.js';
const login = 'https://arelogic.space/api/native-auth/browser/' + 'T'.repeat(43);
const callback = 'https://arelogic.space/app/auth/callback?code=' + 'C'.repeat(43) + '&state=' + 'S'.repeat(43);
const form = `<form method="post" action="${login}/confirm"><input type="hidden" name="csrf" value="${'X'.repeat(43)}"><button>Confirm</button></form>`;
let count = 0;
const results = [];
function check(condition, name) { if (!condition) throw new Error(name); results.push('PASS ' + name); count++; }
function setup(options = {}) {
    let time = 10000;
    const calls = [], sent = [], statuses = [];
    const c = createLoginController({
        now: () => time,
        status: value => statuses.push(value),
        sendReturn: value => { if (options.throwSend) throw new Error('disconnected'); sent.push(value); },
        fetcher: async (url, init) => {
            calls.push({url,init});
            if (options.throwFetch) throw new Error('network');
            return { ok: options.ok !== false,
                url: init.method === 'POST' ? (options.callback || callback) : (options.getUrl || login),
                headers: new Headers({'content-type':options.contentType || 'text/html'}),
                text: async () => options.html ?? form,
            };
        },
    });
    return {c,calls,sent,statuses, advance: n => time += n};
}
try {
    let s=setup();
    check(await s.c.receive(login), 'existing same-origin confirmation is accepted');
    check(s.sent.length===0, 'no delivery before explicit confirmation');
    check(!await s.c.receive(login) && s.calls.length===1, 'duplicate clipboard delivery is inert');
    check(await s.c.confirm(), 'confirmation delivers callback');
    check(s.sent[0]===callback && s.sent.length===1, 'only exact callback enters existing VNC transport');
    check(!await s.c.confirm() && s.sent.length===1, 'single-use confirmation');
    check(s.calls[1].url===login+'/confirm' && String(s.calls[1].init.body)==='csrf='+'X'.repeat(43), 'POST stays on native endpoint with original CSRF');
    check(s.calls.every(x=>x.init.credentials==='same-origin' && x.init.referrerPolicy==='no-referrer' && x.init.cache==='no-store'), 'private fetch options');
    check(!JSON.stringify(s.statuses).includes('code=')&&!JSON.stringify(s.statuses).includes('csrf'), 'statuses reveal no credential values');
    for(const bad of ['http://arelogic.space/api/native-auth/browser/'+'T'.repeat(43),login.replace('arelogic.space','evil.example'),login+'?x=1',login+'#x','https://arelogic.space/api/native-auth/browser/short',null]) {
        s=setup(); check(!await s.c.receive(bad)&&s.calls.length===0, 'reject invalid login input '+count);
    }
    for(const bad of [callback.replace('arelogic.space','evil.example'),callback+'&next=1',callback+'#fragment',callback.replace('code=','token='),callback.replace('C'.repeat(43),'%43'.repeat(43)),callback.replace('https:','http:')]) {
        s=setup({callback:bad}); await s.c.receive(login); check(!await s.c.confirm()&&s.sent.length===0, 'reject unexpected callback '+count);
    }
    for(const bad of [form.replace('/confirm','/other'),form.replace('post','get'),form.replace('hidden','text'),form.replace('csrf','secret'),form+form,form.replace('X'.repeat(43),'short')]) {
        s=setup({html:bad}); check(!await s.c.receive(login)&&s.c.phase()==='failed', 'reject modified confirmation form '+count);
    }
    s=setup({html:'<p>Sign in</p>'}); check(!await s.c.receive(login)&&s.c.phase()==='signin-required', 'not signed in never grants a session');
    s=setup({throwFetch:true}); check(!await s.c.receive(login)&&s.sent.length===0,'network failure closed');
    s=setup({getUrl:login.replace('arelogic.space','evil.example')}); check(!await s.c.receive(login),'unexpected GET target closed');
    s=setup({contentType:'application/json'}); check(!await s.c.receive(login),'unexpected response type closed');
    s=setup({throwSend:true}); await s.c.receive(login); check(!await s.c.confirm()&&s.c.phase()==='failed','disconnected VNC does not claim delivery');
    s=setup(); await s.c.receive(login); s.advance(600000); check(!await s.c.confirm()&&s.sent.length===0,'expired transaction cannot confirm');
    s=setup(); await s.c.receive(login); s.c.cancel(); check(!await s.c.confirm()&&s.sent.length===0,'cancelled transaction cannot confirm');
    s=setup({html:form+' '.repeat(16384)}); check(!await s.c.receive(login)&&s.sent.length===0,'oversized consent is rejected');
    s=setup({html:form.replace('X'.repeat(43),'X'.repeat(44))}); check(!await s.c.receive(login),'CSRF width matches the canonical exact 43-character contract');
    s=setup(); await s.c.receive(login); s.advance(-1); check(!await s.c.confirm()&&s.sent.length===0,'clock rollback fails closed');
    s=setup(); await s.c.receive(login); const first=s.c.confirm(); const second=s.c.confirm(); await first;
    check(!await second&&s.sent.length===1&&s.calls.filter(x=>x.init.method==='POST').length===1,'double tap creates exactly one POST and delivery');
    s=setup(); await s.c.receive(login); const cancelled=s.c.confirm(); s.c.cancel();
    check(!await cancelled&&s.sent.length===0&&s.c.phase()==='cancelled','late confirmation response after cancellation cannot deliver');
    document.getElementById('result').textContent = `${count}/${count} passed\n`+results.join('\n');
} catch(e) { document.getElementById('result').textContent='FAILED '+e.message+'\n'+results.join('\n'); }
