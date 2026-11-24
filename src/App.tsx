import React, { useState } from 'react';
import { Settings as SettingsIcon, MessageSquare, Database, Server } from 'lucide-react';
import { Settings } from './components/Settings';
import { Companies } from './components/Companies';
import { Chat } from './components/Chat';
import { SyncProvider, useSync } from './lib/sync-context';

type Tab = 'chat' | 'companies' | 'settings';

export default function App() {
  return <SyncProvider><AppContent /></SyncProvider>;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const { progress, isSyncing } = useSync();

  return (
    <div className="flex h-screen w-full bg-[#0a0a0b] text-zinc-300 font-sans overflow-hidden selection:bg-blue-500/30 print:h-auto print:overflow-visible">
      
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-950 border-r border-zinc-800/60 flex flex-col shrink-0 print:hidden">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800/60 gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <Server size={18} className="text-white" />
          </div>
          <span className="font-bold text-gray-100 tracking-tight">InfraChat</span>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'chat' 
                ? 'bg-blue-600/10 text-blue-400' 
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <MessageSquare size={18} />
            Chat por Empresa
          </button>
          
          <button
            onClick={() => setActiveTab('companies')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'companies' 
                ? 'bg-blue-600/10 text-blue-400' 
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <Database size={18} />
            Empresas
          </button>
        </nav>

        <div className="p-3 border-t border-zinc-800/60">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'settings' 
                ? 'bg-zinc-800 text-zinc-100' 
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <SettingsIcon size={18} />
            Configurações
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden bg-[#0a0a0b] print:overflow-visible print:bg-white print:text-black">
        <div className={activeTab === 'chat' ? 'h-full' : 'hidden'}><Chat /></div>
        <div className={activeTab === 'companies' ? 'h-full' : 'hidden'}><Companies /></div>
        <div className={activeTab === 'settings' ? 'h-full' : 'hidden'}><Settings /></div>
      </main>

      {isSyncing && activeTab !== 'settings' && (
        <div className="fixed right-6 bottom-6 z-50 w-80 rounded-2xl border border-blue-500/30 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold text-blue-400">Sincronização em andamento</span>
            <span className="font-mono text-zinc-500">{progress.processedFiles}/{progress.totalFiles || '?'}</span>
          </div>
          <p className="mb-3 truncate text-xs text-zinc-400">{progress.message}</p>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            {progress.totalFiles > 0 ? (
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, (progress.processedFiles / progress.totalFiles) * 100)}%` }} />
            ) : <div className="h-full w-1/3 animate-[pulse_1s_ease-in-out_infinite] bg-blue-500" />}
          </div>
        </div>
      )}

    </div>
  );
}
