// Bulochka · knowledge relay — Yandex Cloud Function (Node 18).
// GET  /knowledge         → returns the shared team-notes.md (anyone with the plugin can read)
// POST /knowledge {author, note} → appends a section (guarded by X-Bulochka-Key)
// Store: one markdown object in Yandex Object Storage (S3-compatible).
// No per-designer auth: the write secret lives here (server-side), designers hold nothing.

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.BUCKET;
const KEY = process.env.OBJECT_KEY || 'team-notes.md';
const SECRET = process.env.SHARED_SECRET || ''; // if set, POST requires header X-Bulochka-Key

const s3 = new S3Client({
  region: 'ru-central1',
  endpoint: 'https://storage.yandexcloud.net',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Bulochka-Key',
};

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function readNotes() {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
    return await streamToString(r.Body);
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      return '# База знаний команды (Bulochka)\n\nЗдесь копятся проверенные приёмы, ключи компонентов и фиксы.\n\n---\n';
    }
    throw e;
  }
}

module.exports.handler = async (event) => {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const headers = event.headers || {};

  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    if (method === 'GET') {
      const md = await readNotes();
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'text/markdown; charset=utf-8' }, body: md };
    }

    if (method === 'POST') {
      if (SECRET) {
        const key = headers['X-Bulochka-Key'] || headers['x-bulochka-key'] || '';
        if (key !== SECRET) return { statusCode: 401, headers: CORS, body: 'unauthorized' };
      }
      let raw = event.body || '{}';
      if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf-8');
      const { author, note } = JSON.parse(raw);
      if (!note || !String(note).trim()) return { statusCode: 400, headers: CORS, body: 'empty note' };

      const cur = await readNotes();
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const section = `\n## ${String(author || 'designer').slice(0, 60)} — ${stamp}\n\n${String(note).trim()}\n`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: KEY,
        Body: cur + section,
        ContentType: 'text/markdown; charset=utf-8',
      }));
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: 'method not allowed' };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: 'error: ' + (e && e.message ? e.message : String(e)) };
  }
};
