import { MessageLinkAction } from "../../@types/common";
import { WebAgentDocumentMetadata } from "../WebAgentService";

/**
 * A document that has been analyzed but not yet uploaded.
 *
 * Persisted in `AgentContext` so that follow-up tool calls (e.g. "upload") can
 * act on it without needing the user to re-attach the file.
 */
export interface PendingDocumentUpload {
    fileName: string;
    fileContentBase64: string;
    contentType?: string;
    uploadUrl?: string;
    metadata: WebAgentDocumentMetadata;
}

/**
 * A document that has been successfully uploaded to SharePoint.
 *
 * Retained in `AgentContext` so the agent can continue acting on it across
 * turns ("update its metadata", "tag it as confidential", etc.).
 */
export interface UploadedDocument {
    documentId: string;
    name: string;
    url: string;
    editItemUrl?: string;
    listId?: string;
    listItemId?: number;
    appliedMetadata: WebAgentDocumentMetadata;
}

/**
 * A metadata update proposed by the AI but not yet applied.
 *
 * The orchestrator stores this after receiving `userOption === "update"` from
 * the planner, then applies it when the user confirms (via the Update button
 * or by typing `update`).
 */
export interface PendingMetadataUpdate {
    metadata: Record<string, string>;
}

/**
 * The mutable context the agent carries between user turns.
 */
export interface AgentContext {
    pendingUpload?: PendingDocumentUpload;
    pendingMetadataUpdate?: PendingMetadataUpdate;
    lastUploadedDocument?: UploadedDocument;
}

/**
 * Outcome of a single tool execution.
 *
 * - `toolContent`: short, factual string the tool would return to a caller
 *   (used as the chat-facing message if `chatMessage` is not provided).
 * - `chatMessage` (optional): user-facing assistant message to render in chat.
 * - `linkActions` (optional): action buttons to attach to `chatMessage`.
 * - `contextPatch` (optional): partial agent context to merge in.
 */
export interface ToolResult {
    toolContent: string;
    chatMessage?: string;
    linkActions?: MessageLinkAction[];
    contextPatch?: Partial<AgentContext>;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>, context: AgentContext) => Promise<ToolResult>;
}

/* ----------------------------------------------------------------------------
 * Structured response contract from the LLM (planner).
 *
 * The planner NEVER executes actions itself. For every turn it emits a single
 * JSON object describing:
 *   - the user-facing message, and
 *   - (optionally) a proposal for the next action, discriminated by
 *     `userOption`.
 *
 * The orchestrator validates, stores the proposal in AgentContext, and
 * surfaces a confirmation button (Upload / Update). The action only executes
 * when the user confirms.
 *
 * Design goals:
 *   - All write actions are confirmation-gated (consistent with the existing
 *     Upload flow).
 *   - The JSON shape is flat and extensible; adding a new proposal type means
 *     adding a new `userOption` value and an optional payload.
 *   - The LLM's job is limited to intent + parameter inference; the UI owns
 *     the "do it now" trigger.
 * ------------------------------------------------------------------------- */

export type AgentUserOption = "upload" | "update";

export interface AgentResponse {
    /** Short user-facing message, always rendered. */
    responseText: string;
    /**
     * If present, tells the UI which confirmation button to show:
     *  - "upload": surface the Upload button (requires `context.pendingUpload`).
     *  - "update": surface the Update button (requires `proposedMetadata`).
     */
    userOption?: AgentUserOption;
    /** Required when `userOption === "update"`. Non-empty string values only. */
    proposedMetadata?: Record<string, string>;
    /**
     * Optional. When `userOption === "update"`, list prior on-document values for
     * keys the user is about to change (from `lastUploadedDocument.appliedMetadata` in
     * context) so the UI can show "current → proposed". Only include keys that exist in
     * `proposedMetadata`. Omit keys where there was no prior value.
     */
    previousValues?: Record<string, string>;
}

export interface AgentRunResult {
    responseText: string;
    userOption?: AgentUserOption;
    proposedMetadata?: Record<string, string>;
    /** Merged and validated; may be empty when nothing was known. */
    previousValues?: Record<string, string>;
    contextAfter: AgentContext;
}
