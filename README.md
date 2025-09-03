# MCP CV & Email Server (with Next.js playground)

A complete coding-challenge solution:
- **MCP server** (TypeScript, Express) using **Streamable HTTP transport**
- **Chats about your CV**: exposes the resume via MCP resources and a `cv_query` tool that can answer simple questions
- **Sends email notifications**: `send_email` MCP tool **and** a REST endpoint `/api/send-email`
- **Optional Next.js playground** to chat with the MCP server and send emails from a browser

## Quick start

### 1) Requirements
- Node 18+
- PNPM or NPM
- SMTP creds (Mailtrap, Gmail OAuth, etc.)

### 2) Configure env
Copy `.env.example` to `.env` in `server/` and fill your values:

```bash
cd server
cp .env.example .env
```

### 3) Seed your resume
Edit `server/data/resume.json` (ATS-like structure). You can also POST a JSON to `/api/upload-resume` at runtime.

### 4) Run locally
```bash
pnpm install
pnpm -C server dev
pnpm -C web dev
```
- MCP endpoint: `http://localhost:8787/mcp`
- REST email endpoint: `POST http://localhost:8787/api/send-email`
- Upload resume: `POST http://localhost:8787/api/upload-resume`
- Playground: `http://localhost:3000` (Next.js)

### 5) Connect from an MCP client
This server supports **Streamable HTTP**. Example with the TypeScript SDK client is inside the Next.js app.
In Claude Desktop, add a server block pointing to `http://localhost:8787/mcp` (fallback SSE endpoints also available).

## Deployment
- **Railway/Render/Fly.io**: Use the Dockerfile in `server/`. Expose port `8787`.
- **Vercel for the Next.js app** (`web/`) – host separately from the MCP server because MCP sessions may require sticky routing.
- See `server/DEPLOY.md` for Railway deployment instructions.
