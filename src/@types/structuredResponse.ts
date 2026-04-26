/**
 * First-pass document analysis (drop zone) asks Azure OpenAI for this shape
 * (legacy key spelling `documntType` is intentional and matched in prompts).
 */
export interface DocumentAnalysisStructuredResponse {
    responseText: string;
    documntType: string;
    uploadUrl: string;
    tags: string[];
    reason: string;
}
