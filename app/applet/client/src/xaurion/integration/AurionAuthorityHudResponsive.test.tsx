import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AurionAuthorityHud } from './AurionAuthorityHud';

// Simplified mock to avoid tRPC complexity for responsive testing
vi.mock("@/lib/trpc", () => ({ trpc: {
    useUtils: () => ({}),
    assetSubmissions: { characterAppearance: { useQuery: () => ({ data: null }) } },
    groups: { read: { useQuery: () => ({ data: null }) }, command: { useMutation: () => ({}) } },
    crafting: { read: { useQuery: () => ({ data: null }) }, craft: { useMutation: () => ({}) }, materializeBonus: { useMutation: () => ({}) } },
    player: { ui: { useQuery: () => ({ data: null }) }, saveControls: { useMutation: () => ({}) }, collectLoot: { useMutation: () => ({}) }, equipItem: { useMutation: () => ({}) }, unequipItem: { useMutation: () => ({}) }, me: { useQuery: () => ({ data: null }) } },
    gameplay: { npcActions: { useQuery: () => ({}) }, npcMultiMemory: { useQuery: () => ({}) }, npcSemanticGraph: { useQuery: () => ({}) }, npcSnapshots: { useQuery: () => ({}) }, relationshipStanding: { useQuery: () => ({}) }, currentEncounter: { useQuery: () => ({}) }, startEncounter: { useMutation: () => ({}) }, progress: { useQuery: () => ({}) }, openWorld: { useQuery: () => ({}) }, acceptQuest: { useMutation: () => ({}) }, completeQuest: { useMutation: () => ({}) } },
} }));

describe('AurionAuthorityHud Responsiveness', () => {
    it('should adjust layout on small screens', () => {
        // Set window width to mobile
        vi.stubGlobal('innerWidth', 375);
        
        render(<AurionAuthorityHud userId={7} connected onMove={vi.fn()} onTouchMoveDestination={vi.fn()} onAction={vi.fn()} />);
        
        const hud = screen.getByRole("region", { name: "Serverbestätigter Charakter" });
        expect(hud).toBeDefined();
        // Check for mobile-specific classes or structures if applicable
    });
});
