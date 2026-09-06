import { createPortal } from "react-dom";
import { BellRing, Box, CalendarDays, FileText, Menu, MessageCircle, Send, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

type CommunityPanel = "chat" | "forum" | "events" | "assets" | "guild" | null;
type ForumCategory = "announcements" | "patch_notes" | "events" | "general";

function participantName(name: string | null, userId: number): string {
  return name?.trim() || `Explorer ${userId}`;
}
function localTime(value: Date): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Aurion community boundary.
 *
 * Allowed writes are social only: chat, general forum questions and replies.
 * Gameplay/economy writes (crafting, market, guild bank/governance, loadout,
 * quests, skills, inventory mutation) are deliberately absent.
 */
export default function CommunityOverlay({
  isAuthenticated,
  currentUserId,
}: {
  isAuthenticated: boolean;
  currentUserId?: number;
  onTeamReady: (partnerName: string) => void;
  onTeamCleared: () => void;
  starterCharacterId: "wayfinder" | "veilguard";
  onStarterCharacterSelected: (character: unknown) => void;
}) {
  const [panel, setPanel] = useState<CommunityPanel>(null);
  const [openedFromWorld, setOpenedFromWorld] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatBody, setChatBody] = useState("");
  const [forumCategory, setForumCategory] = useState<ForumCategory>("announcements");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [questionTitle, setQuestionTitle] = useState("");
  const [questionBody, setQuestionBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [message, setMessage] = useState("");
  const utils = trpc.useUtils();

  useEffect(() => {
    const open = (event: Event) => {
      const requested = (event as CustomEvent<unknown>).detail;
      if (!requested || typeof requested !== "object" || !("panel" in requested)) return;
      const value = String(requested.panel);
      const mapped: CommunityPanel = value === "events" ? "events" : value === "chat" || value === "forum" || value === "assets" || value === "guild" ? value : null;
      if (!mapped) {
        setMessage("Diese Funktion gehört nicht zur Aurion-Communityfläche und wird hier nicht ausgeführt.");
        return;
      }
      setPanel(mapped);
      setOpenedFromWorld(Boolean(document.querySelector('[data-testid="xaurion-open-world-runtime"]')));
      setMobileMenuOpen(false);
      setSelectedThreadId(null);
      if (mapped === "events") setForumCategory("events");
    };
    const reset = () => { setOpenedFromWorld(false); setPanel(null); };
    window.addEventListener("aurion:open-community", open);
    window.addEventListener("aurion:return-to-tower", reset);
    return () => { window.removeEventListener("aurion:open-community", open); window.removeEventListener("aurion:return-to-tower", reset); };
  }, []);

  const chat = trpc.community.chat.list.useQuery(undefined, { enabled: isAuthenticated && panel === "chat", refetchInterval: panel === "chat" ? 5000 : false });
  const forumMode = panel === "forum" || panel === "events";
  const threads = trpc.community.forum.list.useQuery({ category: forumCategory }, { enabled: forumMode, refetchInterval: forumMode ? 12000 : false });
  const thread = trpc.community.forum.get.useQuery({ threadId: selectedThreadId ?? "thread_unselected" }, { enabled: Boolean(selectedThreadId) });
  const publicAssets = trpc.assetSubmissions.publicCatalog.useQuery(undefined, { enabled: panel === "assets" });
  const player = trpc.player.me.useQuery(undefined, { enabled: isAuthenticated && panel === "guild", retry: false });

  const sendChat = trpc.community.chat.send.useMutation({
    onSuccess: async () => { setChatBody(""); await utils.community.chat.list.invalidate(); },
    onError: () => setMessage("Der Funkspruch konnte nicht bestätigt gespeichert werden."),
  });
  const createQuestion = trpc.community.forum.createQuestion.useMutation({
    onSuccess: async result => {
      setQuestionTitle(""); setQuestionBody(""); setSelectedThreadId(result.id); setForumCategory("general");
      await utils.community.forum.list.invalidate({ category: "general" });
    },
    onError: () => setMessage("Die Forumsfrage konnte nicht bestätigt gespeichert werden."),
  });
  const reply = trpc.community.forum.reply.useMutation({
    onSuccess: async () => { setReplyBody(""); if (selectedThreadId) await utils.community.forum.get.invalidate({ threadId: selectedThreadId }); },
    onError: () => setMessage("Die Antwort konnte nicht bestätigt gespeichert werden."),
  });

  const categories = useMemo(() => [
    ["announcements", "Ankündigungen"], ["patch_notes", "Patch Notes"], ["events", "Events"], ["general", "Fragen"],
  ] as const, []);

  const close = () => { setPanel(null); setOpenedFromWorld(false); setSelectedThreadId(null); setMessage(""); };
  const overlay = <aside className="community-overlay" aria-label="Aurion Gemeinschaft" data-mobile-menu-open={mobileMenuOpen} data-opened-from-world={openedFromWorld && panel !== null}>
    <button type="button" className="community-mobile-toggle" onClick={() => setMobileMenuOpen(open => !open)} aria-expanded={mobileMenuOpen} aria-controls="aurion-community-dock"><Menu size={18}/><span>{mobileMenuOpen ? "MENÜ SCHLIESSEN" : "GEMEINSCHAFT"}</span></button>
    <div id="aurion-community-dock" className="community-dock">
      <button type="button" className={panel === "chat" ? "community-dock-button active" : "community-dock-button"} onClick={() => isAuthenticated ? setPanel("chat") : setMessage("Bitte anmelden, um den Signalraum zu verwenden.")} aria-label="Expeditionschat öffnen"><MessageCircle size={16}/><span>CHAT</span></button>
      <button type="button" className={panel === "forum" ? "community-dock-button active" : "community-dock-button"} onClick={() => { setPanel("forum"); setForumCategory("announcements"); }} aria-label="Forum öffnen"><FileText size={16}/><span>FORUM</span></button>
      <button type="button" className={panel === "events" ? "community-dock-button active" : "community-dock-button"} onClick={() => { setPanel("events"); setForumCategory("events"); }} aria-label="Community-Events öffnen"><CalendarDays size={16}/><span>EVENTS</span></button>
      <button type="button" className={panel === "guild" ? "community-dock-button active" : "community-dock-button"} onClick={() => isAuthenticated ? setPanel("guild") : setMessage("Bitte anmelden, um deine Gildenzugehörigkeit zu lesen.")} aria-label="Gildenzugehörigkeit öffnen"><UsersRound size={16}/><span>GILDE</span></button>
      <button type="button" className={panel === "assets" ? "community-dock-button active" : "community-dock-button"} onClick={() => setPanel("assets")} aria-label="Asset-Katalog öffnen"><Box size={16}/><span>ASSETS</span></button>
    </div>

    {message && !panel && <p className="community-feedback"><BellRing size={13}/>{message}</p>}
    {panel && <section className={`community-panel ${panel}-panel`} aria-live="polite">
      <header className="community-panel-header"><div><p>AURION // COMMUNITY</p><h2>{panel === "chat" ? "Signalraum" : panel === "forum" ? "Sternwartenforum" : panel === "events" ? "Community-Events" : panel === "guild" ? "Gildenzugehörigkeit" : "Öffentlicher Asset-Katalog"}</h2></div><button type="button" onClick={close} aria-label="Community-Konsole schließen"><X size={18}/></button></header>
      {message && <p className="community-feedback"><BellRing size={13}/>{message}</p>}

      {panel === "chat" && <div className="community-chat"><div className="community-feed">{chat.data?.map(entry => <article key={entry.id} className={entry.userId === currentUserId ? "community-message own" : "community-message"}><header><b>{participantName(entry.authorName, entry.userId)}</b><time>{localTime(entry.createdAt)}</time></header><p>{entry.body}</p></article>)}{!chat.data?.length && <p className="community-empty">Noch keine Funksprüche.</p>}</div><form className="community-compose" onSubmit={event => { event.preventDefault(); if (chatBody.trim()) sendChat.mutate({ body: chatBody }); }}><input value={chatBody} maxLength={500} onChange={event => setChatBody(event.target.value)} placeholder="Kurzer Funkspruch…"/><button type="submit" disabled={!chatBody.trim() || sendChat.isPending} aria-label="Chatnachricht senden"><Send size={16}/></button></form></div>}

      {forumMode && <div className="community-forum"><nav className="forum-categories" aria-label="Forumskategorien">{categories.map(([id, label]) => <button type="button" key={id} aria-pressed={forumCategory === id} onClick={() => { setForumCategory(id); setSelectedThreadId(null); }}>{label}</button>)}</nav>{selectedThreadId && thread.data ? <article className="forum-thread-detail"><button type="button" onClick={() => setSelectedThreadId(null)}>← Zur Übersicht</button><h3>{thread.data.title}</h3><p>{thread.data.body}</p><small>{participantName(thread.data.authorName, thread.data.authorUserId)}</small><div className="forum-replies">{thread.data.replies.map(item => <div key={item.id}><b>{participantName(item.authorName, item.authorUserId)}</b><p>{item.body}</p></div>)}</div>{isAuthenticated && <form onSubmit={event => { event.preventDefault(); if (replyBody.trim()) reply.mutate({ threadId: thread.data!.id, body: replyBody }); }}><textarea value={replyBody} maxLength={4000} onChange={event => setReplyBody(event.target.value)} placeholder="Antwort…"/><button type="submit" disabled={!replyBody.trim() || reply.isPending}>Antwort senden</button></form>}</article> : <><div className="forum-thread-list">{threads.data?.map(item => <button type="button" key={item.id} onClick={() => setSelectedThreadId(item.id)}><b>{item.title}</b><span>{participantName(item.authorName, item.authorUserId)}</span></button>)}{!threads.data?.length && <p className="community-empty">In dieser Kategorie gibt es noch keine Einträge.</p>}</div>{isAuthenticated && forumCategory === "general" && <form className="forum-question-form" onSubmit={event => { event.preventDefault(); if (questionTitle.trim() && questionBody.trim()) createQuestion.mutate({ title: questionTitle, body: questionBody }); }}><h3>Frage stellen</h3><input value={questionTitle} maxLength={160} onChange={event => setQuestionTitle(event.target.value)} placeholder="Titel"/><textarea value={questionBody} maxLength={8000} onChange={event => setQuestionBody(event.target.value)} placeholder="Frage…"/><button type="submit" disabled={!questionTitle.trim() || !questionBody.trim() || createQuestion.isPending}>Veröffentlichen</button></form>}</>}</div>}

      {panel === "guild" && <div className="community-partners">{player.data?.guild ? <div className="community-team-card"><p><UsersRound size={16}/> READ-ONLY GILDE</p><strong>{player.data.guild.guild.name} [{player.data.guild.guild.tag}]</strong><span>Rolle: {player.data.guild.membership.role}</span><span>Auf dieser Aurion-Fläche gibt es keine Gründung, Bank, Gebäude, Governance oder andere Gameplay-Mutation.</span></div> : <p className="community-empty">Keine bestätigte aktive Gildenzugehörigkeit.</p>}</div>}

      {panel === "assets" && <div className="community-assets"><p className="community-empty">Öffentlicher Aurion-Katalog · nur lesend. Upload, Auswahl und Ausrüstung erfolgen nicht über diese Communityfläche.</p><div className="market-inventory">{publicAssets.data?.map(asset => <article key={asset.id} className="market-item"><header><b>{asset.displayName}</b><span>{asset.assetType}</span></header><p>{asset.description || asset.subcategory || "Freigegebenes Community-Asset"}</p></article>)}{!publicAssets.isLoading && !publicAssets.data?.length && <p className="community-empty">Noch keine öffentlichen Assets.</p>}</div></div>}
    </section>}
  </aside>;

  return openedFromWorld && typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}
