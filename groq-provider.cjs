const { app, ipcMain, safeStorage } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const controllers = new Map();
let enabled = true;
const keyPath = () => path.join(app.getPath('userData'), 'groq-key.enc');
const configPath = () => path.join(app.getPath('userData'), 'groq-config.json');
async function saveKey(key) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Proteção de credenciais indisponível.');
  if (typeof key !== 'string' || !key.startsWith('gsk_')) throw new Error('Chave Groq inválida.');
  await fs.writeFile(keyPath(), safeStorage.encryptString(key.trim()));
}
async function getKey() {
  try { return safeStorage.decryptString(await fs.readFile(keyPath())); }
  catch { throw new Error('Configure a chave Groq em Configurações.'); }
}
function redact(text) {
  return text.replace(/\b(?:gsk_|sk-)[A-Za-z0-9_-]+/g, '[SEGREDO OCULTO]')
    .replace(/\b(senha|password|passwd|pwd|token|api[_ -]?key|secret|pgpassword)\s*[:=]\s*[^\r\n|]+/gi, '$1: [SEGREDO OCULTO]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[CHAVE PRIVADA OCULTA]');
}
async function request(payload, controller) {
  const key = await getKey();
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: payload.model || 'openai/gpt-oss-20b', messages: [{ role: 'user', content: redact(payload.prompt) }],
        stream: false, max_completion_tokens: payload.json ? 3500 : 1800, reasoning_effort: 'low',
        ...(payload.json ? { response_format: { type: 'json_object' } } : {}) })
    });
    if (response.status === 429 && attempt < 3) {
      const wait = Math.min(60000, Math.max(1000, Number(response.headers.get('retry-after') || 20) * 1000));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, wait);
        const abort = () => { clearTimeout(timer); reject(new Error('Análise interrompida.')); };
        controller.signal.addEventListener('abort', abort, { once: true });
      });
      continue;
    }
    if (!response.ok) throw new Error(response.status === 401 ? 'Chave Groq inválida ou revogada.' : response.status === 429 ? 'Limite gratuito da Groq atingido. Tente mais tarde.' : `Groq retornou HTTP ${response.status}.`);
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq retornou uma resposta vazia.');
    return content;
  }
}
app.whenReady().then(async () => {
  const bootstrapKey = process.env.IA_DM_GROQ_BOOTSTRAP;
  delete process.env.IA_DM_GROQ_BOOTSTRAP;
  try { enabled = JSON.parse(await fs.readFile(configPath(), 'utf8')).enabled !== false; } catch {}
  if (bootstrapKey) {
    await saveKey(bootstrapKey);
    enabled = true;
    await fs.writeFile(configPath(), JSON.stringify({ enabled }));
  }
});
ipcMain.handle('groq:status', async () => { try { await getKey(); return { configured: true, enabled }; } catch { return { configured: false, enabled: false }; } });
ipcMain.handle('groq:configure', async (_, config) => {
  if (config.key) await saveKey(config.key);
  enabled = config.enabled;
  await fs.writeFile(configPath(), JSON.stringify({ enabled }));
  return { configured: true, enabled };
});
ipcMain.handle('groq:generate', async (_, payload) => {
  if (typeof payload.prompt !== 'string' || payload.prompt.length > 80000 || typeof payload.id !== 'string') throw new Error('Solicitação inválida.');
  const controller = new AbortController(); controllers.set(payload.id, controller);
  try { return await request(payload, controller); } finally { controllers.delete(payload.id); }
});
ipcMain.handle('groq:cancel', (_, id) => controllers.get(id)?.abort());
module.exports = { redact };
