import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import GlbPreview from "@/components/GlbPreview";
import { starterCharacters, type StarterCharacter } from "@/game/starterCharacters";
import { hasAurionApi } from "@/lib/aurionAssets";
import { runtimeIssueCode } from "@shared/runtimeContracts";
import {
  BellRing,
  Box,
  CalendarDays,
  Coins,
  FileText,
  Megaphone,
  MessageCircle,
  Send,
  ShoppingBag,
  Store,
  Upload,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type CommunityPanel = "chat" | "partners" | "market" | "assets" | "forum" | null;
type ForumCategory = "announcements" | "patch_notes" | "events" | "general";

const forumSections: { id: ForumCategory; label: string; icon: typeof Megaphone }[] = [
  { id: "announcements", label: "Ankündigungen", icon: Megaphone },
  { id: "patch_notes", label: "Patch Notes", icon: FileText },
  { id: "events", label: "Events", icon: CalendarDays },
  { id: "general", label: "Fragen", icon: MessageCircle },
];

function participantName(name: string | null, userId: number): string {
  return name?.trim() || `Explorer ${userId}`;
}

function localTime(value: Date): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Die GLB-Datei konnte nicht gelesen werden."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const payload = result.split(",", 2)[1];
      if (!payload) reject(new Error("Die GLB-Datei enthält keinen gültigen Binärinhalt."));
      else resolve(payload);
    };
    reader.readAsDataURL(file);
  });
}

