from pathlib import Path

p = Path("client/src/pages/Home.tsx")
text = p.read_text()
old = '{!isAuthenticated && <button type="button" className="account-game-tools__account" onClick={openAccountAccess}><UserRound size={15} /> KONTO ANLEGEN / ANMELDEN</button>}'
new = '{!isAuthenticated && screen !== "open_world" && <button type="button" className="account-game-tools__account" onClick={openAccountAccess}><UserRound size={15} /> KONTO ANLEGEN / ANMELDEN</button>}'
if text.count(old) != 1:
    raise SystemExit(f"expected one account CTA anchor, found {text.count(old)}")
p.write_text(text.replace(old, new, 1))
