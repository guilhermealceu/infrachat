import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { store, CompanyData, SettingsData } from '../lib/store';
import { askOllama } from '../lib/ollama';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function TypingText({ text, enabled, className, speed = 14 }: { text: string; enabled: boolean; className?: string; speed?: number }) {
  const [visibleText, setVisibleText] = useState(enabled ? '' : text);

  useEffect(() => {
    if (!enabled) {
      setVisibleText(text);
      return;
    }
    setVisibleText('');
    let index = 0;
    const timer = window.setInterval(() => {
      index += Math.max(1, Math.ceil(text.length / 80));
      setVisibleText(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, speed);
    return () => window.clearInterval(timer);
  }, [text, enabled, speed]);

  const isTyping = enabled && visibleText.length < text.length;
  return <span className={className}>{visibleText}{isTyping && <span className="ml-0.5 inline-block animate-pulse text-blue-400">▍</span>}</span>;
}

export function Chat() {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [settings, setSettings] = useState<SettingsData | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string|null>(null);
  const [hasOpened, setHasOpened] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refreshSettings = () => { void store.getSettings().then(setSettings); };
    window.addEventListener('settings-changed', refreshSettings);
    store.getAllCompanies().then(data => {
      setCompanies(data);
      if (data.length > 0) setSelectedCompany(data[0].company);
    });
    store.getSettings().then(data => {
      setSettings(data);
      setHasOpened(true);
    });
    return () => window.removeEventListener('settings-changed', refreshSettings);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !selectedCompany || !settings) return;

    const companyData = companies.find(c => c.company === selectedCompany);
    if (!companyData) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: inputValue.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsGenerating(true);
    setErrorInfo(null);

    const assistantMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

    try {
      await askOllama(
        settings.ollamaUrl,
        settings.ollamaModel,
        userMsg.content,
        companyData.content,
        companyData.company,
        companyData.filename.replace(/,/g, ', '), // Fix formatting if needed
        (chunk) => {
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMsgId 
              ? { ...msg, content: msg.content + chunk } 
              : msg
          ));
        }
      );
    } catch (err: any) {
      setErrorInfo(err.message || 'Erro ao conectar com Ollama.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full max-h-screen text-gray-100 p-6 overflow-hidden max-w-6xl mx-auto w-full">
      
      {/* Header / Configurações Rápidas */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6 bg-zinc-900/80 backdrop-blur-md p-4 rounded-2xl border border-zinc-800 shrink-0 shadow-lg"
      >
        <div className="flex flex-col gap-1.5 w-1/3">
          <label className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider pl-1">Data Source Contexto</label>
          <div className="relative">
            <select 
              value={selectedCompany} 
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setMessages([]); // clean chat on switch
              }}
              className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-medium text-white focus:ring-2 focus:ring-blue-500 outline-none w-full appearance-none transition-colors cursor-pointer"
            >
              {companies.length === 0 && <option value="">Nenhuma empresa sincronizada</option>}
              {companies.map(c => (
                <option key={c.company} value={c.company}>{c.company}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <div className="w-4 h-4 border-l-2 border-b-2 border-zinc-500 -rotate-45 -translate-y-1 rounded-bl-sm"></div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-8 px-4">
          <div className="flex flex-col items-end">
             <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider mb-1">{settings?.provider === 'groq' ? 'Groq' : 'Ollama'}</span>
             <span className="text-sm font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">{settings?.provider === 'groq' ? settings.groqModel : settings?.ollamaModel || 'Carregando...'}</span>
          </div>
          <div className="flex flex-col items-end">
             <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Status Base de Dados</span>
             {companies.find(c => c.company === selectedCompany) ? (
               <span className="text-sm text-emerald-400 flex items-center gap-1.5 font-medium"><CheckCircle2 size={16}/> Sincronizado</span>
             ) : (
               <span className="text-sm text-red-400 flex items-center gap-1.5 font-medium"><AlertTriangle size={16}/> Sem dados</span>
             )}
          </div>
        </div>
      </motion.div>

      {/* Área de Mensagens */}
      <div className="flex-1 overflow-y-auto bg-zinc-900/30 rounded-2xl border border-zinc-800 p-4 mb-6 space-y-6 flex flex-col">
        {messages.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="m-auto flex flex-col items-center justify-center text-zinc-500 gap-6 w-full max-w-lg"
          >
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center shadow-xl border border-zinc-800 relative">
              <Bot size={40} className="text-blue-400" />
              <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 blur-sm"></div>
            </div>
            <div className="text-center space-y-3">
               <h3 className="text-2xl font-bold text-zinc-300"><TypingText text="IA Document Manager" enabled={hasOpened && settings?.animateOnOpen !== false} /></h3>
               <p className="text-sm leading-relaxed text-zinc-400">
                 <TypingText
                   text={`Faça perguntas sobre VPNs, servidores, IPs, topologias e firewall. As respostas usam o acervo da empresa selecionada com ${settings?.provider === 'groq' ? settings.groqModel || 'Groq' : settings?.ollamaModel || 'Ollama'}.`}
                   enabled={hasOpened && settings?.animateOnOpen !== false}
                   speed={9}
                 />
               </p>
            </div>
            {companies.length === 0 && (
              <div className="bg-blue-900/20 text-blue-300 border border-blue-800/50 p-4 rounded-xl text-sm w-full text-center">
                Para começar, acesse a página <b>Configurações</b> para indexar as pastas locais.
              </div>
            )}
          </motion.div>
        ) : (
          <AnimatePresence>
            {messages.map(msg => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id} 
                className={`flex gap-4 max-w-4xl mx-auto w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0 mt-1 ring-1 ring-blue-500/30">
                    <Bot size={18} />
                  </div>
                )}
                
                <div className={`px-5 py-4 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm shadow-md' : 'bg-zinc-800/80 text-zinc-100 rounded-bl-sm border border-zinc-700/50 w-full shadow-lg'}`}>
                  {msg.role === 'assistant' ? (
                    <div className="markdown-body prose prose-invert prose-blue max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800">
                      {msg.content.length > 0 ? (
                        <Markdown>{msg.content}</Markdown>
                      ) : (
                        <div className="flex items-center gap-2 text-blue-400 font-medium">
                          <Loader2 size={16} className="animate-spin" /> Analisando arquivo...
                        </div>
                      )}
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 mt-1 shadow-md">
                    <User size={18} />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        
        {errorInfo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl w-full mx-auto flex items-start gap-3 text-red-400 bg-red-950/30 p-4 rounded-xl border border-red-900/50">
            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
            <div className="text-sm leading-relaxed">{errorInfo}</div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative shrink-0 flex items-center max-w-4xl w-full mx-auto"
      >
        <input 
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating || !selectedCompany}
          placeholder={selectedCompany ? `Pergunte sobre a infraestrutura da ${selectedCompany}...` : "Selecione uma empresa primeiro..."}
          className="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 rounded-2xl pl-6 pr-14 py-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50 shadow-lg text-sm sm:text-base"
        />
        <button 
          onClick={handleSendMessage}
          disabled={isGenerating || !inputValue.trim() || !selectedCompany}
          className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white h-auto w-12 flex items-center justify-center rounded-xl transition-all shrink-0"
        >
          <Send size={18} className={inputValue.trim() ? "translate-x-[-1px] translate-y-[1px]" : ""} />
        </button>
      </motion.div>

    </div>
  );
}
