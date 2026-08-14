import { trpc } from "@/lib/trpc";
import { KeyRound, ShieldCheck, UserRoundPlus, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type Mode = "login" | "register";

export default function LocalAuthPanel() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const login = trpc.auth.loginLocal.useMutation();
  const register = trpc.auth.registerLocal.useMutation();
  const busy = login.isPending || register.isPending;

  useEffect(() => {
    const openPanel = () => { setMessage(""); setOpen(true); };
    window.addEventListener("aurion:open-local-auth", openPanel);
    return () => window.removeEventListener("aurion:open-local-auth", openPanel);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      if (mode === "register") await register.mutateAsync({ handle, password });
      else await login.mutateAsync({ handle, password });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Die Aurion-Anmeldung ist fehlgeschlagen.");
    }
  }

  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-[#061317]/90 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="aurion-auth-title">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-cyan-300/35 bg-[#0b2024] p-5 text-slate-100 shadow-2xl shadow-cyan-950/50 sm:p-7">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div><p className="mb-2 text-[0.68rem] font-semibold tracking-[0.22em] text-cyan-300">AURION // SICHERER ZUGANG</p><h2 id="aurion-auth-title" className="font-serif text-2xl text-amber-100">{mode === "login" ? "In die Sternwarte eintreten" : "Eigenes Aurion-Konto anlegen"}</h2></div>
        <button type="button" onClick={() => setOpen(false)} className="grid size-12 place-items-center rounded-lg border border-slate-400/35 text-slate-200 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" aria-label="Anmeldedialog schließen"><X size={20} /></button>
      </header>
      <p className="mb-5 text-sm leading-6 text-slate-300">{mode === "login" ? "Melde dich mit deinem Aurion-Rufnamen an. Die Spielsitzung bleibt ausschließlich in einem geschützten Cookie." : "Registrierte Konten starten als Spieler. Die Admin-Rolle wird anschließend gezielt und serverseitig vergeben."}</p>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-1" role="tablist" aria-label="Aurion-Kontoaktion">
        <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setMessage(""); }} className={`min-h-12 rounded-lg text-sm font-semibold transition ${mode === "login" ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10"}`}><KeyRound className="mr-2 inline size-4" />Anmelden</button>
        <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setMessage(""); }} className={`min-h-12 rounded-lg text-sm font-semibold transition ${mode === "register" ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10"}`}><UserRoundPlus className="mr-2 inline size-4" />Konto anlegen</button>
      </div>
      <label className="mb-4 block text-sm font-semibold text-slate-200">Rufname<input autoComplete="username" value={handle} onChange={event => setHandle(event.target.value)} placeholder="z. B. goloslos" className="mt-2 min-h-12 w-full rounded-lg border border-slate-500/60 bg-[#07171a] px-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-cyan-300" required /></label>
      <label className="mb-2 block text-sm font-semibold text-slate-200">Passwort<input autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="mindestens 12 Zeichen" className="mt-2 min-h-12 w-full rounded-lg border border-slate-500/60 bg-[#07171a] px-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-cyan-300" minLength={mode === "register" ? 12 : 1} maxLength={128} required /></label>
      {message && <p role="alert" className="my-4 rounded-lg border border-rose-400/45 bg-rose-950/30 p-3 text-sm text-rose-100">{message}</p>}
      <button disabled={busy} className="mt-5 min-h-12 w-full rounded-lg bg-amber-200 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-100 disabled:opacity-60"><ShieldCheck className="mr-2 inline size-4" />{busy ? "Sitzung wird gesichert…" : mode === "login" ? "Sicher anmelden" : "Aurion-Konto erstellen"}</button>
    </form>
  </div>;
}
