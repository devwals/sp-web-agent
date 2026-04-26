/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MessageLinkAction {
    label: string;
    url: string;
    variant?: "primary" | "secondary";
}

export interface Message {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    /** When true, chat UI shows an Upload action button (e.g. after document analysis). */
    showUploadAction?: boolean;
    /** When true, chat UI shows an Update action button (e.g. after metadata proposal). */
    showUpdateAction?: boolean;
    /** Optional set of action buttons (rendered as anchor buttons) attached to this message. */
    linkActions?: MessageLinkAction[];
    /**
     * Metadata fields/values being proposed by the AI (paired with `showUpdateAction`).
     * Rendered as a concrete key/value list above the Update button so the user can
     * see exactly what they're confirming.
     */
    proposedMetadata?: Record<string, string>;
    /**
     * Prior on-document value per proposed key (when known), for "current → proposed" display.
     * Keys align with `proposedMetadata`. Omitted or `undefined` means no prior value was found.
     */
    proposedMetadataPrevious?: Record<string, string | undefined>;
    /**
     * Short instructions shown under the proposed update table (e.g. confirm vs reply with own list).
     */
    updateConfirmationHint?: string;
}
