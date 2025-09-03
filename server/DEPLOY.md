# Deploy (Railway)

1. Create a new Railway project and connect your GitHub repo.
2. Set the **Root Directory** to `server`.
3. Add environment variables from `.env.example` (PORT must be `8787`).
4. Railway will detect the Dockerfile and build automatically.
5. Once deployed, your MCP endpoint will be: `https://<your-app>.up.railway.app/mcp`

> Host the `web` Next.js app separately (e.g., Vercel). Set `ALLOWED_ORIGINS` on the server to your Next.js domain.
