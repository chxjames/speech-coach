import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const file = process.argv[2];
const maxSeconds = Number(process.argv[3] || 30);
const scene = process.argv[4] || 'contest';

const transport = new StdioClientTransport({ command: process.execPath, args: ['src/server.js'], env: process.env });
const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('tools:', tools.tools.map(t => t.name).join(', '));

const t0 = Date.now();
const res = await client.callTool({
  name: 'analyze_speech',
  arguments: { path: file, scene, level: 'solid', format: 'desk', lang: 'en', model: 'Xenova/whisper-base.en', ...(maxSeconds ? { maxSeconds } : {}) },
}, undefined, { timeout: 900000, resetTimeoutOnProgress: true });
console.log('took', ((Date.now() - t0) / 1000).toFixed(1), 's, isError =', !!res.isError);
console.log(String(res.content[0].text).split('\n').slice(0, 40).join('\n'));
await client.close();
