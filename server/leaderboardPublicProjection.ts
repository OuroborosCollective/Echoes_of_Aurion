/** Anonymous ranking projection. No account identifiers, player names, or class/economy fields cross this public boundary. */
export type PublicLeaderboardSource = {
  level: number;
  victories: number;
  seasonPoints: number;
};

export type PublicLeaderboardEntry = PublicLeaderboardSource & { rank: number };

export function toPublicLeaderboard(rows: readonly PublicLeaderboardSource[]): PublicLeaderboardEntry[] {
  return rows.map((entry, index) => ({
    rank: index + 1,
    level: entry.level,
    victories: entry.victories,
    seasonPoints: entry.seasonPoints,
  }));
}
