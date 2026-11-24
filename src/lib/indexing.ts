import type { DocumentChunk, FileInfo } from './store';

const CHUNK_SIZE = 1_200;
const CHUNK_OVERLAP = 180;

export function chunkDocument(file: FileInfo): DocumentChunk[] {
  const text = file.content?.trim();
  if (!text) return [];
  const chunks: DocumentChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end));
      if (boundary > start + CHUNK_SIZE / 2) end = boundary + 1;
    }
    const part = text.slice(start, end).trim();
    if (part) {
      chunks.push({
        id: `${file.relativePath || file.name}#${index}`,
        fileName: file.name,
        relativePath: file.relativePath || file.name,
        text: part,
        index,
      });
      index++;
    }
    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

export function rankChunks(chunks: DocumentChunk[], query: string, limit = 8): DocumentChunk[] {
  const terms: string[] = Array.from(query.toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}._:/-]{2,}/gu) || []);
  return chunks
    .map(chunk => {
      const text = chunk.text.toLocaleLowerCase('pt-BR');
      const score = terms.reduce((total: number, term: string) => total + (text.split(term).length - 1), 0);
      return { chunk, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.relativePath.localeCompare(b.chunk.relativePath))
    .slice(0, limit)
    .map(item => item.chunk);
}
