import { useAuth } from "@/_core/hooks/useAuth";
import CommunityOverlay from "./CommunityOverlay";

/** Aurion-owned website community host. It exposes social/account surfaces only. */
export default function AurionCommunityHost() {
  const { user, isAuthenticated } = useAuth();
  return <CommunityOverlay isAuthenticated={isAuthenticated} currentUserId={user?.id} />;
}
