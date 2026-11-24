import mammoth from "mammoth";
import { store, CompanyData, FileInfo, SyncProgressData } from "./store";
import { chunkDocument } from "./indexing";

// Cloud providers can hydrate every item when their folders are enumerated.
// These folders cannot contain supported source documents in the normal layout,
// so never enter them.
const SKIPPED_DIRECTORY_NAMES = new Set([
  'imagem', 'imagens', 'image', 'images', 'foto', 'fotos', 'photo', 'photos',
  'video', 'videos', 'vídeo', 'vídeos', 'media', 'mídia', 'midia',
  'backup', 'backups', 'lixeira', 'trash', 'temp', 'tmp', 'cache',
  'node_modules', '.git', '$recycle.bin'
]);

function shouldSkipDirectory(name: string): boolean {
  return SKIPPED_DIRECTORY_NAMES.has(name.trim().toLocaleLowerCase('pt-BR'));
}

async function countFilesRecursive(
  dirHandle: any,
  onProgress: (p: SyncProgressData) => void,
  progressState: SyncProgressData,
  relativePath = ''
): Promise<number> {
  let count = 0;
  progressState.scannedFolders = (progressState.scannedFolders || 0) + 1;
  progressState.message = `Mapeando pasta: ${relativePath || 'raiz'}...`;
  onProgress({ ...progressState });
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === "file" && name.toLowerCase().endsWith(".docx") && !name.startsWith("~$")) {
      count++;
    } else if (entry.kind === "directory" && !shouldSkipDirectory(name)) {
      count += await countFilesRecursive(entry, onProgress, progressState, relativePath ? `${relativePath}/${name}` : name);
    }
  }
  return count;
}

async function processDirectoryRecursive(
  dirHandle: any,
  onProgress: (p: SyncProgressData) => void,
  texts: string[],
  filenames: string[],
  filesInfo: FileInfo[],
  progressState: SyncProgressData,
  relativePath = ''
) {
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === "file" && name.toLowerCase().endsWith(".docx") && !name.startsWith("~$")) {
      const filePath = relativePath ? `${relativePath}/${name}` : name;
      progressState.currentFile = filePath;
      progressState.message = `Lendo arquivo: ${name}...`;
      onProgress({ ...progressState });

      try {
        const file = await entry.getFile();
        const arrayBuffer = await file.arrayBuffer();
        
        // Extract text using Mammoth
        const result = await mammoth.extractRawText({ arrayBuffer });
        
        texts.push(result.value);
        filenames.push(name);
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hash = Array.from(new Uint8Array(hashBuffer), byte => byte.toString(16).padStart(2, '0')).join('');
        filesInfo.push({
          name,
          relativePath: filePath,
          sizeKb: file.size / 1024,
          content: result.value,
          hash,
          lastModified: file.lastModified,
          status: result.value.trim() ? 'indexed' : 'empty'
        });

        progressState.processedFiles++;
        onProgress({ ...progressState });
      } catch (err) {
        console.error(`Erro ao ler ${name}:`, err);
        progressState.message = `Erro ao extrair texto de ${name}.`;
        filesInfo.push({
          name,
          relativePath: filePath,
          sizeKb: 0,
          status: 'error',
          extractionError: err instanceof Error ? err.message : 'Erro desconhecido'
        });
        progressState.processedFiles++;
        onProgress({ ...progressState });
      }
    } else if (entry.kind === "directory" && !shouldSkipDirectory(name)) {
      const nestedPath = relativePath ? `${relativePath}/${name}` : name;
      await processDirectoryRecursive(entry, onProgress, texts, filenames, filesInfo, progressState, nestedPath);
    }
  }
}

