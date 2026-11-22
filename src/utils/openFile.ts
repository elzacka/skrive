import type { FileSystemFileHandle } from '@/types';
import { MAX_NOTE_FILE_SIZE } from './storage';

// A file the OS opened with Skrive. It is edited where it lies and never
// enters the notes, the history or a backup
export interface OpenedFile {
  handle: FileSystemFileHandle;
  text: string;
  lastModified: number;
  // Written back as found: text holds \n line endings and no BOM
  crlf: boolean;
  bom: boolean;
}

export type OpenResult =
  | { kind: 'ok'; file: OpenedFile }
  | { kind: 'tooLarge' | 'notText' | 'failed' };

// Set once before render: the consumer gets each launch exactly once, and
// none after a reload
export function waitForLaunchedFile(): Promise<FileSystemFileHandle> | null {
  if (!window.launchQueue) return null;
  return new Promise(resolve => {
    window.launchQueue!.setConsumer(params => {
      if (params.files.length > 0) resolve(params.files[0]);
    });
  });
}

export async function readOpenedFile(handle: FileSystemFileHandle): Promise<OpenResult> {
  try {
    const file = await handle.getFile();
    if (file.size > MAX_NOTE_FILE_SIZE) return { kind: 'tooLarge' };
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
    } catch {
      return { kind: 'notText' };
    }
    // Saving would rewrite another encoding or a binary file as UTF-8
    if (text.includes('\0')) return { kind: 'notText' };
    const bom = text.startsWith('\uFEFF');
    if (bom) text = text.slice(1);
    // The more common ending wins, so one pasted CRLF line does not
    // rewrite a whole LF file. The editor gets \n, as it holds it
    const crlf = (text.match(/\r\n/g)?.length ?? 0) > (text.match(/(?<!\r)\n/g)?.length ?? 0);
    text = text.replace(/\r\n?/g, '\n');
    return { kind: 'ok', file: { handle, text, lastModified: file.lastModified, crlf, bom } };
  } catch {
    return { kind: 'failed' };
  }
}

// Refuses when another program changed the file since Skrive last read
// or wrote it (expected), unless expected is null. Returns the new
// lastModified
export async function writeOpenedFile(file: OpenedFile, text: string, expected: number | null): Promise<number | 'changed'> {
  if (expected !== null && (await file.handle.getFile()).lastModified !== expected) return 'changed';
  const data = (file.bom ? '\uFEFF' : '') + (file.crlf ? text.replace(/\n/g, '\r\n') : text);
  const writable = await file.handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (e) {
    await writable.abort().catch(() => {});
    throw e;
  }
  return (await file.handle.getFile()).lastModified;
}
