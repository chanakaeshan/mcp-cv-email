import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8787', 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['Mcp-Session-Id']
}));

// === RESUME DATA STORE ===
const RESUME_PATH = path.join(__dirname, '../data/resume.json');
function loadResume() {
  try {
    const raw = fs.readFileSync(RESUME_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { basics: {}, work: [], projects: [], skills: [] };
  }
}
function saveResume(json: any) {
  fs.writeFileSync(RESUME_PATH, JSON.stringify(json, null, 2), 'utf8');
}
let resume = loadResume();

// === EMAIL TRANSPORT ===
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendEmail(to: string, subject: string, body: string) {
  const from = process.env.SMTP_FROM || 'no-reply@example.com';
  const info = await transporter.sendMail({ from, to, subject, text: body, html: `<pre>${body}</pre>` });
  return { messageId: info.messageId };
}

// === REST ENDPOINTS ===
app.post('/api/send-email', async (req, res) => {
  const { recipient, subject, body } = req.body || {};
  if (!recipient || !subject || !body) return res.status(400).json({ error: 'recipient, subject, body required' });
  try {
    const result = await sendEmail(recipient, subject, body);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'send failed' });
  }
});

app.post('/api/upload-resume', async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Expecting JSON resume' });
  saveResume(data);
  resume = data;
  res.json({ ok: true });
});

// === MCP SERVER SETUP ===
// Docs: https://github.com/modelcontextprotocol/typescript-sdk
const mcp = new McpServer({ name: 'cv-email-server', version: '1.0.0' });

// Resource: full resume as JSON
mcp.registerResource(
  'resume-json',
  'resume://profile',
  { title: 'Resume JSON', description: 'Full resume in JSON', mimeType: 'application/json' },
  async (uri) => ({
    contents: [{ uri: uri.href, text: JSON.stringify(resume, null, 2) }]
  })
);

// Resource: work entries with a parameterized template
mcp.registerResource(
  'resume-work',
  new ResourceTemplate('resume://work/{index}', {
    list: undefined
  }),
  { title: 'Work Entry', description: 'A single work experience entry' },
  async (uri, { index }) => {
    const i = Number(index);
    const entry = (resume.work || [])[i];
    return {
      contents: [{
        uri: uri.href,
        text: entry ? JSON.stringify(entry, null, 2) : 'Not found'
      }]
    };
  }
);

// Tool: simple CV Q&A via keyword search
mcp.registerTool(
  'cv_query',
  {
    title: 'Ask the CV',
    description: 'Answer simple questions about the resume using keyword search',
    inputSchema: { question: z.string() }
  },
  async ({ question }) => {
    const q = String(question).toLowerCase();
    const answers: string[] = [];
    const push = (label: string, val: any) => answers.push(`• ${label}: ${typeof val === 'string' ? val : JSON.stringify(val)}`);

    // last role heuristic
    const lastRole = (resume.work && resume.work.length) ? resume.work[resume.work.length - 1] : undefined;
    if (/(last|previous|most recent)/.test(q) && lastRole) {
      push('last_position', lastRole.position);
      push('last_company', lastRole.name);
      push('last_dates', `${lastRole.startDate || ''} – ${lastRole.endDate || 'present'}`);
    }

    // common fields
    if (/name/.test(q) && resume.basics?.name) push('name', resume.basics.name);
    if (/(role|position|title)/.test(q) && lastRole?.position) push('position', lastRole.position);
    if (/(company|employer|organization)/.test(q) && lastRole?.name) push('company', lastRole.name);
    if (/(city|location)/.test(q) && resume.basics?.location) push('location', resume.basics.location);
    if (/(skills?|tech|stack)/.test(q) && resume.skills) push('skills', resume.skills);
    if (/(project|built|app)/.test(q) && resume.projects) push('projects', resume.projects);

    // naive keyword scan over all text
    const hay = JSON.stringify(resume).toLowerCase();
    if (answers.length === 0 && hay.includes(q)) {
      answers.push('I found matches in the resume. Here is the resume JSON to inspect.');
      answers.push(JSON.stringify(resume, null, 2));
    }
    if (answers.length === 0) answers.push('No direct match. Try asking about last role, skills, or projects.');

    return { content: [{ type: 'text', text: answers.join('\n') }] };
  }
);

// Tool: send email via SMTP
mcp.registerTool(
  'send_email',
  {
    title: 'Send Email',
    description: 'Send an email using configured SMTP credentials',
    inputSchema: { recipient: z.string().email(), subject: z.string(), body: z.string() }
  },
  async ({ recipient, subject, body }) => {
    const result = await sendEmail(recipient, subject, body);
    return { content: [{ type: 'text', text: `Sent: ${JSON.stringify(result)}` }] };
  }
);

// === Streamable HTTP transport (modern) ===
const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};

app.all('/mcp', async (req, res) => {
  const sessionId = req.header('Mcp-Session-Id') || randomUUID();
  let transport = streamableTransports[sessionId];
  if (!transport) {
    transport = new StreamableHTTPServerTransport({ sessionId });
    streamableTransports[sessionId] = transport;
    res.setHeader('Mcp-Session-Id', sessionId);
    // Connect server on first request for this session
    mcp.connect(transport).catch(err => {
      console.error('MCP connect error', err);
    });
  }
  await transport.handleRequest(req, res);
});

// === Legacy SSE transport (optional fallback) ===
const sseTransports: Record<string, SSEServerTransport> = {};
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res as any);
  sseTransports[transport.sessionId] = transport;
  res.on('close', () => delete sseTransports[transport.sessionId]);
  await mcp.connect(transport);
});
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = sseTransports[sessionId];
  if (!transport) return res.status(400).send('No transport for session');
  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`MCP Server listening on :${PORT}`);
});
