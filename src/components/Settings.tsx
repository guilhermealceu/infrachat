import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, CheckCircle, XCircle, Search, FileText } from 'lucide-react';
import { store, SettingsData } from '../lib/store';
import { generateGroq, getOllamaModels } from '../lib/ollama';
import { motion, AnimatePresence } from 'motion/react';
import { useSync } from '../lib/sync-context';

export function Settings() {
  const isElectron = window.location.protocol === 'file:' || navigator.userAgent.includes('Electron');
  const [settings, setSettings] = useState<SettingsData>({ ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: 'qwen2.5:3b' });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<'none' | 'success' | 'error'>('none');
  const [isTesting, setIsTesting] = useState(false);
  const [groqKey, setGroqKey] = useState('');
  const [groqConfigured, setGroqConfigured] = useState(false);
  const { progress: syncProgress, isSyncing, elapsedSeconds, startSync } = useSync();

  useEffect(() => {
    window.documentManager?.groqStatus().then(status => setGroqConfigured(status.configured));
    store.getSettings().then(async (savedSettings) => {
      setSettings(savedSettings);
      setAvailableModels(await getOllamaModels(savedSettings.ollamaUrl));
    });
  }, []);

  const saveConfig = async () => {
    if (window.documentManager) {
      await window.documentManager.configureGroq({ key: groqKey || undefined, enabled: settings.provider === 'groq' });
      setGroqKey('');
      setGroqConfigured((await window.documentManager.groqStatus()).configured);
    }
    await store.saveSettings(settings);
    alert("Configurações salvas!");
  };

  const toggleOpenAnimation = async () => {
    const updated = { ...settings, animateOnOpen: settings.animateOnOpen === false };
    setSettings(updated);
    await store.saveSettings(updated);
  };

  const verifyConnection = async () => {
    setIsTesting(true);
    setTestResult('none');
    if (settings.provider === 'groq') {
      try {
        await window.documentManager?.configureGroq({ key: groqKey || undefined, enabled: true });
        await store.saveSettings(settings);
        await generateGroq('Responda somente OK.');
        setGroqKey(''); setGroqConfigured(true); setTestResult('success');
      } catch { setTestResult('error'); }
      finally { setIsTesting(false); }
      return;
    }
    const models = await getOllamaModels(settings.ollamaUrl);
    setAvailableModels(models);
    setTestResult(models.length > 0 ? 'success' : 'error');
    setIsTesting(false);
  };

  const handleSync = async () => {
    await startSync();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-8 max-w-4xl mx-auto text-gray-100 h-full overflow-y-auto"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-zinc-400 mt-2">Ajuste os parâmetros de Inteligência Artificial e sincronização de dados.</p>
      </div>
      
      {/* Aviso Ambiente */}
      {!isElectron && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && (
        <div className="bg-yellow-900/40 border border-yellow-600/50 p-4 rounded-xl mb-8 flex text-yellow-200 text-sm">
          <strong className="mr-2">Atenção:</strong> Como você está rodando na pré-visualização web da nuvem, não será possível conectar ao Ollama local ou usar a File System API nativa adequadamente devido à segurança. Exporte o projeto e rode localmente como Electron via <b>npm run electron:start</b>.
        </div>
      )}

      <div className="space-y-8 bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800">
        <h2 className="text-xl font-semibold border-b border-zinc-800 pb-2 flex items-center gap-2">
           <Search size={20} className="text-blue-400"/> Provedor de IA
        </h2>
        <select value={settings.provider || 'ollama'} onChange={e => setSettings({ ...settings, provider: e.target.value as 'groq' | 'ollama' })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white">
          <option value="groq">Groq — nuvem</option><option value="ollama">Ollama — local</option>
        </select>
        {settings.provider === 'groq' && <div className="space-y-3">
          <p className="text-sm text-zinc-400">Extração e OCR locais. Os trechos usados na análise são enviados à Groq; segredos reconhecíveis são ocultados antes do envio.</p>
          <input type="password" autoComplete="off" value={groqKey} onChange={e => setGroqKey(e.target.value)} placeholder={groqConfigured ? 'Chave protegida salva — cole outra para substituir' : 'Chave API Groq'} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white"/>
          <select value={settings.groqModel || 'openai/gpt-oss-20b'} onChange={e => setSettings({ ...settings, groqModel: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white"><option value="openai/gpt-oss-20b">GPT OSS 20B</option><option value="openai/gpt-oss-120b">GPT OSS 120B</option></select>
        </div>}
        
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${settings.provider !== 'ollama' && settings.provider ? 'hidden' : ''}`}>
          <div className="space-y-2">
            <label className="text-sm text-zinc-400 font-medium">URL Base do Ollama</label>
            <input 
              type="url" 
              value={settings.ollamaUrl}
              onChange={e => setSettings({...settings, ollamaUrl: e.target.value})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-zinc-400 font-medium">Modelo Inferência (Ex: qwen2.5:7b)</label>
            <input 
              type="text"
              list="ollama-models"
              value={settings.ollamaModel}
              onChange={e => setSettings({...settings, ollamaModel: e.target.value})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
            />
            <datalist id="ollama-models">
              {availableModels.map(model => <option key={model} value={model} />)}
            </datalist>
            {availableModels.length > 0 && <p className="text-xs text-zinc-500">Modelos encontrados: {availableModels.join(', ')}</p>}
          </div>
        </div>

        <div className="flex items-center gap-4 pt-4">
          <button 
            onClick={saveConfig}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Save size={18} /> Salvar Alterações
          </button>
          
          <button 
            onClick={verifyConnection}
            disabled={isTesting}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-colors border border-zinc-700 disabled:opacity-50"
          >
            <RefreshCw size={18} className={isTesting ? "animate-spin text-blue-400" : ""} /> 
            Testar Conexão
          </button>
          
          <AnimatePresence>
            {testResult === 'success' && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center text-emerald-400 font-medium"><CheckCircle size={18} className="mr-2"/> Conectado com sucesso</motion.div>
            )}
            {testResult === 'error' && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center text-red-400 font-medium"><XCircle size={18} className="mr-2"/> Falha na conexão</motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 flex items-center justify-between gap-5">
          <div>
            <div className="font-medium text-zinc-200">Animações de interface</div>
            <p className="mt-1 text-xs text-zinc-500">Cards, abertura de empresa, Chat e campos digitando. Preferência salva automaticamente.</p>
          </div>
          <button
            onClick={toggleOpenAnimation}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${settings.animateOnOpen === false ? 'bg-zinc-700' : 'bg-blue-600'}`}
            aria-label="Alternar animação ao abrir empresa"
          >
            <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.animateOnOpen === false ? 'translate-x-0' : 'translate-x-5'}`} />
          </button>
        </div>
      </div>

      <div className="space-y-6 mt-8 bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800 relative overflow-hidden">
        <h2 className="text-xl font-semibold border-b border-zinc-800 pb-2 flex items-center gap-2">
           <FileText size={20} className="text-emerald-400"/> Sincronização de Pastas (DOCX)
        </h2>
        
        <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">
          Selecione a raiz da pasta de documentos. No Electron, a leitura é nativa e aceita somente <code className="bg-zinc-950 text-blue-400 px-1.5 py-0.5 rounded border border-zinc-800">.docx</code>, <code className="bg-zinc-950 text-blue-400 px-1.5 py-0.5 rounded border border-zinc-800">.xlsx</code>, <code className="bg-zinc-950 text-blue-400 px-1.5 py-0.5 rounded border border-zinc-800">.pdf</code>, <code className="bg-zinc-950 text-blue-400 px-1.5 py-0.5 rounded border border-zinc-800">.csv</code>, <code className="bg-zinc-950 text-blue-400 px-1.5 py-0.5 rounded border border-zinc-800">.txt</code> e <code className="bg-zinc-950 text-blue-400 px-1.5 py-0.5 rounded border border-zinc-800">.md</code>.
          <br/><strong className="text-yellow-400 font-medium mt-1 inline-block">Arquivos originais nunca são modificados. Arquivos de mídia e executáveis não são enumerados nem baixados.</strong>
        </p>

        <button 
          onClick={handleSync}
          disabled={isSyncing}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-medium transition-colors disabled:opacity-50 relative z-10"
        >
          <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} /> 
          Selecionar Pasta e Iniciar Sincronização
        </button>

        {/* Sync Progress UI */}
        <AnimatePresence>
          {syncProgress.status !== 'idle' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 bg-zinc-950 p-6 rounded-xl border border-zinc-800 flex flex-col gap-4"
            >
              <div className="flex justify-between items-end mb-1 text-sm font-medium">
                <span className={
                  syncProgress.status === 'error' ? 'text-red-400' :
                  syncProgress.status === 'done' ? 'text-emerald-400' :
                  'text-blue-400'
                }>{syncProgress.message}</span>
                {syncProgress.totalFiles > 0 && (
                  <span className="text-zinc-500 font-mono bg-zinc-900 px-2 py-1 rounded">
                    {syncProgress.processedFiles} / {syncProgress.totalFiles} Docs
                  </span>
                )}
              </div>
              
              {/* Progress Bar */}
              {syncProgress.totalFiles > 0 && (
                <div className="w-full bg-zinc-900 rounded-full h-3 border border-zinc-800 overflow-hidden relative">
                  <motion.div 
                    className="h-full bg-blue-500" 
                    initial={{ width: 0 }}
                    animate={{ width: `${(syncProgress.processedFiles / syncProgress.totalFiles) * 100}%` }}
                    transition={{ ease: "easeOut" }}
                  />
                </div>
              )}
              {syncProgress.status === 'scanning' && syncProgress.totalFiles === 0 && (
                <div className="w-full bg-zinc-900 rounded-full h-3 border border-zinc-800 overflow-hidden">
                  <div className="h-full w-1/3 bg-blue-500 animate-[pulse_1s_ease-in-out_infinite]" />
                </div>
              )}
              
              {(syncProgress.status === 'scanning' || syncProgress.status === 'processing') && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2 border-t border-zinc-800 pt-4">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Empresa Atual</div>
                    <div className="text-sm text-zinc-300 font-medium truncate">{syncProgress.currentCompany || '...'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Passo Atual</div>
                    <div className="text-sm text-zinc-300 font-medium">{syncProgress.status === 'scanning' ? 'Mapeando árvores de pastas' : 'Extraindo texto DOCX'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Tempo decorrido</div>
                    <div className="text-sm text-zinc-300 font-medium font-mono">{Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:{(elapsedSeconds % 60).toString().padStart(2, '0')}</div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
