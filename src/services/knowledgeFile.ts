/**
 * Reads a user-selected knowledge file in the browser: the "AI File" markdown, or the zip export
 * that contains it. Nothing is uploaded anywhere.
 */

import type { SiteStructure } from '../types/afaik';
import { extractSiteStructure } from './siteStructure';

const MAX_MARKDOWN_BYTES = 8 * 1024 * 1024;
const MAX_MASTER_BYTES = 150 * 1024 * 1024;

export class KnowledgeFileError extends Error {}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

/** Lists entries from a zip's central directory (no zip64 support — exports are far below 4 GB). */
function readZipEntries(view: DataView): ZipEntry[] {
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65_557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new KnowledgeFileError('This zip file could not be read.');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new KnowledgeFileError('This zip file is damaged.');
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
      localHeaderOffset: view.getUint32(offset + 42, true),
      name: decoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset + 46, nameLength)),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateEntry(buffer: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const view = new DataView(buffer);
  const header = entry.localHeaderOffset;
  if (view.getUint32(header, true) !== 0x04034b50) throw new KnowledgeFileError('This zip file is damaged.');
  const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const data = new Uint8Array(buffer, start, entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new KnowledgeFileError('This zip uses an unsupported compression method.');
  if (typeof DecompressionStream === 'undefined') {
    throw new KnowledgeFileError('This browser cannot open zip files. Extract the zip and load the “AI File” .md instead.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/** Picks the AI File from the export; falls back to the only/smallest markdown file. */
export function chooseZipEntry(names: readonly string[]): string | null {
  const markdown = names.filter((n) => /\.(?:md|markdown|txt)$/i.test(n) && !n.startsWith('__MACOSX'));
  return markdown.find((n) => /ai[_ -]?file/i.test(n)) ?? markdown.find((n) => !/master/i.test(n)) ?? markdown[0] ?? null;
}

export function assertKnowledgeMarkdown(text: string): void {
  if (/<mso:CanvasContent1|data-sp-canvascontrol/.test(text.slice(0, 200_000))) {
    throw new KnowledgeFileError('This is the raw “Master File” SharePoint export. Load the “AI File” markdown (or the zip that contains it) instead.');
  }
}

export interface LoadedKnowledgeFile {
  markdown: string;
  sourceName: string;
  /** Portfolio groups and departments read from the Master File, when the zip includes it. */
  structure?: SiteStructure | null;
}

/** Reads navigation structure from the Master File in the zip, if present. Failures are non-fatal. */
async function readStructure(buffer: ArrayBuffer, entries: ZipEntry[]): Promise<SiteStructure | null> {
  const master = entries.find((e) => /master[_ -]?file.*\.md$/i.test(e.name));
  if (!master || master.uncompressedSize > MAX_MASTER_BYTES) return null;
  try {
    return extractSiteStructure(await inflateEntry(buffer, master));
  } catch (error) {
    console.warn('[afaik] Could not read site structure from the Master File', error);
    return null;
  }
}

export async function readKnowledgeFile(file: File): Promise<LoadedKnowledgeFile> {
  if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
    const buffer = await file.arrayBuffer();
    const entries = readZipEntries(new DataView(buffer));
    const name = chooseZipEntry(entries.map((e) => e.name));
    const entry = entries.find((e) => e.name === name);
    if (!entry) throw new KnowledgeFileError('No markdown (.md) file was found inside this zip.');
    if (entry.uncompressedSize > MAX_MARKDOWN_BYTES) throw new KnowledgeFileError('The knowledge file inside this zip is too large (over 8 MB).');
    const markdown = await inflateEntry(buffer, entry);
    assertKnowledgeMarkdown(markdown);
    const structure = await readStructure(buffer, entries);
    return { markdown, sourceName: entry.name.split('/').pop() ?? entry.name, structure };
  }
  if (file.size > MAX_MARKDOWN_BYTES) throw new KnowledgeFileError('This file is too large (over 8 MB). Load the “AI File” markdown export.');
  const markdown = await file.text();
  assertKnowledgeMarkdown(markdown);
  return { markdown, sourceName: file.name };
}
