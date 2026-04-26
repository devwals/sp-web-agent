import { WebPartContext } from "@microsoft/sp-webpart-base";
import {
    DocumentService,
    UpdateSharePointDocumentMetadataRequest,
    UpdateSharePointDocumentMetadataResponse,
    UploadDocumentWithMetadataRequest,
    WebAgentDocumentResponse
} from "./DocumentService";

// Re-exported so existing consumers can keep importing the metadata type from
// "WebAgentService". New code may import directly from "DocumentService".
export type { WebAgentDocumentMetadata } from "./DocumentService";

export interface WebAgentServiceConfig {
    baseUrl: string;
    apiKey?: string;
    spfxContext?: WebPartContext;
}

/**
 * Top-level orchestrator for web-agent driven tasks.
 *
 * `WebAgentService` owns shared configuration and dispatches each request to
 * the appropriate task service (currently only `DocumentService`; future task
 * services like SearchService will plug in the same way).
 *
 * Only the methods actively used by the app are exposed. If a new caller needs
 * a document operation that isn't on this surface, add a passthrough here or
 * call `DocumentService` directly.
 */
export class WebAgentService {
    private static _instance: WebAgentService;
    private readonly _documentService: DocumentService;

    private constructor() {
        this._documentService = new DocumentService();
    }

    public static getInstance(): WebAgentService {
        if (!WebAgentService._instance) {
            WebAgentService._instance = new WebAgentService();
        }
        return WebAgentService._instance;
    }

    public setConfig(config: WebAgentServiceConfig): void {
        this._documentService.setConfig({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            spfxContext: config.spfxContext
        });
    }

    public uploadDocumentWithMetadata(
        request: UploadDocumentWithMetadataRequest
    ): Promise<WebAgentDocumentResponse> {
        return this._documentService.uploadDocumentWithMetadata(request);
    }

    public updateSharePointDocumentMetadata(
        request: UpdateSharePointDocumentMetadataRequest
    ): Promise<UpdateSharePointDocumentMetadataResponse> {
        return this._documentService.updateSharePointDocumentMetadata(request);
    }
}
