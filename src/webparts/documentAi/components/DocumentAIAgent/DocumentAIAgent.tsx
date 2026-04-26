import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Message } from "../../../../@types/common";
import { parseDocumentAnalysisResponse } from "../../../../utils/parseDocumentAnalysisResponse";
import styles from "./DocumentAIAgent.module.scss";

interface DocumentAIAgentProps {
    chatMessages: Message[];
    updateChatMessages: (messages: Message[], messageType?: "chat" | "instruction") => Promise<string | undefined> | void;
    onActionCommand: (messageText: string) => Promise<boolean>;
    isLoading: boolean;
}

const DocumentAIAgent: React.FC<DocumentAIAgentProps> = ({ chatMessages, updateChatMessages, onActionCommand, isLoading }) => {
    const [input, setInput] = useState<string>("");
    const chatRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = (): void => {
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatMessages]);

    const handleSend = async (): Promise<void> => {
        if (!input.trim()) return;

        const userText = input.trim();
        const userMsg: Message = { id: uuidv4(), role: "user", content: userText };
        const newMessages = [...chatMessages, userMsg];
        setInput("");

        const handledAsAction = await onActionCommand(userText);
        if (handledAsAction) {
            return;
        }

        await updateChatMessages(newMessages, "chat");
    };

    const renderPlainTextWithLinks = (text: string): JSX.Element[] => {
        // Matches markdown links like [label](https://example.com) OR bare URLs.
        const linkRegex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s]+)/g;
        const nodes: JSX.Element[] = [];
        let lastIndex = 0;
        let key = 0;

        const pushText = (raw: string): void => {
            if (!raw) return;
            const lines = raw.split("\n");
            lines.forEach((line, lineIndex) => {
                if (line) {
                    nodes.push(<React.Fragment key={"t-" + key++}>{line}</React.Fragment>);
                }
                if (lineIndex < lines.length - 1) {
                    nodes.push(<br key={"br-" + key++} />);
                }
            });
        };

        let match: RegExpExecArray | null = linkRegex.exec(text);
        while (match !== null) {
            pushText(text.substring(lastIndex, match.index));

            const markdownLabel = match[2];
            const markdownUrl = match[3];
            const bareUrl = match[4];
            const href = markdownUrl || bareUrl;
            const label = markdownLabel || bareUrl;

            nodes.push(
                <a
                    key={"link-" + key++}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.inlineLink}
                >
                    {label}
                </a>
            );

            lastIndex = match.index + match[0].length;
            match = linkRegex.exec(text);
        }

        pushText(text.substring(lastIndex));
        return nodes;
    };

    return (
        <div className={styles.container}>
            <h2>💬 Ask AI Assistant</h2>
            <div className={styles.chatContainer} ref={chatRef}>
                <div className={styles.chatBox}>
                    {chatMessages
                        .filter((x) => x.role !== "system")
                        .map((msg) => (
                            <div className={styles.bubble} key={msg.id}>
                                {msg.role === "user" ? (
                                <div className={styles.userBubble}>
                                    <div className={styles.userBubbleText}>
                                        {msg.content}
                                    </div>
                                    <div className={styles.userBubbleIcon}>
                                        👤
                                    </div>
                                </div>
                                ) : (
                                <div className={styles.assistantBubble}>
                                    <div className={styles.assistantBubbleIcon}>
                                        🤖
                                    </div>
                                    <div className={styles.assistantBubbleText}>
                                        {(() => {
                                            const structuredResponse = parseDocumentAnalysisResponse(msg.content);
                                            if (!structuredResponse) {
                                                const hasLinkActions = !!(msg.linkActions && msg.linkActions.length > 0);
                                                const proposedEntries = msg.proposedMetadata
                                                    ? Object.keys(msg.proposedMetadata)
                                                    : [];
                                                const hasProposedMetadata = proposedEntries.length > 0;
                                                if (msg.showUploadAction || msg.showUpdateAction || hasLinkActions) {
                                                    return (
                                                        <div className={styles.assistantPromptWithAction}>
                                                            <p className={styles.plainAssistantText}>
                                                                {renderPlainTextWithLinks(msg.content)}
                                                            </p>
                                                            {hasProposedMetadata && (
                                                                <div className={styles.proposedUpdateBlock}>
                                                                    <p className={styles.proposedUpdateTitle}>
                                                                        Fields to update
                                                                    </p>
                                                                    <div className={styles.proposedMetadataList} role="table">
                                                                        <div
                                                                            className={`${styles.proposedMetadataHeaderRow} ${styles.proposedMetadataRow}`}
                                                                            role="row"
                                                                        >
                                                                            <span className={styles.proposedMetadataKey} role="columnheader">Field</span>
                                                                            <span className={styles.proposedMetadataPrev} role="columnheader">Current</span>
                                                                            <span className={styles.proposedMetadataValue} role="columnheader">Proposed</span>
                                                                        </div>
                                                                        {proposedEntries.map((key) => {
                                                                            const prevRaw = msg.proposedMetadataPrevious
                                                                                ? msg.proposedMetadataPrevious[key]
                                                                                : undefined;
                                                                            const currentDisplay =
                                                                                prevRaw === undefined
                                                                                    ? "—"
                                                                                    : prevRaw.length === 0
                                                                                        ? "(empty)"
                                                                                        : prevRaw;
                                                                            return (
                                                                                <div
                                                                                    key={"prop-" + key}
                                                                                    className={styles.proposedMetadataRow}
                                                                                    role="row"
                                                                                >
                                                                                    <span className={styles.proposedMetadataKey} role="cell">{key}</span>
                                                                                    <span className={styles.proposedMetadataPrev} role="cell">
                                                                                        {currentDisplay}
                                                                                    </span>
                                                                                    <span className={styles.proposedMetadataValue} role="cell">
                                                                                        {msg.proposedMetadata![key]}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                    {msg.updateConfirmationHint && (
                                                                        <p className={styles.updateConfirmationHint}>
                                                                            {msg.updateConfirmationHint}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className={styles.actionRow}>
                                                                {msg.showUploadAction && (
                                                                    <button
                                                                        type="button"
                                                                        className={styles.uploadPromptButton}
                                                                        disabled={isLoading}
                                                                        onClick={(): void => {
                                                                            onActionCommand("upload").catch(() => undefined);
                                                                        }}
                                                                    >
                                                                        Upload
                                                                    </button>
                                                                )}
                                                                {msg.showUpdateAction && (
                                                                    <button
                                                                        type="button"
                                                                        className={styles.uploadPromptButton}
                                                                        disabled={isLoading}
                                                                        onClick={(): void => {
                                                                            onActionCommand("update").catch(() => undefined);
                                                                        }}
                                                                    >
                                                                        Update
                                                                    </button>
                                                                )}
                                                                {hasLinkActions && msg.linkActions!.map((action, idx) => (
                                                                    <a
                                                                        key={"action-" + idx}
                                                                        href={action.url}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className={
                                                                            action.variant === "secondary"
                                                                                ? styles.linkActionButtonSecondary
                                                                                : styles.linkActionButton
                                                                        }
                                                                    >
                                                                        {action.label}
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return <p className={styles.plainAssistantText}>{renderPlainTextWithLinks(msg.content)}</p>;
                                            }

                                            const isUnrelatedResponse =
                                                (structuredResponse.responseText || "").toLowerCase().indexOf("out of context") >= 0 ||
                                                (structuredResponse.reason || "").toLowerCase().indexOf("unrelated") >= 0 ||
                                                (structuredResponse.reason || "").toLowerCase().indexOf("out of scope") >= 0;

                                            return (
                                                <div className={styles.structuredResponse}>
                                                    <p><strong className={styles.structuredLabel}>Response:</strong> {structuredResponse.responseText}</p>
                                                    {!isUnrelatedResponse && (
                                                        <>
                                                            <p><strong className={styles.structuredLabel}>Suggested Document Type:</strong> {structuredResponse.documntType}</p>
                                                            <p>
                                                                <strong className={styles.structuredLabel}>Suggested Upload URL:</strong>{" "}
                                                                <a href={structuredResponse.uploadUrl} target="_blank" rel="noreferrer">
                                                                    {structuredResponse.uploadUrl}
                                                                </a>
                                                            </p>
                                                            <p><strong className={styles.structuredLabel}>Suggested Tags:</strong> {structuredResponse.tags.join(", ") || "None"}</p>
                                                            <p><strong className={styles.structuredLabel}>Reason:</strong> {structuredResponse.reason}</p>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                                )}
                            </div>
                        ))}
                    {isLoading && (
                        <div className={styles.bubble}>
                            <div className={styles.assistantBubble}>
                                <div className={styles.assistantBubbleIcon}>
                                    🤖
                                </div>
                                <div className={styles.assistantBubbleText}>
                                    <div className={styles.loadingContent}>
                                        <span className={styles.loadingSpinner} />
                                        <span>Waiting for response from AI endpoint</span>
                                        <span className={styles.loadingDots} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.inputBar}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask something..."
                    className={styles.input}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    disabled={isLoading}
                />
                <button onClick={handleSend} className={styles.button} disabled={isLoading}>
                    📤
                </button>
            </div>
        </div>
    );
};

export default DocumentAIAgent;
