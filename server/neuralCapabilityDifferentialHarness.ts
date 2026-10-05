import {
  interpretDialogue,
  type DialogueInterpretation,
  type LanguageProfile,
} from "./wasdAurionProtocol";
import type {
  NeuralCapabilityDifferentialObservation,
  NeuralCapabilityDifferentialRecord,
} from "@shared/neuralCapabilityCagProtocol";

export type NeuralCapabilityDifferentialCase = Readonly<{
  caseId: string;
  text: string;
  profile: LanguageProfile;
  trust: number;
  threat: number;
  expected: NeuralCapabilityDifferentialObservation;
  neural: NeuralCapabilityDifferentialObservation;
}>;

function mapLegacy(interpretation: DialogueInterpretation): NeuralCapabilityDifferentialObservation {
  if (interpretation.state !== "accepted" || interpretation.semanticIntent === "unknown") {
    return Object.freeze({
      intent: "reject",
      questContextValid: false,
      validatorResult: "rejected",
    });
  }
  const intent = interpretation.semanticIntent === "turn_in_quest"
    ? "request_turn_in"
    : interpretation.semanticIntent === "ask_quest"
      ? "accept_quest"
      : interpretation.semanticIntent;
  return Object.freeze({
    intent,
    questContextValid: true,
    validatorResult: "accepted",
  });
}

/**
 * Offline differential harness. The legacy side executes the real deterministic
 * interpreter; the neural side is a bounded observation captured from an
 * artifact evaluation. No gameplay mutation is available from this module.
 */
export function buildNeuralCapabilityDifferentials(
  cases: readonly NeuralCapabilityDifferentialCase[],
): readonly NeuralCapabilityDifferentialRecord[] {
  return Object.freeze(cases.map(testCase => Object.freeze({
    caseId: testCase.caseId,
    expected: testCase.expected,
    legacy: mapLegacy(interpretDialogue({
      text: testCase.text,
      profile: testCase.profile,
      trust: testCase.trust,
      threat: testCase.threat,
    })),
    neural: testCase.neural,
  })));
}
