import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MASTER_FILE_SNIPPET } from '../test/fixture';
import { assertKnowledgeMarkdown, chooseZipEntry, KnowledgeFileError, readKnowledgeFile } from './knowledgeFile';

/** Builds a minimal zip archive (deflate) in memory. */
function makeZip(entries: Array<{ name: string; text: string }>): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const raw = enc.encode(e.text);
    const data = new Uint8Array(deflateRawSync(raw));
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

describe('knowledge file reading', () => {
  it('prefers the AI File inside an export zip', () => {
    expect(chooseZipEntry(['KB_Master_File.md', 'KB_AI_File.md'])).toBe('KB_AI_File.md');
    expect(chooseZipEntry(['notes.txt'])).toBe('notes.txt');
    expect(chooseZipEntry(['image.png'])).toBeNull();
  });

  it('extracts the AI File from a zip', async () => {
    const zip = makeZip([
      { name: 'KB_Master_File.md', text: MASTER_FILE_SNIPPET },
      { name: 'KB_AI_File.md', text: '# Page\n\nHello world from the fixture.' },
    ]);
    const file = new File([zip.slice().buffer], 'export.zip', { type: 'application/zip' });
    await expect(readKnowledgeFile(file)).resolves.toEqual({ markdown: '# Page\n\nHello world from the fixture.', sourceName: 'KB_AI_File.md', structure: null });
  });

  it('reads plain markdown', async () => {
    const file = new File(['# Page\n\ntext'], 'kb.md', { type: 'text/markdown' });
    await expect(readKnowledgeFile(file)).resolves.toMatchObject({ sourceName: 'kb.md' });
  });

  it('rejects the raw Master File export', () => {
    expect(() => assertKnowledgeMarkdown(MASTER_FILE_SNIPPET)).toThrow(KnowledgeFileError);
  });
});
