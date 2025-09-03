'use client';
import { useEffect, useRef, useState } from 'react';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export default function Page() {
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [question, setQuestion] = useState('What role did I have at my last position?');
  const [email, setEmail] = useState({ recipient: '', subject: '', body: '' });
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    async function connect() {
      try {
        const transport = new StreamableHTTPClientTransport(new URL(process.env.NEXT_PUBLIC_MCP_URL || 'http://localhost:8787/mcp'));
        const client = new Client({ name: 'next-playground', version: '1.0.0' });
        await client.connect(transport);
        clientRef.current = client;
        setConnected(true);
        setLogs(l => [...l, 'Connected to MCP']);
      } catch (e: any) {
        setLogs(l => [...l, 'Failed to connect: ' + e?.message]);
      }
    }
    connect();
    return () => { clientRef.current?.close(); };
  }, []);

  async function askCv() {
    const client = clientRef.current;
    if (!client) return;
    const result = await client.callTool({ name: 'cv_query', arguments: { question } });
    const text = (result as any).content?.map((c:any)=>c.text).join('\n');
    setLogs(l => [...l, 'Q: ' + question, 'A: ' + (text || '(no content)')]);
  }

  async function sendEmail() {
    const res = await fetch((process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:8787') + '/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email)
    });
    const json = await res.json();
    setLogs(l => [...l, 'Email result: ' + JSON.stringify(json)]);
  }

  return (
    <main style={{ maxWidth: 960, margin: '40px auto', padding: 16 }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>MCP CV & Email Playground</h1>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr' }}>
        <section style={{ background: '#111214', padding: 16, borderRadius: 12 }}>
          <h2 style={{ fontSize: 18 }}>Connection</h2>
          <p>Status: {connected ? 'Connected ✅' : 'Not connected ❌'}</p>
        </section>

        <section style={{ background: '#111214', padding: 16, borderRadius: 12 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Ask the CV (MCP tool)</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              style={{ flex: 1, padding: 8, borderRadius: 8, background: '#0b0b0c', color: 'white', border: '1px solid #26272b' }}
            />
            <button onClick={askCv} style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: 'white' }}>Ask</button>
          </div>
        </section>

        <section style={{ background: '#111214', padding: 16, borderRadius: 12 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Send Email (REST)</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            <input placeholder="recipient" value={email.recipient} onChange={(e) => setEmail({ ...email, recipient: e.target.value })}
              style={{ padding: 8, borderRadius: 8, background: '#0b0b0c', color: 'white', border: '1px solid #26272b' }} />
            <input placeholder="subject" value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })}
              style={{ padding: 8, borderRadius: 8, background: '#0b0b0c', color: 'white', border: '1px solid #26272b' }} />
            <textarea placeholder="body" value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })}
              rows={4} style={{ padding: 8, borderRadius: 8, background: '#0b0b0c', color: 'white', border: '1px solid #26272b' }} />
            <button onClick={sendEmail} style={{ padding: '8px 12px', borderRadius: 8, background: '#16a34a', color: 'white' }}>Send</button>
          </div>
        </section>

        <section style={{ background: '#111214', padding: 16, borderRadius: 12 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Logs</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{logs.join('\n')}</pre>
        </section>
      </div>
    </main>
  );
}
