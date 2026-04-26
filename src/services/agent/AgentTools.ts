import { MessageLinkAction } from "../../@types/common";
import { WebAgentDocumentMetadata, WebAgentService } from "../WebAgentService";
import { ToolDefinition, ToolResult } from "./AgentTypes";

const buildLinkActions = (url?: string, editUrl?: string): MessageLinkAction[] => {
    const actions: MessageLinkAction[] = [];
    if (url) {
        actions.push({ label: "Open document", url: url, variant: "primary" });
    }
    if (editUrl) {
        actions.push({ label: "View properties", url: editUrl, variant: "secondary" });
    }
    return actions;
};

const sanitizeMetadataArg = (raw: unknown): WebAgentDocumentMetadata => {
    const out: WebAgentDocumentMetadata = {};
    if (!raw || typeof raw !== "object") {
        return out;
    }
    const source = raw as Record<string, unknown>;
    Object.keys(source).forEach((key) => {
        const value = source[key];
        if (value === undefined || value === null) {
            return;
        }
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            out[key] = value;
        } else {
            out[key] = String(value);
        }
    });
    return out;
};

/**
 * Uploads the document the user previously analyzed (held in
 * `AgentContext.pendingUpload`).
 *
 * This is the tool the agent picks when the user says things like
 * "upload it", "save it to SharePoint", or "go ahead".
 */
export const uploadPendingDocumentTool: ToolDefinition = {
    name: "uploadPendingDocument",
    description:
        "Upload the document the user has analyzed but not yet uploaded. " +
        "Call this when the user asks to upload, save, submit, or post the prepared document. " +
        "Do not call this if no document is pending.",
    parameters: {
        type: "object",
        properties: {},
        required: []
    },
    execute: async (_args, context): Promise<ToolResult> => {
        const pending = context.pendingUpload;
        if (!pending) {
            return {
                toolContent:
                    "No pending document is prepared. Ask the user to drop a document first."
            };
        }
        if (!pending.uploadUrl) {
            return {
                toolContent:
                    "Pending document has no upload URL. Ask the user to re-run document analysis."
            };
        }

        const result = await WebAgentService.getInstance().uploadDocumentWithMetadata({
            fileName: pending.fileName,
            fileContentBase64: pending.fileContentBase64,
            contentType: pending.contentType,
            uploadUrl: pending.uploadUrl,
            metadata: pending.metadata
        });

        const summary = result.metadataUpdated
            ? "Upload completed successfully. " + (result.metadataMessage || "")
            : (result.metadataMessage || "File uploaded but metadata was not updated.");

        return {
            toolContent:
                "Uploaded \"" + result.name + "\" to " + result.url + ". " +
                "metadataUpdated=" + (result.metadataUpdated ? "true" : "false") + ". " +
                (result.metadataMessage || ""),
            chatMessage: summary,
            linkActions: buildLinkActions(result.url, result.editItemUrl),
            contextPatch: {
                pendingUpload: undefined,
                lastUploadedDocument: {
                    documentId: result.documentId,
                    name: result.name,
                    url: result.url,
                    editItemUrl: result.editItemUrl,
                    listId: result.listId,
                    listItemId: result.listItemId,
                    appliedMetadata: result.metadata
                }
            }
        };
    }
};

/**
 * Updates SharePoint metadata on the most recently uploaded document.
 *
 * The LLM is responsible for inferring the field names and values from the
 * document content (visible in chat history) and the user's request, and
 * passing them in the `metadata` argument.
 */
export const updateLastDocumentMetadataTool: ToolDefinition = {
    name: "updateLastDocumentMetadata",
    description:
        "Update SharePoint metadata on the most recently uploaded document. " +
        "Use this when the user asks to add, change, generate, or refine metadata on the document they just uploaded. " +
        "You should infer appropriate metadata field names and string values yourself from the document content and the user's request. " +
        "All values must be strings.",
    parameters: {
        type: "object",
        properties: {
            metadata: {
                type: "object",
                description:
                    "A flat key/value object of metadata to apply. Keys are human-friendly metadata names; values are strings. " +
                    "The application will map these to the appropriate SharePoint columns.",
                additionalProperties: { type: "string" }
            }
        },
        required: ["metadata"]
    },
    execute: async (args, context): Promise<ToolResult> => {
        const last = context.lastUploadedDocument;
        if (!last) {
            return {
                toolContent:
                    "No document has been uploaded yet. Ask the user to upload a document first."
            };
        }
        if (!last.listId || !last.listItemId) {
            return {
                toolContent:
                    "The last uploaded document has no SharePoint listId/listItemId on record, " +
                    "so its metadata cannot be updated through SharePoint. Direct the user to the View properties link instead."
            };
        }

        const sanitized = sanitizeMetadataArg(args.metadata);
        if (Object.keys(sanitized).length === 0) {
            return { toolContent: "No metadata fields were provided." };
        }

        const result = await WebAgentService.getInstance().updateSharePointDocumentMetadata({
            listId: last.listId,
            listItemId: last.listItemId,
            metadata: sanitized
        });

        const fieldList = Object.keys(sanitized).join(", ");
        const summary = result.metadataUpdated
            ? "Updated metadata on \"" + last.name + "\". " + result.metadataMessage
            : "Could not update metadata on \"" + last.name + "\". " + result.metadataMessage;

        const mergedAppliedMetadata: WebAgentDocumentMetadata = {
            ...last.appliedMetadata,
            ...result.appliedMetadata
        };

        return {
            toolContent:
                summary +
                (fieldList.length > 0 ? " Requested fields: " + fieldList + "." : ""),
            chatMessage: summary,
            linkActions: buildLinkActions(last.url, last.editItemUrl),
            contextPatch: {
                lastUploadedDocument: { ...last, appliedMetadata: mergedAppliedMetadata }
            }
        };
    }
};

export const allTools: ToolDefinition[] = [uploadPendingDocumentTool, updateLastDocumentMetadataTool];
