// Imported -ax1@d356881538dae23c3aa97364a5596d48b6ac3079, professionsData blob 832c4b5. Static lore only; AX1 quest IDs are not mapped to completed Aurion quests.
export const LORE_CHAPTERS = [
  {
    id: 'sonnen_spitze',
    title: 'Chapter I: The Awakening of the Sun Spire',
    germanTitle: 'Kapitel I: Das Erwachen der Sonnen-Spitze',
    era: 'Zeitalter der goldenen Monumente (742 n. d. Spaltung)',
    description: 'Die Errichtung des Sonnenturms von Aethelgard und die ersten Kontakte mit den schwebenden Archonten-Kernen.',
    unlocked: true,
    requiredCompletedQuests: ['q_1'],
    icon: '🏛️',
    bannerColor: '#f59e0b',
  },
  {
    id: 'aschen_gewoelbe',
    title: 'Chapter II: Flames of the Ash Vault',
    germanTitle: 'Kapitel II: Die Asche des Aschengewölbes',
    era: 'Epoche der Schmelzfeuer (780 n. d. Spaltung)',
    description: 'Wie die Schmiedemeister die geschmolzene Titanen-Ader entdeckten und die Maschinengarde erschufen.',
    unlocked: false,
    requiredCompletedQuests: ['q_3'],
    icon: '🔥',
    bannerColor: '#ef4444',
  },
  {
    id: 'windhaine',
    title: 'Chapter III: Whispers of the Storm Forest',
    germanTitle: 'Kapitel III: Das Flüstern der Windhaine',
    era: 'Das Konzil der Leylinien (810 n. d. Spaltung)',
    description: 'Die Druiden des Windhains und die Geisterbäume, welche die Risse des Äthers vor dem Kollaps bewahren.',
    unlocked: false,
    requiredCompletedQuests: ['q_2'],
    icon: '🍃',
    bannerColor: '#10b981',
  },
  {
    id: 'aethelgard_krieg',
    title: 'Chapter IV: The Concord of Four Citadels',
    germanTitle: 'Kapitel IV: Die Konklave der Vier Orden',
    era: 'Gegenwart der Goldenen Krone',
    description: 'Der politische Pakt zwischen Rittern, Magiern, Waldläufern und den freien Bürgern von Aurion.',
    unlocked: true,
    requiredCompletedQuests: [],
    icon: '⚖️',
    bannerColor: '#00f0ff',
  },
];

export const LORE_ENTRIES = [
  {
    id: 'lore_1',
    chapterId: 'sonnen_spitze',
    title: 'Die Inschrift des Obersten Archonten',
    author: 'Chronist Vaelen von Aethelgard',
    excerpt: 'Als der erste Lichtstrahl die Turmspitze traf, sang der Honigstein...',
    fullText:
      'Im Jahre 742 legten die Gründer den Eckstein der Sonnen-Spitze. Aus den Felsen des Windhains gehauen und mit Bronze versiegelt, sollte dieser Turm als Fanal gegen das Vergessen stehen. Hier bündelt sich das Sonnenlicht in reines Aurion-Türkis, das den Bürgern Kraft spendet und die Schutzbarrieren speist.',
  },
  {
    id: 'lore_2',
    chapterId: 'aschen_gewoelbe',
    title: 'Das Geheimnis der Titanen-Schmiede',
    author: 'Kustos Kaelen, Schmiedevogt',
    excerpt: 'Unter der Schlacke ruht kein totes Erz, sondern das schlagende Herz einer vergangenen Epoche.',
    fullText:
      'Tief unter Emberfall fließen die Feuerrinne des Aschengewölbes. Generationen von Schmieden nutzten diese unerschöpfliche Hitze, um Waffen von unübertroffener Zähigkeit zu schaffen. Doch seit dem Beben wandeln glühende Schemen in den Gängen, und der Schlackenkönig fordert seinen Tribut.',
  },
  {
    id: 'lore_3',
    chapterId: 'windhaine',
    title: 'Die Gesänge der Windrufer',
    author: 'Hüterin Elora',
    excerpt: 'Wer still am Leylinien-Bach kniet, hört die Ahnen im Blätterdach.',
    fullText:
      'Die Bäume des Windhains sind älter als jede Stadtmauer. Sie trinken aus dem flüssigen Äther, der tief in der Erde pulsiert. Die Schreiner und Holzschnitzer des Hains schneiden niemals lebendes Holz ohne Opferung einer Sonnenblüte. Daher tragen ihre Werke die Harmonie des Waldes in sich.',
  },
  {
    id: 'lore_4',
    chapterId: 'aethelgard_krieg',
    title: 'Die Charta der Freien Bürger & Handwerker',
    author: 'Volkstribun Lysandros',
    excerpt: 'Kein Fürst herrscht ohne den Amboss des Schmieds und das Korn des Bauern.',
    fullText:
      'Nach den Unruhen am Flussufer unterzeichneten die vier großen Gilden den Pakt von Aurion. Jedem Bürger steht das Recht zu, sein Handwerk frei auszuüben, auf dem Forum zu debattieren und in Notzeiten Beistand durch die Garde zu erhalten. Ein Zeugnis echter Bürgerdemokratie in einer magischen Welt.',
  },
];

