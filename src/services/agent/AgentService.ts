import { Message } from "../../@types/common";
import { AppStorageService } from "../AppStorageService";
import { allTools } from "./AgentTools";
import {
    AgentContext,
    AgentResponse,
    AgentRunResult,
    AgentUserOption,
    ToolDefinition,
    ToolResult
} from "./AgentTypes";

interface OpenAIChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface OpenAIChatResponse {
    choices?: Array<{
        message?: {
            role?: string;
            content?: string;
        };
    }>;
}

const VALID_USER_OPTIONS: ReadonlyArray<AgentUserOption> = ["upload", "update"];

const buildSystemPrompt = (documentGuide: string, context: AgentContext): string => {
    const ctxLines: string[] = [];
    if (context.pendingUpload) {
        ctxLines.push(
            "- Pending upload: \"" + context.pendingUpload.fileName + "\" -> " +
            (context.pendingUpload.uploadUrl || "(no URL)") +
            ", suggested metadata: " + JSON.stringify(context.pendingUpload.metadata)
        );
    }
    if (context.pendingMetadataUpdate) {
        ctxLines.push(
            "- Pending metadata update (awaiting user confirmation): " +
            JSON.stringify(context.pendingMetadataUpdate.metadata)
        );
    }
    if (context.lastUploadedDocument) {
        ctxLines.push(
            "- Last uploaded document: \"" + context.lastUploadedDocument.name +
            "\" at " + context.lastUploadedDocument.url +
            ", applied metadata: " + JSON.stringify(context.lastUploadedDocument.appliedMetadata)
        );
    }
    const contextSection = ctxLines.length > 0
        ? "Current document context:\n" + ctxLines.join("\n")
        : "No document is currently in context.";

    return `You are the planner for a SharePoint document upload assistant.

You never execute actions. Your only job is to interpret the user's intent and emit a strict JSON object. The orchestrator will display the proposal (including any properties) and surface a confirmation button. The action only runs when the user confirms.

${contextSection}

Reply with EXACTLY one JSON object, no markdown, no commentary, no extra text. Schema:

{
  "responseText": string,                    // see rules below
  "userOption": "upload" | "update" | null,  // which confirmation button to show; null/absent when no action is proposed
  "proposedMetadata": object | null,         // required when userOption == "update"; otherwise null/absent
  "previousValues": object | null            // optional when userOption == "update"; see rule 2
}

Rules for userOption:

1) "upload"
   - Use when the user wants to upload/save/submit the prepared document.
   - Only valid when a pending upload exists in context.
   - Do NOT include proposedMetadata for this option.

2) "update"
   - Use whenever proposing metadata changes on the most recently uploaded document is relevant. This includes:
       * the user explicitly asks to update / change / set / add / remove metadata, tags, properties, or fields, OR
       * the user asks you to extract / generate / find / suggest more tags or metadata from the document, OR
       * the user lists specific field names and values they want (treat that as the new proposal and still ask for confirmation), OR
       * you have inferred concrete metadata values from the document that would meaningfully improve its findability.
   - Only valid when a last uploaded document exists in context.
   - proposedMetadata MUST be a non-empty flat object. Keys are human-friendly field names. Values are non-empty strings.
   - Infer keys and values from the document content visible in earlier messages and from the user's request. Do NOT invent values that are not supported by the document or the user's request.
   - Avoid re-proposing values that are already in the last uploaded document's applied metadata unless the user is explicitly changing them.
   - If the user only specifies a field name without a value, or a value without a field, do NOT propose. Set userOption to null and ask in responseText.
   - previousValues (optional): when you know the current on-document value for a key you are changing, add the same key under previousValues with that prior value (string). Use the "last uploaded document" applied metadata in context. Only include keys that also appear in proposedMetadata. Omit keys that had no prior value (new properties).
   - responseText when userOption is "update" MUST:
       (a) Name which field(s) will be written (by display name / key).
       (b) Ask the user to confirm by clicking Update (or typing "update"), OR to reply with a different list of fields and values if they want to change the proposal. Example: "Tags, Department, and Category will be updated. Click Update to apply, or send the exact fields and values you want instead."
       (c) Not repeat the full value table (the UI shows it). One or two sentences is enough.

3) null / absent
   - Use when the user asks a general question, needs clarification, or the requested action lacks required context.
   - responseText should answer or clarify directly.

How responseText should sound when proposing an update:
   - Follow (a)-(b)-(c) above. The UI will still show a side-by-side style list of current (if known) and proposed values, plus the Update button.
   - Never claim the update has been applied. The orchestrator reports outcomes after the user confirms.

General rules:
- Output valid JSON only.
- Keep responseText short and concrete. Do NOT describe the success or failure of any action — the orchestrator reports those.
- Never invent context. If a prerequisite is missing, explain in responseText instead of proposing.

Document upload guide for reference:
${documentGuide}`;
};

