import { store } from './store';

export async function generateGroq(prompt: string, json = false, signal?: AbortSignal): Promise<string> {
  const bridge = window.documentManager;
  if (!bridge) throw new Error('Groq requer o aplicativo desktop.');
  const settings = await store.getSettings();
  const id = crypto.randomUUID();
  if (signal?.aborted) throw new Error('Análise interrompida.');
  const abort = () => { void bridge.cancelGroq(id); };
  signal?.addEventListener('abort', abort, { once: true });
  try { return await bridge.generateGroq({ id, prompt, model: settings.groqModel || 'openai/gpt-oss-20b', json }); }
  finally { signal?.removeEventListener('abort', abort); }
}

function apiUrl(url: string, path: string): string {
  return `${url.trim().replace(/\/+$/, '')}${path}`;
}

export async function getOllamaModels(url: string): Promise<string[]> {
  try {
    const res = await fetch(apiUrl(url, '/api/tags'));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.models)
      ? data.models.map((item: { name?: string }) => item.name).filter((name): name is string => Boolean(name))
      : [];
  } catch {
    return [];
  }
}

export async function testOllamaConnection(url: string): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(url, '/api/tags'));
    return res.ok;
  } catch {
    return false;
  }
}

// Helper to filter relevant paragraphs for huge documents so we don't blow up the context window
function getRelevantContext(fullText: string, query: string, maxChars: number = 8000): string {
  if (fullText.length <= maxChars) return fullText;

  // Split into manageable paragraphs
  const paragraphs = fullText.split(/\n\n+/).filter(p => p.trim().length > 0);
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  // Score paragraphs based on simple word hits
  const scored = paragraphs.map(p => {
    const pLower = p.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (pLower.includes(word)) score += 1;
    }
    return { text: p, score };
  });

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  // Take top paragraphs up to maxChars
  let combined = "";
  for (const item of scored) {
    if ((combined.length + item.text.length) > maxChars) break;
    combined += item.text + "\n\n";
  }

  // If search failed to find much, fallback to start of document
  if (combined.trim().length === 0) {
    return fullText.slice(0, maxChars);
  }

  return combined;
}

// A normalização não precisa enviar páginas inteiras de texto repetido para o modelo.
// Mantém a abertura do documento e prioriza linhas com dados de infraestrutura literais.
function getNormalizationContext(fullText: string, maxChars: number = 9000): string {
  if (fullText.length <= maxChars) return fullText;
  const lines = fullText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const keyword = /\b(?:\d{1,3}(?:\.\d{1,3}){3}|ip|gateway|dns|vlan|servidor|firewall|switch|wifi|vpn|zabbix|glpi|backup|nobreak|storage|nas|porta|mikrotik|forti|pfsense)\b/i;
  const selected = [...lines.slice(0, 35), ...lines.filter(line => keyword.test(line))];
  const unique = [...new Set(selected)];
  let output = '';
  for (const line of unique) {
    if (output.length + line.length + 1 > maxChars) break;
    output += `${line}\n`;
  }
  return output.trim() || fullText.slice(0, maxChars);
}

