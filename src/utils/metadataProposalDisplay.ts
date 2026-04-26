import { WebAgentDocumentMetadata } from "../services/WebAgentService";

export const UPDATE_PROPOSAL_HINT =
    "Click Update to apply the values in the “Proposed” column. To use different " +
    "fields or values instead, reply with a clear list (for example: Tags: A, B; Department: Engineering).";

export function previousValueForProposedKey(
    applied: WebAgentDocumentMetadata | undefined,
    proposedKey: string
): string | undefined {
    if (!applied) {
        return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(applied, proposedKey)) {
        return String(applied[proposedKey] ?? "");
    }
    const lower = proposedKey.toLowerCase();
    for (const ak of Object.keys(applied)) {
        if (ak.toLowerCase() === lower) {
            return String(applied[ak] ?? "");
        }
    }
    return undefined;
}

/**
 * Merges planner-reported `previousValues` with a lookup into the last upload's
 * `appliedMetadata` so the UI can show a “Current” column.
 */
export function mergePreviousForProposal(
    applied: WebAgentDocumentMetadata | undefined,
    proposed: Record<string, string>,
    fromPlanner: Record<string, string> | undefined
): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    const planner = fromPlanner || {};
    Object.keys(proposed).forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(planner, k)) {
            out[k] = planner[k];
        } else {
            out[k] = previousValueForProposedKey(applied, k);
        }
    });
    return out;
}