const messageToApi = (m: Message): OpenAIChatMessage => ({
    role: m.role === "assistant" ? "assistant" : (m.role === "system" ? "system" : "user"),
    content: m.content
});

const stripJsonFences = (raw: string): string => {
    let s = raw.trim();
    if (s.indexOf("```") === 0) {
        const firstNewline = s.indexOf("\n");
        if (firstNewline >= 0) {
            s = s.substring(firstNewline + 1);
        }
        const closingFence = s.lastIndexOf("```");
        if (closingFence >= 0) {
            s = s.substring(0, closingFence);
        }
    }
    return s.trim();
};

/**
 * Like coerceMetadata but allows empty strings (meaning "was blank on document").
 */
const coerceStringMap = (raw: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!raw || typeof raw !== "object") {
        return out;
    }
    const src = raw as Record<string, unknown>;
    Object.keys(src).forEach((key) => {
        const value = src[key];
        if (value === undefined || value === null) {
            return;
        }
        out[key] = typeof value === "string" ? value : String(value);
    });
    return out;
};

/**
 * Keeps only keys present in `proposed` so the model cannot smuggle extra fields.
 */
const filterValuesForProposedKeys = (
    proposed: Record<string, string>,
    raw: Record<string, string>
): Record<string, string> => {
    const out: Record<string, string> = {};
    Object.keys(proposed).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(raw, key) && typeof raw[key] === "string") {
            out[key] = raw[key];
        }
    });
    return out;
};

const coerceMetadata = (raw: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!raw || typeof raw !== "object") {
        return out;
    }
    const src = raw as Record<string, unknown>;
    Object.keys(src).forEach((key) => {
        const value = src[key];
        if (typeof value === "string" && value.trim().length > 0) {
            out[key] = value;
        } else if (typeof value === "number" || typeof value === "boolean") {
            out[key] = String(value);
        }
    });
    return out;
};

/**
 * Validates the LLM's parsed JSON against the AgentResponse contract.
 * Dropping malformed proposals rather than crashing keeps the UX resilient:
 * the user sees responseText and is simply not offered a button they can't use.
 */
const coerceAgentResponse = (raw: unknown): AgentResponse => {
    const fallback: AgentResponse = { responseText: "" };
    if (!raw || typeof raw !== "object") {
        return fallback;
    }

    const obj = raw as Record<string, unknown>;
    const responseText = typeof obj.responseText === "string" ? obj.responseText : "";

    const rawOption = obj.userOption;
    let userOption: AgentUserOption | undefined;
    if (typeof rawOption === "string" && VALID_USER_OPTIONS.indexOf(rawOption as AgentUserOption) >= 0) {
        userOption = rawOption as AgentUserOption;
    }

    let proposedMetadata: Record<string, string> | undefined;
    let previousValues: Record<string, string> | undefined;
    if (userOption === "update") {
        const coerced = coerceMetadata(obj.proposedMetadata);
        if (Object.keys(coerced).length === 0) {
            // Planner violated the contract (empty metadata with update option).
            // Drop the proposal; the responseText still surfaces to the user.
            userOption = undefined;
        } else {
            proposedMetadata = coerced;
            const rawPrev = coerceStringMap(obj.previousValues);
            const filtered = filterValuesForProposedKeys(coerced, rawPrev);
            if (Object.keys(filtered).length > 0) {
                previousValues = filtered;
            }
        }
    }

    return {
        responseText: responseText,
        userOption: userOption,
        proposedMetadata: proposedMetadata,
        previousValues: previousValues
    };
};