export async function normalizeInfraData(url: string, model: string, fullContext: string, sourceName: string, signal?: AbortSignal): Promise<any> {
  const text = getNormalizationContext(fullContext);
  const prompt = `Você é um analista de infraestrutura de redes sênior. 
Leia o texto extraído da documentação de infraestrutura abaixo (que pode conter multiplas filiais marcadas com [ARQUIVO/FILIAL: ...]) e extraia as informações estruturadas EXACTAMENTE no formato JSON solicitado. 
Se uma categoria não existir ou não tiver dados, preencha com string vazia "" ou array vazio []. Nunca crie um item de array totalmente vazio.
REGRAS DE QUALIDADE:
- Preserve valores literalmente; não adivinhe nem complete campos.
- Um IP privado (10.x, 172.16-31.x, 192.168.x) nunca é IP público. Para links DHCP, registre-o em ip_modem ou gateway conforme o texto.
- "Servidor: Não possui" não gera servidor. Porém storage, NAS e equipamentos com IP devem ser registrados em servidores ou equipamentos, com IP e detalhes.
- Extraia o nome da empresa quando estiver escrito no objetivo/aplicação.
- Registre impressoras, nobreaks, licenças, atendimento e refrigeração em equipamentos/observações se não houver campo específico.
- Para documentação de monitoramento, registre o servidor monitorado como servidor: hostname, IP, sistema/componente, função, diretório de scripts, protocolo e porta devem constar em funções ou observações. Registre Zabbix/monitoramento e dependências em equipamentos.
- Em "descobertas", registre somente fatos úteis que não couberam bem nas categorias: GLPI, Zabbix, VPN, licenças, rotinas, URLs, portas, alertas e ferramentas. Cada descoberta precisa conter um trecho literal curto do texto e a fonte "${sourceName}".
- Nunca exponha senhas, tokens ou chaves. Se houver segredo, registre somente "Segredo identificado (oculto)" e a fonte.
Apenas retorne o JSON, não coloque texto fora do bloco JSON.

ESQUEMA OBRIGATÓRIO (retorne SOMENTE as propriedades abaixo):
{
  "empresa": {"nome": "", "unidade": "", "codigo_documento": "", "data_revisao": "", "responsavel": "", "observacoes": ""},
  "servidores": [{"hostname": "", "so": "", "ip": "", "funcoes": "", "acesso_remoto": "", "id_acesso": "", "discos": "", "observacoes": ""}],
  "internet": [{"provedor": "", "velocidade": "", "tipo_ip": "", "ip_publico": "", "mascara": "", "gateway": "", "dns_primario": "", "dns_secundario": "", "ip_modem": "", "observacoes": ""}],
  "firewall": [{"fabricante_modelo": "", "ip_gerenciamento": "", "funcao": "", "observacoes": ""}],
  "switches": [{"fabricante_modelo": "", "nome": "", "ip": "", "localizacao": "", "observacoes": ""}],
  "vlans": [{"id_vlan": "", "nome": "", "subnet": "", "gateway": "", "observacoes": ""}],
  "wifi": [{"fabricante_modelo": "", "nome_localizacao": "", "ip": "", "controladora": "", "observacoes": ""}],
  "equipamentos": [{"tipo": "", "detalhes": ""}],
  "backup": {"possui_backup": "", "onde_fica": "", "frequencia": "", "responsavel": "", "ultimo_teste": "", "observacoes": ""},
  "revisoes": [{"numero": "", "data": "", "descricao": "", "responsavel": ""}],
  "descobertas": [{"categoria": "", "titulo": "", "valor": "", "fonte": "${sourceName}", "trecho": "", "confianca": "alta"}]
}

TEXTO DOCUMENTAÇÃO:
${text}`;

  try {
    if ((await store.getSettings()).provider === 'groq') {
      return sanitizeNormalizedData(JSON.parse(await generateGroq(prompt, true, signal)), text, sourceName);
    }
    const response = await fetch(apiUrl(url, '/api/generate'), {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        format: "json", // Força o modelo a responder num JSON parseável estruturado
        stream: false,
      }),
    });

    if (!response.ok) throw new Error("Erro na requisição Ollama API");

    const data = await response.json();
    return sanitizeNormalizedData(JSON.parse(data.response), text, sourceName);
  } catch (err: any) {
    throw new Error(`Falha ao normalizar dados: ${err.message}`);
  }
}

