import {
  type CollectiveProposal,
  type Institution,
} from "../../shared/aurionInstitutionContract";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { InstitutionService, globalInstitutionService } from "./institutionService";

export interface ProposalEvaluationResult {
  ratified: boolean;
  status: "RATIFIED" | "REJECTED";
  votesForCount: number;
  votesAgainstCount: number;
  quorumReached: boolean;
  resultingReceiptHash?: string;
  reason?: string;
}

export class CollectiveDecisionGateway {
  constructor(private readonly institutionService: InstitutionService = globalInstitutionService) {}

  /**
   * Deterministically evaluates and ratifies collective decisions under institutional rules.
   * LLM may propose; authority rules decide.
   */
  async evaluateProposal(
    proposal: CollectiveProposal,
    currentEpoch: number
  ): Promise<ProposalEvaluationResult> {
    const institution = await this.institutionService.getInstitution(proposal.institutionId);
    if (!institution) {
      return {
        ratified: false,
        status: "REJECTED",
        votesForCount: 0,
        votesAgainstCount: 0,
        quorumReached: false,
        reason: "INSTITUTION_NOT_FOUND",
      };
    }

    // Verify proposer membership
    const proposer = institution.members.find(m => m.npcId === proposal.proposerNpcId);
    if (!proposer) {
      return {
        ratified: false,
        status: "REJECTED",
        votesForCount: 0,
        votesAgainstCount: 0,
        quorumReached: false,
        reason: "PROPOSER_NOT_A_MEMBER",
      };
    }

    const totalMembers = institution.members.length;
    const votesFor = new Set(proposal.votesFor);
    const votesAgainst = new Set(proposal.votesAgainst);

    // Only count valid members
    let validVotesFor = 0;
    let validVotesAgainst = 0;

    for (const member of institution.members) {
      if (votesFor.has(member.npcId)) validVotesFor++;
      if (votesAgainst.has(member.npcId)) validVotesAgainst++;
    }

    const totalVotes = validVotesFor + validVotesAgainst;
    const quorumReached = totalMembers === 0 ? false : (totalVotes / totalMembers) >= 0.5;
    const majorityPassed = validVotesFor > validVotesAgainst;

    if (quorumReached && majorityPassed) {
      const receiptHash = canonicalSha256({
        action: "COLLECTIVE_RATIFICATION",
        proposalId: proposal.proposalId,
        institutionId: proposal.institutionId,
        epoch: currentEpoch,
        votesFor: validVotesFor,
        votesAgainst: validVotesAgainst,
      });

      return {
        ratified: true,
        status: "RATIFIED",
        votesForCount: validVotesFor,
        votesAgainstCount: validVotesAgainst,
        quorumReached: true,
        resultingReceiptHash: receiptHash,
      };
    }

    return {
      ratified: false,
      status: "REJECTED",
      votesForCount: validVotesFor,
      votesAgainstCount: validVotesAgainst,
      quorumReached,
      reason: !quorumReached ? "QUORUM_NOT_MET" : "MAJORITY_NOT_REACHED",
    };
  }
}

export const globalCollectiveDecisionGateway = new CollectiveDecisionGateway();
