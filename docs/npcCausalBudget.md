# NPC Causal Budget Contract

Canonical dependency, importance, guarantee and interest facts are mapped to the existing #485 simulation modes. The contract is policy-only: it does not persist NPC state, execute renderer work, or replace the existing simulation scheduler.

\`\`\`text
canonical facts
    |
    v
deterministic tier selection
    |
    +--> existing #485 cadence
    |
    +--> dormant -> bounded causal catch-up
                    |
                    +--> lastResolutionIndex
                    +--> sourceRevision
                    +--> bounded causal evidence
                    +--> declared reducedModelVersion
                    |
                    v
              existing Aurion NPC resolver
\`\`\`

Presentation interest is intentionally projection-only. Network interest may promote to reduced cadence when explicitly supplied by the #489 interest boundary; it never creates gameplay truth.

Catch-up evidence is sorted by logical resolution index and source hash. Evidence outside the declared interval fails closed. \`lastResolutionIndex = -1\` is supported for an NPC with no confirmed decision yet.

Replay/reference testing proves the declared reduced-model evidence envelope is byte-stable across serialization and reordered inputs. The actual NPC state transition remains owned by the existing Aurion resolver.