/**
 * Stateless planner orchestrator.
 *
 * Flow for a single turn:
 *   1) Ask the LLM for a JSON plan (`AgentResponse`).
 *   2) Validate the plan and compute a context patch (store any proposal).
 *   3) Return responseText + userOption + proposedMetadata + patched context.
 *
 * Actual execution happens when the user confirms (via `invokeTool` from the
 * React layer, triggered by the Upload/Update button or a typed command).
 */
export class AgentService {
    private static _instance: AgentService;
    private readonly _tools: ToolDefinition[];

    private constructor() {
        this._tools = allTools;
    }

    public static getInstance(): AgentService {
        if (!AgentService._instance) {
            AgentService._instance = new AgentService();
        }
        return AgentService._instance;
    }

    public async run(
        chatHistory: Message[],
        userText: string,
        context: AgentContext,
        documentGuide: string
    ): Promise<AgentRunResult> {
        const systemPrompt = buildSystemPrompt(documentGuide, context);

        // The agent supplies its own system prompt with a strict JSON schema.
        // Any `system` messages already present in chatHistory belong to the
        // legacy structured-response flow (documntType / uploadUrl / tags /
        // reason) and would conflict with the planner contract — drop them.
        const apiMessages: OpenAIChatMessage[] = [{ role: "system", content: systemPrompt }];
        chatHistory.forEach((m) => {
            if (m.role === "system") {
                return;
            }
            apiMessages.push(messageToApi(m));
        });
        apiMessages.push({ role: "user", content: userText });

        const rawContent = await this.callChatCompletion(apiMessages);
        const plan = this.parsePlan(rawContent);

        const contextAfter: AgentContext = { ...context };

        if (plan.userOption === "update" && plan.proposedMetadata) {
            contextAfter.pendingMetadataUpdate = { metadata: plan.proposedMetadata };
        } else if (plan.userOption === "upload") {
            // No state change; the existing pendingUpload is what we'll act on.
        } else {
            // No proposal in this turn. Clear any stale pending metadata update
            // so a previously-proposed update doesn't silently stick around.
            contextAfter.pendingMetadataUpdate = undefined;
        }

        return {
            responseText: plan.responseText,
            userOption: plan.userOption,
            proposedMetadata: plan.proposedMetadata,
            previousValues: plan.previousValues,
            contextAfter: contextAfter
        };
    }

    /**
     * Direct execution of a single tool by name. Used by confirmation buttons
     * (Upload / Update) to skip the LLM round-trip.
     */
    public async invokeTool(
        toolName: string,
        args: Record<string, unknown>,
        context: AgentContext
    ): Promise<ToolResult> {
        const tool = this.findTool(toolName);
        if (!tool) {
            return { toolContent: "Tool '" + toolName + "' is not available." };
        }
        try {
            return await tool.execute(args, context);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            return { toolContent: "Tool '" + toolName + "' failed: " + errMsg };
        }
    }

    private findTool(name: string): ToolDefinition | undefined {
        for (let i = 0; i < this._tools.length; i++) {
            if (this._tools[i].name === name) {
                return this._tools[i];
            }
        }
        return undefined;
    }

    private parsePlan(rawContent: string): AgentResponse {
        const cleaned = stripJsonFences(rawContent);
        if (cleaned.length === 0) {
            return { responseText: "" };
        }
        try {
            const parsed: unknown = JSON.parse(cleaned);
            return coerceAgentResponse(parsed);
        } catch {
            // Model didn't emit valid JSON; surface the raw text so the user
            // still sees a response rather than silence.
            return { responseText: rawContent.trim() };
        }
    }

    private async callChatCompletion(messages: OpenAIChatMessage[]): Promise<string> {
        const endpoint = AppStorageService.getInstance().apiEndpoint;
        const apiKey = AppStorageService.getInstance().apiKey;

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": apiKey
            },
            body: JSON.stringify({
                messages: messages,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            let errText = "";
            try {
                errText = await response.text();
            } catch {
                errText = "";
            }
            throw new Error("AgentService chat completion failed (" + response.status + "): " + errText);
        }

        const data = await response.json() as OpenAIChatResponse;
        const choice = data && data.choices ? data.choices[0] : undefined;
        const content = choice && choice.message ? choice.message.content : "";
        return content || "";
    }
}