export default function CommunityOverlay({
  isAuthenticated,
  currentUserId,
  onTeamReady,
  onTeamCleared,
  starterCharacterId,
  onStarterCharacterSelected,
}: {
  isAuthenticated: boolean;
  currentUserId?: number;
  onTeamReady: (partnerName: string) => void;
  onTeamCleared: () => void;
  starterCharacterId: StarterCharacter["id"];
  onStarterCharacterSelected: (character: StarterCharacter) => void;
}) {
  const [panel, setPanel] = useState<CommunityPanel>(null);
  const [chatBody, setChatBody] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [forumCategory, setForumCategory] = useState<ForumCategory>("announcements");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [questionTitle, setQuestionTitle] = useState("");
  const [questionBody, setQuestionBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [message, setMessage] = useState("");
  const [listingPrices, setListingPrices] = useState<Record<string, string>>({});
  const [assetType, setAssetType] = useState<"character" | "enemy" | "weapon" | "armor" | "arena">("character");
  const [assetSubtype, setAssetSubtype] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [assetVisibility, setAssetVisibility] = useState<"private" | "public">("private");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetPreviewUrl, setAssetPreviewUrl] = useState<string | null>(null);
  const lastTeamId = useRef<string | null>(null);
  const utils = trpc.useUtils();
  const apiAvailable = hasAurionApi();

  const chat = trpc.community.chat.list.useQuery(undefined, {
    enabled: apiAvailable && isAuthenticated && panel === "chat",
    refetchInterval: panel === "chat" ? 5000 : false,
  });
  const requests = trpc.community.partners.open.useQuery(undefined, {
    enabled: apiAvailable && isAuthenticated,
    refetchInterval: 6000,
  });
  const team = trpc.community.team.active.useQuery(undefined, {
    enabled: apiAvailable && isAuthenticated,
    refetchInterval: 6000,
  });
  const player = trpc.player.me.useQuery(undefined, { enabled: apiAvailable && isAuthenticated });
  const marketInventory = trpc.market.inventory.useQuery(undefined, { enabled: apiAvailable && isAuthenticated && panel === "market" });
  const marketListings = trpc.market.activeListings.useQuery({ limit: 50 }, { enabled: apiAvailable && isAuthenticated && panel === "market", refetchInterval: apiAvailable && panel === "market" ? 8000 : false });
  const myMarketListings = trpc.market.myListings.useQuery(undefined, { enabled: apiAvailable && isAuthenticated && panel === "market" });
  const mySubmissions = trpc.assetSubmissions.mine.useQuery(undefined, { enabled: apiAvailable && isAuthenticated && panel === "assets" });
  const assetCatalog = trpc.assetSubmissions.catalog.useQuery(undefined, { enabled: apiAvailable && isAuthenticated && panel === "assets" });
  const publicAssetCatalog = trpc.assetSubmissions.publicCatalog.useQuery(undefined, { enabled: apiAvailable && panel === "assets" });
  const characterAppearance = trpc.assetSubmissions.characterAppearance.useQuery(undefined, { enabled: apiAvailable && isAuthenticated && panel === "assets" });
  const threads = trpc.community.forum.list.useQuery(
    { category: forumCategory },
    { enabled: apiAvailable && panel === "forum", refetchInterval: apiAvailable && panel === "forum" ? 12000 : false },
  );
  const threadQuery = trpc.community.forum.get.useQuery(
    { threadId: selectedThreadId ?? "thread_unselected" },
    { enabled: apiAvailable && Boolean(selectedThreadId) },
  );
  const selectedThread = threadQuery.data;
  const marketLoading = marketInventory.isLoading || marketListings.isLoading || myMarketListings.isLoading || player.isLoading;
  const marketError = marketInventory.error ?? marketListings.error ?? myMarketListings.error ?? player.error;
  const reportRuntimeFailure = (action: string, error: unknown) => setMessage(`${action} konnte nicht abgeschlossen werden. Vorgang ${runtimeIssueCode(error)}.`);

  const sendChat = trpc.community.chat.send.useMutation({
    onSuccess: async () => {
      setChatBody("");
      await utils.community.chat.list.invalidate();
    },
    onError: error => reportRuntimeFailure("Der Funkspruch", error),
  });
  const createRequest = trpc.community.partners.create.useMutation({
    onSuccess: async () => {
      setRequestNote("");
      setMessage("Dein Gesuch ist für andere Explorer sichtbar.");
      await utils.community.partners.open.invalidate();
    },
    onError: error => reportRuntimeFailure("Das Partnergesuch", error),
  });
  const cancelRequest = trpc.community.partners.cancel.useMutation({
    onSuccess: () => void utils.community.partners.open.invalidate(),
    onError: error => reportRuntimeFailure("Das Zurückziehen des Gesuchs", error),
  });
  const acceptRequest = trpc.community.partners.accept.useMutation({
    onSuccess: async () => {
      setMessage("Team-Siegel bestätigt. Ihr könnt die Sternwarte nun ohne LLM betreten.");
      await Promise.all([
        utils.community.partners.open.invalidate(),
        utils.community.team.active.invalidate(),
      ]);
    },
    onError: error => reportRuntimeFailure("Der Teambeitritt", error),
  });
  const leaveTeam = trpc.community.team.leave.useMutation({
    onSuccess: async () => {
      lastTeamId.current = null;
      onTeamCleared();
      setMessage("Das Expeditionsteam wurde aufgelöst.");
      await Promise.all([
        utils.community.team.active.invalidate(),
        utils.community.partners.open.invalidate(),
      ]);
    },
    onError: error => reportRuntimeFailure("Das Auflösen des Teams", error),
  });
  const createQuestion = trpc.community.forum.createQuestion.useMutation({
    onSuccess: async result => {
      setQuestionTitle("");
      setQuestionBody("");
      setSelectedThreadId(result.id);
      await utils.community.forum.list.invalidate({ category: "general" });
    },
    onError: error => reportRuntimeFailure("Die Forumsfrage", error),
  });
  const reply = trpc.community.forum.reply.useMutation({
    onSuccess: async () => {
      setReplyBody("");
      if (selectedThreadId) await utils.community.forum.get.invalidate({ threadId: selectedThreadId });
    },
    onError: error => reportRuntimeFailure("Die Forumsantwort", error),
  });
  const sellToSystem = trpc.market.sellToSystem.useMutation({ onSuccess: async result => { setMessage(`${result.aurionGranted} Aurion wurden deinem Feldkonto gutgeschrieben.`); await Promise.all([utils.market.inventory.invalidate(), utils.player.me.invalidate()]); }, onError: error => reportRuntimeFailure("Der Systemverkauf", error) });
  const createListing = trpc.market.createListing.useMutation({ onSuccess: async () => { setMessage("Dein Gegenstand ist jetzt im Auktionshaus sichtbar."); await Promise.all([utils.market.inventory.invalidate(), utils.market.activeListings.invalidate(), utils.market.myListings.invalidate()]); }, onError: error => reportRuntimeFailure("Das Auktionsangebot", error) });
  const cancelListing = trpc.market.cancelListing.useMutation({ onSuccess: async () => { setMessage("Das Angebot wurde zurückgenommen."); await Promise.all([utils.market.inventory.invalidate(), utils.market.activeListings.invalidate(), utils.market.myListings.invalidate()]); }, onError: error => reportRuntimeFailure("Das Zurücknehmen", error) });
  const buyListing = trpc.market.buyListing.useMutation({ onSuccess: async () => { setMessage("Kauf bestätigt. Der Gegenstand liegt jetzt in deinem Inventar."); await Promise.all([utils.market.inventory.invalidate(), utils.market.activeListings.invalidate(), utils.market.myListings.invalidate(), utils.player.me.invalidate()]); }, onError: error => reportRuntimeFailure("Der Kauf", error) });
  const submitAsset = trpc.assetSubmissions.submit.useMutation({ onSuccess: async () => { setAssetSubtype(""); setAssetName(""); setAssetDescription(""); setAssetFile(null); setMessage("Dein GLB wurde serverseitig geprüft und liegt jetzt zur Admin-Freigabe vor."); await utils.assetSubmissions.mine.invalidate(); }, onError: error => reportRuntimeFailure("Die GLB-Einreichung", error) });
  const equipCharacter = trpc.assetSubmissions.equipCharacter.useMutation({ onSuccess: async appearance => { setMessage(`${appearance.displayName} ist nun dein aktives Charaktermodell.`); await utils.assetSubmissions.characterAppearance.invalidate(); }, onError: error => reportRuntimeFailure("Das Ausrüsten des Charaktermodells", error) });

  const pendingRequests = useMemo(
    () => requests.data?.filter(request => request.requesterUserId !== currentUserId) ?? [],
    [requests.data, currentUserId],
  );
  const ownOpenRequest = useMemo(
    () => requests.data?.find(request => request.requesterUserId === currentUserId),
    [requests.data, currentUserId],
  );
  const catalogEntries = isAuthenticated ? assetCatalog.data : publicAssetCatalog.data;

  useEffect(() => {
    if (!team.data || team.data.id === lastTeamId.current) return;
    lastTeamId.current = team.data.id;
    const partner = team.data.members.find(member => member.userId !== currentUserId);
    onTeamReady(participantName(partner?.name ?? null, partner?.userId ?? 0));
  }, [team.data, currentUserId, onTeamReady]);

  useEffect(() => {
    if (!assetFile) { setAssetPreviewUrl(null); return; }
    const nextUrl = URL.createObjectURL(assetFile);
    setAssetPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [assetFile]);

  const open = (next: CommunityPanel) => {
    if (!isAuthenticated && next !== "forum" && next !== "assets") {
      startLogin();
      return;
    }
    setMessage("");
    setPanel(previous => previous === next ? null : next);
    if (next !== "forum") setSelectedThreadId(null);
  };

  return <aside className="community-overlay" aria-label="Aurion Gemeinschaft">
    <div className="community-dock">
      <button type="button" className={panel === "chat" ? "community-dock-button active" : "community-dock-button"} onClick={() => open("chat")} aria-label="Expeditionschat öffnen"><MessageCircle size={16} /><span>CHAT</span></button>
      <button type="button" className={panel === "partners" ? "community-dock-button active" : "community-dock-button"} onClick={() => open("partners")} aria-label="Partnergesuche öffnen"><UsersRound size={16} /><span>TEAM</span>{pendingRequests.length > 0 && <b className="community-badge">{pendingRequests.length}</b>}</button>
      <button type="button" className={panel === "market" ? "community-dock-button active" : "community-dock-button"} onClick={() => open("market")} aria-label="Auktionshaus öffnen"><Store size={16} /><span>MARKT</span></button>
      <button type="button" className={panel === "assets" ? "community-dock-button active" : "community-dock-button"} onClick={() => open("assets")} aria-label="GLB-Einreichung öffnen"><Box size={16} /><span>ASSET</span></button>
      <button type="button" className={panel === "forum" ? "community-dock-button active" : "community-dock-button"} onClick={() => open("forum")} aria-label="Forum öffnen"><FileText size={16} /><span>FORUM</span></button>
    </div>

    {panel && <section className={`community-panel ${panel}-panel`} aria-live="polite">
      <header className="community-panel-header">
        <div><p>EXPEDITION // GEMEINSCHAFT</p><h2>{panel === "chat" ? "Signalraum" : panel === "partners" ? "Partnergesuche" : panel === "market" ? "Auktionshaus" : panel === "assets" ? "Asset-Einreichung" : "Sternwartenforum"}</h2></div>
        <button type="button" onClick={() => setPanel(null)} aria-label="Community-Konsole schließen"><X size={18} /></button>
      </header>
      {message && <p className="community-feedback"><BellRing size={13} />{message}</p>}

      {panel === "chat" && <div className="community-chat">
        <div className="community-feed">
          {chat.data?.map(entry => <article key={entry.id} className={entry.userId === currentUserId ? "community-message own" : "community-message"}><header><b>{participantName(entry.authorName, entry.userId)}</b><time>{localTime(entry.createdAt)}</time></header><p>{entry.body}</p></article>)}
          {!chat.data?.length && <p className="community-empty">Noch keine Funksprüche. Eröffne den Signalraum für dein Expeditionsteam.</p>}
        </div>
        <form className="community-compose" onSubmit={event => { event.preventDefault(); if (chatBody.trim()) sendChat.mutate({ body: chatBody }); }}>
          <input value={chatBody} maxLength={500} onChange={event => setChatBody(event.target.value)} placeholder="Kurzer Funkspruch…" />
          <button type="submit" disabled={!chatBody.trim() || sendChat.isPending} aria-label="Chatnachricht senden"><Send size={16} /></button>
        </form>
      </div>}

      {panel === "partners" && <div className="community-partners">
        {team.data ? <div className="community-team-card"><p><UsersRound size={16} /> AKTIVES ZWEIERTEAM</p><strong>{team.data.members.map(member => participantName(member.name, member.userId)).join(" · ")}</strong><span>Die Steuerimpulse eures Partners erscheinen im Echo-Slot. Ihr spielt ohne LLM-Verbindung.</span><button type="button" onClick={() => leaveTeam.mutate()} disabled={leaveTeam.isPending}>Team auflösen</button></div> : <>
          <div className="community-intro"><UserPlus size={18} /><div><b>Ohne LLM gemeinsam spielen</b><p>Beschreibe kurz, welche Rolle oder Begleitung du suchst. Andere Explorer sehen das Gesuch über ihr Team-Siegel.</p></div></div>
          {ownOpenRequest ? <div className="community-own-request"><b>Dein Gesuch ist offen</b><p>{ownOpenRequest.note}</p><button type="button" onClick={() => cancelRequest.mutate({ requestId: ownOpenRequest.id })} disabled={cancelRequest.isPending}>Gesuch zurückziehen</button></div> : <form className="community-request-form" onSubmit={event => { event.preventDefault(); if (requestNote.trim()) createRequest.mutate({ note: requestNote }); }}><textarea value={requestNote} maxLength={280} onChange={event => setRequestNote(event.target.value)} placeholder="Zum Beispiel: Suche einen taktischen Partner für die erste Sternwarte." /><button type="submit" disabled={!requestNote.trim() || createRequest.isPending}><UserPlus size={15} /> Partnergesuch senden</button></form>}
        </>}
        <div className="community-section-heading"><span>OFFENE GESUCHE</span><i /></div>
        <div className="community-request-list">
          {pendingRequests.map(request => <article key={request.id} className="community-request"><header><b>{participantName(request.requesterName, request.requesterUserId)}</b><time>{localTime(request.createdAt)}</time></header><p>{request.note}</p><button type="button" onClick={() => acceptRequest.mutate({ requestId: request.id })} disabled={Boolean(team.data) || acceptRequest.isPending}>Als Partner beitreten</button></article>)}
          {!pendingRequests.length && <p className="community-empty">Im Moment wartet kein anderer Explorer. Dein Gesuch bleibt sichtbar, bis du es zurückziehst oder ein Team entsteht.</p>}
        </div>
      </div>}

      {panel === "market" && <div className="community-market">
        {marketLoading && <p className="community-empty">Marktdaten werden aus der Sternwarte abgerufen…</p>}
        {marketError && <p className="community-feedback"><BellRing size={13} />Der Markt ist gerade nicht erreichbar. Vorgang {runtimeIssueCode(marketError)}.</p>}
        <div className="market-balance"><Coins size={16} /><div><span>FELDKONTO</span><b>{player.data?.profile.aurionPoints ?? 0} AURION</b></div></div>
        <div className="community-section-heading"><span>DEIN INVENTAR</span><i /></div>
        <div className="market-inventory">{marketInventory.data?.map(item => <article key={item.id} className="market-item"><header><b>{item.baseItemKey.replaceAll("_", " ")}</b><span className={`market-quality ${item.quality}`}>{item.quality}</span></header><p>Gegenstandsstufe {item.itemLevel} · Der Systemverkauf vergütet deinen Fund sofort in Aurion.</p><div className="market-item-actions"><button type="button" onClick={() => sellToSystem.mutate({ itemId: item.id })} disabled={sellToSystem.isPending}>Direkt verkaufen</button><label><input type="number" min="1" max="1000000" value={listingPrices[item.id] ?? ""} onChange={event => setListingPrices(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Preis" /><button type="button" disabled={!Number(listingPrices[item.id]) || createListing.isPending} onClick={() => createListing.mutate({ itemId: item.id, askingPrice: Number(listingPrices[item.id]) })}>Anbieten</button></label></div></article>)}{!marketLoading && !marketError && !marketInventory.data?.length && <p className="community-empty">Dein Inventar enthält keine handelbaren Gegenstände. Beute erscheint nach bestätigten Expeditionen.</p>}</div>
        <div className="community-section-heading"><span>DEINE ANGEBOTE</span><i /></div>
        <div className="market-listings">{myMarketListings.data?.filter(listing => listing.status === "active").map(listing => <article key={listing.id} className="market-listing mine"><div><b>{listing.baseItemKey.replaceAll("_", " ")}</b><span>{listing.askingPrice} Aurion</span></div><button type="button" onClick={() => cancelListing.mutate({ listingId: listing.id })} disabled={cancelListing.isPending}>Zurücknehmen</button></article>)}{!marketLoading && !marketError && !myMarketListings.data?.some(listing => listing.status === "active") && <p className="community-empty">Du hast aktuell keine aktiven Angebote.</p>}</div>
        <div className="community-section-heading"><span>AKTIVE AUKTIONEN</span><i /></div>
        <div className="market-listings">{marketListings.data?.filter(listing => listing.sellerUserId !== currentUserId).map(listing => <article key={listing.id} className="market-listing"><div><b>{listing.baseItemKey.replaceAll("_", " ")}</b><small>{listing.quality} · Stufe {listing.itemLevel} · {participantName(listing.sellerName, listing.sellerUserId)}</small></div><button type="button" disabled={buyListing.isPending || (player.data?.profile.aurionPoints ?? 0) < listing.askingPrice} onClick={() => buyListing.mutate({ listingId: listing.id, idempotencyKey: `market:${crypto.randomUUID()}` })}><ShoppingBag size={13} />{listing.askingPrice} Aurion</button></article>)}{!marketLoading && !marketError && !marketListings.data?.filter(listing => listing.sellerUserId !== currentUserId).length && <p className="community-empty">Noch keine Angebote anderer Explorer. Gib deinem Fundstück einen Wert und eröffne den Handel.</p>}</div>
      </div>}

      {panel === "assets" && <div className="community-assets">
        {isAuthenticated ? <><div className="community-intro"><Box size={18} /><div><b>Dein Modell für Aurion</b><p>GLB-Dateien werden erst lokal vorgeschaut, dann serverseitig auf Binärformat, Integrität und maximal 16 MiB geprüft. Erst eine Admin-Freigabe macht sie im Katalog verfügbar.</p></div></div>
        <form className="asset-submission-form" onSubmit={async event => { event.preventDefault(); if (!isAuthenticated) { startLogin(); return; } if (!assetFile) { setMessage("Wähle zuerst eine GLB-Datei aus."); return; } try { await submitAsset.mutateAsync({ assetType, subcategory: assetSubtype, displayName: assetName, description: assetDescription, visibility: assetVisibility, contentBase64: await fileAsBase64(assetFile) }); } catch (error) { setMessage(error instanceof Error ? error.message : "Die GLB-Einreichung ist fehlgeschlagen."); } }}>
          <div className="asset-form-grid"><label><span>Kategorie</span><select value={assetType} onChange={event => { const next = event.target.value as typeof assetType; setAssetType(next); if (next !== "character") setAssetVisibility("public"); }}><option value="character">Charakter</option><option value="weapon">Waffe</option><option value="armor">Rüstung</option><option value="enemy">Gegner</option><option value="arena">Arena</option></select></label><label><span>Unterkategorie</span><input value={assetSubtype} maxLength={80} onChange={event => setAssetSubtype(event.target.value)} placeholder="z. B. Langschwert" /></label></div>
          <label><span>Name des Gegenstands</span><input value={assetName} maxLength={120} onChange={event => setAssetName(event.target.value)} placeholder="Bezeichnung im Katalog" /></label>
          <label><span>Beschreibung</span><textarea value={assetDescription} maxLength={1000} onChange={event => setAssetDescription(event.target.value)} placeholder="Form, Einsatz und besondere Eigenschaften deines Modells…" /></label>
          <label><span>Sichtbarkeit</span><select value={assetVisibility} disabled={assetType !== "character"} onChange={event => setAssetVisibility(event.target.value as "private" | "public")}><option value="private">Privater Charakter – nur für mich</option><option value="public">Öffentlicher Spiel-Asset-Katalog</option></select>{assetType !== "character" && <small>Gegenstände und Welten werden nach Freigabe öffentlich katalogisiert.</small>}</label>
          <label className="asset-file-input"><span>GLB-Datei · maximal 16 MiB</span><input type="file" accept=".glb,model/gltf-binary" onChange={event => { const file = event.target.files?.[0] ?? null; if (!file) return; if (!file.name.toLowerCase().endsWith(".glb") || file.size > 16 * 1024 * 1024) { setAssetFile(null); setMessage("Bitte wähle eine gültige GLB-Datei mit höchstens 16 MiB."); return; } setAssetFile(file); setMessage(""); }} /><small>{assetFile ? `${assetFile.name} · ${(assetFile.size / 1024 / 1024).toFixed(2)} MiB` : "Noch keine Datei ausgewählt."}</small></label>
          <GlbPreview sourceUrl={assetPreviewUrl} fileName={assetFile?.name} />
          <button type="submit" disabled={isAuthenticated && (!assetFile || !assetSubtype.trim() || !assetName.trim() || assetDescription.trim().length < 12 || submitAsset.isPending)}><Upload size={15} />{!isAuthenticated ? "Anmelden, um ein GLB einzureichen" : submitAsset.isPending ? "Wird sicher eingereicht…" : "GLB zur Prüfung einreichen"}</button>
        </form>
        <div className="community-section-heading"><span>DEINE EINREICHUNGEN</span><i /></div><div className="asset-submission-list">{mySubmissions.data?.map(submission => <article key={submission.id}><div><b>{submission.displayName}</b><span>{submission.assetType} · {submission.visibility} · {(submission.bytes / 1024 / 1024).toFixed(2)} MiB</span></div><p className={`submission-status ${submission.status}`}>{submission.status === "pending" ? "PRÜFUNG AUSSTEHEND" : submission.status === "approved" ? "FREIGEGEBEN" : "ABGELEHNT"}</p>{submission.reviewNote && <small>{submission.reviewNote}</small>}</article>)}{!mySubmissions.data?.length && <p className="community-empty">Noch keine eigenen GLB-Einreichungen. Nutze hier Modelle aus deinem eigenen GLB-Creator.</p>}</div></> : <div className="community-intro guest-catalog-intro"><Box size={18} /><div><b>Öffentlicher Aurion-Katalog</b><p>Du siehst ausschließlich freigegebene Modelle. Einreichung, Ausrüstung und private Charakterdaten bleiben bis zur Anmeldung versiegelt.</p></div></div>}
        <div className="community-section-heading"><span>FREIGEGEBENER ASSET-KATALOG</span><i /></div>
        <div className="asset-catalog starter-asset-catalog">{starterCharacters.map(character => <article key={character.id}><div><b>{character.name}</b><span>standard · character · riggt + animiert</span><p>{character.role} · {character.detail}</p></div><div className="asset-catalog-actions"><a href={character.assetPath} target="_blank" rel="noreferrer">Modell ansehen</a>{isAuthenticated && <button type="button" disabled={starterCharacterId === character.id} onClick={() => onStarterCharacterSelected(character)}>{starterCharacterId === character.id ? "Aktiv" : "Als Charakter wählen"}</button>}</div></article>)}</div>
        {characterAppearance.data && <p className="active-character-asset">Aktives Charaktermodell: <b>{characterAppearance.data.displayName}</b></p>}
        <div className="asset-catalog">{catalogEntries?.map(asset => <article key={asset.id}><div><b>{asset.displayName}</b><span>{asset.assetType} · {asset.subcategory ?? "Katalog"} · {asset.visibility ?? "redaktionell"}</span>{asset.description && <p>{asset.description}</p>}</div><div className="asset-catalog-actions"><a href={asset.storageUrl} target="_blank" rel="noreferrer">Modell ansehen</a>{isAuthenticated && asset.assetType === "character" && <button type="button" disabled={equipCharacter.isPending || characterAppearance.data?.assetId === asset.id} onClick={() => equipCharacter.mutate({ assetId: asset.id })}>{characterAppearance.data?.assetId === asset.id ? "Aktiv" : "Als Charakter wählen"}</button>}</div></article>)}{!catalogEntries?.length && <p className="community-empty">Noch keine freigegebenen Modelle im Katalog.</p>}</div>
      </div>}

      {panel === "forum" && <div className="community-forum">
        {!selectedThreadId ? <>
          <nav className="forum-categories" aria-label="Forumskategorien">{forumSections.map(section => { const Icon = section.icon; return <button type="button" key={section.id} className={forumCategory === section.id ? "active" : ""} onClick={() => setForumCategory(section.id)}><Icon size={13} />{section.label}</button>; })}</nav>
          {forumCategory === "general" && <form className="forum-question-form" onSubmit={event => { event.preventDefault(); if (!isAuthenticated) { startLogin(); return; } if (questionTitle.trim() && questionBody.trim()) createQuestion.mutate({ title: questionTitle, body: questionBody }); }}><input value={questionTitle} maxLength={160} onChange={event => setQuestionTitle(event.target.value)} placeholder="Frage an die Gemeinschaft" /><textarea value={questionBody} maxLength={8000} onChange={event => setQuestionBody(event.target.value)} placeholder="Beschreibe dein Anliegen kurz und nachvollziehbar…" /><button type="submit" disabled={createQuestion.isPending}>Frage veröffentlichen</button></form>}
          <div className="forum-thread-list">
            {threads.data?.map(item => <button key={item.id} type="button" className="forum-thread" onClick={() => setSelectedThreadId(item.id)}><span>{forumSections.find(section => section.id === item.category)?.label}</span><b>{item.title}</b><p>{item.body}</p><small>{participantName(item.authorName, item.authorUserId)} · {new Date(item.createdAt).toLocaleDateString()}</small></button>)}
            {!threads.data?.length && <p className="community-empty">In diesem Bereich wurden noch keine Beiträge veröffentlicht.</p>}
          </div>
        </> : <div className="forum-detail">
          <button type="button" className="forum-back" onClick={() => setSelectedThreadId(null)}>← Zur Übersicht</button>
          {selectedThread && <>
            <article className="forum-featured-thread"><span>{forumSections.find(section => section.id === selectedThread.category)?.label}</span><h3>{selectedThread.title}</h3><p>{selectedThread.body}</p><small>{participantName(selectedThread.authorName, selectedThread.authorUserId)} · {new Date(selectedThread.createdAt).toLocaleString()}</small></article>
            <div className="forum-replies">{selectedThread.replies.map(item => <article key={item.id}><header><b>{participantName(item.authorName, item.authorUserId)}</b><time>{localTime(item.createdAt)}</time></header><p>{item.body}</p></article>)}{!selectedThread.replies.length && <p className="community-empty">Noch keine Antwort. Die Sternwarte wartet auf ein Echo.</p>}</div>
            <form className="forum-reply-form" onSubmit={event => { event.preventDefault(); if (!isAuthenticated) { startLogin(); return; } if (replyBody.trim()) reply.mutate({ threadId: selectedThread.id, body: replyBody }); }}><textarea value={replyBody} maxLength={4000} onChange={event => setReplyBody(event.target.value)} placeholder="Eine hilfreiche Antwort schreiben…" /><button type="submit" disabled={!replyBody.trim() || reply.isPending}>Antwort senden</button></form>
          </>}
        </div>}
      </div>}
    </section>}
  </aside>;
}
