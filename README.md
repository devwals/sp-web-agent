🛡️ Licensing: This project is Source Available. It is free for internal use by organizations. Commercial redistribution or selling this agent as a service is strictly prohibited.

# Web Agent for SharePoint

**SharePoint Framework (SPFx) client-side web part** that gives users an **AI assistant for document upload and follow-up** in SharePoint. It is published as **`web-agent-for-sharepoint.sppkg`** and works on modern SharePoint pages and full-page experiences (see `DocumentAiWebPart.manifest.json` for supported hosts).

**Publisher:** [Devwals](https://devwals.com/) (see `config/package-solution.json` for privacy/terms metadata).

---

## What this product does

1. **Drop-zone analysis (`.docx` / `.pdf`)**  
   Extracts text, calls **Azure OpenAI** with your **document guide** and system prompt, and returns structured suggestions: `responseText`, document type, suggested **upload URL** (SharePoint library path), **tags**, and a short **reason**. The UI offers an **Upload** action to confirm.

2. **Upload to SharePoint**  
   On confirmation, the **Document service** uses **PnPjs** to upload the file to the suggested library and applies **metadata** where it can be mapped to editable list columns (with an optional second AI pass for field mapping).

3. **Chat and metadata updates after upload**  
   A **planner-style agent** (strict JSON: `responseText`, optional `userOption: "upload" | "update"`, `proposedMetadata`, etc.) helps with follow-up: e.g. suggest new tags, show **Field / Current / Proposed**, and an **Update** button (or the user can type `update`) to write metadata to the last uploaded item.

4. **Teams-friendly**  
   The web part is intended for use where users already work (including Microsoft Teams context when the host supports it). Primary delivery is through **SharePoint app catalog** deployment to sites.

For **request/response flow, routing, and context** (upload vs planner vs fast paths), see **[docs/PROMPT_FLOW.md](docs/PROMPT_FLOW.md)**.

---

## Technical stack

| Area | Technology |
|------|------------|
| UI | React 17, TypeScript, Sass modules |
| Host | SPFx **1.21.1** (see `package.json`) |
| AI | Azure OpenAI **chat completions** (endpoint + `api-key` from web part properties) |
| SharePoint | **@pnp/sp** (v4) for file upload and list item metadata |
| No separate backend in-repo | Optional `POST {baseUrl}/documents` in `DocumentService` exists for a remote API fallback when not using the PnP path |

---

## Web part properties (end-user / admin)

| Property | Purpose |
|----------|---------|
| **Description** | Optional welcome line above the experience |
| **Rejected question answer** | Fallback when the first-pass (legacy) model needs an out-of-scope message |
| **AI API Endpoint** | Full **HTTPS** Azure OpenAI **chat completion** URL |
| **AI API Key** | Azure OpenAI key (property pane uses a **password**-style field; see security note below) |
| **Document guide** | Long-form guidance for document types, **library upload URLs** (e.g. server-relative paths in your `DocumentGuideText` or property text), and tagging hints |

Default guide text can be loaded from `src/data/DocumentGuideText.ts` when the property is left empty (see `DocumentAiWebPart.onInit`).

---

## Security (important)

- The **API key and endpoint** are **stored in web part properties** and used **in the browser** (`AppStorageService` + `api-key` / `x-api-key` headers). Anyone who can **edit the page** or **inspect network traffic** may be able to see or abuse them.
- For **production**, prefer a **server-side proxy** (e.g. Azure Function, API Management) with **Entra ID** and keys in **Key Vault** / **Managed Identity** instead of embedding long-lived keys in client properties.

Do **not** commit real keys or tenant-specific URLs in source control.

---

## Prerequisites

- **Node.js** in the range supported by the repo (see `package.json` `engines`)
- A **Microsoft 365 / SharePoint** tenant and permission to add apps to the **app catalog** (or equivalent pipeline)
- An **Azure OpenAI** resource with a **chat completion** deployment and its URL + key

---

## Build and test locally

```bash
npm install
gulp serve
```

Configure the workbench or a dev site with **AI API Endpoint** and **AI API Key** in the web part properties.

---

## Production build and deployment

1. **Bundle**
   ```bash
   gulp bundle --ship
   ```

2. **Package the solution** (produces the `.sppkg` named in `config/package-solution.json`)
   ```bash
   gulp package-solution --ship
   ```
   Output: **`sharepoint/solution/web-agent-for-sharepoint.sppkg`** (or the path in your `package-solution.json`).

3. **Optional: CDN** — If you use Azure Storage for static assets, configure `config/deploy-azure-storage.json` and run:
   ```bash
   gulp deploy-azure-storage
   ```

4. **Deploy the package** to your **SharePoint App Catalog**, approve/trust as required, and add the **Web Agent for SharePoint** web part to pages.

More detail: [Deploy SPFx solutions to SharePoint](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/publish-to-sharepoint).

---

## Version history

| Version | Notes |
|---------|--------|
| 1.0.0.x | See `config/package-solution.json` `solution.version` for the current package version. |

---

## Disclaimer

**THIS CODE IS PROVIDED *AS IS* WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT.**

---

## Applies to

- [SharePoint Framework](https://aka.ms/spfx)
- [Microsoft 365](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/set-up-your-developer-tenant) development tenants

A free dev tenant: [Microsoft 365 Developer Program](https://aka.ms/o365devprogram)
