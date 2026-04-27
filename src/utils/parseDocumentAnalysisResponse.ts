import { DocumentAnalysisStructuredResponse } from "../@types/structuredResponse";

/**
 * Parses the legacy first-pass document analysis JSON from the drop-zone / chat flow.
 */
export function parseDocumentAnalysisResponse(content: string): DocumentAnalysisStructuredResponse | undefined {
    try {
        const parsed = JSON.parse(content) as Partial<DocumentAnalysisStructuredResponse>;
        if (
            typeof parsed.responseText === "string" &&
            typeof parsed.documntType === "string" &&
            typeof parsed.uploadUrl === "string" &&
            Array.isArray(parsed.tags) &&
            typeof parsed.reason === "string"
        ) {
            return {
                responseText: parsed.responseText,
                documntType: parsed.documntType,
                uploadUrl: parsed.uploadUrl,
                tags: parsed.tags.filter((tag): tag is string => typeof tag === "string"),
                reason: parsed.reason
            };
        }
    } catch {
        return undefined;
    }

    return undefined;
}
