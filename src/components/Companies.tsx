import React, { useState, useEffect, useRef } from 'react';
import { Database, FileText, Clock, Server, Network, Wifi, Shield, Globe, Lock, Loader2, Maximize2, Save, Router, Briefcase, ChevronRight, ArrowLeft, CheckCircle, RefreshCw, Plus, Trash2, HardDrive, Files } from 'lucide-react';
import { store, CompanyData, FileInfo, NormalizedInfraData, InfraEmpresa, InfraServidor, InfraInternet, InfraFirewall, InfraSwitch, InfraVlan, InfraWifi, InfraEquipamento, InfraBackup, InfraRevisao } from '../lib/store';
import { mergeNormalizedData, normalizeInfraData } from '../lib/ollama';
import { motion } from 'motion/react';
import { TopologyMap } from './TopologyMap';

const isSupportedDocument = (file: FileInfo) => /\.(docx|xlsx|csv|txt|md|pdf)$/i.test(file.relativePath || file.name);
const fileIdentity = (file: FileInfo) => file.relativePath || file.name;

export function Companies() {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null);
  // null = acervo inteiro; array = seleção explícita de um ou mais arquivos.
  const [selectedFileIds, setSelectedFileIds] = useState<string[] | null>(null);
  const [normalizingMap, setNormalizingMap] = useState<Record<string, boolean>>({});
  
  const [editedData, setEditedData] = useState<NormalizedInfraData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showTopologyMap, setShowTopologyMap] = useState(false);
  const [activeHighlightField, setActiveHighlightField] = useState<string | null>(null);
  const [analysisLogs, setAnalysisLogs] = useState<Array<{ id: string; label: string; status: 'active' | 'done' }>>([]);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [showStopDialog, setShowStopDialog] = useState(false);
  const stopModeRef = useRef<'preserve' | 'discard' | null>(null);
  const normalizationAbortRef = useRef<AbortController | null>(null);
  const normalizationRunningRef = useRef(false);
  const normalizationModelRef = useRef('');
  const detailsScrollRef = useRef<HTMLDivElement | null>(null);
  const lastAnimatedCompanyRef = useRef<string>('');
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  useEffect(() => {
    loadCompanies();
    store.getSettings().then(settings => setAnimationsEnabled(settings.animateOnOpen !== false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (selectedCompany) {
      if (selectedCompany.normalizedData) {
        const key = `${selectedCompany.company}:${selectedCompany.syncedAt}`;
        store.getSettings().then(async settings => {
          if (cancelled) return;
          if (settings.animateOnOpen !== false && lastAnimatedCompanyRef.current !== key) {
            lastAnimatedCompanyRef.current = key;
            await animateJsonFields(JSON.parse(JSON.stringify(selectedCompany.normalizedData)), () => {}, true);
          } else {
            setEditedData(JSON.parse(JSON.stringify(selectedCompany.normalizedData)));
          }
        });
      } else {
        setEditedData({});
      }
    } else {
      setEditedData(null);
    }
    return () => { cancelled = true; };
  }, [selectedCompany]);

  const loadCompanies = async () => {
    setIsLoading(true);
    const data = await store.getAllCompanies();
    setCompanies(data);
    if (selectedCompany) {
      const updated = data.find(c => c.company === selectedCompany.company);
      if (updated) setSelectedCompany(updated);
    }
    setIsLoading(false);
  };

  const animateJsonFields = async (fullJson: any, onField: (label: string) => void, shouldScroll = true) => {
    // Initial empty state to display the form sections right away
    const emptyState = {
      empresa: {},
      servidores: [],
      internet: [],
      firewall: [],
      switches: [],
      vlans: [],
      wifi: [],
      equipamentos: [],
      backup: {},
      revisoes: [],
      descobertas: []
    } as any;

    setEditedData(emptyState);
    await new Promise(r => setTimeout(r, 100)); // wait for react to render

    const currentData = { ...emptyState };
    const sections = ['empresa', 'backup', 'servidores', 'internet', 'firewall', 'switches', 'vlans', 'wifi', 'equipamentos', 'revisoes', 'descobertas'];
    
    for (const section of sections) {
      if (!fullJson[section]) continue;

      if (Array.isArray(fullJson[section])) {
        if (fullJson[section].length > 0) {
          currentData[section] = [];
          for (let idx = 0; idx < fullJson[section].length; idx++) {
            const item = fullJson[section][idx];
            currentData[section].push({});
            setEditedData({ ...currentData });
            await new Promise(r => setTimeout(r, 50));

            for (const key of Object.keys(item)) {
              if (item[key] === null || item[key] === undefined || item[key] === '') continue; // skip empties
              
              const fieldId = `${section}-${idx}-${key}`;
              setActiveHighlightField(fieldId);
              if (shouldScroll) document.getElementById(fieldId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              onField(`Preenchendo ${key.replaceAll('_', ' ')}...`);
              const value = String(item[key]);
              const step = Math.max(1, Math.ceil(value.length / 14));
              for (let count = step; count < value.length; count += step) {
                currentData[section][idx][key] = `${value.slice(0, count)}▍`;
                setEditedData({ ...currentData });
                await new Promise(r => setTimeout(r, 14));
              }
              currentData[section][idx][key] = value;
              setEditedData({ ...currentData });
              await new Promise(r => setTimeout(r, 70));
            }
          }
        }
      } else {
        // Object
        if (Object.keys(fullJson[section]).length > 0) {
          currentData[section] = {};
          for (const key of Object.keys(fullJson[section])) {
             if (fullJson[section][key] === null || fullJson[section][key] === undefined || fullJson[section][key] === '') continue;
             
             const fieldId = `${section}-${key}`;
             setActiveHighlightField(fieldId);
             if (shouldScroll) document.getElementById(fieldId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
             
             onField(`Preenchendo ${key.replaceAll('_', ' ')}...`);
             const value = String(fullJson[section][key]);
             const step = Math.max(1, Math.ceil(value.length / 14));
             for (let count = step; count < value.length; count += step) {
               currentData[section][key] = `${value.slice(0, count)}▍`;
               setEditedData({ ...currentData });
               await new Promise(r => setTimeout(r, 14));
             }
             currentData[section][key] = value;
             setEditedData({ ...currentData });
             await new Promise(r => setTimeout(r, 70));
          }
        }
      }
    }
    
    setActiveHighlightField(null);
    setEditedData(fullJson); // Lock exact match
  };

  const handleNormalize = async (company: CompanyData, forcedFile?: string, retryMode?: '5m' | 'unlimited') => {
    if (normalizationRunningRef.current) return;
    normalizationRunningRef.current = true;
    try {
      stopModeRef.current = null;
      setNormalizingMap(prev => ({ ...prev, [company.company]: true }));
      setAnalysisLogs([
        { id: 'sources', label: 'Validando fontes selecionadas', status: 'active' },
        { id: 'model', label: 'Aguardando processamento do modelo local', status: 'active' },
        { id: 'fields', label: 'Preparando visualização dos campos', status: 'active' },
      ]);
      const settings = await store.getSettings();
      normalizationModelRef.current = settings.provider === 'groq' ? '' : settings.ollamaModel;
      
      const requestedIds = forcedFile ? [forcedFile] : selectedFileIds;
      const supportedFiles = (company.files || []).filter(isSupportedDocument);
      const sourceCandidates = requestedIds === null ? supportedFiles : supportedFiles.filter(file => requestedIds.includes(fileIdentity(file)));
      const retriedIds = new Set(requestedIds || supportedFiles.map(fileIdentity));
      const issues: Array<{ fileName: string; reason: string }> = [
        ...(company.analysisIssues || []).filter(issue => !retriedIds.has(issue.fileName)),
        ...sourceCandidates
        .filter(file => !file.content || file.status === 'error')
        .map(file => ({ fileName: fileIdentity(file), reason: file.status === 'error' ? (file.extractionError || 'Falha na extração') : 'Arquivo sem texto extraído' }))
      ];
      let selectedSources = sourceCandidates.filter(file => file.content && file.status !== 'error');
      if (selectedSources.length === 0) {
        if (!company.files?.length && company.content.trim()) {
          selectedSources = [{ name: 'Acervo da empresa', sizeKb: 0, content: company.content }];
        } else {
          const updatedCompany = { ...company, analysisIssues: issues.length ? issues : [{ fileName: 'Seleção', reason: 'Nenhum arquivo selecionado possui texto extraído' }] };
          await store.saveCompany(updatedCompany);
          setCompanies(prev => prev.map(c => c.company === company.company ? updatedCompany : c));
          if (selectedCompany?.company === company.company) setSelectedCompany(updatedCompany);
          return;
        }
      }
      // Começar pelos menores preserva resultados úteis mesmo se um documento pesado exceder o limite.
      selectedSources = [...selectedSources].sort((a, b) => (a.sizeKb - b.sizeKb) || ((a.content?.length || 0) - (b.content?.length || 0)));

      setAnalysisProgress({ current: 0, total: selectedSources.length, currentFile: '' });

      setAnalysisLogs(prev => prev.map(item => item.id === 'sources' ? {
        ...item,
        label: selectedSources.length === 1 ? '1 fonte selecionada para análise' : `${selectedSources.length} fontes selecionadas — menor para maior`,
        status: 'done'
      } : item));

      const normalizedDocuments = company.normalizedData ? [company.normalizedData] : [];
      let completedSources = 0;
      for (let index = 0; index < selectedSources.length; index++) {
        if (stopModeRef.current) break;
        const source = selectedSources[index];
        setAnalysisProgress({ current: index + 1, total: selectedSources.length, currentFile: source.name });
        setAnalysisLogs(prev => prev.map(item => item.id === 'model' ? { ...item, label: `${settings.provider === 'groq' ? 'Groq' : 'Ollama'} · ${index + 1}/${selectedSources.length}: ${source.name}`, status: 'active' } : item));
        const controller = new AbortController();
        normalizationAbortRef.current = controller;
        const maxWaitMs = retryMode === 'unlimited' ? null : retryMode === '5m' || settings.provider === 'groq' ? 300_000 : 90_000;
        let timedOut = false;
        const timeout = maxWaitMs ? window.setTimeout(() => { timedOut = true; controller.abort(); }, maxWaitMs) : null;
        try {
          normalizedDocuments.push(await normalizeInfraData(settings.ollamaUrl, settings.ollamaModel, source.content!, fileIdentity(source), controller.signal));
          completedSources += 1;
        } catch (error) {
          if (stopModeRef.current) break;
          issues.push({ fileName: fileIdentity(source), reason: timedOut ? `Tempo máximo de ${maxWaitMs! / 1_000} segundos excedido` : error instanceof Error ? error.message : 'Falha ao processar este documento' });
          setAnalysisLogs(prev => prev.map(item => item.id === 'model' ? { ...item, label: `Ignorado: ${source.name} (${timedOut ? 'tempo excedido' : 'erro'})`, status: 'active' } : item));
        } finally {
          if (timeout) window.clearTimeout(timeout);
          normalizationAbortRef.current = null;
        }
        if (completedSources > 0) {
          const checkpoint = { ...company, normalizedData: mergeNormalizedData(normalizedDocuments), normalizedStatus: 'ai' as const, analysisIssues: issues };
          await store.saveCompany(checkpoint);
        }
      }
      if (stopModeRef.current === 'discard') {
        await store.saveCompany(company);
        return;
      }
      if (completedSources === 0 && !company.normalizedData) {
        const unresolvedIssues = issues.length ? issues : [{ fileName: selectedSources[0]?.name || 'Documento', reason: stopModeRef.current ? 'Análise interrompida pelo usuário' : 'Não foi possível concluir a leitura' }];
        const updatedCompany = { ...company, analysisIssues: unresolvedIssues };
        await store.saveCompany(updatedCompany);
        setCompanies(prev => prev.map(c => c.company === company.company ? updatedCompany : c));
        if (selectedCompany?.company === company.company) setSelectedCompany(updatedCompany);
        return;
      }
      setAnalysisProgress({ current: selectedSources.length, total: selectedSources.length, currentFile: 'Consolidação dos dados concluída' });
      const normalizedJson = mergeNormalizedData(normalizedDocuments);
      setAnalysisLogs(prev => prev.map(item => item.id === 'model' ? { ...item, label: `${completedSources}/${selectedSources.length} documentos concluídos e consolidados`, status: 'done' } : item));
      await animateJsonFields(normalizedJson, (label) => {
        setAnalysisLogs(prev => prev.map(item => item.id === 'fields' ? { ...item, label } : item));
      });
      detailsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      lastAnimatedCompanyRef.current = `${company.company}:${company.syncedAt}`;
      setAnalysisLogs(prev => prev.map(item => item.id === 'fields' ? { ...item, label: 'Campos prontos para revisão', status: 'done' } : item));
      
      const updatedCompany = { ...company, normalizedData: normalizedJson, normalizedStatus: 'ai' as const, analysisIssues: issues };
      await store.saveCompany(updatedCompany);
      
      setCompanies(prev => prev.map(c => c.company === company.company ? updatedCompany : c));
      if (selectedCompany?.company === company.company) {
        setSelectedCompany(updatedCompany);
      }
      
    } catch (err: any) {
      const updatedCompany = { ...company, analysisIssues: [{ fileName: 'Execução', reason: err?.message || 'Erro inesperado na análise' }] };
      await store.saveCompany(updatedCompany);
      setCompanies(prev => prev.map(c => c.company === company.company ? updatedCompany : c));
      if (selectedCompany?.company === company.company) setSelectedCompany(updatedCompany);
    } finally {
      normalizationRunningRef.current = false;
      setNormalizingMap(prev => ({ ...prev, [company.company]: false }));
    }
  };

  const stopNormalization = (mode: 'preserve' | 'discard') => {
    stopModeRef.current = mode;
    normalizationAbortRef.current?.abort();
    if (normalizationModelRef.current) void window.documentManager?.stopOllama(normalizationModelRef.current);
    setShowStopDialog(false);
  };

  const resetAnalysis = async () => {
    if (!selectedCompany || !confirm('Limpar somente os dados analisados? Os arquivos originais permanecem intactos.')) return;
    const updated = { ...selectedCompany, normalizedData: undefined, normalizedStatus: undefined, analysisIssues: undefined };
    await store.saveCompany(updated);
    setSelectedCompany(updated);
    setCompanies(prev => prev.map(company => company.company === updated.company ? updated : company));
  };

  const handleSaveData = async () => {
    if (!selectedCompany || !editedData) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const updatedCompany = { ...selectedCompany, normalizedData: editedData };
      await store.saveCompany(updatedCompany);
      setSelectedCompany(updatedCompany);
      setCompanies(prev => prev.map(c => c.company === selectedCompany.company ? updatedCompany : c));
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 1_800);
    } catch (e) {
      alert("Erro ao salvar os dados");
    } finally {
      setIsSaving(false);
    }
  };

  const updateEmpresaObj = (field: keyof InfraEmpresa, value: string) => {
    setEditedData(prev => {
      if (!prev) return prev;
      return { ...prev, empresa: { ...prev.empresa, [field]: value } as InfraEmpresa };
    });
  };

  const updateBackupObj = (field: keyof InfraBackup, value: string) => {
    setEditedData(prev => {
      if (!prev) return prev;
      return { ...prev, backup: { ...prev.backup, [field]: value } as InfraBackup };
    });
  };

  const handleArrayUpdate = (arrayName: keyof NormalizedInfraData, index: number, field: string, value: string) => {
    setEditedData(prev => {
      if (!prev) return prev;
      const arr = [...(prev[arrayName] as any[] || [])];
      arr[index] = { ...arr[index], [field]: value };
      return { ...prev, [arrayName]: arr };
    });
  };

  const handleAddArrayItem = (arrayName: keyof NormalizedInfraData, defaultObj: any) => {
    setEditedData(prev => {
      if (!prev) return prev;
      const arr = [...(prev[arrayName] as any[] || [])];
      arr.push(defaultObj);
      return { ...prev, [arrayName]: arr };
    });
  };

  const handleRemoveArrayItem = (arrayName: keyof NormalizedInfraData, index: number) => {
    if(!confirm("Atenção, deseja deletar este item?")) return;
    setEditedData(prev => {
      if (!prev) return prev;
      const arr = [...(prev[arrayName] as any[] || [])];
      arr.splice(index, 1);
      return { ...prev, [arrayName]: arr };
    });
  };

  const visibleFiles = selectedCompany?.files?.filter(isSupportedDocument);

  return (
    <div className="flex flex-col h-full w-full bg-[#09090b] text-zinc-100 relative">
      
      {!selectedCompany ? (
        <div className="flex-1 overflow-y-auto p-10 scroll-smooth">
          <div className="max-w-[1200px] mx-auto pb-16">
            <div className="flex justify-between items-center mb-8 pb-6 border-b border-white/5">
              <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
                <Database className="text-blue-500" /> Empresas Sincronizadas
              </h1>
              <button onClick={loadCompanies} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors rounded-xl text-zinc-300 font-medium px-4 py-2.5 flex items-center gap-2 text-sm">
                 <RefreshCw size={16} /> Atualizar
              </button>
            </div>
            
            {isLoading ? (
              <div className="text-center text-zinc-500 py-20 flex flex-col items-center">
                <Loader2 className="animate-spin mb-4 text-blue-500" size={32}/>
                <p className="text-lg">Carregando acervo de empresas...</p>
              </div>
            ) : companies.length === 0 ? (
              <div className="text-center text-zinc-500 py-20 border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/30">
                <Briefcase size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">Nenhuma empresa mapeada ainda.</p>
                <p className="text-sm">Vá até as Configurações e faça a sincronização de uma pasta local.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {companies.map((comp, index) => (
                  <motion.div
                    key={comp.company}
                    onClick={() => { setSelectedFileIds(null); setSelectedCompany(comp); }}
                    initial={animationsEnabled ? { opacity: 0, y: 18, scale: 0.985 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.28, delay: Math.min(index * 0.045, 0.5), ease: 'easeOut' }}
                    className="bg-[#111114] border border-white/5 hover:border-blue-500/30 hover:bg-[#15151a] p-6 rounded-3xl cursor-pointer transition-all shadow-lg hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] group flex flex-col h-full relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                    <div className="flex items-start justify-between mb-6 relative z-10">
                      <div className="flex flex-col">
                        <span className="font-bold text-xl tracking-tight text-white mb-1 group-hover:text-blue-400 transition-colors">{comp.company}</span>
                        <span className="text-sm text-zinc-500 flex items-center gap-1.5"><Clock size={14}/> Sinc: {new Date(comp.syncedAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                      {comp.normalizedData && <CheckCircle size={20} className="text-emerald-500 shrink-0"/>}
                    </div>
                    
                    <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-4 text-xs font-medium text-zinc-400">
                        <span className="flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded-md"><Files size={14} className="text-zinc-500" /> {comp.files ? comp.files.filter(isSupportedDocument).length : 1} docs</span>
                        <span className="flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded-md"><Database size={14} className="text-zinc-500" /> {(comp.content.length / 1024).toFixed(0)} KB</span>
                      </div>
                      <ChevronRight size={18} className="text-zinc-600 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div ref={detailsScrollRef} className="flex-1 overflow-y-auto scroll-smooth bg-[#09090b]">
          <div className="p-8 max-w-[1400px] mx-auto pb-[15vh]">
            
            <button 
              onClick={() => setSelectedCompany(null)} 
              className="text-zinc-400 hover:text-white flex items-center gap-2 mb-6 transition-colors font-medium hover:bg-zinc-900 px-3 py-1.5 rounded-lg w-fit group"
            >
              <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Voltar para lista
            </button>

            <div className="flex items-start justify-between flex-wrap gap-4 pb-8 mb-8 border-b border-white/5">
              <div>
                <h2 className="text-5xl font-black tracking-tight text-white mb-4">{selectedCompany.company}</h2>
                <div className="flex items-center gap-4 text-sm font-medium">
                  <span className="flex items-center gap-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg"><Clock size={16}/> {new Date(selectedCompany.syncedAt).toLocaleString('pt-BR')}</span>
                  <span className="flex items-center gap-2 bg-zinc-900 text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-lg"><Database size={16} className="text-zinc-500"/> {selectedCompany.content.length.toLocaleString()} caracteres extraídos</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowPrintModal(true)}
                  className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 px-5 py-3.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-zinc-800 shadow-sm"
                >
                  <FileText size={18} className="text-zinc-400" /> Relatório PDF
                </button>
                {(editedData || selectedCompany.normalizedData) && <button onClick={() => setShowTopologyMap(true)} className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 px-5 py-3.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-zinc-800 shadow-sm"><Network size={18} className="text-blue-400" /> Mapa visual</button>}
                <button 
                  onClick={() => handleNormalize(selectedCompany)}
                  disabled={normalizingMap[selectedCompany.company]}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white px-6 py-3.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-blue-500/20"
                >
                  {normalizingMap[selectedCompany.company] ? (
                    <><Loader2 size={18} className="animate-spin text-white" /> Analisando contexto...</>
                  ) : (
                    <><Maximize2 size={18} /> {selectedFileIds === null ? 'Extrair Contexto Acervo Inteiro' : `Extrair ${selectedFileIds.length} Arquivo${selectedFileIds.length === 1 ? '' : 's'}`}</>
                  )}
                </button>
                {normalizingMap[selectedCompany.company] && (
                  <button onClick={() => setShowStopDialog(true)} className="bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 px-5 py-3.5 rounded-xl text-sm font-bold transition-colors">
                    Parar análise
                  </button>
                )}
                {(editedData && Object.keys(editedData).length > 0) && (
                  <button 
                    onClick={handleSaveData}
                    disabled={isSaving || normalizingMap[selectedCompany.company]}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-3.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/20"
                  >
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : saveSuccess ? <CheckCircle size={18} className="animate-in zoom-in duration-200" /> : <Save size={18} />}
                    {isSaving ? 'Salvando...' : saveSuccess ? 'Salvo localmente' : 'Salvar Localmente'}
                  </button>
                )}
                {selectedCompany.normalizedData && !normalizingMap[selectedCompany.company] && (
                  <button onClick={resetAnalysis} className="p-3.5 rounded-xl border border-zinc-800 text-zinc-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 transition-colors" title="Limpar análise anterior">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>

            {selectedCompany.analysisIssues && selectedCompany.analysisIssues.length > 0 && (
              <div className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm text-amber-100">
                <strong>{selectedCompany.analysisIssues.length} documento(s) não concluído(s):</strong>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {selectedCompany.analysisIssues.map(item => {
                    const retryable = selectedCompany.files?.some(file => fileIdentity(file) === item.fileName);
                    return (
                      <div key={item.fileName} className="flex max-w-full items-center gap-2 rounded-lg border border-amber-500/20 bg-black/10 px-2 py-1.5 text-xs">
                        <span className="max-w-72 truncate text-amber-100" title={`${item.fileName} — ${item.reason}`}>{item.fileName}</span>
                        <span className="hidden text-amber-300/60 lg:inline">{item.reason}</span>
                        {retryable && <>
                          <button disabled={!!normalizingMap[selectedCompany.company]} onClick={() => handleNormalize(selectedCompany, item.fileName, '5m')} className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">5 min</button>
                          <button disabled={!!normalizingMap[selectedCompany.company]} onClick={() => handleNormalize(selectedCompany, item.fileName, 'unlimited')} className="rounded-md bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">Sem limite</button>
                        </>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Layout dividido da tela igual ao screenshot */}
            <div className="flex flex-col lg:flex-row gap-8 mb-12">
              <div className="flex-1 bg-[#111114] border border-white/5 shadow-2xl rounded-3xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-3">
                    <Files className="text-blue-500" size={24}/> Arquivos Originais Lidos
                  </h3>
                  
                  {visibleFiles && visibleFiles.length > 1 && (
                     <button 
                       disabled={!!normalizingMap[selectedCompany.company]}
                       onClick={() => setSelectedFileIds(null)}
                       className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border disabled:cursor-not-allowed disabled:opacity-50 ${selectedFileIds === null ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-transparent text-zinc-400 hover:text-white border-zinc-800'}`}
                     >
                       {selectedFileIds === null ? 'Todos selecionados' : `Selecionar todos (${visibleFiles.length})`}
                     </button>
                  )}
                </div>

                {visibleFiles && visibleFiles.length > 1 && (
                   <p className="text-[13px] text-zinc-500 font-medium mb-4">Clique no card do arquivo que deseja extrair dados isoladamente ou deixe todos selecionados.</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visibleFiles ? visibleFiles.map((file, i) => (
                    <div 
                      key={fileIdentity(file)} 
                      onClick={() => !normalizingMap[selectedCompany.company] && setSelectedFileIds(previous => {
                        const id = fileIdentity(file);
                        if (previous === null) return [id];
                        return previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id];
                      })}
                      className={`flex flex-col p-5 rounded-2xl border transition-all ${!normalizingMap[selectedCompany.company] ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'} ${selectedFileIds === null || selectedFileIds.includes(fileIdentity(file)) ? 'bg-blue-500/10 border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'bg-transparent border-white/5 hover:bg-white/5'}`}
                    >
                      <div className="flex items-start justify-between w-full mb-3">
                        <div className={`p-2.5 rounded-xl shrink-0 ${selectedFileIds === null || selectedFileIds.includes(fileIdentity(file)) ? 'bg-blue-500/20' : 'bg-zinc-800'}`}>
                          <FileText size={20} className={selectedFileIds === null || selectedFileIds.includes(fileIdentity(file)) ? 'text-blue-400' : 'text-zinc-400'}/>
                        </div>
                        <span className="text-xs text-zinc-500 font-mono bg-zinc-900 px-2 py-1.5 rounded border border-zinc-800">
                          {file.sizeKb ? file.sizeKb.toFixed(1) : '---'} KB
                        </span>
                      </div>
                      <span className={`text-sm font-medium line-clamp-2 mt-auto leading-relaxed ${selectedFileIds === null || selectedFileIds.includes(fileIdentity(file)) ? 'text-white' : 'text-zinc-300'}`}>
                        {file.name}
                      </span>
                    </div>
                  )) : selectedCompany.filename.split(',').map((name, i) => (
                    <div key={i} className="flex flex-col p-5 rounded-2xl border border-white/5 bg-[#161619]">
                      <div className="p-2.5 bg-zinc-800 rounded-xl w-fit mb-3">
                        <FileText size={20} className="text-zinc-400"/>
                      </div>
                      <span className="text-sm font-medium text-zinc-300 line-clamp-2">{name.trim()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full lg:w-[420px] shrink-0 bg-[#0f0f11] border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                {normalizingMap[selectedCompany.company] ? (
                  <div className="relative z-10 flex h-full flex-col">
                    <div className="mb-7 flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 ring-1 ring-blue-500/30"><Loader2 size={21} className="animate-spin text-blue-400" /></div>
                      <div><h3 className="font-bold text-white">Análise ao vivo</h3><p className="text-xs text-blue-300">Processamento em execução</p></div>
                    </div>
                    <div className="space-y-3">
                      {analysisLogs.map(log => (
                        <div key={log.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.025] p-3 transition-all">
                          {log.status === 'done' ? <CheckCircle size={17} className="mt-0.5 shrink-0 text-emerald-400" /> : <Loader2 size={17} className="mt-0.5 shrink-0 animate-spin text-blue-400" />}
                          <span className={`text-sm leading-snug ${log.status === 'done' ? 'text-zinc-300' : 'text-white'}`}>{log.label}</span>
                        </div>
                      ))}
                    </div>
                    {analysisProgress.total > 0 && (
                      <div className="mt-5 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] p-4">
                        <div className="mb-2 flex items-center justify-between text-xs font-medium">
                          <span className="text-blue-300">Processando documento {analysisProgress.current}/{analysisProgress.total}</span>
                          <span className="font-mono text-zinc-500">em andamento</span>
                        </div>
                        <p className="truncate text-sm text-zinc-200" title={analysisProgress.currentFile}>{analysisProgress.currentFile}</p>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                          <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.max(12, ((analysisProgress.current - 1) / analysisProgress.total) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                    <div className="mt-auto pt-7">
                      <p className="mt-3 text-xs leading-relaxed text-zinc-500">Os valores aparecem somente quando forem identificados nas fontes selecionadas.</p>
                    </div>
                  </div>
                ) : <>
                  <h3 className="text-xl font-bold text-white mb-6 tracking-tight relative z-10">Sobre o Processamento</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-8 flex-1 relative z-10">
                    Os arquivos exibidos foram lidos localmente, em modo <strong className="text-zinc-200 font-mono text-xs bg-zinc-800 px-1.5 py-0.5 rounded">Read-Only</strong>. Nenhum original é modificado durante a análise.
                  </p>
                  <div className="bg-emerald-950/40 text-emerald-400 border border-emerald-900/50 px-4 py-4 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 mt-auto relative z-10 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                     <Shield size={16}/> Leitura 100% Segura Local
                  </div>
                </>}
              </div>
            </div>

            {/* Renderizar campos de edição se houver dados extraídos (editedData não vazio) */}
            {(editedData && Object.keys(editedData).length > 0) && (
              <div className="grid gap-8 pb-10">
              {/* Geral Section */}
              <div className="bg-[#0c0c0e] border border-white/5 shadow-xl rounded-3xl p-8">
                <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-6">
                  <div className="p-2.5 bg-blue-500/10 rounded-xl"><Briefcase className="text-blue-500" size={20}/></div>
                  Empresa / Geral
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <InputField activeHighlightField={activeHighlightField} fieldPath="empresa-nome" label="Nome" value={editedData.empresa?.nome} onChange={v => updateEmpresaObj('nome', v)} />
                  <InputField activeHighlightField={activeHighlightField} fieldPath="empresa-unidade" label="Unidade/filial" value={editedData.empresa?.unidade} onChange={v => updateEmpresaObj('unidade', v)} />
                  <InputField activeHighlightField={activeHighlightField} fieldPath="empresa-codigo_documento" label="Código do documento" value={editedData.empresa?.codigo_documento} onChange={v => updateEmpresaObj('codigo_documento', v)} />
                  <InputField activeHighlightField={activeHighlightField} fieldPath="empresa-data_revisao" label="Data da última revisão" value={editedData.empresa?.data_revisao} onChange={v => updateEmpresaObj('data_revisao', v)} />
                  <InputField activeHighlightField={activeHighlightField} fieldPath="empresa-responsavel" label="Responsável" value={editedData.empresa?.responsavel} onChange={v => updateEmpresaObj('responsavel', v)} />
                  <div className="lg:col-span-3">
                    <TextAreaField activeHighlightField={activeHighlightField} fieldPath="empresa-observacoes" label="Observações gerais" value={editedData.empresa?.observacoes} onChange={v => updateEmpresaObj('observacoes', v)} />
                  </div>
                </div>
              </div>

              {/* Servidores */}
              <ArraySection 
                title="Servidores" 
                icon={<Server className="text-emerald-500" size={20}/>}
                iconContainerClass="bg-emerald-500/10"
                items={editedData.servidores}
                defaultItem={{ hostname: '', so: '', ip: '', funcoes: '', acesso_remoto: '', id_acesso: '', discos: '', observacoes: '' }}
                onAdd={(def: any) => handleAddArrayItem('servidores', def)}
                onRemove={(idx: number) => handleRemoveArrayItem('servidores', idx)}
                renderItem={(item: any, idx: number) => (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`servidores-${idx}-hostname`} label="Nome/hostname" value={item.hostname} onChange={v => handleArrayUpdate('servidores', idx, 'hostname', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`servidores-${idx}-so`} label="Sistema operacional" value={item.so} onChange={v => handleArrayUpdate('servidores', idx, 'so', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`servidores-${idx}-ip`} label="IP" value={item.ip} onChange={v => handleArrayUpdate('servidores', idx, 'ip', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`servidores-${idx}-funcoes`} label="Funções (AD, DNS...)" value={item.funcoes} onChange={v => handleArrayUpdate('servidores', idx, 'funcoes', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`servidores-${idx}-acesso_remoto`} label="Acesso remoto" value={item.acesso_remoto} onChange={v => handleArrayUpdate('servidores', idx, 'acesso_remoto', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`servidores-${idx}-id_acesso`} label="ID AnyDesk/RustDesk" value={item.id_acesso} onChange={v => handleArrayUpdate('servidores', idx, 'id_acesso', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`servidores-${idx}-discos`} label="Discos/unidades" value={item.discos} onChange={v => handleArrayUpdate('servidores', idx, 'discos', v)} />
                    <div className="lg:col-span-2">
                       <InputField activeHighlightField={activeHighlightField} fieldPath={`servidores-${idx}-observacoes`} label="Observações" value={item.observacoes} onChange={v => handleArrayUpdate('servidores', idx, 'observacoes', v)} />
                    </div>
                  </div>
                )}
              />

              {/* Internet */}
              <ArraySection 
                title="Internet / Provedores" 
                icon={<Globe className="text-cyan-500" size={20}/>}
                iconContainerClass="bg-cyan-500/10"
                items={editedData.internet}
                defaultItem={{ provedor: '', velocidade: '', tipo_ip: '', ip_publico: '', mascara: '', gateway: '', dns_primario: '', dns_secundario: '', ip_modem: '', observacoes: '' }}
                onAdd={(def: any) => handleAddArrayItem('internet', def)}
                onRemove={(idx: number) => handleRemoveArrayItem('internet', idx)}
                renderItem={(item: any, idx: number) => (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`internet-${idx}-provedor`} label="Provedor" value={item.provedor} onChange={v => handleArrayUpdate('internet', idx, 'provedor', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`internet-${idx}-velocidade`} label="Velocidade" value={item.velocidade} onChange={v => handleArrayUpdate('internet', idx, 'velocidade', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`internet-${idx}-tipo_ip`} label="Tipo de IP" value={item.tipo_ip} onChange={v => handleArrayUpdate('internet', idx, 'tipo_ip', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`internet-${idx}-ip_publico`} label="IP público" value={item.ip_publico} onChange={v => handleArrayUpdate('internet', idx, 'ip_publico', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`internet-${idx}-mascara`} label="Máscara" value={item.mascara} onChange={v => handleArrayUpdate('internet', idx, 'mascara', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`internet-${idx}-gateway`} label="Gateway" value={item.gateway} onChange={v => handleArrayUpdate('internet', idx, 'gateway', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`internet-${idx}-dns_primario`} label="DNS primário" value={item.dns_primario} onChange={v => handleArrayUpdate('internet', idx, 'dns_primario', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`internet-${idx}-dns_secundario`} label="DNS secundário" value={item.dns_secundario} onChange={v => handleArrayUpdate('internet', idx, 'dns_secundario', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`internet-${idx}-ip_modem`} label="IP modem/roteador" value={item.ip_modem} onChange={v => handleArrayUpdate('internet', idx, 'ip_modem', v)} />
                    <div className="lg:col-span-3">
                       <InputField activeHighlightField={activeHighlightField} fieldPath={`internet-${idx}-observacoes`} label="Observações" value={item.observacoes} onChange={v => handleArrayUpdate('internet', idx, 'observacoes', v)} />
                    </div>
                  </div>
                )}
              />

              {/* Firewall */}
              <ArraySection 
                title="Firewall" 
                icon={<Shield className="text-red-500" size={20}/>}
                iconContainerClass="bg-red-500/10"
                items={editedData.firewall}
                defaultItem={{ fabricante_modelo: '', ip_gerenciamento: '', funcao: '', observacoes: '' }}
                onAdd={(def: any) => handleAddArrayItem('firewall', def)}
                onRemove={(idx: number) => handleRemoveArrayItem('firewall', idx)}
                renderItem={(item: any, idx: number) => (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`firewall-${idx}-fabricante_modelo`} label="Fabricante/modelo" value={item.fabricante_modelo} onChange={v => handleArrayUpdate('firewall', idx, 'fabricante_modelo', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`firewall-${idx}-ip_gerenciamento`} label="IP de gerenciamento" value={item.ip_gerenciamento} onChange={v => handleArrayUpdate('firewall', idx, 'ip_gerenciamento', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`firewall-${idx}-funcao`} label="Função" value={item.funcao} onChange={v => handleArrayUpdate('firewall', idx, 'funcao', v)} />
                    <div className="lg:col-span-3">
                       <InputField activeHighlightField={activeHighlightField} fieldPath={`firewall-${idx}-observacoes`} label="Observações" value={item.observacoes} onChange={v => handleArrayUpdate('firewall', idx, 'observacoes', v)} />
                    </div>
                  </div>
                )}
              />

              {/* Switches */}
              <ArraySection 
                title="Switches" 
                icon={<Router className="text-orange-500" size={20}/>}
                iconContainerClass="bg-orange-500/10"
                items={editedData.switches}
                defaultItem={{ fabricante_modelo: '', nome: '', ip: '', localizacao: '', observacoes: '' }}
                onAdd={(def: any) => handleAddArrayItem('switches', def)}
                onRemove={(idx: number) => handleRemoveArrayItem('switches', idx)}
                renderItem={(item: any, idx: number) => (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`switches-${idx}-fabricante_modelo`} label="Fabricante/modelo" value={item.fabricante_modelo} onChange={v => handleArrayUpdate('switches', idx, 'fabricante_modelo', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`switches-${idx}-nome`} label="Nome" value={item.nome} onChange={v => handleArrayUpdate('switches', idx, 'nome', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`switches-${idx}-ip`} label="IP" value={item.ip} onChange={v => handleArrayUpdate('switches', idx, 'ip', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`switches-${idx}-localizacao`} label="Localização" value={item.localizacao} onChange={v => handleArrayUpdate('switches', idx, 'localizacao', v)} />
                    <div className="lg:col-span-4">
                       <InputField activeHighlightField={activeHighlightField} fieldPath={`switches-${idx}-observacoes`} label="Observações" value={item.observacoes} onChange={v => handleArrayUpdate('switches', idx, 'observacoes', v)} />
                    </div>
                  </div>
                )}
              />

              {/* VLANs */}
              <ArraySection 
                title="VLANs" 
                icon={<Network className="text-purple-500" size={20}/>}
                iconContainerClass="bg-purple-500/10"
                items={editedData.vlans}
                defaultItem={{ id_vlan: '', nome: '', subnet: '', gateway: '', observacoes: '' }}
                onAdd={(def: any) => handleAddArrayItem('vlans', def)}
                onRemove={(idx: number) => handleRemoveArrayItem('vlans', idx)}
                renderItem={(item: any, idx: number) => (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`vlans-${idx}-id_vlan`} label="ID da VLAN" value={item.id_vlan} onChange={v => handleArrayUpdate('vlans', idx, 'id_vlan', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`vlans-${idx}-nome`} label="Nome" value={item.nome} onChange={v => handleArrayUpdate('vlans', idx, 'nome', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`vlans-${idx}-subnet`} label="Subnet" value={item.subnet} onChange={v => handleArrayUpdate('vlans', idx, 'subnet', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`vlans-${idx}-gateway`} label="Gateway/router" value={item.gateway} onChange={v => handleArrayUpdate('vlans', idx, 'gateway', v)} />
                    <div className="lg:col-span-4">
                       <InputField activeHighlightField={activeHighlightField} fieldPath={`vlans-${idx}-observacoes`} label="Observações" value={item.observacoes} onChange={v => handleArrayUpdate('vlans', idx, 'observacoes', v)} />
                    </div>
                  </div>
                )}
              />

              {/* Wi-Fi */}
              <ArraySection 
                title="Wi-Fi / Access Points" 
                icon={<Wifi className="text-indigo-500" size={20}/>}
                iconContainerClass="bg-indigo-500/10"
                items={editedData.wifi}
                defaultItem={{ fabricante_modelo: '', nome_localizacao: '', ip: '', controladora: '', observacoes: '' }}
                onAdd={(def: any) => handleAddArrayItem('wifi', def)}
                onRemove={(idx: number) => handleRemoveArrayItem('wifi', idx)}
                renderItem={(item: any, idx: number) => (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`wifi-${idx}-fabricante_modelo`} label="Fabricante/modelo" value={item.fabricante_modelo} onChange={v => handleArrayUpdate('wifi', idx, 'fabricante_modelo', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`wifi-${idx}-nome_localizacao`} label="Nome/localização" value={item.nome_localizacao} onChange={v => handleArrayUpdate('wifi', idx, 'nome_localizacao', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`wifi-${idx}-ip`} label="IP" value={item.ip} onChange={v => handleArrayUpdate('wifi', idx, 'ip', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`wifi-${idx}-controladora`} label="Controladora" value={item.controladora} onChange={v => handleArrayUpdate('wifi', idx, 'controladora', v)} />
                    <div className="lg:col-span-4">
                       <InputField activeHighlightField={activeHighlightField} fieldPath={`wifi-${idx}-observacoes`} label="Observações" value={item.observacoes} onChange={v => handleArrayUpdate('wifi', idx, 'observacoes', v)} />
                    </div>
                  </div>
                )}
              />

              {/* Equipamentos */}
              <ArraySection 
                title="Equipamentos Diversos" 
                icon={<Database className="text-pink-500" size={20}/>}
                iconContainerClass="bg-pink-500/10"
                items={editedData.equipamentos}
                defaultItem={{ tipo: '', detalhes: '' }}
                onAdd={(def: any) => handleAddArrayItem('equipamentos', def)}
                onRemove={(idx: number) => handleRemoveArrayItem('equipamentos', idx)}
                renderItem={(item: any, idx: number) => (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1">
                      <InputField activeHighlightField={activeHighlightField} fieldPath={`equipamentos-${idx}-tipo`} label="Tipo (DVR, VoIP...)" value={item.tipo} onChange={v => handleArrayUpdate('equipamentos', idx, 'tipo', v)} />
                    </div>
                    <div className="md:col-span-2">
                       <InputField activeHighlightField={activeHighlightField} fieldPath={`equipamentos-${idx}-detalhes`} label="Detalhes" value={item.detalhes} onChange={v => handleArrayUpdate('equipamentos', idx, 'detalhes', v)} />
                    </div>
                  </div>
                )}
              />

              {editedData.descobertas && editedData.descobertas.length > 0 && (
                <ArraySection
                  title="Descobertas técnicas"
                  icon={<Network className="text-blue-400" size={20}/>}
                  iconContainerClass="bg-blue-500/10"
                  items={editedData.descobertas}
                  defaultItem={{ categoria: '', titulo: '', valor: '', fonte: '', trecho: '', confianca: 'media' }}
                  onAdd={(def: any) => handleAddArrayItem('descobertas', def)}
                  onRemove={(idx: number) => handleRemoveArrayItem('descobertas', idx)}
                  renderItem={(item: any, idx: number) => (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <InputField activeHighlightField={activeHighlightField} fieldPath={`descobertas-${idx}-categoria`} label="Categoria" value={item.categoria} onChange={v => handleArrayUpdate('descobertas', idx, 'categoria', v)} />
                      <InputField activeHighlightField={activeHighlightField} fieldPath={`descobertas-${idx}-titulo`} label="Título" value={item.titulo} onChange={v => handleArrayUpdate('descobertas', idx, 'titulo', v)} />
                      <InputField activeHighlightField={activeHighlightField} fieldPath={`descobertas-${idx}-confianca`} label="Confiança" value={item.confianca} onChange={v => handleArrayUpdate('descobertas', idx, 'confianca', v)} />
                      <div className="lg:col-span-3"><TextAreaField activeHighlightField={activeHighlightField} fieldPath={`descobertas-${idx}-valor`} label="Dado extraído" value={item.valor} onChange={v => handleArrayUpdate('descobertas', idx, 'valor', v)} /></div>
                      <InputField activeHighlightField={activeHighlightField} fieldPath={`descobertas-${idx}-fonte`} label="Arquivo de origem" value={item.fonte} onChange={v => handleArrayUpdate('descobertas', idx, 'fonte', v)} />
                      <div className="lg:col-span-2"><TextAreaField activeHighlightField={activeHighlightField} fieldPath={`descobertas-${idx}-trecho`} label="Trecho literal usado como evidência" value={item.trecho} onChange={v => handleArrayUpdate('descobertas', idx, 'trecho', v)} /></div>
                    </div>
                  )}
                />
              )}

              {/* Backup */}
              <div className="bg-[#0c0c0e] border border-white/5 shadow-xl rounded-3xl p-8">
                <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-6">
                  <div className="p-2.5 bg-yellow-500/10 rounded-xl"><HardDrive className="text-yellow-500" size={20}/></div>
                  Backup
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <InputField activeHighlightField={activeHighlightField} fieldPath="backup-possui_backup" label="Possui backup?" value={editedData.backup?.possui_backup} onChange={v => updateBackupObj('possui_backup', v)} />
                  <InputField activeHighlightField={activeHighlightField} fieldPath="backup-onde_fica" label="Onde fica" value={editedData.backup?.onde_fica} onChange={v => updateBackupObj('onde_fica', v)} />
                  <InputField activeHighlightField={activeHighlightField} fieldPath="backup-frequencia" label="Frequência" value={editedData.backup?.frequencia} onChange={v => updateBackupObj('frequencia', v)} />
                  <InputField activeHighlightField={activeHighlightField} fieldPath="backup-responsavel" label="Responsável" value={editedData.backup?.responsavel} onChange={v => updateBackupObj('responsavel', v)} />
                  <InputField activeHighlightField={activeHighlightField} fieldPath="backup-ultimo_teste" label="Último teste" value={editedData.backup?.ultimo_teste} onChange={v => updateBackupObj('ultimo_teste', v)} />
                  <div className="lg:col-span-3">
                    <TextAreaField activeHighlightField={activeHighlightField} fieldPath="backup-observacoes" label="Observações" value={editedData.backup?.observacoes} onChange={v => updateBackupObj('observacoes', v)} />
                  </div>
                </div>
              </div>

              {/* Revisoes */}
              <ArraySection 
                title="Revisões" 
                icon={<CheckCircle className="text-teal-500" size={20}/>}
                iconContainerClass="bg-teal-500/10"
                items={editedData.revisoes}
                defaultItem={{ numero: '', data: '', descricao: '', responsavel: '' }}
                onAdd={(def: any) => handleAddArrayItem('revisoes', def)}
                onRemove={(idx: number) => handleRemoveArrayItem('revisoes', idx)}
                renderItem={(item: any, idx: number) => (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`revisoes-${idx}-numero`} label="Número" value={item.numero} onChange={v => handleArrayUpdate('revisoes', idx, 'numero', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`revisoes-${idx}-data`} label="Data" value={item.data} onChange={v => handleArrayUpdate('revisoes', idx, 'data', v)} />
                    <InputField activeHighlightField={activeHighlightField} fieldPath={`revisoes-${idx}-responsavel`} label="Responsável" value={item.responsavel} onChange={v => handleArrayUpdate('revisoes', idx, 'responsavel', v)} />
                    <div className="lg:col-span-4">
                       <InputField activeHighlightField={activeHighlightField} fieldPath={`revisoes-${idx}-descricao`} label="Descrição" value={item.descricao} onChange={v => handleArrayUpdate('revisoes', idx, 'descricao', v)} />
                    </div>
                  </div>
                )}
              />

              </div>
            )}
          </div>
        </div>
      )}

      {showPrintModal && editedData && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-y-auto text-black print:block print:absolute print:inset-0 print:!overflow-visible print:bg-white print:h-auto print:w-auto">
          {/* Print controls - hidden in print */}
          <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center print:hidden shadow-lg z-50">
            <h3 className="text-white font-bold text-lg">Visualização de Impressão</h3>
            <div className="flex gap-3">
              <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium">Imprimir PDF</button>
              <button onClick={() => setShowPrintModal(false)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg font-medium">Fechar</button>
            </div>
          </div>

          <div className="p-12 max-w-5xl mx-auto w-full bg-white print:p-0">
            <div className="border-b-2 border-black pb-6 mb-8 flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black text-black mb-2">{selectedCompany?.company}</h1>
                <p className="text-zinc-600">Documentação de Infraestrutura TI</p>
              </div>
              <div className="text-right text-sm text-zinc-500">
                <p>Data de geração: {new Date().toLocaleDateString('pt-BR')}</p>
                {editedData.empresa?.data_revisao && <p>Última revisão: {editedData.empresa.data_revisao}</p>}
                {editedData.empresa?.codigo_documento && <p>Documento: {editedData.empresa.codigo_documento}</p>}
              </div>
            </div>

            <div className="space-y-12">
              <PrintSection title="1. Informações Gerais da Empresa">
                <div className="grid grid-cols-2 gap-4">
                  <PrintRow label="Nome" value={editedData.empresa?.nome} />
                  <PrintRow label="Unidade/Filial" value={editedData.empresa?.unidade} />
                  <PrintRow label="Responsável" value={editedData.empresa?.responsavel} />
                  <PrintRow label="Observações" value={editedData.empresa?.observacoes} colSpan={2} />
                </div>
              </PrintSection>

              <PrintSection title="2. Servidores" data={editedData.servidores}>
                {(item: any, i: number) => (
                   <div key={i} className="mb-4 bg-zinc-50 p-4 border border-zinc-200">
                     <h4 className="font-bold border-b border-zinc-200 pb-2 mb-3">{item.hostname || 'Servidor Sem Nome'}</h4>
                     <div className="grid grid-cols-2 gap-3 text-sm">
                       <PrintRow label="IP" value={item.ip} />
                       <PrintRow label="SO" value={item.so} />
                       <PrintRow label="Funções" value={item.funcoes} />
                       <PrintRow label="Discos" value={item.discos} />
                       <PrintRow label="Acesso" value={item.acesso_remoto} />
                       <PrintRow label="ID de Acesso" value={item.id_acesso} />
                       <PrintRow label="Obs" value={item.observacoes} colSpan={2} />
                     </div>
                   </div>
                )}
              </PrintSection>

              <PrintSection title="3. Internet e Provedores" data={editedData.internet}>
                {(item: any, i: number) => (
                   <div key={i} className="mb-4 bg-zinc-50 p-4 border border-zinc-200">
                     <h4 className="font-bold border-b border-zinc-200 pb-2 mb-3">{item.provedor || 'Link'}</h4>
                     <div className="grid grid-cols-2 gap-3 text-sm">
                       <PrintRow label="Velocidade" value={item.velocidade} />
                       <PrintRow label="Tipo IP" value={item.tipo_ip} />
                       <PrintRow label="IP Público" value={item.ip_publico} />
                       <PrintRow label="Máscara" value={item.mascara} />
                       <PrintRow label="Gateway" value={item.gateway} />
                       <PrintRow label="DNS" value={`${item.dns_primario || ''} ${item.dns_secundario ? '/ ' + item.dns_secundario : ''}`} />
                       <PrintRow label="IP Modem" value={item.ip_modem} />
                       <PrintRow label="Obs" value={item.observacoes} colSpan={2} />
                     </div>
                   </div>
                )}
              </PrintSection>

              <PrintSection title="4. Firewall" data={editedData.firewall}>
                {(item: any, i: number) => (
                   <div key={i} className="mb-4 bg-zinc-50 p-4 border border-zinc-200">
                     <div className="grid grid-cols-2 gap-3 text-sm">
                       <PrintRow label="Modelo" value={item.fabricante_modelo} />
                       <PrintRow label="IP Gerenciamento" value={item.ip_gerenciamento} />
                       <PrintRow label="Função" value={item.funcao} />
                       <PrintRow label="Obs" value={item.observacoes} colSpan={2} />
                     </div>
                   </div>
                )}
              </PrintSection>

              <div className="break-inside-avoid">
                <PrintSection title="5. Infraestrutura de Rede (Switches e VLANs)">
                  <div className="mb-6">
                    <h4 className="font-bold mb-3 text-sm uppercase text-black">Switches</h4>
                    {editedData.switches && editedData.switches.length > 0 ? editedData.switches.map((item: any, i: number) => (
                      <div key={'sw'+i} className="mb-2 bg-zinc-50 p-3 border border-zinc-200 text-sm">
                        <span className="font-bold">{item.nome || item.fabricante_modelo}</span> - IP: {item.ip} - Local: {item.localizacao}
                        {item.observacoes && <div className="text-zinc-600 italic mt-1">{item.observacoes}</div>}
                      </div>
                    )) : <p className="text-sm text-zinc-500 italic">Nenhum switch mapeado.</p>}
                  </div>
                  <div>
                    <h4 className="font-bold mb-3 text-sm uppercase text-black">VLANs</h4>
                    {editedData.vlans && editedData.vlans.length > 0 ? editedData.vlans.map((item: any, i: number) => (
                      <table key={'vl'+i} className="w-full text-sm border-collapse border border-zinc-200 mb-2">
                        <tbody>
                          <tr>
                            <td className="border border-zinc-200 p-2 bg-zinc-50 font-bold w-32">VLAN {item.id_vlan}</td>
                            <td className="border border-zinc-200 p-2 font-bold">{item.nome}</td>
                            <td className="border border-zinc-200 p-2">Subnet: {item.subnet}</td>
                            <td className="border border-zinc-200 p-2">Gateway: {item.gateway}</td>
                          </tr>
                          {item.observacoes && <tr><td colSpan={4} className="border border-zinc-200 p-2 text-zinc-600 italic">{item.observacoes}</td></tr>}
                        </tbody>
                      </table>
                    )) : <p className="text-sm text-zinc-500 italic">Nenhuma vlan mapeada.</p>}
                  </div>
                </PrintSection>
              </div>

              <PrintSection title="6. Wi-Fi" data={editedData.wifi}>
                {(item: any, i: number) => (
                   <div key={i} className="mb-4 bg-zinc-50 p-3 text-sm border border-zinc-200">
                     <span className="font-bold">{item.nome_localizacao || item.fabricante_modelo}</span> - IP: {item.ip} - Controladora: {item.controladora}
                     {item.observacoes && <div className="text-zinc-600 italic mt-1">{item.observacoes}</div>}
                   </div>
                )}
              </PrintSection>

              <PrintSection title="7. Equipamentos Diversos" data={editedData.equipamentos}>
                {(item: any, i: number) => (
                   <div key={i} className="mb-2 p-2 text-sm border-b border-zinc-200">
                     <span className="font-bold mr-2 uppercase">{item.tipo}:</span> {item.detalhes}
                   </div>
                )}
              </PrintSection>

              <PrintSection title="8. Rotinas de Backup">
                <div className="grid grid-cols-2 gap-4 text-sm bg-zinc-50 p-4 border border-zinc-200">
                  <PrintRow label="Possui Backup?" value={editedData.backup?.possui_backup} />
                  <PrintRow label="Onde Fica" value={editedData.backup?.onde_fica} />
                  <PrintRow label="Frequência" value={editedData.backup?.frequencia} />
                  <PrintRow label="Responsável" value={editedData.backup?.responsavel} />
                  <PrintRow label="Último Teste" value={editedData.backup?.ultimo_teste} />
                  <PrintRow label="Observações" value={editedData.backup?.observacoes} colSpan={2} />
                </div>
              </PrintSection>

              {editedData.revisoes && editedData.revisoes.length > 0 && (
                <div className="break-inside-avoid text-black print:text-black">
                  <h3 className="text-xl font-bold uppercase border-b border-zinc-300 pb-2 mb-4 text-black">9. Histórico de Revisões</h3>
                  <table className="w-full text-sm border-collapse border border-zinc-300">
                    <thead className="bg-zinc-100">
                      <tr>
                        <th className="border border-zinc-300 p-2 text-left w-20">Rev.</th>
                        <th className="border border-zinc-300 p-2 text-left w-32">Data</th>
                        <th className="border border-zinc-300 p-2 text-left">Descrição</th>
                        <th className="border border-zinc-300 p-2 text-left w-48">Responsável</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editedData.revisoes.map((item: any, i: number) => (
                        <tr key={i}>
                          <td className="border border-zinc-300 p-2 font-mono">{item.numero}</td>
                          <td className="border border-zinc-300 p-2">{item.data}</td>
                          <td className="border border-zinc-300 p-2">{item.descricao}</td>
                          <td className="border border-zinc-300 p-2">{item.responsavel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {showStopDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-950 p-7 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Parar análise?</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">O documento atual será interrompido. Você pode manter os documentos já concluídos ou descartar esta execução inteira.</p>
            <div className="mt-7 flex flex-col gap-3">
              <button onClick={() => stopNormalization('preserve')} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500">Parar e manter o que já foi analisado</button>
              <button onClick={() => stopNormalization('discard')} className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-200 hover:bg-red-500/20">Descartar esta execução</button>
              <button onClick={() => setShowStopDialog(false)} className="px-5 py-2 text-sm font-medium text-zinc-400 hover:text-white">Continuar análise</button>
            </div>
          </div>
        </div>
      )}

      {showTopologyMap && selectedCompany && (editedData || selectedCompany.normalizedData) && <TopologyMap company={selectedCompany.company} data={editedData || selectedCompany.normalizedData!} onClose={() => setShowTopologyMap(false)} />}

    </div>
  );
}

function ArraySection({ title, icon, iconContainerClass, items = [], defaultItem, onAdd, onRemove, renderItem }: any) {
  return (
    <div className="bg-[#0c0c0e] border border-white/5 shadow-xl rounded-3xl overflow-hidden">
      <div className="bg-white/[0.02] p-6 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${iconContainerClass}`}>{icon}</div> {title}
        </h3>
        <button 
          onClick={() => onAdd(defaultItem)}
          className="bg-white/5 hover:bg-white/10 text-sm font-bold px-4 py-2.5 rounded-xl border border-white/10 flex items-center gap-2 transition-colors text-white"
        >
          <Plus size={16}/> Adicionar novo
        </button>
      </div>
      <div className="p-8 space-y-6">
        {items.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm bg-black/20 rounded-2xl border border-dashed border-white/10">Nenhum item cadastrado.</div>
        ) : (
          items.map((item: any, idx: number) => (
            <div key={idx} className="relative bg-[#111114] border border-white/5 p-6 rounded-2xl">
              <button 
                onClick={() => onRemove(idx)}
                className="absolute top-4 right-4 p-2 text-red-500/50 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                title="Deletar Item"
              >
                <Trash2 size={18} />
              </button>
              {renderItem(item, idx)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InputField({ label, value = "", onChange, activeHighlightField, fieldPath }: { label: string, value?: string, onChange: (v: string) => void, activeHighlightField?: string | null, fieldPath?: string }) {
  return (
    <div className={`transition-all duration-300 ${activeHighlightField && activeHighlightField === fieldPath ? "ring-1 ring-emerald-500 rounded-xl bg-emerald-500/10 -m-2 p-2 relative z-10 scale-105" : ""}`}>
      <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${activeHighlightField && activeHighlightField === fieldPath ? "text-emerald-400" : "text-zinc-400"}`}>{label}</label>
      <input 
        type="text" 
        value={value}
        onChange={e => onChange(e.target.value)}
        id={fieldPath} className={`w-full bg-[#070709] border ${activeHighlightField && activeHighlightField === fieldPath ? "border-emerald-500/50" : "border-white/10 hover:border-white/20"} rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors`}
        placeholder="..."
      />
    </div>
  );
}

function TextAreaField({ label, value = "", onChange, activeHighlightField, fieldPath }: { label: string, value?: string, onChange: (v: string) => void, activeHighlightField?: string | null, fieldPath?: string }) {
  return (
    <div className={`transition-all duration-300 ${activeHighlightField && activeHighlightField === fieldPath ? "ring-1 ring-emerald-500 rounded-xl bg-emerald-500/10 -m-2 p-2 relative z-10 scale-105" : ""}`}>
      <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${activeHighlightField && activeHighlightField === fieldPath ? "text-emerald-400" : "text-zinc-400"}`}>{label}</label>
      <textarea 
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        id={fieldPath} className={`w-full bg-[#070709] border ${activeHighlightField && activeHighlightField === fieldPath ? "border-emerald-500/50" : "border-white/10 hover:border-white/20"} rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-y leading-relaxed`}
        placeholder="..."
      />
    </div>
  );
}

function PrintSection({ title, data, children }: any) {
  const isEmpty = !data || (Array.isArray(data) && data.length === 0);
  return (
    <div className="break-inside-avoid text-black print:text-black">
      <h3 className="text-xl font-bold uppercase border-b border-zinc-300 pb-2 mb-4 text-black">{title}</h3>
      {data !== undefined && isEmpty ? (
        <p className="text-sm text-zinc-500 italic">Nenhum dado cadastrado.</p>
      ) : data !== undefined && Array.isArray(data) ? (
        data.map((item: any, i: number) => children(item, i))
      ) : (
        children
      )}
    </div>
  );
}

function PrintRow({ label, value, colSpan = 1 }: any) {
  return (
    <div className={`col-span-${colSpan} border-b border-zinc-200 pb-1`}>
      <span className="font-bold text-black uppercase text-xs mr-2">{label}:</span>
      <span className="text-zinc-800">{value || '-'}</span>
    </div>
  );
}
