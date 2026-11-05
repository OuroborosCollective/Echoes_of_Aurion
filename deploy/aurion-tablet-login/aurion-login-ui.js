import UI from './ui.js';
import * as Log from '../core/util/logging.js';
import { createLoginController } from './aurion-login-core.js';

const messages = {
    waiting: 'Die Godot-Anmeldung wird vorbereitet.',
    loading: 'Aurion prüft die Browser-Anmeldung.',
    'signin-required': 'Melde dich zuerst mit deinem Aurion-Konto an. Kehre danach hierher zurück.',
    ready: 'Diese einmalige Anmeldung verbindet die laufende Godot-Sitzung mit deinem Aurion-Konto.',
    confirming: 'Aurion bestätigt die Anmeldung.',
    delivered: 'Die Rückgabe wurde an Godot übertragen. Godot prüft jetzt die Sitzung.',
    expired: 'Dieser Anmeldeversuch ist abgelaufen. Es wird kein alter Link wiederverwendet.',
    failed: 'Die Anmeldung konnte nicht abgeschlossen werden. Bitte prüfe den Status in Godot.',
    cancelled: 'Anmeldung abgebrochen.',
};
const panel = document.createElement('section');
panel.id = 'aurion-login';
panel.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:10000;background:#172230;color:white;padding:14px;border-radius:10px;max-width:90%;box-shadow:0 2px 12px #0008;font:16px sans-serif';
const message = document.createElement('div');
message.setAttribute('role', 'status');
const confirm = document.createElement('button');
confirm.textContent = 'Einmalig mit Aurion anmelden';
const signin = document.createElement('a');
signin.textContent = 'Aurion-Konto anmelden';
signin.href = 'https://arelogic.space/';
signin.target = '_blank';
signin.rel = 'noopener noreferrer';
const retry = document.createElement('button');
retry.textContent = 'Anmeldung fortsetzen';
for (const element of [confirm, signin, retry]) element.style.cssText = 'margin:12px 8px 0 0;padding:12px;border-radius:8px;background:#eff6ff;color:#10243a;border:0;font:inherit;cursor:pointer';
panel.append(message, confirm, signin, retry);
document.body.append(panel);

const controller = createLoginController({
    fetcher: (...args) => fetch(...args),
    sendReturn: (value) => {
        if (!UI.connected || !UI.rfb) throw new Error('disconnected');
        Log.init_logging('warn');
        UI.rfb.clipboardPasteFrom(value);
    },
    status: (phase) => {
        message.textContent = messages[phase];
        confirm.hidden = phase !== 'ready';
        signin.hidden = phase !== 'signin-required';
        retry.hidden = phase !== 'signin-required';
        if (phase === 'delivered') setTimeout(() => { panel.hidden = true; }, 8000);
    },
});
message.textContent = messages.waiting;
confirm.hidden = signin.hidden = retry.hidden = true;
confirm.addEventListener('click', () => controller.confirm());
retry.addEventListener('click', () => controller.retry());
let bound = null;
const bindTimer = setInterval(() => {
    if (!UI.rfb || bound === UI.rfb) return;
    bound = UI.rfb;
    Log.init_logging('warn');
    // The special login page never displays remote clipboard contents.
    bound.removeEventListener('clipboard', UI.clipboardReceive);
    bound.addEventListener('clipboard', (event) => controller.receive(event.detail.text));
    bound.addEventListener('disconnect', () => controller.cancel());
    const clipboard = document.getElementById('noVNC_clipboard_text');
    if (clipboard) clipboard.value = '';
    const clipboardButton = document.getElementById('noVNC_clipboard_button');
    if (clipboardButton) clipboardButton.style.display = 'none';
}, 50);
window.addEventListener('pagehide', () => { clearInterval(bindTimer); controller.cancel(); });
