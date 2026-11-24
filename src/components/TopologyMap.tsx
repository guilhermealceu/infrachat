import { useEffect, useMemo, useRef, useState } from 'react';
import { addEdge, Background, Controls, Handle, MarkerType, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps, useEdgesState, useNodesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { NormalizedInfraData } from '../lib/store';

type CardData = { label: string; type: string; ip: string; details: string };
type MapNode = Node<CardData>;

function InfraCard({ data, selected }: NodeProps<MapNode>) {
  return <div className={`min-w-48 rounded-2xl border p-4 shadow-xl ${selected ? 'border-blue-400 bg-blue-500/15 ring-2 ring-blue-500/25' : 'border-zinc-700 bg-[#18181b]'}`}>
    <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-blue-400" />
    <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300">{data.type || 'Dispositivo'}</div>
    <div className="mt-1 font-bold text-white">{data.label || 'Sem nome'}</div>
    {data.ip && <div className="mt-2 font-mono text-xs text-zinc-400">{data.ip}</div>}
    {data.details && <div className="mt-1 max-w-48 truncate text-xs text-zinc-500">{data.details}</div>}
    <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-emerald-400" />
  </div>;
}

const nodeTypes = { infra: InfraCard };
const storageKey = (company: string) => `ia-document-manager-topology:${company}`;
const makeNode = (id: string, data: CardData, x: number, y: number): MapNode => ({ id, type: 'infra', position: { x, y }, data });

function initialNodes(data: NormalizedInfraData): MapNode[] {
  const nodes: MapNode[] = [];
  const internet = data.internet || [];
  const firewalls = data.firewall || [];
  const switches = data.switches || [];
  const servers = data.servidores || [];
  const wifi = data.wifi || [];
  internet.forEach((item, i) => nodes.push(makeNode(`wan-${i}`, { label: item.provedor || 'Link de internet', type: 'Internet', ip: item.ip_publico || item.ip_modem || item.gateway, details: item.velocidade }, 40, 120 + i * 160)));
  firewalls.forEach((item, i) => nodes.push(makeNode(`firewall-${i}`, { label: item.fabricante_modelo || 'Firewall', type: 'Firewall', ip: item.ip_gerenciamento, details: item.funcao }, 320, 120 + i * 160)));
  switches.forEach((item, i) => nodes.push(makeNode(`switch-${i}`, { label: item.nome || item.fabricante_modelo || 'Switch', type: 'Switch', ip: item.ip, details: item.localizacao }, 610, 70 + i * 150)));
  servers.forEach((item, i) => nodes.push(makeNode(`server-${i}`, { label: item.hostname || 'Servidor', type: 'Servidor', ip: item.ip, details: item.funcoes }, 900, 50 + i * 145)));
  wifi.forEach((item, i) => nodes.push(makeNode(`wifi-${i}`, { label: item.nome_localizacao || item.fabricante_modelo || 'Access point', type: 'Wi-Fi', ip: item.ip, details: item.controladora }, 900, 400 + i * 145)));
  return nodes;
}

function initialEdges(nodes: MapNode[]): Edge[] {
  const byPrefix = (prefix: string) => nodes.filter(node => node.id.startsWith(prefix));
  const wan = byPrefix('wan-')[0], firewall = byPrefix('firewall-')[0], sw = byPrefix('switch-')[0];
  const targets = [...byPrefix('server-'), ...byPrefix('wifi-')];
  const pairs: Array<[MapNode | undefined, MapNode | undefined]> = [[wan, firewall], [firewall, sw], ...targets.map(node => [sw || firewall || wan, node] as [MapNode | undefined, MapNode | undefined])];
  return pairs.filter((pair): pair is [MapNode, MapNode] => Boolean(pair[0] && pair[1])).map(([source, target]) => ({ id: `edge-${source.id}-${target.id}`, source: source.id, target: target.id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#34d399' }, style: { stroke: '#34d399', strokeWidth: 2 } }));
}

export function TopologyMap({ company, data, onClose }: { company: string; data: NormalizedInfraData; onClose: () => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loaded = useRef(false);
  const selected = useMemo(() => nodes.find(node => node.id === selectedId), [nodes, selectedId]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(company)) || 'null');
      if (saved?.nodes && saved?.edges) { setNodes(saved.nodes); setEdges(saved.edges); }
      else { const generated = initialNodes(data); setNodes(generated); setEdges(initialEdges(generated)); }
    } catch { const generated = initialNodes(data); setNodes(generated); setEdges(initialEdges(generated)); }
    loaded.current = true;
  }, [company]);

  useEffect(() => {
    if (loaded.current) localStorage.setItem(storageKey(company), JSON.stringify({ nodes, edges }));
  }, [company, nodes, edges]);

  const onConnect = (connection: Connection) => setEdges(current => addEdge({ ...connection, id: `manual-${Date.now()}`, type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }, style: { stroke: '#3b82f6', strokeWidth: 2 } }, current));
  const addCard = () => setNodes(current => [...current, makeNode(`manual-${Date.now()}`, { label: 'Novo equipamento', type: 'Manual', ip: '', details: '' }, 500, 500)]);
  const updateSelected = (field: keyof CardData, value: string) => selected && setNodes(current => current.map(node => node.id === selected.id ? { ...node, data: { ...node.data, [field]: value } } : node));
  const deleteSelected = () => selected && (setNodes(current => current.filter(node => node.id !== selected.id)), setEdges(current => current.filter(edge => edge.source !== selected.id && edge.target !== selected.id)), setSelectedId(null));
  const reset = () => { localStorage.removeItem(storageKey(company)); const generated = initialNodes(data); setNodes(generated); setEdges(initialEdges(generated)); setSelectedId(null); };

  return <div className="fixed inset-0 z-[80] bg-[#09090b] p-5">
    <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-bold text-white">Mapa visual — {company}</h2><p className="text-sm text-zinc-400">Arraste cards. Arraste do ponto inferior de um card ao superior de outro para criar uma linha. Selecione uma linha e pressione Delete para removê-la.</p></div><div className="flex gap-2"><button onClick={reset} className="rounded-xl border border-zinc-700 p-3 text-zinc-300 hover:bg-zinc-800" title="Restaurar mapa automático"><RotateCcw size={18}/></button><button onClick={addCard} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500"><Plus size={17}/> Card</button><button onClick={onClose} className="rounded-xl border border-zinc-700 p-3 text-zinc-300 hover:bg-zinc-800"><X size={18}/></button></div></div>
    <div className="flex h-[calc(100vh-104px)] overflow-hidden rounded-2xl border border-zinc-800 bg-[#111114]">
      <div className="flex-1"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodesDelete={() => setSelectedId(null)} onConnect={onConnect} onNodeClick={(_, node) => setSelectedId(node.id)} fitView minZoom={0.25}><Background color="#25476a" gap={18} size={1}/><Controls/></ReactFlow></div>
      <aside className="w-80 border-l border-zinc-800 bg-[#0c0c0e] p-5">{selected ? <div className="space-y-4"><div className="flex items-center justify-between"><h3 className="font-bold text-white">Editar card</h3><button onClick={deleteSelected} className="rounded-lg p-2 text-red-300 hover:bg-red-500/10" title="Excluir card"><Trash2 size={17}/></button></div>{(['label', 'type', 'ip', 'details'] as const).map(field => <label key={field} className="block text-xs font-bold uppercase tracking-wide text-zinc-500">{field}<input value={selected.data[field]} onChange={event => updateSelected(field, event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm normal-case text-white outline-none focus:border-blue-500"/></label>)}<p className="pt-2 text-xs text-zinc-500">Alterações e posições são salvas localmente para esta empresa.</p></div> : <div className="text-sm text-zinc-500">Selecione um card para editar. Linhas podem ser removidas com <strong className="text-zinc-300">Delete</strong>.</div>}</aside>
    </div>
  </div>;
}
