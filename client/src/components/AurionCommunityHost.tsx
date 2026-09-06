import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import CommunityOverlay from "./CommunityOverlay";
import { starterCharacters, type StarterCharacter } from "@/game/starterCharacters";

/**
 * Aurion-owned global community surface. Team and asset selections are stored
 * or presented here, but this host never mutates AX1/WASD gameplay state.
 */
export default function AurionCommunityHost() {
  const { user, isAuthenticated } = useAuth();
  const [starterCharacter, setStarterCharacter] = useState<StarterCharacter>(starterCharacters[0]!);

  return (
    <CommunityOverlay
      isAuthenticated={isAuthenticated}
      currentUserId={user?.id}
      onTeamReady={() => { /* AX1 reads confirmed team data; Aurion does not inject gameplay state. */ }}
      onTeamCleared={() => { /* Community persistence is the only owner here. */ }}
      starterCharacterId={starterCharacter.id}
      onStarterCharacterSelected={setStarterCharacter}
    />
  );
}