async function hashText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function syncWithElectron(onProgress: (p: SyncProgressData) => void, progressState: SyncProgressData): Promise<CompanyData[]> {
  const result = await window.documentManager!.scanFolder(update => {
    Object.assign(progressState, update);
    onProgress({ ...progressState });
  });
  if (result.canceled) {
    progressState.status = 'idle';
    progressState.message = 'Seleção cancelada.';
    onProgress({ ...progressState });
    return [];
  }

  progressState.totalFiles = result.companies.reduce((total, company) => total + company.files.length, 0);
  progressState.processedFiles = 0;
  progressState.status = 'processing';
  const syncedCompanies: CompanyData[] = [];

  for (const company of result.companies) {
    progressState.currentCompany = company.company;
    const files = await Promise.all(company.files.map(async file => ({
      ...file,
      hash: file.content ? await hashText(file.content) : undefined
    })));
    const readableFiles = files.filter(file => file.content && file.status === 'indexed');
    const previous = await store.getCompany(company.company);
    const previousHashes = new Map((previous?.files || []).map(file => [file.relativePath || file.name, file.hash]));
    const changedFiles = files
      .filter(file => file.status !== 'error' && previousHashes.get(file.relativePath || file.name) !== file.hash)
      .map(file => file.relativePath || file.name);
    const data: CompanyData = {
      company: company.company,
      filename: readableFiles.map(file => file.name).join(', '),
      files,
      chunks: readableFiles.flatMap(chunkDocument),
      content: readableFiles.map(file => `[ARQUIVO/FILIAL: ${file.relativePath || file.name}]\n${file.content}`).join('\n\n========================\n\n'),
      syncedAt: new Date().toISOString(),
      changedFiles,
      normalizedData: previous?.normalizedData,
      normalizedStatus: changedFiles.length > 0 ? 'ai' : previous?.normalizedStatus
    };
    await store.saveCompany(data);
    syncedCompanies.push(data);
    progressState.processedFiles += files.length;
    progressState.message = `Empresa sincronizada: ${company.company}`;
    onProgress({ ...progressState });
  }

  progressState.status = 'done';
  progressState.message = `Sincronização finalizada! ${syncedCompanies.length} empresas atualizadas.`;
  onProgress({ ...progressState });
  return syncedCompanies;
}

export async function syncDirectory(onProgress: (p: SyncProgressData) => void): Promise<CompanyData[]> {
  const progressState: SyncProgressData = {
    status: 'idle',
    message: 'Aguardando seleção da pasta...',
    scannedFolders: 0,
    processedFiles: 0,
    totalFiles: 0
  };

  try {
    if (window.documentManager) return await syncWithElectron(onProgress, progressState);

    // Attempt to open directory picker
    let dirHandle: any;
    try {
      dirHandle = await (window as any).showDirectoryPicker({
        mode: "read", // READ-ONLY MODE ENSURES FILES ARE NEVER MODIFIED
        startIn: "documents"
      });
    } catch (e: any) {
      if (e.name === "AbortError") throw new Error("Ação cancelada pelo usuário.");
      throw new Error("Seu navegador não suporta a API de File System ou a ação foi bloqueada.");
    }

    progressState.status = 'scanning';
    progressState.message = 'Analisando estrutura de pastas e contando documentos...';
    onProgress({ ...progressState });

    const totalFiles = await countFilesRecursive(dirHandle, onProgress, progressState);
    progressState.totalFiles = totalFiles;
    progressState.status = 'processing';
    onProgress({ ...progressState });

    const syncedCompanies: CompanyData[] = [];

    // Iterate over folders (companies)
    for await (const [name, entry] of dirHandle.entries()) {
      if (entry.kind === "directory" && !shouldSkipDirectory(name)) {
        progressState.currentCompany = name;
        progressState.message = `Analisando empresa: ${name}...`;
        onProgress({ ...progressState });
        
        const texts: string[] = [];
        const filenames: string[] = [];
        const filesInfo: FileInfo[] = [];
        
        // Traverse subfolders recursively
        await processDirectoryRecursive(entry, onProgress, texts, filenames, filesInfo, progressState);
        
        if (filesInfo.length > 0) {
          const combinedContent = texts.map((t, i) => `[ARQUIVO/FILIAL: ${filenames[i]}]\n${t}`).join("\n\n========================\n\n");
          const previous = await store.getCompany(name.toUpperCase());
          const previousHashes = new Map((previous?.files || []).map(file => [file.relativePath || file.name, file.hash]));
          const changedFiles = filesInfo
            .filter(file => file.status !== 'error' && previousHashes.get(file.relativePath || file.name) !== file.hash)
            .map(file => file.relativePath || file.name);
          const data: CompanyData = {
            company: name.toUpperCase(), // Normalize company name
            filename: filenames.join(", "),
            files: filesInfo,
            chunks: filesInfo.flatMap(chunkDocument),
            content: combinedContent,
            syncedAt: new Date().toISOString(),
            changedFiles,
            // A changed source invalidates a previous AI extraction. Manual data
            // remains visible, but its status makes review explicit.
            normalizedData: previous?.normalizedData,
            normalizedStatus: changedFiles.length > 0 ? 'ai' : previous?.normalizedStatus
          };

          await store.saveCompany(data);
          syncedCompanies.push(data);
        }
      }
    }

    progressState.status = 'done';
    progressState.message = `Sincronização finalizada! ${syncedCompanies.length} empresas atualizadas.`;
    onProgress({ ...progressState });
    return syncedCompanies;
  } catch (error: any) {
    progressState.status = 'error';
    progressState.message = error.message || "Erro desconhecido durante a sincronização.";
    onProgress({ ...progressState });
    throw error;
  }
}
