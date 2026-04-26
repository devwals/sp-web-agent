import * as React from "react";
import { v4 as uuidv4 } from "uuid";
import DocumentAIAgent from "../DocumentAIAgent/DocumentAIAgent";
import DocumentUpload from "../DocumentUpload/DocumentUpload";
import { sendMessageToAzureAI } from "../../../../services/AzureAIService";
import { WebAgentDocumentMetadata } from "../../../../services/WebAgentService";
import { AgentService } from "../../../../services/agent/AgentService";
import { AgentContext } from "../../../../services/agent/AgentTypes";
import styles from "./WebPartWrapper.module.scss";
import Copyright from "../Copyright/Copyright";
import { useEffect, useRef, useState } from "react";
import { Message, MessageLinkAction } from "../../../../@types/common";
import {
    mergePreviousForProposal,
    UPDATE_PROPOSAL_HINT
} from "../../../../utils/metadataProposalDisplay";

interface WebPartWrapperProps {
    documentGuide: string;
    rejectedQuestionAnswer: string;
}

interface PendingDocumentOperation {
    fileName: string;
    fileContentBase64: string;
    contentType?: string;
    uploadUrl?: string;
    metadata: WebAgentDocumentMetadata;
}

export default function WebPartWrapper({ documentGuide, rejectedQuestionAnswer }: WebPartWrapperProps): JSX.Element {
    const [chatMessages, setChatMessages] = React.useState<Message[]>(() => {
        return [
            {
                id: uuidv4(),
                role: "assistant",
                content: "Hello! I'm here to help you with your document upload related questions. Upload a document or paste relevant content below in the chat so that I can suggest a document type and an upload location. "
            },
            {
                id: uuidv4(),
                role: "system",
                content:
                    `You are a document upload assistant.
Only use the uploaded document content and the provided guide.
If the question is out of scope, use this fallback message in responseText: ${rejectedQuestionAnswer?.trim().length > 0 ? rejectedQuestionAnswer : "\"Oops! I don't have permission to discuss that.\""}.

Return JSON only (no markdown, no extra text) with exactly these keys:
- responseText: string
- documntType: string
- uploadUrl: string
- tags: string[]
- reason: string

Rules:
1) Output must be a single valid JSON object.
2) Use documntType key exactly as written.
3) Keep responseText concise and actionable.
4) Infer documntType, uploadUrl, and tags from the guide.
5) If unsure, set best-effort values and explain why in reason.

Guide:
${documentGuide}`
            }
        ];
    });

    const [error, setError] = useState<Error | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [agentContext, setAgentContext] = useState<AgentContext>({});

    // Mirror state into refs so async agent runs always see the latest values
    // even if multiple tool steps fire before React commits a re-render.
    const chatMessagesRef = useRef<Message[]>(chatMessages);
    const agentContextRef = useRef<AgentContext>(agentContext);
    useEffect(() => {
        chatMessagesRef.current = chatMessages;
    }, [chatMessages]);
    useEffect(() => {
        agentContextRef.current = agentContext;
    }, [agentContext]);

    const appendUserMessage = (content: string): void => {
        setChatMessages((prev) => [
            ...prev,
            { id: uuidv4(), role: "user", content: content }
        ]);
    };

    const appendAssistantMessage = (
        content: string,
        options?: {
            showUploadAction?: boolean;
            showUpdateAction?: boolean;
            linkActions?: MessageLinkAction[];
            proposedMetadata?: Record<string, string>;
            proposedMetadataPrevious?: Record<string, string | undefined>;
            updateConfirmationHint?: string;
        }
    ): void => {
        setChatMessages((prev) => [
            ...prev,
            {
                id: uuidv4(),
                role: "assistant",
                content: content,
                showUploadAction: options && options.showUploadAction === true,
                showUpdateAction: options && options.showUpdateAction === true,
                linkActions: options && options.linkActions ? options.linkActions : undefined,
                proposedMetadata: options && options.proposedMetadata ? options.proposedMetadata : undefined,
                proposedMetadataPrevious: options && options.proposedMetadataPrevious
                    ? options.proposedMetadataPrevious
                    : undefined,
                updateConfirmationHint: options && options.updateConfirmationHint
                    ? options.updateConfirmationHint
                    : undefined
            }
        ]);
    };


    async function updateChatMessage(
        messages: Message[],
        messageType: "chat" | "instruction" = "chat",
        readableMessage = ""
    ): Promise<string | undefined> {
        try {
            setIsLoading(true);
            const response = await sendMessageToAzureAI(messages);

            const data = await response.json();
            const assistantReply = data?.choices?.[0]?.message?.content;

            if (messageType === "instruction" && readableMessage.length > 0) {
                messages[messages.length - 1].content = readableMessage;
            }

            if (assistantReply) {
                setChatMessages([
                    ...messages,
                    { id: uuidv4(), role: "assistant", content: assistantReply }
                ]);
            } else {
                setChatMessages(messages);
            }

            return assistantReply;
        } catch (e) {
            setError(e);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }

    const onDocumentOperationPrepared = (operation: PendingDocumentOperation): void => {
        setAgentContext((prev) => ({
            ...prev,
            pendingUpload: {
                fileName: operation.fileName,
                fileContentBase64: operation.fileContentBase64,
                contentType: operation.contentType,
                uploadUrl: operation.uploadUrl,
                metadata: operation.metadata
            }
        }));
        appendAssistantMessage(
            "I have suggested document metadata and upload location. If you want to proceed, reply with `upload`.",
            { showUploadAction: true }
        );
    };

    /**
     * Direct (non-LLM) execution of the upload tool. Triggered by the explicit
     * "upload" command and by the Upload button. Skipping the LLM round-trip
     * keeps the most common action snappy and deterministic.
     */
    const runUploadDirectly = async (): Promise<void> => {
        const ctx = agentContextRef.current;
        if (!ctx.pendingUpload) {
            appendAssistantMessage("Please attach a document first so I can suggest metadata and upload location.");
            return;
        }
        if (!ctx.pendingUpload.uploadUrl) {
            appendAssistantMessage("I could not find a suggested upload URL. Please re-run document analysis.");
            return;
        }

        try {
            setIsLoading(true);
            const result = await AgentService.getInstance().invokeTool(
                "uploadPendingDocument",
                {},
                ctx
            );

            if (result.contextPatch) {
                setAgentContext((prev) => ({ ...prev, ...result.contextPatch }));
            }
            if (result.chatMessage) {
                appendAssistantMessage(result.chatMessage, { linkActions: result.linkActions });
            } else {
                appendAssistantMessage(result.toolContent);
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "Upload failed.";
            appendAssistantMessage("Upload failed: " + errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Direct (non-LLM) execution of the metadata update tool. Triggered when
     * the user confirms a previously-proposed update, either by clicking the
     * Update button or typing `update`. The proposal itself lives in
     * `agentContext.pendingMetadataUpdate`, put there by `runAgent`.
     */
    const runUpdateDirectly = async (): Promise<void> => {
        const ctx = agentContextRef.current;
        if (!ctx.pendingMetadataUpdate || Object.keys(ctx.pendingMetadataUpdate.metadata).length === 0) {
            appendAssistantMessage(
                "There's no metadata update pending. Tell me what you'd like to change and I'll propose it."
            );
            return;
        }
        if (!ctx.lastUploadedDocument) {
            appendAssistantMessage("I can only update metadata on a document that has already been uploaded.");
            return;
        }

        try {
            setIsLoading(true);
            const result = await AgentService.getInstance().invokeTool(
                "updateLastDocumentMetadata",
                { metadata: ctx.pendingMetadataUpdate.metadata },
                ctx
            );

            // Always clear the proposal now that the user confirmed it,
            // regardless of whether the tool itself succeeded — we don't want
            // the Update button to keep reappearing for the same proposal.
            setAgentContext((prev) => {
                const next: AgentContext = { ...prev, pendingMetadataUpdate: undefined };
                if (result.contextPatch) {
                    Object.assign(next, result.contextPatch);
                }
                return next;
            });

            if (result.chatMessage) {
                appendAssistantMessage(result.chatMessage, { linkActions: result.linkActions });
            } else {
                appendAssistantMessage(result.toolContent);
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "Metadata update failed.";
            appendAssistantMessage("Metadata update failed: " + errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Routes a chat message through the planner agent. The LLM returns a
     * strict JSON proposal ({ responseText, userOption?, proposedMetadata? }).
     * The orchestrator stores any proposal in `agentContext` and surfaces the
     * corresponding confirmation button (Upload / Update). Nothing is executed
     * here — execution happens when the user confirms.
     */
    const runAgent = async (userText: string): Promise<void> => {
        try {
            setIsLoading(true);
            const result = await AgentService.getInstance().run(
                chatMessagesRef.current,
                userText,
                agentContextRef.current,
                documentGuide
            );

            setAgentContext(result.contextAfter);

            const preamble = (result.responseText || "").trim();
            const fallback = "I couldn't determine what to do. Could you rephrase or be more specific?";
            const content = preamble.length > 0 ? preamble : fallback;
            const isUpdateProposal = result.userOption === "update" && !!result.proposedMetadata;
            // Use the returned context, not the ref, so we are not one tick stale after setAgentContext.
            const applied = result.contextAfter.lastUploadedDocument?.appliedMetadata;
            const previousMerged =
                isUpdateProposal && result.proposedMetadata
                    ? mergePreviousForProposal(
                        applied,
                        result.proposedMetadata,
                        result.previousValues
                    )
                    : undefined;

            appendAssistantMessage(content, {
                showUploadAction: result.userOption === "upload" && !!result.contextAfter.pendingUpload,
                showUpdateAction: isUpdateProposal,
                proposedMetadata: isUpdateProposal ? result.proposedMetadata : undefined,
                proposedMetadataPrevious: isUpdateProposal ? previousMerged : undefined,
                updateConfirmationHint: isUpdateProposal ? UPDATE_PROPOSAL_HINT : undefined
            });
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            appendAssistantMessage("Sorry, I hit an error: " + errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleActionCommand = async (messageText: string): Promise<boolean> => {
        const trimmed = messageText.trim();
        const normalized = trimmed.toLowerCase();
        const isUploadCommand = normalized.indexOf("upload") === 0;
        const isUpdateCommand = normalized.indexOf("update") === 0;
        const ctx = agentContextRef.current;
        const hasDocumentInContext = !!(ctx.pendingUpload || ctx.lastUploadedDocument);

        // Fast path: explicit "upload" command — invoke the upload tool directly,
        // skipping the LLM hop entirely.
        if (isUploadCommand && ctx.pendingUpload) {
            appendUserMessage(messageText);
            await runUploadDirectly();
            return true;
        }

        // "upload" without anything pending — surface a helpful hint.
        if (isUploadCommand && !ctx.pendingUpload) {
            appendUserMessage(messageText);
            appendAssistantMessage("Please attach a document first so I can suggest metadata and upload location.");
            return true;
        }

        // Fast path: explicit "update" command with a pending metadata
        // proposal — apply it directly without another LLM round-trip.
        if (isUpdateCommand && ctx.pendingMetadataUpdate) {
            appendUserMessage(messageText);
            await runUpdateDirectly();
            return true;
        }

        // Any other free-text message while a document is in context — let the
        // planner agent decide what to do (answer, propose an update, etc.).
        if (hasDocumentInContext) {
            appendUserMessage(messageText);
            await runAgent(messageText);
            return true;
        }

        // No document context: fall through to the existing structured-JSON
        // chat flow handled by `updateChatMessages`.
        return false;
    };

    if (error) throw error;

    return (
        <div className={styles.wrapper}>
            <DocumentUpload
                chatMessages={chatMessages}
                updateChatMessages={updateChatMessage}
                onDocumentOperationPrepared={onDocumentOperationPrepared}
            />
            <DocumentAIAgent
                chatMessages={chatMessages}
                updateChatMessages={updateChatMessage}
                onActionCommand={handleActionCommand}
                isLoading={isLoading}
            />
            <Copyright />
        </div>
    );
}
