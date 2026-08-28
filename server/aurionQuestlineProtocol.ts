import { createHash } from "node:crypto";

export const AURION_QUESTLINE_RULESET_VERSION = "aurion-questlines.v2-human-stories" as const;
export const aurionFactions = ["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact", "free_haven"] as const;
export type AurionFaction = (typeof aurionFactions)[number];
export const questApproaches = ["trade", "craft", "combat", "espionage", "exploration"] as const;
export type QuestApproach = (typeof questApproaches)[number];
export type QuestKind = "main" | "side" | "oath" | "warfront";
export type QuestNode = Readonly<{
  id: string;
  faction: AurionFaction;
  kind: QuestKind;
  title: string;
  region: string;
  premise: string;
  preferredApproaches: readonly QuestApproach[];
  objectiveByApproach: Readonly<Record<QuestApproach, string>>;
  requires: readonly string[];
  next: readonly string[];
  decisionKeys: readonly string[];
  warfrontBossKey?: string;
}>;
export type QuestDecision = Readonly<{ questId: string; key: string; approach: QuestApproach; receiptId: string; resolutionIndex: number }>;
export type AurionFactionStory = Readonly<{
  faction: AurionFaction;
  protagonist: string;
  title: string;
  visibleNeed: string;
  privateWound: string;
  humanTruth: string;
  coreQuestline: string;
  turningPoint: string;
  endingPromise: string;
  signatureMotifs: readonly string[];
}>;