export function mergeNormalizedData(documents: any[]): any {
  const output: any = { empresa: {}, servidores: [], internet: [], firewall: [], switches: [], vlans: [], wifi: [], equipamentos: [], backup: {}, revisoes: [], descobertas: [] };
  const arrayFields = ['servidores', 'internet', 'firewall', 'switches', 'vlans', 'wifi', 'equipamentos', 'revisoes', 'descobertas'];
  for (const document of documents) {
    if (!document) continue;
    for (const field of ['empresa', 'backup']) for (const [key, value] of Object.entries(document[field] || {})) {
      if (!output[field][key] && hasValue(value)) output[field][key] = value;
    }
    for (const field of arrayFields) output[field].push(...(Array.isArray(document[field]) ? document[field] : []));
  }
  for (const field of arrayFields) {
    const seen = new Set<string>();
    output[field] = output[field].filter((item: unknown) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return output;
}

function hasValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function sanitizeNormalizedData(data: any, text: string, sourceName: string): any {
  const output = { ...data };
  const arrays = ['servidores', 'internet', 'firewall', 'switches', 'vlans', 'wifi', 'equipamentos', 'revisoes', 'descobertas'];
  for (const field of arrays) {
    output[field] = Array.isArray(output[field]) ? output[field].filter((item: Record<string, unknown>) => Object.values(item || {}).some(hasValue)) : [];
  }
  output.descobertas = output.descobertas.map((item: any) => ({ ...item, fonte: hasValue(item.fonte) ? item.fonte : sourceName, confianca: ['alta', 'media', 'baixa'].includes(item.confianca) ? item.confianca : 'media' }))
    .filter((item: any) => hasValue(item.titulo) && hasValue(item.valor) && hasValue(item.trecho));

  output.empresa = output.empresa || {};
  if (!hasValue(output.empresa.nome)) {
    const match = text.match(/documentação de infraestrutura de TI da empresa\s+([^\.\n]+)/i);
    if (match) output.empresa.nome = match[1].trim();
  }

  for (const link of output.internet) {
    const privateIp = hasValue(link.ip_publico) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(link.ip_publico);
    if (privateIp) {
      link.ip_modem = link.ip_modem || link.ip_publico;
      link.ip_publico = '';
    }
  }

  const storage = text.match(/storage\s+em\s+(RAID[^\n–-]*)\s*[–-]\s*((?:\d{1,3}\.){3}\d{1,3})/i);
  if (storage && !output.servidores.some((item: any) => item.ip === storage[2])) {
    output.servidores.push({ hostname: 'Storage', so: '', ip: storage[2], funcoes: 'Armazenamento', acesso_remoto: '', id_acesso: '', discos: storage[1].trim(), observacoes: '' });
  }
  return output;
}

export async function askOllama(
  url: string,
  model: string,
  query: string,
  fullContext: string,
  company: string,
  filename: string,
  onChunk: (chunk: string) => void
): Promise<void> {

  // Get relevant slice of the context based on the query to save processing power and avoid limit errors
  const context = getRelevantContext(fullContext, query);

  const prompt = `Você é um assistente de infraestrutura de redes.
Você está consultando a documentação da empresa cliente: ${company}.

Responda à pergunta do usuário APENAS com base no contexto fornecido abaixo.
Se a informação não estiver no contexto, responda EXATAMENTE: "Não encontrei essa informação na documentação da empresa selecionada."
NUNCA invente IPs, senhas, VLANs, nomes de servidores, firewall, links ou configurações (alucinação).
Seja direto, técnico e objetivo.

Sempre cite a empresa (${company}) e o arquivo usado como fonte (${filename}) no momento que entregar a resposta.

======= CONTEXTO EXTRAÍDO (${company}) =======
${context}
=================================================

PERGUNTA DO USUÁRIO: ${query}`;

  try {
    if ((await store.getSettings()).provider === 'groq') {
      onChunk(await generateGroq(prompt));
      return;
    }
    const response = await fetch(apiUrl(url, '/api/generate'), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: true,
      }),
    });

    if (!response.body) throw new Error("A resposta não contém dados stream.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkObj = decoder.decode(value, { stream: true });
      const lines = chunkObj.split("\n").filter((l) => l.trim() !== "");

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.response) {
            onChunk(parsed.response);
          }
        } catch (err) {
          // Ignore incomplete JSON chunks, let next iteration fix
        }
      }
    }
  } catch (err: any) {
    throw new Error(`Falha na solicitação de IA: ${err.message}`);
  }
}
