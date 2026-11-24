import localforage from 'localforage';

localforage.config({
  name: 'InfraChat',
  storeName: 'companies_docs'
});

export interface InfraEmpresa {
  nome: string;
  unidade: string;
  codigo_documento: string;
  data_revisao: string;
  responsavel: string;
  observacoes: string;
}

export interface InfraServidor {
  hostname: string;
  so: string;
  ip: string;
  funcoes: string;
  acesso_remoto: string;
  id_acesso: string;
  discos: string;
  observacoes: string;
}

export interface InfraInternet {
  provedor: string;
  velocidade: string;
  tipo_ip: string;
  ip_publico: string;
  mascara: string;
  gateway: string;
  dns_primario: string;
  dns_secundario: string;
  ip_modem: string;
  observacoes: string;
}

export interface InfraFirewall {
  fabricante_modelo: string;
  ip_gerenciamento: string;
  funcao: string;
  observacoes: string;
}

export interface InfraSwitch {
  fabricante_modelo: string;
  nome: string;
  ip: string;
  localizacao: string;
  observacoes: string;
}

export interface InfraVlan {
  id_vlan: string;
  nome: string;
  subnet: string;
  gateway: string;
  observacoes: string;
}

export interface InfraWifi {
  fabricante_modelo: string;
  nome_localizacao: string;
  ip: string;
  controladora: string;
  observacoes: string;
}

export interface InfraEquipamento {
  tipo: string;
  detalhes: string;
}

export interface InfraBackup {
  possui_backup: string;
  onde_fica: string;
  frequencia: string;
  responsavel: string;
  ultimo_teste: string;
  observacoes: string;
}

export interface InfraRevisao {
  numero: string;
  data: string;
  descricao: string;
  responsavel: string;
}

export interface InfraDescoberta {
  categoria: string;
  titulo: string;
  valor: string;
  fonte: string;
  trecho: string;
  confianca: 'alta' | 'media' | 'baixa';
}

export interface NormalizedInfraData {
  empresa?: InfraEmpresa;
  servidores?: InfraServidor[];
  internet?: InfraInternet[];
  firewall?: InfraFirewall[];
  switches?: InfraSwitch[];
  vlans?: InfraVlan[];
  wifi?: InfraWifi[];
  equipamentos?: InfraEquipamento[];
  backup?: InfraBackup;
  revisoes?: InfraRevisao[];
  descobertas?: InfraDescoberta[];
}

export interface FileInfo {
  name: string;
  relativePath?: string;
  sizeKb: number;
  content?: string;
  hash?: string;
  lastModified?: number;
  status?: 'indexed' | 'empty' | 'error';
  extractionError?: string;
}

export interface DocumentChunk {
  id: string;
  fileName: string;
  relativePath: string;
  text: string;
  index: number;
}

export interface CompanyData {
  company: string;
  filename: string;
  files?: FileInfo[];
  chunks?: DocumentChunk[];
  content: string;
  syncedAt: string;
  changedFiles?: string[];
  normalizedStatus?: 'ai' | 'reviewed';
  analysisIssues?: Array<{ fileName: string; reason: string }>;
  normalizedData?: NormalizedInfraData;
}

export interface SettingsData {
  provider?: 'ollama' | 'groq';
  groqModel?: string;
  ollamaUrl: string;
  ollamaModel: string;
  animateOnOpen?: boolean;
}

export interface SyncProgressData {
  status: 'idle' | 'scanning' | 'processing' | 'done' | 'error';
  message: string;
  currentCompany?: string;
  currentFile?: string;
  scannedFolders?: number;
  processedFiles: number;
  totalFiles: number;
}

declare global {
  interface Window {
    documentManager?: {
      groqStatus: () => Promise<{ configured: boolean; enabled: boolean }>;
      configureGroq: (config: { key?: string; enabled: boolean }) => Promise<unknown>;
      generateGroq: (payload: { id: string; prompt: string; model: string; json: boolean }) => Promise<string>;
      cancelGroq: (id: string) => Promise<void>;
      scanFolder: (onProgress: (progress: Partial<SyncProgressData>) => void) => Promise<{ canceled: boolean; companies: Array<{ company: string; files: FileInfo[] }> }>;
      stopOllama: (model: string) => Promise<void>;
    };
  }
}

export const store = {
  async saveCompany(data: CompanyData) {
    await localforage.setItem(`company_${data.company}`, data);
  },
  
  async getCompany(companyName: string): Promise<CompanyData | null> {
    return await localforage.getItem(`company_${companyName}`);
  },

  async getAllCompanies(): Promise<CompanyData[]> {
    const keys = await localforage.keys();
    const companies: CompanyData[] = [];
    for (const key of keys) {
      if (key.startsWith('company_')) {
        const data = await localforage.getItem<CompanyData>(key);
        if (data) companies.push(data);
      }
    }
    // Sort alphabetically
    return companies.sort((a, b) => a.company.localeCompare(b.company));
  },

  async saveSettings(settings: SettingsData) {
    await localforage.setItem('app_settings', settings);
    window.dispatchEvent(new Event('settings-changed'));
  },

  async getSettings(): Promise<SettingsData> {
    const data = await localforage.getItem<SettingsData>('app_settings');
    const settings = data || { ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: 'qwen2.5:3b', animateOnOpen: true };
    const groq = await window.documentManager?.groqStatus();
    return { ...settings, provider: groq?.configured && groq.enabled ? 'groq' : 'ollama', groqModel: settings.groqModel || 'openai/gpt-oss-20b' };
  }
};