export const aurionFactionStories: readonly AurionFactionStory[] = Object.freeze([
  {
    faction: "sunward_concord",
    protagonist: "Mara Venn, Maurerin des Sonnenwalls",
    title: "Die Namen, die der Wall behält",
    visibleNeed: "Mara braucht Stein, Arbeitskräfte und einen geschlossenen Wall, bevor die nächste Flüchtlingswelle eintrifft.",
    privateWound: "Ihr jüngerer Bruder starb beim ersten Einsturz, doch sein Name wurde aus dem Bürgerbuch gestrichen, weil er als Fremder galt.",
    humanTruth: "Sie baut nicht nur eine Festung. Sie versucht, einen Ort zu schaffen, an dem niemand erst beweisen muss, dass sein Leben zählt.",
    coreQuestline: "Die Questline führt von der Rettung einer Wagenkolonne über das Wiederfinden gestrichener Namen bis zur Entscheidung, ob der Wall Zuflucht oder nur ein besseres Gefängnis wird.",
    turningPoint: "Mara muss wählen, ob sie den letzten Stein für den militärischen Schutzkreis oder für eine offene Pforte der Evakuierung verwendet.",
    endingPromise: "Die Concord kann lernen, dass Ordnung nicht dasselbe wie Gerechtigkeit ist; der Preis ist, die eigene Familiengeschichte öffentlich zu machen.",
    signatureMotifs: ["Mörtel", "Bürgerbuch", "offene Pforte", "fremde Namen"],
  },
  {
    faction: "ironwardens",
    protagonist: "Joren Kest, Träger des ersten Schildes",
    title: "Die Linie, hinter der Menschen stehen",
    visibleNeed: "Joren muss eine rote Front halten, damit verstreute Siedlungen nicht voneinander abgeschnitten werden.",
    privateWound: "Er trägt den Schild seines gefallenen Partners und verschweigt, dass dieser in seiner letzten Stunde nicht nach Ruhm, sondern nach einem Weg für die Verwundeten fragte.",
    humanTruth: "Seine Härte ist erlernte Angst: Wenn er den Befehl nicht ausspricht, glaubt er, wieder jemanden im Staub zu verlieren.",
    coreQuestline: "Die Questline führt durch eine kontrollierte Gegenoffensive, eine Schmiede voller Lehrlinge und die Frage, ob Stärke Schutz bedeutet oder nur schneller gehorcht.",
    turningPoint: "Joren muss den taktisch glänzenden Angriff abbrechen, um eine Gruppe feindlicher und eigener Verwundeter gemeinsam herauszuführen.",
    endingPromise: "Die Ironwardens können aus einer Armee von Linienhaltern eine Gemeinschaft von Schutzträgern werden, wenn Joren den Namen seines Partners wieder ausspricht.",
    signatureMotifs: ["Schildleder", "roter Staub", "Lehrlingshände", "Rückzugssignal"],
  },
  {
    faction: "veiled_covenant",
    protagonist: "Ilyra Senn, Hüterin der stillen Archive",
    title: "Was eine Maske bewahren soll",
    visibleNeed: "Ilyra braucht belastbare Informationen, um einen Befehl zu stoppen, der die falschen Menschen treffen würde.",
    privateWound: "Ihre Schwester lebt unter einem falschen Namen, weil Ilyra sie einst aus einem Spionagenetz löste und dafür die eigene Akte fälschte.",
    humanTruth: "Für sie ist Geheimhaltung kein Spiel der Macht, sondern die letzte Form von Fürsorge für Menschen, deren Namen sonst zu Waffen werden.",
    coreQuestline: "Die Questline führt durch einen inneren Riegel, falsche Befehle und die Rettung von Gefangenen, während jede Wahrheit eine neue Gefahr für jemanden zuhause öffnet.",
    turningPoint: "Ilyra muss entscheiden, ob sie die perfekte Tarnung bewahrt oder eine unvollständige Wahrheit veröffentlicht, die ihre Schwester sichtbar macht.",
    endingPromise: "Der Covenant kann lernen, dass eine Information nicht erst dann wertvoll ist, wenn sie geheim bleibt, sondern wenn sie Leben bewahrt.",
    signatureMotifs: ["Maskenfaden", "unvollständige Wahrheit", "Archivstaub", "zwei gleiche Handschriften"],
  },
  {
    faction: "wayfarer_compact",
    protagonist: "Tava Orr, Kartografin der Randlande",
    title: "Die siebte Markierung",
    visibleNeed: "Tava muss einen sicheren Korridor durch Sturmgrat und gebrochenen Fluss finden, bevor die Evakuierungsroute verschwindet.",
    privateWound: "Sie zeichnet jede verlorene Person in ihre Karten ein, weil sie den letzten Weg ihrer Gefährtin im Aschensturm nie finden konnte.",
    humanTruth: "Ihre Rastlosigkeit ist Trauer in Bewegung. Sie hilft jedem weiter, damit niemand so namenlos verschwindet wie die Person, die sie liebte.",
    coreQuestline: "Die Questline verbindet Leuchtfeuer, Wegrechte und eine Gruppe verängstigter Reisender; der eigentliche Schatz ist eine Karte, die nicht Besitz, sondern Rückkehr beschreibt.",
    turningPoint: "Tava muss eine Route aufgeben, die sie berühmt machen würde, um einen unscheinbaren Umweg für eine langsame, verletzliche Gruppe zu öffnen.",
    endingPromise: "Der Compact wird einzigartig, wenn seine Wege nicht nach dem schnellsten Durchkommen, sondern nach der Möglichkeit gemessen werden, gemeinsam anzukommen.",
    signatureMotifs: ["siebte Markierung", "Leuchtfeuer", "Aschenwind", "Karte der Rückkehr"],
  },
  {
    faction: "free_haven",
    protagonist: "Niko Pell, Hüter des Brunnenkreises",
    title: "Der fünfte Weg nach Hause",
    visibleNeed: "Niko muss Wasser, Verhandlungen und einen neutralen Ort bewahren, während alle Fraktionen den Freihafen für sich gewinnen wollen.",
    privateWound: "Er war einst selbst Befehlshaber einer Plünderergruppe und trägt heimlich die Liste der Menschen, deren Wasser er damals rationierte.",
    humanTruth: "Seine Neutralität ist keine Unschuld. Sie ist tägliche Wiedergutmachung, die nur funktioniert, solange er niemanden zwingt, ihm zu vergeben.",
    coreQuestline: "Die Questline beginnt am Brunnen, führt durch eine gemeinsame Versorgungslinie und endet an der Frage, ob Frieden auch dann gilt, wenn niemand die eigene Schuld ablegen darf.",
    turningPoint: "Niko muss seine Vergangenheit offenlegen, obwohl dadurch der Waffenstillstand zerbrechen kann, oder schweigen und die alte Lüge erneut als Schutzschild verwenden.",
    endingPromise: "Freihafen bleibt einzigartig, wenn seine Stärke nicht darin liegt, unberührt zu bleiben, sondern Schuld auszuhalten, ohne die nächste Generation dafür bezahlen zu lassen.",
    signatureMotifs: ["Brunnenkreis", "geteilte Schlüssel", "Wasserliste", "fünfter Weg"],
  },
]);

