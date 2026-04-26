import * as React from "react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import * as mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import { v4 as uuidv4 } from "uuid";
import { Message } from "../../../../@types/common";
import { WebAgentDocumentMetadata } from "../../../../services/WebAgentService";
import { parseDocumentAnalysisResponse } from "../../../../utils/parseDocumentAnalysisResponse";
import styles from "./DocumentUpload.module.scss";

pdfjsLib.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.min.js");

interface DocumentUploadProps {
    chatMessages: Message[];
    updateChatMessages: (messages: Message[], messageType?: "instruction" | "chat") => Promise<string | undefined> | void;
    onDocumentOperationPrepared: (operation: {
        fileName: string;
        fileContentBase64: string;
        contentType?: string;
        uploadUrl?: string;
        metadata: WebAgentDocumentMetadata;
    }) => void;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ chatMessages, updateChatMessages, onDocumentOperationPrepared }) => {

    const [statusMessage, setStatusMessage] = useState<string>("");
    const [isUploading, setIsUploading] = useState<boolean>(false);

    const extractPdfText = async (arrayBuffer: ArrayBuffer): Promise<string> => {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const maxPages = pdf.numPages;
        let fullText = "";

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pageText = content.items.map((item: any) => item.str).join(" ");
            fullText += pageText + "\n";
        }

        return fullText;
    };

    const toBase64 = (arrayBuffer: ArrayBuffer): string => {
        let binary = "";
        const bytes = new Uint8Array(arrayBuffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    };

    const onDrop = useCallback(async (acceptedFiles: File[]): Promise<void> => {
        const file = acceptedFiles[0];
        if (!file) return;

        const ext = file.name.split(".").pop()?.toLowerCase();

        setIsUploading(true);
        setStatusMessage(`Uploading ${file.name}...`);

        try {
            const arrayBuffer = await file.arrayBuffer();

            let resultText = ''

            if (ext === "docx") {
                setStatusMessage(`Reading ${file.name}...`);
                const result = await mammoth.extractRawText({ arrayBuffer });
                resultText = result.value;
            } else if (ext === "pdf") {
                setStatusMessage(`Reading ${file.name}...`);
                const text = await extractPdfText(arrayBuffer);
                resultText = text;
            } else {
                setStatusMessage(`"${file.name}" is not a supported file type. Please drop a .docx or .pdf file.`);
                return;
            }

            if (resultText.length > 0) {
                setStatusMessage(`Analyzing ${file.name}...`);
                const userMsg: Message = { id: uuidv4(), role: "system", content: "Document content: " + resultText };
                const newMessages = [...chatMessages, userMsg];
                const assistantReply = await updateChatMessages(newMessages, "instruction");
                const structuredResponse = assistantReply ? parseDocumentAnalysisResponse(assistantReply) : null;

                if (structuredResponse) {
                    // `reason` and `responseText` are conversational fields meant for the user
                    // and intentionally excluded from metadata so the mapper does not try to
                    // write them to library columns.
                    const metadata: WebAgentDocumentMetadata = {
                        suggestedDocumentType: structuredResponse.documntType,
                        suggestedUploadUrl: structuredResponse.uploadUrl,
                        suggestedTags: structuredResponse.tags.join(", ")
                    };

                    onDocumentOperationPrepared({
                        fileName: file.name,
                        fileContentBase64: toBase64(arrayBuffer),
                        contentType: file.type || undefined,
                        uploadUrl: structuredResponse.uploadUrl || undefined,
                        metadata: metadata
                    });
                    setStatusMessage(`"${file.name}" analyzed. Type "upload" in chat to continue.`);
                } else {
                    setStatusMessage(`"${file.name}" analyzed, but no structured suggestion was returned.`);
                }
            }
        } finally {
            setIsUploading(false);
        }
    }, [chatMessages, onDocumentOperationPrepared, updateChatMessages]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: false,
        accept: {
            "application/pdf": [".pdf"],
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"]
        }
    });

    return (
        <div className={styles.documentUpload}>
            <div className={styles.uploadRow}>
                <div
                    className={styles.dropZone}
                    {...getRootProps()}
                    style={{
                        background: isDragActive ? "rgb(240, 248, 255)" : "transparent"
                    }}
                >
                    <input {...getInputProps()} />
                    <div className={styles.dropRow}>
                        <div className={styles.dropIcon} aria-hidden>
                            📤
                        </div>
                        <div className={styles.dropBody}>
                            {isDragActive ? (
                                <p className={styles.dropLine}>Release to add your document</p>
                            ) : (
                                <>
                                    <p className={styles.dropLine}>
                                        <span>Drop a PDF or Word file, or</span>{" "}
                                        <span className={styles.dropAction}>click to browse</span>
                                    </p>
                                    <p className={styles.dropHint}>One file at a time · .pdf, .docx</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {statusMessage && (
                    <div className={styles.statusColumn} role="status" aria-live="polite">
                        {isUploading && <span className={styles.spinner} aria-hidden={true} />}
                        <span className={styles.statusText}>{statusMessage}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentUpload;
