import { createHash } from "node:crypto";

export const AURION_QUESTLINE_RULESET_VERSION = "aurion-questlines.v2-human-stories" as const;

export const aurionFactions = [
  "sunward_concord",
  "ironwardens",
  "veiled_covenant",
  "wayfarer_compact",
  "free_haven",
] as const;
export type AurionFaction = (typeof aurionFactions)[number];

export const questApproaches = ["trade", "craft", "combat", "espionage", "exploration"] as const;
export type QuestApproach = (typeof questApproaches)[number];

export type QuestNodeKind = "main" | "side" | "oath" | "warfront";

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

export type QuestNode = Readonly<{
  id: string;
  faction: AurionFaction;
  kind: QuestNodeKind;
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

export type QuestDecision = Readonly<{
  questId: string;
  key: string;
  approach: QuestApproach;
  receiptId: string;
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
  oathStatus: "pledged" | "unpledged";
  warfrontBossKeys: readonly string[];
  deterministicHash: string;
}>;

export const aurionFactionStories: readonly AurionFactionStory[]=Object.freeze([{faction:"sunward_concord",protagonist:"Mara Venn, Maurerin des Sonnenwalls",title:"Die Namen, die der Wall beh\xE4lt",visibleNeed:"Mara braucht Stein, Arbeitskr\xE4fte und einen geschlossenen Wall, bevor die n\xE4chste Fl\xFCchtlingswelle eintrifft.",privateWound:"Ihr j\xFCngerer Bruder starb beim ersten Einsturz, doch sein Name wurde aus dem B\xFCrgerbuch gestrichen, weil er als Fremder galt.",humanTruth:"Sie baut nicht nur eine Festung. Sie versucht, einen Ort zu schaffen, an dem niemand erst beweisen muss, dass sein Leben z\xE4hlt.",coreQuestline:"Die Questline f\xFChrt von der Rettung einer Wagenkolonne \xFCber das Wiederfinden gestrichener Namen bis zur Entscheidung, ob der Wall Zuflucht oder nur ein besseres Gef\xE4ngnis wird.",turningPoint:"Mara muss w\xE4hlen, ob sie den letzten Stein f\xFCr den milit\xE4rischen Schutzkreis oder f\xFCr eine offene Pforte der Evakuierung verwendet.",endingPromise:"Die Concord kann lernen, dass Ordnung nicht dasselbe wie Gerechtigkeit ist; der Preis ist, die eigene Familiengeschichte \xF6ffentlich zu machen.",signatureMotifs:["M\xF6rtel","B\xFCrgerbuch","offene Pforte","fremde Namen"]},{faction:"ironwardens",protagonist:"Joren Kest, Tr\xE4ger des ersten Schildes",title:"Die Linie, hinter der Menschen stehen",visibleNeed:"Joren muss eine rote Front halten, damit verstreute Siedlungen nicht voneinander abgeschnitten werden.",privateWound:"Er tr\xE4gt den Schild seines gefallenen Partners und verschweigt, dass dieser in seiner letzten Stunde nicht nach Ruhm, sondern nach einem Weg f\xFCr die Verwundeten fragte.",humanTruth:"Seine H\xE4rte ist erlernte Angst: Wenn er den Befehl nicht ausspricht, glaubt er, wieder jemanden im Staub zu verlieren.",coreQuestline:"Die Questline f\xFChrt durch eine kontrollierte Gegenoffensive, eine Schmiede voller Lehrlinge und die Frage, ob St\xE4rke Schutz bedeutet oder nur schneller gehorcht.",turningPoint:"Joren muss den taktisch gl\xE4nzenden Angriff abbrechen, um eine Gruppe feindlicher und eigener Verwundeter gemeinsam herauszuf\xFChren.",endingPromise:"Die Ironwardens k\xF6nnen aus einer Armee von Linienhaltern eine Gemeinschaft von Schutztr\xE4gern werden, wenn Joren den Namen seines Partners wieder ausspricht.",signatureMotifs:["Schildleder","roter Staub","Lehrlingsh\xE4nde","R\xFCckzugssignal"]},{faction:"veiled_covenant",protagonist:"Ilyra Senn, H\xFCterin der stillen Archive",title:"Was eine Maske bewahren soll",visibleNeed:"Ilyra braucht belastbare Informationen, um einen Befehl zu stoppen, der die falschen Menschen treffen w\xFCrde.",privateWound:"Ihre Schwester lebt unter einem falschen Namen, weil Ilyra sie einst aus einem Spionagenetz l\xF6ste und daf\xFCr die eigene Akte f\xE4lschte.",humanTruth:"F\xFCr sie ist Geheimhaltung kein Spiel der Macht, sondern die letzte Form von F\xFCrsorge f\xFCr Menschen, deren Namen sonst zu Waffen werden.",coreQuestline:"Die Questline f\xFChrt durch einen inneren Riegel, falsche Befehle und die Rettung von Gefangenen, w\xE4hrend jede Wahrheit eine neue Gefahr f\xFCr jemanden zuhause \xF6ffnet.",turningPoint:"Ilyra muss entscheiden, ob sie die perfekte Tarnung bewahrt oder eine unvollst\xE4ndige Wahrheit ver\xF6ffentlicht, die ihre Schwester sichtbar macht.",endingPromise:"Der Covenant kann lernen, dass eine Information nicht erst dann wertvoll ist, wenn sie geheim bleibt, sondern wenn sie Leben bewahrt.",signatureMotifs:["Maskenfaden","unvollst\xE4ndige Wahrheit","Archivstaub","zwei gleiche Handschriften"]},{faction:"wayfarer_compact",protagonist:"Tava Orr, Kartografin der Randlande",title:"Die siebte Markierung",visibleNeed:"Tava muss einen sicheren Korridor durch Sturmgrat und gebrochenen Fluss finden, bevor die Evakuierungsroute verschwindet.",privateWound:"Sie zeichnet jede verlorene Person in ihre Karten ein, weil sie den letzten Weg ihrer Gef\xE4hrtin im Aschensturm nie finden konnte.",humanTruth:"Ihre Rastlosigkeit ist Trauer in Bewegung. Sie hilft jedem weiter, damit niemand so namenlos verschwindet wie die Person, die sie liebte.",coreQuestline:"Die Questline verbindet Leuchtfeuer, Wegrechte und eine Gruppe ver\xE4ngstigter Reisender; der eigentliche Schatz ist eine Karte, die nicht Besitz, sondern R\xFCckkehr beschreibt.",turningPoint:"Tava muss eine Route aufgeben, die sie ber\xFChmt machen w\xFCrde, um einen unscheinbaren Umweg f\xFCr eine langsame, verletzliche Gruppe zu \xF6ffnen.",endingPromise:"Der Compact wird einzigartig, wenn seine Wege nicht nach dem schnellsten Durchkommen, sondern nach der M\xF6glichkeit gemessen werden, gemeinsam anzukommen.",signatureMotifs:["siebte Markierung","Leuchtfeuer","Aschenwind","Karte der R\xFCckkehr"]},{faction:"free_haven",protagonist:"Niko Pell, H\xFCter des Brunnenkreises",title:"Der f\xFCnfte Weg nach Hause",visibleNeed:"Niko muss Wasser, Verhandlungen und einen neutralen Ort bewahren, w\xE4hrend alle Fraktionen den Freihafen f\xFCr sich gewinnen wollen.",privateWound:"Er war einst selbst Befehlshaber einer Pl\xFCnderergruppe und tr\xE4gt heimlich die Liste der Menschen, deren Wasser er damals rationierte.",humanTruth:"Seine Neutralit\xE4t ist keine Unschuld. Sie ist t\xE4gliche Wiedergutmachung, die nur funktioniert, solange er niemanden zwingt, ihm zu vergeben.",coreQuestline:"Die Questline beginnt am Brunnen, f\xFChrt durch eine gemeinsame Versorgungslinie und endet an der Frage, ob Frieden auch dann gilt, wenn niemand die eigene Schuld ablegen darf.",turningPoint:"Niko muss seine Vergangenheit offenlegen, obwohl dadurch der Waffenstillstand zerbrechen kann, oder schweigen und die alte L\xFCge erneut als Schutzschild verwenden.",endingPromise:"Freihafen bleibt einzigartig, wenn seine St\xE4rke nicht darin liegt, unber\xFChrt zu bleiben, sondern Schuld auszuhalten, ohne die n\xE4chste Generation daf\xFCr bezahlen zu lassen.",signatureMotifs:["Brunnenkreis","geteilte Schl\xFCssel","Wasserliste","f\xFCnfter Weg"]}]);;

export function getFactionStory(faction: AurionFaction): AurionFactionStory {
  const story = aurionFactionStories.find(candidate => candidate.faction === faction);
  if (!story) throw new Error(`Unknown Aurion faction: ${faction}`);
  return story;
}

const emptyObjectives: Readonly<Record<QuestApproach, string>> = {
  trade: "Verhandle Vorräte und sichere einen fairen Tausch.",
  craft: "Baue, repariere oder verstärke eine schützende Struktur.",
  combat: "Halte die Front und besiege die unmittelbare Bedrohung.",
  espionage: "Infiltriere den Gegner und verändere sein Vorhaben von innen.",
  exploration: "Erkunde einen gefährlichen Zugang und sichere neue Erkenntnisse.",
};

const objective = (overrides: Partial<Record<QuestApproach, string>>): Record<QuestApproach, string> => ({
  ...emptyObjectives,
  ...overrides,
});

const n = (
  id: string,
  faction: AurionFaction,
  kind: QuestNodeKind,
  title: string,
  region: string,
  premise: string,
  preferredApproaches: readonly QuestApproach[],
  requires: readonly string[],
  next: readonly string[],
  decisionKeys: readonly string[],
  overrides: Partial<Record<QuestApproach, string>>,
  warfrontBossKey?: string,
): QuestNode => ({
  id,
  faction,
  kind,
  title,
  region,
  premise,
  preferredApproaches,
  objectiveByApproach: objective(overrides),
  requires,
  next,
  decisionKeys,
  ...(warfrontBossKey ? { warfrontBossKey } : {}),
});

export const aurionQuestlineNodes: readonly QuestNode[]=Object.freeze([n("concord.gate-seal","sunward_concord","main","Das Tor, das standh\xE4lt","Sonnenwall","Der Sonnenwall droht unter Fl\xFCchtlingsstr\xF6men und feindlichem Druck zu brechen.",["craft","trade","exploration"],[],["concord.oath","concord.supply"],["build","bargain","map"],{craft:"Errichte einen verst\xE4rkten Torbogen, der den Schutzkreis schlie\xDFt.",trade:"Sichere Stein, Erz und Nahrung durch ein Abkommen mit den Karawanen.",exploration:"Finde den alten Fundamentstollen unter dem Tor."}),n("concord.oath","sunward_concord","oath","Das Gel\xF6bnis des offenen Tores","Sonnenwall","Die Concord verlangt keine Herkunft, sondern den Beweis, dass Schutz allen gilt.",["craft","trade"],["concord.gate-seal"],["concord.mainline","concord.side-ledger"],["pledge","refuse"],{craft:"Verankere dein Gel\xF6bnis in einem sichtbaren Schutzwerk.",trade:"Vermittle zwischen den Lagern und beweise, dass Versorgung Schutz bedeutet."}),n("concord.supply","sunward_concord","side","Die letzte Wagenkolonne","Bernsteinroute","Eine Karawane tr\xE4gt die N\xE4gel und Getreidesiegel, die den Wall retten k\xF6nnen.",["trade","espionage","exploration"],["concord.gate-seal"],["concord.mainline"],["escort","misdirect","scout"],{trade:"Schlie\xDFe den Zollstreit ohne die Vorr\xE4te zu verlieren.",espionage:"Lenke die Pl\xFCnderer auf eine leere Nebenroute.",exploration:"Finde einen sicheren Pass durch das Glasmoor."}),n("concord.mainline","sunward_concord","main","Die Mauer aus vielen H\xE4nden","Sonnenwall","Am Vorabend der Warfront muss der Wall zugleich Zuflucht und Bollwerk sein.",["craft","combat","trade","espionage","exploration"],["concord.oath"],["concord.side-ledger","warfront.concord"],["fortify","hold","supply","sabotage","survey"],{craft:"Baue das Tor fertig und befestige es gegen Belagerungsst\xF6\xDFe.",combat:"Verteidige die Baustelle, w\xE4hrend andere den letzten Balken setzen.",trade:"Organisiere Arbeitskr\xE4fte, Material und Evakuierungswege.",espionage:"\xD6ffne ein feindliches Versorgungstor im richtigen Moment.",exploration:"Entdecke die vergessene Fluchtroute hinter dem Wall."}),n("concord.side-ledger","sunward_concord","side","Namen im M\xF6rtel","Sonnenwall","Die Namen der Helfenden wurden aus dem B\xFCrgerbuch gestrichen; ohne sie wird der Schutzkreis instabil.",["trade","craft","espionage"],["concord.oath"],["warfront.concord"],["record","repair","recover"],{trade:"Vers\xF6hne die Handwerkerh\xE4user und erneuere das B\xFCrgerbuch.",craft:"Setze die Siegelsteine der vergessenen Familien ein.",espionage:"Hole die gestohlenen Namen aus dem Archiv der Besatzer zur\xFCck."}),n("ironwardens.oath","ironwardens","oath","Der Eid vor dem Schild","Eisensteppe","Die Ironwardens bieten Zugeh\xF6rigkeit denen an, die eine Linie halten, ohne Zivilisten preiszugeben.",["combat","craft"],[],["ironwardens.mainline","ironwardens.side-forge"],["pledge","refuse"],{combat:"Halte den \xDCbungswall gegen eine kontrollierte Angriffswelle.",craft:"Schmiede ein Schild, das Schutz vor Ruhm stellt."}),n("ironwardens.mainline","ironwardens","main","Die Linie im roten Staub","Eisensteppe","Ein feindlicher Vorsto\xDF droht die verstreuten Siedlungen voneinander abzuschneiden.",["combat","craft","exploration","trade","espionage"],["ironwardens.oath"],["ironwardens.side-forge","warfront.ironwardens"],["charge","brace","route","provision","breach"],{combat:"F\xFChre den Gegensto\xDF und halte die Linie vor dem Tor.",craft:"Verst\xE4rke die Sperren, damit der Gegensto\xDF nicht zum Massaker wird.",exploration:"Finde den versch\xFCtteten Umgehungspfad f\xFCr die Verwundeten.",trade:"Sichere Heilmittel und Ersatzteile von neutralen H\xE4ndlern.",espionage:"Manipuliere die feindlichen Signalfeuer."}),n("ironwardens.side-forge","ironwardens","side","Die Klinge, die nicht bricht","Eisensteppe","Eine alte Schmiede kann Waffen in Werkzeuge des Schutzes verwandeln, wenn ihre Besitzer einander vertrauen.",["craft","trade","combat"],["ironwardens.oath"],["warfront.ironwardens"],["forge","barter","duel"],{craft:"Fertige eine Torstrebe aus dem alten Sternenmetall.",trade:"Tausche Erz gegen Heilmittel statt gegen weitere Waffen.",combat:"Sch\xFCtze die Schmiede, ohne die Lehrlinge zu gef\xE4hrden."}),n("veiled_covenant.oath","veiled_covenant","oath","Das Schweigen mit offenen Augen","Schleierhafen","Der Veiled Covenant verlangt Diskretion, aber kein blindes Vertrauen: Informationen sollen Leben retten.",["espionage","trade","exploration"],[],["veiled_covenant.mainline","veiled_covenant.side-masks"],["pledge","refuse"],{espionage:"Entlarve einen Verr\xE4ter, ohne seine Familie zu verbrennen.",trade:"Kaufe Informationen, ohne Abh\xE4ngigkeiten zu schaffen.",exploration:"Lies die Spuren eines verschwundenen Kundschafters."}),n("veiled_covenant.mainline","veiled_covenant","main","Hinter dem feindlichen Tor","Schleierhafen","Die Warfront wird nicht am st\xE4rksten Tor entschieden, sondern an der Wahrheit hinter ihm.",["espionage","exploration","trade","craft","combat"],["veiled_covenant.oath"],["veiled_covenant.side-masks","warfront.veiled_covenant"],["infiltrate","decode","broker","disguise","extract"],{espionage:"Schleiche durch die feindlichen Tore und \xF6ffne den inneren Riegel.",exploration:"Verfolge alte Tunnelzeichen bis zur Kommandozentrale.",trade:"Vermittle einem feindlichen Quartiermeister einen Ausweg.",craft:"Baue eine lautlose Hebevorrichtung f\xFCr den Riegel.",combat:"Sichere den R\xFCckzug, wenn die Tarnung bricht."}),n("veiled_covenant.side-masks","veiled_covenant","side","Masken ohne Gesicht","Schleierhafen","Drei falsche Befehle k\xF6nnten den Krieg verk\xFCrzen oder die falschen Menschen treffen.",["espionage","craft","trade"],["veiled_covenant.oath"],["warfront.veiled_covenant"],["forge-seal","bribe","expose"],{espionage:"Ersetze den Befehl durch eine Evakuierung statt durch ein Massaker.",craft:"F\xE4lsche ein Siegel nur mit nachvollziehbarer Materialspur.",trade:"Kaufe die Freilassung der Gefangenen mit einem \xFCberpr\xFCfbaren Vertrag."}),n("wayfarer_compact.oath","wayfarer_compact","oath","Die Karte geh\xF6rt niemandem","Randlande","Der Wayfarer Compact schw\xF6rt der offenen Stra\xDFe und sch\xFCtzt Wege, die Fraktionen verbinden.",["exploration","trade","craft"],[],["wayfarer_compact.mainline","wayfarer_compact.side-beacons"],["pledge","refuse"],{exploration:"Finde den n\xE4chsten sicheren \xDCbergang und markiere ihn f\xFCr alle.",trade:"Vereinbare Wegrechte statt Besitzanspr\xFCche.",craft:"Baue einen Leuchtturm, der Wandernde heimf\xFChrt."}),n("wayfarer_compact.mainline","wayfarer_compact","main","Jenseits der siebten Markierung","Randlande","Die Warfront droht die einzige Verbindung zwischen den Fronten abzuschneiden.",["exploration","trade","craft","espionage","combat"],["wayfarer_compact.oath"],["wayfarer_compact.side-beacons","warfront.wayfarer_compact"],["chart","negotiate","build","sneak","escort"],{exploration:"Erkunde den Sturmgrat und kartiere einen gangbaren Korridor.",trade:"Sichere Wegrechte mit allen Lagern.",craft:"Errichte mobile Br\xFCcken \xFCber den gebrochenen Fluss.",espionage:"Entdecke, wer die Wegmarken absichtlich verdreht.",combat:"Begleite die letzte Gruppe durch das offene Gel\xE4nde."}),n("wayfarer_compact.side-beacons","wayfarer_compact","side","Lichter f\xFCr die Verlorenen","Randlande","Ein Netz aus Leuchtfeuern kann Fl\xFCchtende f\xFChren, aber jedes Feuer verr\xE4t auch eine Position.",["exploration","craft","espionage"],["wayfarer_compact.oath"],["warfront.wayfarer_compact"],["place","repair","conceal"],{exploration:"Finde Sichtlinien, die auch im Aschensturm halten.",craft:"Baue ein Leuchtfeuer aus wiederverwendeten Torresten.",espionage:"Verberge das echte Signal in einer falschen Route."}),n("free_haven.oath","free_haven","oath","Kein Banner \xFCber dem Brunnen","Freihafen","Die neutrale Fraktion sch\xFCtzt Versorgung und Verhandlungen, bis der Spieler einer Sache Treue schw\xF6rt.",["trade","craft","exploration","espionage","combat"],[],["free_haven.mainline"],["pledge","delay"],{trade:"Stifte einen Vertrag, der niemanden aus dem Brunnenkreis ausschlie\xDFt.",craft:"Baue eine Zisterne, deren Schl\xFCssel geteilt wird.",exploration:"Finde eine zweite Wasserader.",espionage:"Entdecke, wer den Brunnen vergiften will.",combat:"Halte die Angreifer fern, ohne den Freihafen zu militarisieren."}),n("free_haven.mainline","free_haven","main","Der f\xFCnfte Weg","Freihafen","Die neutrale Route verbindet die Fraktionen, bevor der Spieler seine Treue erkl\xE4rt.",["trade","craft","exploration","espionage","combat"],["free_haven.oath"],["warfront.free_haven"],["mediate","build","map","unmask","defend"],{trade:"Vermittle die erste gemeinsame Versorgungslinie.",craft:"Baue ein neutrales Tor, das alle Parteien passieren d\xFCrfen.",exploration:"Finde das Schlachtfeld, bevor es jemand beansprucht.",espionage:"Entlarve den Kriegstreiber, der alle Banner gegeneinander ausspielt.",combat:"Verteidige die Verhandlung, ohne Partei zu ergreifen."}),n("concord.return-names","sunward_concord","side","Die Namen kehren heim","Sonnenwall","Nach der \xD6ffnung des Tores m\xFCssen die zur\xFCckgekehrten Namen einen Platz im neuen B\xFCrgerbuch finden.",["trade","craft","exploration"],["concord.mainline"],["warfront.concord"],["restore","reconcile","witness"],{trade:"Vermittle den Familien einen Platz, der nicht wieder gestrichen werden kann.",craft:"Setze eine Gedenktafel in den Wall, ohne daraus ein Denkmal der Sieger zu machen.",exploration:"Finde die verschollene Seite des ersten B\xFCrgerbuchs."}),n("concord.warfront-scar","sunward_concord","side","Die Narbe im Schutzkreis","Sonnenwall","Der Sieg hat einen Riss hinterlassen: Wer darf entscheiden, welche Opfer als notwendige Kosten gelten?",["espionage","combat","trade"],["warfront.concord"],[],["expose","protect","listen"],{espionage:"Lege den geheimen Kriegsrat offen.",combat:"Sch\xFCtze die Zeugen vor denen, die den Riss schlie\xDFen wollen.",trade:"Schaffe einen Ausgleich f\xFCr die zerst\xF6rten H\xE4user."}),n("ironwardens.field-hospital","ironwardens","side","Hinter dem letzten Schild","Eisensteppe","Die Verwundeten beider Seiten warten auf eine Entscheidung, die kein Banner allein treffen kann.",["craft","trade","combat"],["ironwardens.mainline"],["warfront.ironwardens"],["triage","armistice","guard"],{craft:"Richte aus Tr\xFCmmern ein gemeinsames Lazarett her.",trade:"Sichere Heilmittel \xFCber eine neutrale Versorgungslinie.",combat:"Halte die Waffenruhe gegen den n\xE4chsten Angriff."}),n("ironwardens.shield-memory","ironwardens","side","Das Gewicht des Schildes","Eisensteppe","Jorens Schild bewahrt einen Namen, den die Reihen nicht h\xF6ren wollten.",["exploration","espionage","craft"],["warfront.ironwardens"],[],["remember","unseal","forge"],{exploration:"Finde den Ort, an dem sein Partner zuletzt um R\xFCckzug bat.",espionage:"\xD6ffne das versiegelte Einsatzprotokoll.",craft:"Schmiede aus dem Schild ein Zeichen, das Schutz statt Befehl bedeutet."}),n("veiled_covenant.sister-letter","veiled_covenant","side","Der Brief ohne Maske","Schleierhafen","Ilyras Schwester kann nur zur\xFCckkehren, wenn Wahrheit nicht als Waffe benutzt wird.",["espionage","trade","exploration"],["veiled_covenant.mainline"],["warfront.veiled_covenant"],["deliver","bargain","follow"],{espionage:"Liefere den Brief, ohne das Netz der Beobachter zu verraten.",trade:"Erhandle einen Namen, der nicht mehr verkauft werden darf.",exploration:"Verfolge die Handschrift durch die stillen Archive."}),n("veiled_covenant.false-command","veiled_covenant","side","Der Befehl, der nicht geschah","Schleierhafen","Ein verhinderter Befehl bleibt als Ger\xFCcht bestehen und droht die falschen Menschen zu treffen.",["trade","craft","espionage"],["warfront.veiled_covenant"],[],["clarify","forge","confess"],{trade:"Vereinbare eine \xF6ffentliche Korrektur mit den Betroffenen.",craft:"Baue ein Beweissiegel, das nicht gef\xE4lscht werden kann.",espionage:"Finde, wer den nie erteilten Befehl verbreitet."}),n("wayfarer_compact.return-map","wayfarer_compact","side","Die Karte der R\xFCckkehr","Randlande","Tava muss eine Karte zeichnen, die nicht den schnellsten, sondern den gemeinsam m\xF6glichen Weg bewahrt.",["exploration","craft","trade"],["wayfarer_compact.mainline"],["warfront.wayfarer_compact"],["mark","shelter","share"],{exploration:"Markiere die Wege, die auch die Langsamsten sicher zur\xFCckf\xFChren.",craft:"Baue Rastpl\xE4tze aus dem Material der alten Front.",trade:"Sichere Wegrechte, die nach der Krise bestehen bleiben."}),n("wayfarer_compact.seventh-beacon","wayfarer_compact","side","Das siebte Leuchtfeuer","Randlande","Ein letztes Licht kann die Fronten verbinden oder sie in eine neue Zielscheibe verwandeln.",["craft","espionage","combat"],["warfront.wayfarer_compact"],[],["ignite","conceal","defend"],{craft:"Errichte das Leuchtfeuer aus f\xFCnf verschiedenen Heimaterden.",espionage:"Verberge das Signal vor dem, der Wege zu Fallen macht.",combat:"Verteidige die Helfenden bis zum ersten Morgenlicht."}),n("free_haven.water-list","free_haven","side","Die Wasserliste","Freihafen","Nikos alte Liste darf nicht verschwinden, aber sie darf auch niemanden f\xFCr immer verurteilen.",["trade","espionage","exploration"],["free_haven.mainline"],["warfront.free_haven"],["publish","redact","repair"],{trade:"Verhandle eine Form der Wiedergutmachung, die den Brunnen offenh\xE4lt.",espionage:"Pr\xFCfe die Liste gegen die Stimmen der \xDCberlebenden.",exploration:"Finde die zweite Wasserader f\xFCr alle, die keinen Anspruch haben."}),n("free_haven.shared-key","free_haven","side","Der geteilte Schl\xFCssel","Freihafen","Ein Schl\xFCssel ist nur neutral, wenn jede Hand ihn tragen kann, ohne den Brunnen zu besitzen.",["craft","trade","exploration"],["warfront.free_haven"],[],["duplicate","entrust","bury"],{craft:"Fertige f\xFCnf gleiche Schl\xFCssel mit verschiedenen Geschichten.",trade:"Stifte ein rotierendes Treuhandabkommen.",exploration:"Finde den alten zweiten Zugang unter dem Brunnenkreis."}),n("warfront.concord","sunward_concord","warfront","Warfront: Der Wallherz-Koloss","Warfront","Alle Wege laufen am Schlachtfeld zusammen; die Concord bringt den Wallherz-Koloss.",["craft","trade","combat","espionage","exploration"],["concord.mainline"],[],["converge"],{craft:"Aktiviere Schutzanker zwischen den Fronten.",trade:"Versorge alle Lager bis zum letzten Vorrat.",combat:"Halte den Koloss und seine Angreifer auf.",espionage:"Finde die Sabotagequelle im Belagerungsheer.",exploration:"Sichere den R\xFCckzugsweg hinter dem Schlachtfeld."},"boss.wallheart_colossus"),n("warfront.ironwardens","ironwardens","warfront","Warfront: Der rote Bannerbrecher","Warfront","Die Ironwardens stellen sich dem Bannerbrecher, der Fronten durch Furcht spaltet.",["combat","craft","espionage","trade","exploration"],["ironwardens.mainline"],[],["converge"],{combat:"Fordere den Bannerbrecher in der offenen Linie.",craft:"Errichte Schildkeile, die den Durchbruch verhindern.",espionage:"Zerschneide seine Befehlsverbindungen.",trade:"Halte die Versorgung der Verwundeten offen.",exploration:"Finde eine Stellung, von der aus Zivilr\xE4ume gesch\xFCtzt werden."},"boss.bannerbreaker"),n("warfront.veiled_covenant","veiled_covenant","warfront","Warfront: Die Maskenmutter","Warfront","Der Covenant jagt die Maskenmutter, die jede Wahrheit in ein falsches Signal verwandelt.",["espionage","exploration","trade","craft","combat"],["veiled_covenant.mainline"],[],["converge"],{espionage:"Entlarve ihre echte Identit\xE4t und kappe die T\xE4uschungsnetze.",exploration:"Finde den verborgenen Beobachtungspunkt.",trade:"Sichere die Aussage eines \xFCberlaufenden Boten.",craft:"Baue ein Gegen-Signalger\xE4t.",combat:"Sch\xFCtze die Zeugen w\xE4hrend der Enth\xFCllung."},"boss.mother_of_masks"),n("warfront.wayfarer_compact","wayfarer_compact","warfront","Warfront: Der Sturmwanderer","Warfront","Der Compact f\xFChrt den Sturmwanderer aus den Korridoren, damit kein Weg zur Falle wird.",["exploration","trade","craft","espionage","combat"],["wayfarer_compact.mainline"],[],["converge"],{exploration:"Lies den Sturm und f\xFChre die Front aus seinem Kern.",trade:"Koordiniere die Durchg\xE4nge aller Verb\xFCndeten.",craft:"Verankere den Korridor mit mobilen Br\xFCcken.",espionage:"Entdecke die falschen Wegmarken.",combat:"Halte den Sturmwanderer fern von den Evakuierungsrouten."},"boss.stormwalker"),n("warfront.free_haven","free_haven","warfront","Warfront: Der Eidlose","Warfront","Der Freihafen tritt nicht mit einem Banner an, sondern mit dem Eidlosen, der alle B\xFCndnisse zerrei\xDFen will.",["trade","craft","exploration","espionage","combat"],["free_haven.mainline"],[],["converge"],{trade:"Halte den Waffenstillstand lang genug f\xFCr eine gemeinsame Entscheidung.",craft:"Baue einen Schutzring f\xFCr die Zivilisten.",exploration:"Finde den sicheren Sammelpunkt hinter der Warfront.",espionage:"Entdecke den Ausl\xF6ser, der die Fraktionen gegeneinander hetzt.",combat:"Verteidige den Schutzring, ohne den Eidlosen zu dienen."},"boss.the_oathless")]);

const hash = (parts: readonly string[]): string =>
  createHash("sha256").update(parts.join("|"), "utf8").digest("hex");

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const scoreApproach = (
  input: { approachScores: Partial<Record<QuestApproach, number>> },
  approach: QuestApproach,
): number => (Number.isFinite(input.approachScores[approach]) ? Number(input.approachScores[approach]) : 0);

export function getQuestlineNode(id: string): QuestNode {
  const node = aurionQuestlineNodes.find(candidate => candidate.id === id);
  if (!node) throw new Error(`Unknown Aurion questline node: ${id}`);
  return node;
}

export function selectPreferredQuestApproach(input: {
  approachScores: Partial<Record<QuestApproach, number>>;
}): QuestApproach {
  return questApproaches
    .slice()
    .sort(
      (a, b) =>
        scoreApproach(input, b) - scoreApproach(input, a) ||
        questApproaches.indexOf(a) - questApproaches.indexOf(b),
    )[0]!;
}

export function resolveQuestline(input: {
  playerId: string;
  faction: AurionFaction;
  completedQuestIds: readonly string[];
  resolutionIndex: number;
  approachScores: Partial<Record<QuestApproach, number>>;
  decisions?: readonly unknown[];
}): QuestlineReadmodel {
  if (
    !input.playerId ||
    !aurionFactions.includes(input.faction) ||
    !Number.isSafeInteger(input.resolutionIndex) ||
    input.resolutionIndex < 0
  ) {
    throw new Error("Questline input is not valid");
  }
  const completed = new Set(input.completedQuestIds);
  const preferredApproach = selectPreferredQuestApproach(input);
  const factionNodes = aurionQuestlineNodes.filter(node => node.faction === input.faction);
  const available = factionNodes.filter(
    node =>
      node.requires.every(required => completed.has(required)) &&
      !completed.has(node.id) &&
      (node.kind === "main" || node.kind === "side" || node.kind === "oath"),
  );
  const oath = available.filter(node => node.kind === "oath").map(node => node.id).sort(compare);
  const main = available.filter(node => node.kind === "main").map(node => node.id).sort(compare);
  const side = available.filter(node => node.kind === "side").map(node => node.id).sort(compare);
  const oathStatus =
    completed.has(`${input.faction}.oath`) ||
    (input.faction === "free_haven" && completed.has("free_haven.oath"))
      ? "pledged"
      : "unpledged";
  const route = factionNodes
    .filter(
      node =>
        node.kind !== "warfront" &&
        (node.preferredApproaches.includes(preferredApproach) || node.kind === "oath"),
    )
    .map(node => node.id)
    .sort(compare);
  const warfrontBossKeys = aurionQuestlineNodes
    .filter(node => node.kind === "warfront")
    .map(node => node.warfrontBossKey!)
    .filter(key => Boolean(key))
    .sort(compare);

  return {
    faction: input.faction,
    factionStory: getFactionStory(input.faction),
    preferredApproach,
    availableOathQuestIds: oath,
    availableMainQuestIds: main,
    availableSideQuestIds: side,
    route,
    oathStatus,
    warfrontBossKeys,
    deterministicHash: hash([
      AURION_QUESTLINE_RULESET_VERSION,
      input.playerId,
      input.faction,
      String(input.resolutionIndex),
      preferredApproach,
      ...oath,
      ...main,
      ...side,
      ...route,
      ...warfrontBossKeys,
    ]),
  };
}

export function resolveQuestDecision(input: {
  playerId: string;
  nodeId: string;
  decisionKey: string;
  approach: QuestApproach;
  receiptId: string;
  resolutionIndex: number;
}): QuestDecision {
  const node = getQuestlineNode(input.nodeId);
  if (!node.decisionKeys.includes(input.decisionKey)) throw new Error("Quest decision is not authored for this node");
  if (!node.preferredApproaches.includes(input.approach)) throw new Error("Quest approach is not authored for this node");
  if (!input.playerId || !input.receiptId || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) {
    throw new Error("Quest decision receipt is not valid");
  }
  return {
    questId: node.id,
    key: input.decisionKey,
    approach: input.approach,
    receiptId: input.receiptId,
    resolutionIndex: input.resolutionIndex,
  };
}

export function resolveQuestObjective(nodeId: string, approach: QuestApproach): string {
  const node = getQuestlineNode(nodeId);
  return node.objectiveByApproach[approach];
}

export function getWarfrontBosses(): readonly { faction: AurionFaction; bossKey: string; questId: string }[] {
  return aurionQuestlineNodes
    .filter(node => node.kind === "warfront" && Boolean(node.warfrontBossKey))
    .map(node => ({ faction: node.faction, bossKey: node.warfrontBossKey!, questId: node.id }))
    .sort((a, b) => compare(a.faction, b.faction));
}