export function getFactionStory(faction: AurionFaction): AurionFactionStory {
  const story = aurionFactionStories.find(candidate => candidate.faction === faction);
  if (!story) throw new Error(`Unknown Aurion faction story: ${faction}`);
  return story;
}
export type QuestlineInput = Readonly<{
  playerId: string;
  faction: AurionFaction;
  completedQuestIds: readonly string[];
  decisions: readonly QuestDecision[];
  approachScores: Readonly<Partial<Record<QuestApproach, number>>>;
  resolutionIndex: number;
}>;
export type QuestlineReadmodel = Readonly<{
  faction: AurionFaction;
  factionStory: AurionFactionStory;
  preferredApproach: QuestApproach;
  availableOathQuestIds: readonly string[];
  availableMainQuestIds: readonly string[];
  availableSideQuestIds: readonly string[];
  route: readonly string[];
  oathStatus: "unpledged" | "pledged";
  warfrontBossKeys: readonly string[];
  deterministicHash: string;
}>;

const emptyObjectives: Record<QuestApproach, string> = { trade: "Verhandle Vorräte und sichere einen fairen Tausch.", craft: "Baue, repariere oder verstärke eine schützende Struktur.", combat: "Halte die Front und besiege die unmittelbare Bedrohung.", espionage: "Infiltriere den Gegner und verändere sein Vorhaben von innen.", exploration: "Erkunde einen gefährlichen Zugang und sichere neue Erkenntnisse." };
const objective = (overrides: Partial<Record<QuestApproach, string>>): Readonly<Record<QuestApproach, string>> => ({ ...emptyObjectives, ...overrides });
const n = (id: string, faction: AurionFaction, kind: QuestKind, title: string, region: string, premise: string, preferredApproaches: readonly QuestApproach[], requires: readonly string[], next: readonly string[], decisionKeys: readonly string[], overrides: Partial<Record<QuestApproach, string>>, warfrontBossKey?: string): QuestNode => ({ id, faction, kind, title, region, premise, preferredApproaches, objectiveByApproach: objective(overrides), requires, next, decisionKeys, ...(warfrontBossKey ? { warfrontBossKey } : {}) });

