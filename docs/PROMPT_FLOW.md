# Prompt & Document Flow

This document describes how a user's input flows through the SPFx web part, the planner agent, and SharePoint, ending in either an uploaded document or an updated metadata record.

All diagrams use [Mermaid](https://mermaid.js.org/) and render natively in GitHub, VS Code (with the Markdown preview extension), and Cursor.

---

## 1. High-level architecture

```mermaid
flowchart LR
    subgraph UI["UI Layer (React + SPFx)"]
        DU["DocumentUpload<br/><sub>dropzone + text extraction</sub>"]
        WPW["WebPartWrapper<br/><sub>state + routing</sub>"]
        DAA["DocumentAIAgent<br/><sub>chat bubbles + buttons</sub>"]
    end

    subgraph Agent["Agent Layer"]
        AS["AgentService<br/><sub>planner + invokeTool</sub>"]
        AT["AgentTools<br/><sub>uploadPendingDocument<br/>updateLastDocumentMetadata</sub>"]
        AC[("AgentContext<br/><sub>pendingUpload<br/>pendingMetadataUpdate<br/>lastUploadedDocument</sub>")]
    end

    subgraph Services["Service Layer"]
        WAS["WebAgentService<br/><sub>thin orchestrator</sub>"]
        DS["DocumentService<br/><sub>PnPjs SharePoint ops</sub>"]
    end

    subgraph External["External"]
        AOAI["Azure OpenAI<br/><sub>chat completion</sub>"]
        SP["SharePoint<br/><sub>list + library</sub>"]
    end

    DU -->|onDocumentOperationPrepared| WPW
    DAA -->|onActionCommand| WPW
    WPW -->|chat history + context| AS
    WPW -->|invokeTool upload/update| AS

    AS <-->|JSON plan| AOAI
    AS -->|execute| AT
    AT --> WAS
    AT -.reads/writes.-> AC

    WAS --> DS
    DS <--> SP

    AS -- AgentRunResult --> WPW
    WPW -- Message[] --> DAA
```

### Roles in one line each

| Component | Responsibility |
|---|---|
| `DocumentUpload` | Read the dropped file, extract text, ask Azure OpenAI for structured analysis, hand off a `pendingUpload` to `WebPartWrapper`. |
| `WebPartWrapper` | Owns chat state and `AgentContext`. Routes user input to the right path (fast-path tool, planner agent, or legacy chat). |
| `DocumentAIAgent` | Renders chat bubbles and confirmation buttons (Upload / Update); emits `onActionCommand`. |
| `AgentService` | Calls Azure OpenAI as a **planner** with a strict JSON contract; also exposes `invokeTool` for direct execution. |
| `AgentTools` | Concrete actions (`uploadPendingDocument`, `updateLastDocumentMetadata`) that call `WebAgentService`. |
| `WebAgentService` | Top-level service orchestrator. Currently dispatches to `DocumentService`. |
| `DocumentService` | All SharePoint document I/O via PnPjs. |

---

## 2. End-to-end lifecycle (drop → upload → propose → update)

```mermaid
flowchart TD
    Start([User drops a file]) --> Analyze["DocumentUpload<br/>extracts text + asks AOAI<br/>for documntType / uploadUrl / tags"]
    Analyze --> Pending["AgentContext.pendingUpload set<br/>chat shows <b>Upload</b> button"]
    Pending -->|click Upload<br/>or type 'upload'| FastUpload["runUploadDirectly<br/>→ invokeTool('uploadPendingDocument')"]
    FastUpload --> SP1[(SharePoint)]
    SP1 --> Uploaded["AgentContext.lastUploadedDocument set<br/>chat shows success +<br/>Open document / View properties"]

    Uploaded -->|free-text chat<br/>e.g. 'extract more tags'| Planner["runAgent →<br/>AgentService.run<br/>(planner LLM call)"]
    Planner -->|userOption='update'<br/>+ proposedMetadata| Proposal["AgentContext.pendingMetadataUpdate set<br/>chat shows property list +<br/><b>Update</b> button"]
    Proposal -->|click Update<br/>or type 'update'| FastUpdate["runUpdateDirectly<br/>→ invokeTool('updateLastDocumentMetadata')"]
    FastUpdate --> SP2[(SharePoint)]
    SP2 --> Updated["lastUploadedDocument.appliedMetadata merged<br/>chat shows update result"]
    Updated -.next turn.-> Planner

    Planner -->|userOption=null<br/>(answer / clarification)| Answer["chat shows responseText only"]
    Answer -.-> Planner
```

The same loop applies for any number of follow-up turns. Each user message either:

1. Triggers a **fast path** (`upload` / `update` confirms a pending proposal), or
2. Goes to the **planner**, which may produce a new proposal or just answer.

---

## 3. Flow A — Document analysis (drop a file)

This is the only path that still uses the **legacy structured-response prompt** (the schema with `documntType`, `uploadUrl`, `tags`, `reason`). It runs once per dropped file.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant DU as DocumentUpload
    participant AOAI as Azure OpenAI
    participant WPW as WebPartWrapper
    participant DAA as DocumentAIAgent

    U->>DU: drop file
    DU->>DU: extract text (mammoth / pdfjs)
    DU->>AOAI: chat completion<br/>(legacy schema prompt + extracted text)
    AOAI-->>DU: { responseText, documntType,<br/>uploadUrl, tags, reason }
    DU->>WPW: onDocumentOperationPrepared({fileName, base64, uploadUrl, metadata})
    WPW->>WPW: setAgentContext({ pendingUpload: ... })
    WPW->>DAA: appendAssistantMessage("...reply 'upload'", {showUploadAction: true})
    DAA-->>U: 🤖 message + [Upload] button
```

> The legacy system message lives in `WebPartWrapper`'s initial `chatMessages` and is **filtered out** of every planner call (see Flow C).

---

## 4. Flow B — Confirm upload (click **Upload** or type `upload`)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant DAA as DocumentAIAgent
    participant WPW as WebPartWrapper
    participant AS as AgentService
    participant AT as uploadPendingDocumentTool
    participant WAS as WebAgentService
    participant DS as DocumentService
    participant SP as SharePoint

    U->>DAA: click Upload (or type 'upload')
    DAA->>WPW: onActionCommand('upload')
    WPW->>WPW: handleActionCommand → runUploadDirectly<br/>(reads agentContext.pendingUpload)
    WPW->>AS: invokeTool('uploadPendingDocument', {}, ctx)
    AS->>AT: execute({}, ctx)
    AT->>WAS: uploadDocumentWithMetadata(req)
    WAS->>DS: uploadDocumentWithMetadata(req)
    DS->>SP: PnPjs upload + item.update(metadata)
    SP-->>DS: file info + item id
    DS-->>WAS: WebAgentDocumentResponse
    WAS-->>AT: WebAgentDocumentResponse
    AT-->>AS: ToolResult { chatMessage, linkActions, contextPatch }
    AS-->>WPW: ToolResult
    WPW->>WPW: clear pendingUpload, set lastUploadedDocument
    WPW->>DAA: appendAssistantMessage(success + Open/View properties links)
    DAA-->>U: 🤖 success + action links
```

The fast path **skips the LLM** — clicking Upload is deterministic.

---

## 5. Flow C — Planner agent (chat after a document is in context)

This is the heart of the new architecture. The LLM acts purely as a **planner**, never an executor.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant DAA as DocumentAIAgent
    participant WPW as WebPartWrapper
    participant AS as AgentService
    participant AOAI as Azure OpenAI

    U->>DAA: type "extract more tags"
    DAA->>WPW: onActionCommand("extract more tags")
    Note over WPW: not 'upload' / 'update'<br/>but document is in context<br/>→ runAgent(userText)
    WPW->>AS: run(chatHistory, userText, ctx, guide)
    AS->>AS: buildSystemPrompt(ctx, guide)
    Note over AS: Filters legacy 'system' messages<br/>out of chatHistory so they<br/>don't conflict with the planner contract
    AS->>AOAI: chat completion<br/>(response_format: json_object)
    AOAI-->>AS: { responseText,<br/>userOption, proposedMetadata }
    AS->>AS: coerceAgentResponse<br/>(drops invalid options/empty metadata)
    AS->>AS: patch context.pendingMetadataUpdate
    AS-->>WPW: AgentRunResult
    WPW->>WPW: setAgentContext(result.contextAfter)
    WPW->>DAA: appendAssistantMessage(<br/>responseText,<br/>{showUpdateAction, proposedMetadata})
    DAA-->>U: 🤖 message + property list + [Update]
```

### Planner JSON contract

```json
{
  "responseText": "Here are some HR-related tags I extracted.",
  "userOption": "update",
  "proposedMetadata": {
    "Tags": "HR, Recruitment, Training",
    "DocumentCategory": "Human Resources"
  }
}
```

- `userOption` is one of `"upload"`, `"update"`, or absent.
- `proposedMetadata` is required when `userOption === "update"` and must be a non-empty `Record<string, string>`.
- The orchestrator validates the shape; malformed proposals are silently downgraded to a plain `responseText` so the user is never offered a broken button.

---

## 6. Flow D — Confirm metadata update (click **Update** or type `update`)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant DAA as DocumentAIAgent
    participant WPW as WebPartWrapper
    participant AS as AgentService
    participant AT as updateLastDocumentMetadataTool
    participant WAS as WebAgentService
    participant DS as DocumentService
    participant SP as SharePoint

    U->>DAA: click Update (or type 'update')
    DAA->>WPW: onActionCommand('update')
    WPW->>WPW: handleActionCommand → runUpdateDirectly<br/>(reads agentContext.pendingMetadataUpdate)
    WPW->>AS: invokeTool('updateLastDocumentMetadata',<br/>{metadata}, ctx)
    AS->>AT: execute({metadata}, ctx)
    AT->>WAS: updateSharePointDocumentMetadata({listId, listItemId, metadata})
    WAS->>DS: updateSharePointDocumentMetadata(...)
    DS->>SP: PnPjs item.update(mappedColumns)
    SP-->>DS: ok / partial
    DS-->>WAS: UpdateSharePointDocumentMetadataResponse
    WAS-->>AT: response
    AT-->>AS: ToolResult { chatMessage, linkActions, contextPatch }
    AS-->>WPW: ToolResult
    WPW->>WPW: clear pendingMetadataUpdate,<br/>merge appliedMetadata into lastUploadedDocument
    WPW->>DAA: appendAssistantMessage(update result)
    DAA-->>U: 🤖 update result + Open/View properties
```

Like Upload, this fast path skips the LLM. The proposal stored from Flow C is the source of truth for *what* gets applied.

---

## 7. Routing decisions inside `WebPartWrapper.handleActionCommand`

```mermaid
flowchart TD
    Start[/"user types message"/] --> Lower["normalize text"]
    Lower --> Q1{"starts with<br/>'upload'?"}
    Q1 -- yes --> Q1a{"pendingUpload<br/>exists?"}
    Q1a -- yes --> A1["runUploadDirectly<br/>(Flow B)"]
    Q1a -- no --> Hint1["hint: 'attach a document first'"]

    Q1 -- no --> Q2{"starts with<br/>'update'?"}
    Q2 -- yes --> Q2a{"pendingMetadataUpdate<br/>exists?"}
    Q2a -- yes --> A2["runUpdateDirectly<br/>(Flow D)"]
    Q2a -- no --> Q3
    Q2 -- no --> Q3

    Q3{"document in<br/>context?"} -- yes --> A3["runAgent<br/>(Flow C, planner LLM)"]
    Q3 -- no --> Legacy["fall through to<br/>updateChatMessage<br/>(legacy structured chat)"]
```

The decision is intentionally simple: **fast paths first, then planner, then legacy chat**. Every branch is exercised by the diagrams above.

---

## 8. `AgentContext` lifecycle

`AgentContext` is the single source of truth that survives across turns. Its states drive which buttons appear in the UI.

```mermaid
stateDiagram-v2
    [*] --> Empty: webpart loads

    Empty --> PendingUpload: file dropped\n(Flow A)
    PendingUpload --> Uploaded: Upload confirmed\n(Flow B)
    PendingUpload --> Empty: user re-drops a file\n(replaces pendingUpload)

    Uploaded --> PendingUpdate: planner proposes\nuserOption=update\n(Flow C)
    PendingUpdate --> Uploaded: Update confirmed\n(Flow D)\n(appliedMetadata merged)
    PendingUpdate --> Uploaded: planner returns\nno proposal next turn\n(stale proposal cleared)

    Uploaded --> Uploaded: planner answers\nwith no proposal
    Uploaded --> PendingUpload: user drops a new file
```

Key invariants enforced in code:

- **Only one `pendingMetadataUpdate` at a time.** A new turn without `userOption: "update"` clears the old proposal so the Update button can't linger over a stale proposal.
- **`pendingUpload` is cleared when the upload tool succeeds**, and `lastUploadedDocument` is set in the same `contextPatch`.
- **`lastUploadedDocument.appliedMetadata` is *merged* on update**, never replaced — so partial updates accumulate.

---

## 9. UI signals from `AgentResponse` to `Message`

```mermaid
flowchart LR
    subgraph LLM["AgentResponse (planner JSON)"]
        rt["responseText"]
        uo["userOption?"]
        pm["proposedMetadata?"]
    end

    subgraph WPW["WebPartWrapper.runAgent"]
        check{"userOption === 'update'<br/>AND proposedMetadata?"}
    end

    subgraph Msg["assistant Message"]
        c["content = responseText"]
        sua["showUploadAction"]
        sUd["showUpdateAction"]
        pmd["proposedMetadata"]
    end

    rt --> c
    uo --> check
    pm --> check
    check -- "userOption='upload'" --> sua
    check -- "yes (update proposal)" --> sUd
    check -- "yes (update proposal)" --> pmd

    sua -.renders.-> BtnUp[["[Upload] button"]]
    sUd -.renders.-> ListPlusBtn[["proposed metadata list<br/>+ [Update] button"]]
    c -.renders.-> Bubble[["assistant chat bubble"]]
```

This is the contract between the planner and the UI: the planner only describes *intent*; the wrapper translates that into concrete UI affordances on the `Message`, and `DocumentAIAgent` renders them.

---

## 10. Quick reference: where each flow lives

| Flow | Entry point | Key code |
|---|---|---|
| A — Analyze | `DocumentUpload.onDrop` | `DocumentUpload.tsx`, `AzureAIService.sendMessageToAzureAI` |
| B — Upload (fast path) | `WebPartWrapper.runUploadDirectly` | `AgentService.invokeTool` → `uploadPendingDocumentTool` → `DocumentService.uploadDocumentWithMetadata` |
| C — Planner chat | `WebPartWrapper.runAgent` | `AgentService.run` (planner LLM call + `coerceAgentResponse`) |
| D — Update (fast path) | `WebPartWrapper.runUpdateDirectly` | `AgentService.invokeTool` → `updateLastDocumentMetadataTool` → `DocumentService.updateSharePointDocumentMetadata` |
| Legacy chat | `WebPartWrapper.updateChatMessage` | Used only when no document is in context |
