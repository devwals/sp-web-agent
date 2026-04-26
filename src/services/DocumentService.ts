import { WebPartContext } from "@microsoft/sp-webpart-base";
import { SPFI, spfi } from "@pnp/sp";
import { SPFx } from "@pnp/sp/behaviors/spfx";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/folders";
import "@pnp/sp/files";
import "@pnp/sp/items";
import "@pnp/sp/fields";

export interface DocumentServiceConfig {
    baseUrl: string;
    apiKey?: string;
    spfxContext?: WebPartContext;
}

export interface WebAgentDocumentMetadata {
    [key: string]: string | number | boolean | undefined;
}

export interface UploadDocumentWithMetadataRequest {
    fileName: string;
    fileContentBase64: string;
    contentType?: string;
    metadata: WebAgentDocumentMetadata;
    uploadUrl?: string;
    targetPath?: string;
}

export interface WebAgentDocumentResponse {
    documentId: string;
    name: string;
    url: string;
    metadata: WebAgentDocumentMetadata;
    metadataUpdated?: boolean;
    metadataMessage?: string;
    editItemUrl?: string;
    /** SharePoint list GUID, populated when uploaded via PnPjs. */
    listId?: string;
    /** SharePoint list-item ID, populated when uploaded via PnPjs. */
    listItemId?: number;
}

export interface UpdateSharePointDocumentMetadataRequest {
    listId: string;
    listItemId: number;
    metadata: WebAgentDocumentMetadata;
}

export interface UpdateSharePointDocumentMetadataResponse {
    listId: string;
    listItemId: number;
    metadataUpdated: boolean;
    metadataMessage: string;
    appliedMetadata: WebAgentDocumentMetadata;
}

/**
 * Document operations used by the web part: SharePoint upload (PnP) and list-item
 * metadata update. Optional remote REST `POST /documents` fallback when upload URL is set
 * but PnP is unavailable. Heavy lifting for column mapping uses Azure OpenAI in-process.
 */
export class DocumentService {
    private _config?: DocumentServiceConfig;
    private _sp?: SPFI;

    public setConfig(config: DocumentServiceConfig): void {
        this._config = config;
        if (config.spfxContext) {
            this._sp = spfi().using(SPFx(config.spfxContext));
        }
    }

    public async uploadDocumentWithMetadata(
        request: UploadDocumentWithMetadataRequest
    ): Promise<WebAgentDocumentResponse> {
        if (request.uploadUrl && this._sp) {
            return this.uploadToSharePointWithPnP(request);
        }

        return this.request<WebAgentDocumentResponse>("POST", "/documents", {
            fileName: request.fileName,
            fileContentBase64: request.fileContentBase64,
            contentType: request.contentType,
            metadata: request.metadata,
            uploadUrl: request.uploadUrl || request.targetPath,
            targetPath: request.targetPath
        });
    }

    private async request<TResponse>(
        method: "POST",
        path: string,
        body?: unknown
    ): Promise<TResponse> {
        if (!this._config || !this._config.baseUrl || this._config.baseUrl.trim().length === 0) {
            throw new Error("DocumentService is not configured. Call setConfig() with a valid baseUrl first.");
        }

        const baseUrl = this._config.baseUrl.replace(/\/+$/, "");
        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };

        if (this._config.apiKey && this._config.apiKey.trim().length > 0) {
            headers["x-api-key"] = this._config.apiKey;
        }

        const response = await fetch(baseUrl + path, {
            method: method,
            headers: headers,
            body: body !== undefined ? JSON.stringify(body) : undefined
        });

        if (!response.ok) {
            let responseText = "";
            try {
                responseText = await response.text();
            } catch {
                responseText = "";
            }

            throw new Error("DocumentService request failed (" + response.status + "): " + responseText);
        }

        if (response.status === 204) {
            return undefined as TResponse;
        }