export const aurionQuestlineNodes: readonly QuestNode[] = Object.freeze([
  n("concord.gate-seal", "sunward_concord", "main", "Das Tor, das standhält", "Sonnenwall", "Der Sonnenwall droht unter Flüchtlingsströmen und feindlichem Druck zu brechen.", ["craft", "trade", "exploration"], [], ["concord.oath", "concord.supply"], ["build", "bargain", "map"], { craft: "Errichte einen verstärkten Torbogen, der den Schutzkreis schließt.", trade: "Sichere Stein, Erz und Nahrung durch ein Abkommen mit den Karawanen.", exploration: "Finde den alten Fundamentstollen unter dem Tor." }),
  n("concord.oath", "sunward_concord", "oath", "Das Gelöbnis des offenen Tores", "Sonnenwall", "Die Concord verlangt keine Herkunft, sondern den Beweis, dass Schutz allen gilt.", ["craft", "trade"], ["concord.gate-seal"], ["concord.mainline", "concord.side-ledger"], ["pledge", "refuse"], { craft: "Verankere dein Gelöbnis in einem sichtbaren Schutzwerk.", trade: "Vermittle zwischen den Lagern und beweise, dass Versorgung Schutz bedeutet." }),
  n("concord.supply", "sunward_concord", "side", "Die letzte Wagenkolonne", "Bernsteinroute", "Eine Karawane trägt die Nägel und Getreidesiegel, die den Wall retten können.", ["trade", "espionage", "exploration"], ["concord.gate-seal"], ["concord.mainline"], ["escort", "misdirect", "scout"], { trade: "Schließe den Zollstreit ohne die Vorräte zu verlieren.", espionage: "Lenke die Plünderer auf eine leere Nebenroute.", exploration: "Finde einen sicheren Pass durch das Glasmoor." }),
  n("concord.mainline", "sunward_concord", "main", "Die Mauer aus vielen Händen", "Sonnenwall", "Am Vorabend der Warfront muss der Wall zugleich Zuflucht und Bollwerk sein.", ["craft", "combat", "trade", "espionage", "exploration"], ["concord.oath"], ["concord.side-ledger", "warfront.concord"], ["fortify", "hold", "supply", "sabotage", "survey"], { craft: "Baue das Tor fertig und befestige es gegen Belagerungsstöße.", combat: "Verteidige die Baustelle, während andere den letzten Balken setzen.", trade: "Organisiere Arbeitskräfte, Material und Evakuierungswege.", espionage: "Öffne ein feindliches Versorgungstor im richtigen Moment.", exploration: "Entdecke die vergessene Fluchtroute hinter dem Wall." }),
  n("concord.side-ledger", "sunward_concord", "side", "Namen im Mörtel", "Sonnenwall", "Die Namen der Helfenden wurden aus dem Bürgerbuch gestrichen; ohne sie wird der Schutzkreis instabil.", ["trade", "craft", "espionage"], ["concord.oath"], ["warfront.concord"], ["record", "repair", "recover"], { trade: "Versöhne die Handwerkerhäuser und erneuere das Bürgerbuch.", craft: "Setze die Siegelsteine der vergessenen Familien ein.", espionage: "Hole die gestohlenen Namen aus dem Archiv der Besatzer zurück." }),
  n("ironwardens.oath", "ironwardens", "oath", "Der Eid vor dem Schild", "Eisensteppe", "Die Ironwardens bieten Zugehörigkeit denen an, die eine Linie halten, ohne Zivilisten preiszugeben.", ["combat", "craft"], [], ["ironwardens.mainline", "ironwardens.side-forge"], ["pledge", "refuse"], { combat: "Halte den Übungswall gegen eine kontrollierte Angriffswelle.", craft: "Schmiede ein Schild, das Schutz vor Ruhm stellt." }),
  n("ironwardens.mainline", "ironwardens", "main", "Die Linie im roten Staub", "Eisensteppe", "Ein feindlicher Vorstoß droht die verstreuten Siedlungen voneinander abzuschneiden.", ["combat", "craft", "exploration", "trade", "espionage"], ["ironwardens.oath"], ["ironwardens.side-forge", "warfront.ironwardens"], ["charge", "brace", "route", "provision", "breach"], { combat: "Führe den Gegenstoß und halte die Linie vor dem Tor.", craft: "Verstärke die Sperren, damit der Gegenstoß nicht zum Massaker wird.", exploration: "Finde den verschütteten Umgehungspfad für die Verwundeten.", trade: "Sichere Heilmittel und Ersatzteile von neutralen Händlern.", espionage: "Manipuliere die feindlichen Signalfeuer." }),
  n("ironwardens.side-forge", "ironwardens", "side", "Die Klinge, die nicht bricht", "Eisensteppe", "Eine alte Schmiede kann Waffen in Werkzeuge des Schutzes verwandeln, wenn ihre Besitzer einander vertrauen.", ["craft", "trade", "combat"], ["ironwardens.oath"], ["warfront.ironwardens"], ["forge", "barter", "duel"], { craft: "Fertige eine Torstrebe aus dem alten Sternenmetall.", trade: "Tausche Erz gegen Heilmittel statt gegen weitere Waffen.", combat: "Schütze die Schmiede, ohne die Lehrlinge zu gefährden." }),
  n("veiled_covenant.oath", "veiled_covenant", "oath", "Das Schweigen mit offenen Augen", "Schleierhafen", "Der Veiled Covenant verlangt Diskretion, aber kein blindes Vertrauen: Informationen sollen Leben retten.", ["espionage", "trade", "exploration"], [], ["veiled_covenant.mainline", "veiled_covenant.side-masks"], ["pledge", "refuse"], { espionage: "Entlarve einen Verräter, ohne seine Familie zu verbrennen.", trade: "Kaufe Informationen, ohne Abhängigkeiten zu schaffen.", exploration: "Lies die Spuren eines verschwundenen Kundschafters." }),
  n("veiled_covenant.mainline", "veiled_covenant", "main", "Hinter dem feindlichen Tor", "Schleierhafen", "Die Warfront wird nicht am stärksten Tor entschieden, sondern an der Wahrheit hinter ihm.", ["espionage", "exploration", "trade", "craft", "combat"], ["veiled_covenant.oath"], ["veiled_covenant.side-masks", "warfront.veiled_covenant"], ["infiltrate", "decode", "broker", "disguise", "extract"], { espionage: "Schleiche durch die feindlichen Tore und öffne den inneren Riegel.", exploration: "Verfolge alte Tunnelzeichen bis zur Kommandozentrale.", trade: "Vermittle einem feindlichen Quartiermeister einen Ausweg.", craft: "Baue eine lautlose Hebevorrichtung für den Riegel.", combat: "Sichere den Rückzug, wenn die Tarnung bricht." }),
  n("veiled_covenant.side-masks", "veiled_covenant", "side", "Masken ohne Gesicht", "Schleierhafen", "Drei falsche Befehle könnten den Krieg verkürzen oder die falschen Menschen treffen.", ["espionage", "craft", "trade"], ["veiled_covenant.oath"], ["warfront.veiled_covenant"], ["forge-seal", "bribe", "expose"], { espionage: "Ersetze den Befehl durch eine Evakuierung statt durch ein Massaker.", craft: "Fälsche ein Siegel nur mit nachvollziehbarer Materialspur.", trade: "Kaufe die Freilassung der Gefangenen mit einem überprüfbaren Vertrag." }),
  n("wayfarer_compact.oath", "wayfarer_compact", "oath", "Die Karte gehört niemandem", "Randlande", "Der Wayfarer Compact schwört der offenen Straße und schützt Wege, die Fraktionen verbinden.", ["exploration", "trade", "craft"], [], ["wayfarer_compact.mainline", "wayfarer_compact.side-beacons"], ["pledge", "refuse"], { exploration: "Finde den nächsten sicheren Übergang und markiere ihn für alle.", trade: "Vereinbare Wegrechte statt Besitzansprüche.", craft: "Baue einen Leuchtturm, der Wandernde heimführt." }),
  n("wayfarer_compact.mainline", "wayfarer_compact", "main", "Jenseits der siebten Markierung", "Randlande", "Die Warfront droht die einzige Verbindung zwischen den Fronten abzuschneiden.", ["exploration", "trade", "craft", "espionage", "combat"], ["wayfarer_compact.oath"], ["wayfarer_compact.side-beacons", "warfront.wayfarer_compact"], ["chart", "negotiate", "build", "sneak", "escort"], { exploration: "Erkunde den Sturmgrat und kartiere einen gangbaren Korridor.", trade: "Sichere Wegrechte mit allen Lagern.", craft: "Errichte mobile Brücken über den gebrochenen Fluss.", espionage: "Entdecke, wer die Wegmarken absichtlich verdreht.", combat: "Begleite die letzte Gruppe durch das offene Gelände." }),
  n("wayfarer_compact.side-beacons", "wayfarer_compact", "side", "Lichter für die Verlorenen", "Randlande", "Ein Netz aus Leuchtfeuern kann Flüchtende führen, aber jedes Feuer verrät auch eine Position.", ["exploration", "craft", "espionage"], ["wayfarer_compact.oath"], ["warfront.wayfarer_compact"], ["place", "repair", "conceal"], { exploration: "Finde Sichtlinien, die auch im Aschensturm halten.", craft: "Baue ein Leuchtfeuer aus wiederverwendeten Torresten.", espionage: "Verberge das echte Signal in einer falschen Route." }),
  n("free_haven.oath", "free_haven", "oath", "Kein Banner über dem Brunnen", "Freihafen", "Die neutrale Fraktion schützt Versorgung und Verhandlungen, bis der Spieler einer Sache Treue schwört.", ["trade", "craft", "exploration", "espionage", "combat"], [], ["free_haven.mainline"], ["pledge", "delay"], { trade: "Stifte einen Vertrag, der niemanden aus dem Brunnenkreis ausschließt.", craft: "Baue eine Zisterne, deren Schlüssel geteilt wird.", exploration: "Finde eine zweite Wasserader.", espionage: "Entdecke, wer den Brunnen vergiften will.", combat: "Halte die Angreifer fern, ohne den Freihafen zu militarisieren." }),
  n("free_haven.mainline", "free_haven", "main", "Der fünfte Weg", "Freihafen", "Die neutrale Route verbindet die Fraktionen, bevor der Spieler seine Treue erklärt.", ["trade", "craft", "exploration", "espionage", "combat"], ["free_haven.oath"], ["warfront.free_haven"], ["mediate", "build", "map", "unmask", "defend"], { trade: "Vermittle die erste gemeinsame Versorgungslinie.", craft: "Baue ein neutrales Tor, das alle Parteien passieren dürfen.", exploration: "Finde das Schlachtfeld, bevor es jemand beansprucht.", espionage: "Entlarve den Kriegstreiber, der alle Banner gegeneinander ausspielt.", combat: "Verteidige die Verhandlung, ohne Partei zu ergreifen." }),
  n("warfront.concord", "sunward_concord", "warfront", "Warfront: Der Wallherz-Koloss", "Warfront", "Alle Wege laufen am Schlachtfeld zusammen; die Concord bringt den Wallherz-Koloss.", ["craft", "trade", "combat", "espionage", "exploration"], ["concord.mainline"], [], ["converge"], { craft: "Aktiviere Schutzanker zwischen den Fronten.", trade: "Versorge alle Lager bis zum letzten Vorrat.", combat: "Halte den Koloss und seine Angreifer auf.", espionage: "Finde die Sabotagequelle im Belagerungsheer.", exploration: "Sichere den Rückzugsweg hinter dem Schlachtfeld." }, "boss.wallheart_colossus"),
  n("warfront.ironwardens", "ironwardens", "warfront", "Warfront: Der rote Bannerbrecher", "Warfront", "Die Ironwardens stellen sich dem Bannerbrecher, der Fronten durch Furcht spaltet.", ["combat", "craft", "espionage", "trade", "exploration"], ["ironwardens.mainline"], [], ["converge"], { combat: "Fordere den Bannerbrecher in der offenen Linie.", craft: "Errichte Schildkeile, die den Durchbruch verhindern.", espionage: "Zerschneide seine Befehlsverbindungen.", trade: "Halte die Versorgung der Verwundeten offen.", exploration: "Finde eine Stellung, von der aus Zivilräume geschützt werden." }, "boss.bannerbreaker"),
  n("warfront.veiled_covenant", "veiled_covenant", "warfront", "Warfront: Die Maskenmutter", "Warfront", "Der Covenant jagt die Maskenmutter, die jede Wahrheit in ein falsches Signal verwandelt.", ["espionage", "exploration", "trade", "craft", "combat"], ["veiled_covenant.mainline"], [], ["converge"], { espionage: "Entlarve ihre echte Identität und kappe die Täuschungsnetze.", exploration: "Finde den verborgenen Beobachtungspunkt.", trade: "Sichere die Aussage eines überlaufenden Boten.", craft: "Baue ein Gegen-Signalgerät.", combat: "Schütze die Zeugen während der Enthüllung." }, "boss.mother_of_masks"),
  n("warfront.wayfarer_compact", "wayfarer_compact", "warfront", "Warfront: Der Sturmwanderer", "Warfront", "Der Compact führt den Sturmwanderer aus den Korridoren, damit kein Weg zur Falle wird.", ["exploration", "trade", "craft", "espionage", "combat"], ["wayfarer_compact.mainline"], [], ["converge"], { exploration: "Lies den Sturm und führe die Front aus seinem Kern.", trade: "Koordiniere die Durchgänge aller Verbündeten.", craft: "Verankere den Korridor mit mobilen Brücken.", espionage: "Entdecke die falschen Wegmarken.", combat: "Halte den Sturmwanderer fern von den Evakuierungsrouten." }, "boss.stormwalker"),
  n("warfront.free_haven", "free_haven", "warfront", "Warfront: Der Eidlose", "Warfront", "Der Freihafen tritt nicht mit einem Banner an, sondern mit dem Eidlosen, der alle Bündnisse zerreißen will.", ["trade", "craft", "exploration", "espionage", "combat"], ["free_haven.mainline"], [], ["converge"], { trade: "Halte den Waffenstillstand lang genug für eine gemeinsame Entscheidung.", craft: "Baue einen Schutzring für die Zivilisten.", exploration: "Finde den sicheren Sammelpunkt hinter der Warfront.", espionage: "Entdecke den Auslöser, der die Fraktionen gegeneinander hetzt.", combat: "Verteidige den Schutzring, ohne den Eidlosen zu dienen." }, "boss.the_oathless"),
]);

