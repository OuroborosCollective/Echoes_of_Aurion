// Aurion's existing web confirmation remains the sole login authority.
// This adapter keeps the one-time return URL in browser memory only.
const ORIGIN = 'https://arelogic.space';
const LOGIN = /^https:\/\/arelogic\.space\/api\/native-auth\/browser\/[A-Za-z0-9_-]{32,128}$/;
const CALLBACK = /^https:\/\/arelogic\.space\/app\/auth\/callback\?(?:code=[A-Za-z0-9_-]{43,256}&state=[A-Za-z0-9_-]{43,128}|state=[A-Za-z0-9_-]{43,128}&code=[A-Za-z0-9_-]{43,256})$/;
const MAX_CONSENT_BYTES = 16384;

async function consentText(response) {
    if (!response.body?.getReader) {
        const text = await response.text();
        if (new TextEncoder().encode(text).length > MAX_CONSENT_BYTES) throw new Error('size');
        return text;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '', bytes = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_CONSENT_BYTES) { await reader.cancel(); throw new Error('size'); }
            text += decoder.decode(value, { stream: true });
        }
        return text + decoder.decode();
    } finally { reader.releaseLock(); }
}

export function createLoginController({ fetcher, sendReturn, status, now = Date.now }) {
    let login = '';
    let lastLogin = '';
    let csrf = '';
    let phase = 'waiting';
    let created = 0;
    let generation = 0;
    let inFlight = false;
    let abort = null;
    const announce = (next) => { phase = next; status(next); };
    const clear = () => { login = ''; csrf = ''; generation++; };
    function expired() { return !created || now() < created || now() - created >= 600000; }

    async function prepare(raw, retry = false) {
        if (typeof raw !== 'string' || !LOGIN.test(raw) || inFlight) return false;
        if (raw === lastLogin && !retry) return false;
        if (phase === 'delivered' || phase === 'confirming') return false;
        if (raw !== login) { clear(); login = raw; lastLogin = raw; created = now(); }
        if (expired()) { clear(); announce('expired'); return false; }
        csrf = '';
        inFlight = true;
        const own = ++generation;
        abort = new AbortController();
        const timer = setTimeout(() => abort?.abort(), 15000);
        announce('loading');
        try {
            const response = await fetcher(login, {
                credentials: 'same-origin', cache: 'no-store', redirect: 'error',
                referrerPolicy: 'no-referrer', signal: abort.signal,
            });
            if (own !== generation) return false;
            if (!response.ok || response.url !== login ||
                !String(response.headers.get('content-type')).includes('text/html')) throw new Error('unavailable');
            const document = new DOMParser().parseFromString(await consentText(response), 'text/html');
            if (own !== generation) return false;
            const forms = document.querySelectorAll('form');
            if (forms.length === 0) { announce('signin-required'); return false; }
            if (forms.length !== 1) throw new Error('form');
            const form = forms[0];
            const action = new URL(form.getAttribute('action') || '', ORIGIN);
            const inputs = form.querySelectorAll('input');
            if (action.href !== login + '/confirm' ||
                (form.getAttribute('method') || '').toLowerCase() !== 'post' ||
                inputs.length !== 1 || inputs[0].name !== 'csrf' ||
                inputs[0].type !== 'hidden' || !/^[A-Za-z0-9_-]{43}$/.test(inputs[0].value)) throw new Error('form');
            csrf = inputs[0].value;
            announce('ready');
            return true;
        } catch (_) {
            if (own === generation) { clear(); announce('failed'); }
            return false;
        } finally { clearTimeout(timer); abort = null; inFlight = false; }
    }

    async function confirm() {
        if (phase !== 'ready' || inFlight || !csrf) return false;
        if (expired()) { clear(); announce('expired'); return false; }
        const own = generation;
        const target = login + '/confirm';
        const body = new URLSearchParams({ csrf });
        csrf = '';
        inFlight = true;
        abort = new AbortController();
        const timer = setTimeout(() => abort?.abort(), 15000);
        announce('confirming');
        try {
            // The containing page's connect-src 'self' blocks any foreign redirect.
            // Browser cookies and the original CSRF field go only to Aurion.
            const response = await fetcher(target, {
                method: 'POST', credentials: 'same-origin', cache: 'no-store',
                redirect: 'follow', referrerPolicy: 'no-referrer', mode: 'cors', signal: abort.signal,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
            });
            if (own !== generation) return false;
            if (!response.ok || !CALLBACK.test(response.url)) throw new Error('callback');
            // No query is rendered, stored, logged or sent to the assistant.
            sendReturn(response.url);
            clear();
            announce('delivered');
            return true;
        } catch (_) {
            if (own === generation) { clear(); announce('failed'); }
            return false;
        } finally { clearTimeout(timer); abort = null; inFlight = false; }
    }

    return {
        receive: (raw) => prepare(raw),
        retry: () => phase === 'signin-required' && login ? prepare(login, true) : Promise.resolve(false),
        confirm,
        cancel: () => { abort?.abort(); clear(); announce('cancelled'); },
        phase: () => phase,
    };
}