        return response.json() as Promise<TResponse>;
    }

    private async uploadToSharePointWithPnP(
        request: UploadDocumentWithMetadataRequest
    ): Promise<WebAgentDocumentResponse> {
        const uploadUrl = request.uploadUrl || "";
        const folderServerRelativePath = this.getServerRelativePathFromUrl(uploadUrl);
        const fileName = request.fileName;

        if (!folderServerRelativePath) {
            throw new Error("Suggested upload URL is invalid. Please provide a valid SharePoint library URL.");
        }

        if (!this._sp) {
            throw new Error("PnPjs client is not configured for DocumentService.");
        }

        const fileBytes = this.base64ToArrayBuffer(request.fileContentBase64);
        const addedFileInfo = await this._sp.web
            .getFolderByServerRelativePath(folderServerRelativePath)
            .files.addUsingPath(fileName, fileBytes, {
                Overwrite: true
            });

        const uploadedFile = this._sp.web.getFileByServerRelativePath(addedFileInfo.ServerRelativeUrl);
        const itemRef = await uploadedFile.getItem();
        const fileItem = await itemRef
            .select("Id", "ParentList/Id")
            .expand("ParentList")<{
                Id: number;
                ParentList?: {
                    Id?: string;
                };
            }>();
        const itemId = fileItem.Id as number;
        const parentListId = fileItem.ParentList && fileItem.ParentList.Id ? String(fileItem.ParentList.Id) : "";
        const siteUrl = this.getSiteAbsoluteUrl();

        let metadataUpdated = false;
        let metadataMessage = "No metadata changes were applied.";
        const editItemUrl = parentListId && itemId
            ? siteUrl + "/_layouts/15/listform.aspx?PageType=6&ListId=" + encodeURIComponent(parentListId) + "&ID=" + itemId
            : siteUrl + addedFileInfo.ServerRelativeUrl;

        if (Object.keys(request.metadata).length > 0) {
            try {
                const mappedFields = await this.mapMetadataToEditableColumns(parentListId, request.metadata);
                if (Object.keys(mappedFields).length > 0) {
                    await itemRef.update(mappedFields);
                    metadataUpdated = true;
                    metadataMessage = "Metadata was applied to matching editable columns.";
                } else {
                    metadataMessage =
                        "File uploaded successfully, but no matching editable column was found for metadata. Please update metadata manually using the edit link.";
                }
            } catch {
                metadataUpdated = false;
                metadataMessage =
                    "File uploaded successfully, but metadata could not be updated automatically. Please update metadata manually using the edit link.";
            }
        }

        const fileInfo = await uploadedFile.select("ServerRelativeUrl", "Name")<{
            ServerRelativeUrl: string;
            Name: string;
        }>();

        return {
            documentId: String(itemId || fileInfo.ServerRelativeUrl),
            name: fileInfo.Name || fileName,
            url: fileInfo.ServerRelativeUrl || this.combineServerRelativePath(folderServerRelativePath, fileName),
            metadata: request.metadata,
            metadataUpdated: metadataUpdated,
            metadataMessage: metadataMessage,
            editItemUrl: editItemUrl,
            listId: parentListId || undefined,
            listItemId: itemId || undefined
        };
    }

    /**
     * Updates metadata on a SharePoint list item via PnPjs, using the same
     * AI-driven column mapping as the upload path. Used by tool-driven flows
     * where we already know the listId + listItemId of the just-uploaded file.
     */
    public async updateSharePointDocumentMetadata(
        request: UpdateSharePointDocumentMetadataRequest
    ): Promise<UpdateSharePointDocumentMetadataResponse> {
        if (!this._sp) {
            throw new Error("PnPjs client is not configured for DocumentService.");
        }
        if (!request.listId || !request.listItemId) {
            throw new Error("listId and listItemId are required to update SharePoint metadata.");
        }

        const itemRef = this._sp.web.lists.getById(request.listId).items.getById(request.listItemId);

        if (Object.keys(request.metadata).length === 0) {
            return {
                listId: request.listId,
                listItemId: request.listItemId,
                metadataUpdated: false,
                metadataMessage: "No metadata changes were provided.",
                appliedMetadata: {}
            };
        }

        try {
            const mappedFields = await this.mapMetadataToEditableColumns(request.listId, request.metadata);
            if (Object.keys(mappedFields).length === 0) {
                return {
                    listId: request.listId,
                    listItemId: request.listItemId,
                    metadataUpdated: false,
                    metadataMessage:
                        "No matching editable column was found for the provided metadata. Please update manually using the edit link.",
                    appliedMetadata: {}
                };
            }

            await itemRef.update(mappedFields);

            // appliedMetadata mirrors the original keys the caller asked us to apply
            // (so the agent context retains a human-readable view of what was set).
            const applied: WebAgentDocumentMetadata = {};
            Object.keys(request.metadata).forEach((k) => {
                const v = request.metadata[k];
                if (v !== undefined) {
                    applied[k] = v;
                }
            });

            return {
                listId: request.listId,
                listItemId: request.listItemId,
                metadataUpdated: true,
                metadataMessage: "Metadata was applied to matching editable columns.",
                appliedMetadata: applied
            };
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            return {
                listId: request.listId,
                listItemId: request.listItemId,
                metadataUpdated: false,
                metadataMessage: "Metadata could not be updated automatically. " + errMsg,
                appliedMetadata: {}
            };
        }
    }

    /**
     * Keys that are produced by the AI for the user's benefit (conversational
     * explanation, suggested response text, etc.) and must never be considered
     * for column mapping.
     */
    private static readonly NON_METADATA_KEYS: ReadonlyArray<string> = [
        "reason",
        "responseText"
    ];

    private async mapMetadataToEditableColumns(
        listId: string,
        metadata: WebAgentDocumentMetadata
    ): Promise<Record<string, string | number | boolean>> {
        if (!this._sp || !listId) {
            return {};
        }

        const editableFields = await this._sp.web.lists
            .getById(listId)
            .fields.filter("ReadOnlyField eq false and Hidden eq false and Sealed eq false")
            .select("Title", "InternalName", "TypeAsString", "Required")();

        if (!editableFields || editableFields.length === 0) {
            return {};
        }

        const metadataEntries = Object.keys(metadata)
            .filter((key) => metadata[key] !== undefined)
            .filter((key) => DocumentService.NON_METADATA_KEYS.indexOf(key) === -1)
            .map((key) => ({
                key: key,
                value: String(metadata[key])
            }));

        if (metadataEntries.length === 0) {
            return {};
        }

        const mappingPrompt =
            "You map metadata to SharePoint editable columns.\n" +
            "Return JSON only with this shape:\n" +
            "{ \"mappings\": [{ \"metadataKey\": \"\", \"columnInternalName\": \"\" }] }\n" +
            "Rules:\n" +
            "1) Only map when semantically appropriate.\n" +
            "2) Use only provided columnInternalName values.\n" +
            "3) Skip mappings that do not clearly fit.\n" +
            "4) Do not invent columns.\n\n" +
            "Metadata:\n" + JSON.stringify(metadataEntries) + "\n\n" +
            "Editable columns:\n" + JSON.stringify(editableFields.map((f: { Title?: string; InternalName?: string; TypeAsString?: string }) => ({
                title: f.Title || "",
                internalName: f.InternalName || "",
                type: f.TypeAsString || ""
            })));

        const aiResult = await this.callChatCompletion(mappingPrompt);
        const mapped = this.parseMetadataMappings(aiResult);
        const normalized = this.normalizeMetadataForUpdate(metadata);
        const output: Record<string, string | number | boolean> = {};

        mapped.forEach((entry) => {
            if (entry.metadataKey in normalized && entry.columnInternalName) {
                output[entry.columnInternalName] = normalized[entry.metadataKey];
            }
        });

        return output;
    }

    private async callChatCompletion(prompt: string): Promise<string> {
        const endpoint = this._config && this._config.baseUrl ? this._config.baseUrl.trim() : "";
        const apiKey = this._config && this._config.apiKey ? this._config.apiKey.trim() : "";
        if (!endpoint || !apiKey) {
            return "";
        }

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": apiKey
            },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: "You are a strict JSON assistant." },
                    { role: "user", content: prompt }
                ]
            })
        });

        if (!response.ok) {
            return "";
        }

        const json = await response.json();
        return json && json.choices && json.choices[0] && json.choices[0].message
            ? String(json.choices[0].message.content || "")
            : "";
    }

    private parseMetadataMappings(aiContent: string): Array<{ metadataKey: string; columnInternalName: string }> {
        try {
            const parsed = JSON.parse(aiContent) as {
                mappings?: Array<{ metadataKey?: string; columnInternalName?: string }>;
            };
            if (!parsed.mappings || !Array.isArray(parsed.mappings)) {
                return [];
            }

            return parsed.mappings
                .filter((m) => !!m.metadataKey && !!m.columnInternalName)
                .map((m) => ({
                    metadataKey: String(m.metadataKey),
                    columnInternalName: String(m.columnInternalName)
                }));
        } catch {
            return [];
        }
    }

    private getSiteAbsoluteUrl(): string {
        if (this._config && this._config.spfxContext) {
            return this._config.spfxContext.pageContext.web.absoluteUrl;
        }
        return "";
    }

    private normalizeMetadataForUpdate(metadata: WebAgentDocumentMetadata): Record<string, string | number | boolean> {
        const output: Record<string, string | number | boolean> = {};

        Object.keys(metadata).forEach((key) => {
            const value = metadata[key];
            if (value !== undefined) {
                if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                    output[key] = value;
                } else {
                    output[key] = String(value);
                }
            }
        });

        return output;
    }

    private getServerRelativePathFromUrl(urlValue: string): string {
        try {
            const parsedUrl = new URL(urlValue);
            return decodeURI(parsedUrl.pathname).replace(/\/+$/, "");
        } catch {
            if (urlValue.indexOf("/") === 0) {
                return decodeURI(urlValue).replace(/\/+$/, "");
            }
            return "";
        }
    }

    private combineServerRelativePath(folderPath: string, fileName: string): string {
        if (folderPath.lastIndexOf("/") === folderPath.length - 1) {
            return folderPath + fileName;
        }
        return folderPath + "/" + fileName;
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