const hash = (parts: readonly string[]): string => createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const scoreApproach = (input: QuestlineInput, approach: QuestApproach): number => Number.isFinite(input.approachScores[approach]) ? Number(input.approachScores[approach]) : 0;
export function getQuestlineNode(id: string): QuestNode { const node = aurionQuestlineNodes.find(candidate => candidate.id === id); if (!node) throw new Error(`Unknown Aurion questline node: ${id}`); return node; }
export function selectPreferredQuestApproach(input: QuestlineInput): QuestApproach { return questApproaches.slice().sort((a, b) => scoreApproach(input, b) - scoreApproach(input, a) || questApproaches.indexOf(a) - questApproaches.indexOf(b))[0]; }
export function resolveQuestline(input: QuestlineInput): QuestlineReadmodel {
  if (!input.playerId || !aurionFactions.includes(input.faction) || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Questline input is not valid");
  const completed = new Set(input.completedQuestIds);
  const preferredApproach = selectPreferredQuestApproach(input);
  const factionNodes = aurionQuestlineNodes.filter(node => node.faction === input.faction);
  const available = factionNodes.filter(node => node.requires.every(required => completed.has(required)) && !completed.has(node.id) && (node.kind === "main" || node.kind === "side" || node.kind === "oath"));
  const oath = available.filter(node => node.kind === "oath").map(node => node.id).sort(compare);
  const main = available.filter(node => node.kind === "main").map(node => node.id).sort(compare);
  const side = available.filter(node => node.kind === "side").map(node => node.id).sort(compare);
  const oathStatus = completed.has(`${input.faction}.oath`) || input.faction === "free_haven" && completed.has("free_haven.oath") ? "pledged" : "unpledged";
  const route = factionNodes.filter(node => node.kind !== "warfront" && (node.preferredApproaches.includes(preferredApproach) || node.kind === "oath")).map(node => node.id).sort(compare);
  const warfrontBossKeys = aurionQuestlineNodes.filter(node => node.kind === "warfront").map(node => node.warfrontBossKey).filter((key): key is string => Boolean(key)).sort(compare);
  return { faction: input.faction, factionStory: getFactionStory(input.faction), preferredApproach, availableOathQuestIds: oath, availableMainQuestIds: main, availableSideQuestIds: side, route, oathStatus, warfrontBossKeys, deterministicHash: hash([AURION_QUESTLINE_RULESET_VERSION, input.playerId, input.faction, String(input.resolutionIndex), preferredApproach, ...oath, ...main, ...side, ...route, ...warfrontBossKeys]) };
}
export function resolveQuestDecision(input: Readonly<{ playerId: string; nodeId: string; decisionKey: string; approach: QuestApproach; receiptId: string; resolutionIndex: number }>): QuestDecision {
  const node = getQuestlineNode(input.nodeId);
  if (!node.decisionKeys.includes(input.decisionKey)) throw new Error("Quest decision is not authored for this node");
  if (!node.preferredApproaches.includes(input.approach)) throw new Error("Quest approach is not authored for this node");
  if (!input.playerId || !input.receiptId || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Quest decision receipt is not valid");
  return { questId: node.id, key: input.decisionKey, approach: input.approach, receiptId: input.receiptId, resolutionIndex: input.resolutionIndex };
}
export function resolveQuestObjective(nodeId: string, approach: QuestApproach): string { const node = getQuestlineNode(nodeId); return node.objectiveByApproach[approach]; }
export function getWarfrontBosses(): readonly { faction: AurionFaction; bossKey: string; questId: string }[] { return aurionQuestlineNodes.filter(node => node.kind === "warfront" && node.warfrontBossKey).map(node => ({ faction: node.faction, bossKey: node.warfrontBossKey as string, questId: node.id })).sort((a, b) => compare(a.faction, b.faction)); }
