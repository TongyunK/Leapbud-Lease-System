import { createHash } from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import PizZip from 'pizzip';

const execFileAsync = promisify(execFile);

const LO_PROFILE_DIR = path.join(os.tmpdir(), 'leapbud-lo-profile');
const PDF_DISK_CACHE_DIR = path.join(os.tmpdir(), 'leapbud-pdf-cache');
const LO_ACCEPT_PORT = 2002;

function resolveUnoScript(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'scripts', 'lo-uno-convert.py'),
    path.join(process.cwd(), 'scripts', 'lo-uno-convert.py'),
    path.join(process.cwd(), 'backend', 'scripts', 'lo-uno-convert.py'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const PDF_CACHE_TTL_MS = 60 * 60 * 1000;
const PDF_CACHE_MAX = 64;
const pdfCache = new Map<string, { buf: Buffer; at: number }>();

let resolvedSoffice: string | null | undefined;
let resolvedLoPython: string | null | undefined;
let convertQueue: Promise<unknown> = Promise.resolve();
let warmedUp = false;
let listenerProc: ChildProcess | null = null;
let listenerReady = false;

function sofficeCandidates(): string[] {
  const list: string[] = [];
  if (process.platform === 'win32') {
    list.push(
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    );
  }
  list.push('soffice', 'soffice.exe');
  return list;
}

function toFileUri(absPath: string): string {
  const normalized = path.resolve(absPath).replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}

async function resolveSoffice(): Promise<string | null> {
  if (resolvedSoffice !== undefined) return resolvedSoffice;

  for (const bin of sofficeCandidates()) {
    if (path.isAbsolute(bin) || bin.includes('\\') || bin.includes('/')) {
      if (fs.existsSync(bin)) {
        resolvedSoffice = bin;
        return bin;
      }
      continue;
    }
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('where.exe', [bin], {
          timeout: 3_000,
          windowsHide: true,
        });
        const found = String(stdout)
          .split(/\r?\n/)
          .map((s) => s.trim())
          .find(Boolean);
        if (found && fs.existsSync(found)) {
          resolvedSoffice = found;
          return found;
        }
      } else {
        const { stdout } = await execFileAsync('which', [bin], { timeout: 3_000 });
        const found = String(stdout).trim();
        if (found && fs.existsSync(found)) {
          resolvedSoffice = found;
          return found;
        }
      }
    } catch {
      /* try next */
    }
  }

  resolvedSoffice = null;
  return null;
}

async function resolveLoPython(sofficeBin: string): Promise<string | null> {
  if (resolvedLoPython !== undefined) return resolvedLoPython;
  const dir = path.dirname(sofficeBin);
  const candidates = [
    path.join(dir, 'python.exe'),
    path.join(dir, 'python'),
    path.join(dir, 'python.bin'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      resolvedLoPython = p;
      return p;
    }
  }
  resolvedLoPython = null;
  return null;
}

function cacheGet(key: string): Buffer | null {
  const hit = pdfCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PDF_CACHE_TTL_MS) {
    pdfCache.delete(key);
    return null;
  }
  hit.at = Date.now();
  return hit.buf;
}

function cacheSet(key: string, buf: Buffer) {
  pdfCache.set(key, { buf, at: Date.now() });
  while (pdfCache.size > PDF_CACHE_MAX) {
    let oldestKey: string | undefined;
    let oldestAt = Infinity;
    for (const [k, v] of pdfCache) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) pdfCache.delete(oldestKey);
    else break;
  }
}

function diskCachePath(key: string) {
  const safe = createHash('sha1').update(key).digest('hex');
  return path.join(PDF_DISK_CACHE_DIR, `${safe}.pdf`);
}

async function diskCacheGet(key: string): Promise<Buffer | null> {
  try {
    const p = diskCachePath(key);
    const st = await fsp.stat(p);
    if (Date.now() - st.mtimeMs > PDF_CACHE_TTL_MS) {
      await fsp.rm(p, { force: true }).catch(() => undefined);
      return null;
    }
    return await fsp.readFile(p);
  } catch {
    return null;
  }
}

async function diskCacheSet(key: string, buf: Buffer) {
  try {
    await fsp.mkdir(PDF_DISK_CACHE_DIR, { recursive: true });
    await fsp.writeFile(diskCachePath(key), buf);
  } catch {
    /* ignore disk cache errors */
  }
}

export function invalidatePdfCache(keyOrPrefix?: string) {
  if (!keyOrPrefix) {
    pdfCache.clear();
    void fsp.rm(PDF_DISK_CACHE_DIR, { recursive: true, force: true }).catch(() => undefined);
    return;
  }
  for (const k of [...pdfCache.keys()]) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) pdfCache.delete(k);
  }
  if (keyOrPrefix.startsWith('tpl:') || keyOrPrefix.startsWith('print:')) {
    void fsp.rm(PDF_DISK_CACHE_DIR, { recursive: true, force: true }).catch(() => undefined);
  }
}

function enqueueConvert<T>(fn: () => Promise<T>): Promise<T> {
  const run = convertQueue.then(fn, fn);
  convertQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function runExecFile(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; stderr?: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env },
    });
    let stderr = '';
    child.stderr?.on('data', (d) => {
      stderr += String(d);
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, stderr });
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, stderr });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stderr });
    });
  });
}

/** 探测 2002 是否已有可用的 LO 监听（含上次残留进程） */
async function probeListener(sofficeBin: string): Promise<boolean> {
  const py = await resolveLoPython(sofficeBin);
  const unoScript = resolveUnoScript();
  if (!py || !fs.existsSync(unoScript)) return false;
  // 用极短超时的 python 连接探测：写一个空脚本太重，直接 net 探测端口
  return await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: LO_ACCEPT_PORT });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 800);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function ensureListener(bin: string): Promise<void> {
  if (listenerProc && !listenerProc.killed && listenerProc.exitCode == null && listenerReady) {
    return;
  }

  if (await probeListener(bin)) {
    listenerReady = true;
    return;
  }

  if (listenerProc && !listenerProc.killed && listenerProc.exitCode == null) {
    await new Promise((r) => setTimeout(r, 1000));
    if (listenerReady || (await probeListener(bin))) {
      listenerReady = true;
      return;
    }
  }

  await fsp.mkdir(LO_PROFILE_DIR, { recursive: true });
  listenerReady = false;
  listenerProc = spawn(
    bin,
    [
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--norestore',
      `-env:UserInstallation=${toFileUri(LO_PROFILE_DIR)}`,
      `--accept=socket,host=127.0.0.1,port=${LO_ACCEPT_PORT};urp;StarOffice.ComponentContext`,
    ],
    {
      windowsHide: true,
      stdio: 'ignore',
      // 与 Nest 解耦：dev watch 重启后仍可复用已预热的 LO，避免每次冷启动
      detached: true,
      env: { ...process.env },
    },
  );
  listenerProc.unref();
  listenerProc.on('exit', () => {
    listenerProc = null;
    listenerReady = false;
  });

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await probeListener(bin)) {
      listenerReady = true;
      return;
    }
  }
  listenerReady = true; // 仍尝试后续 UNO，由 convert 决定成败
}

/** 通过 UNO 复用常驻实例转换（二次起通常远快于每次 --convert-to） */
async function convertViaUno(
  sofficeBin: string,
  inputPath: string,
  pdfPath: string,
): Promise<boolean> {
  const py = await resolveLoPython(sofficeBin);
  const unoScript = resolveUnoScript();
  if (!py || !fs.existsSync(unoScript)) return false;

  await ensureListener(sofficeBin);
  await fsp.rm(pdfPath, { force: true }).catch(() => undefined);

  const result = await runExecFile(
    py,
    [unoScript, inputPath, pdfPath, '127.0.0.1', String(LO_ACCEPT_PORT)],
    90_000,
  );
  if (!result.ok) return false;
  try {
    await fsp.access(pdfPath);
    return true;
  } catch {
    return false;
  }
}

/** 回退：每次拉起 soffice --convert-to（慢，但兼容） */
async function convertViaCli(
  bin: string,
  inputPath: string,
  outDir: string,
  pdfPath: string,
): Promise<boolean> {
  await fsp.mkdir(LO_PROFILE_DIR, { recursive: true });
  const profileArg = `-env:UserInstallation=${toFileUri(LO_PROFILE_DIR)}`;
  const attempts: string[][] = [
    [
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--norestore',
      profileArg,
      '--convert-to',
      'pdf',
      '--outdir',
      outDir,
      inputPath,
    ],
    [
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--convert-to',
      'pdf',
      '--outdir',
      outDir,
      inputPath,
    ],
  ];

  for (const args of attempts) {
    await fsp.rm(pdfPath, { force: true }).catch(() => undefined);
    await runExecFile(bin, args, 90_000);
    try {
      await fsp.access(pdfPath);
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function runSofficeConvert(
  bin: string,
  inputPath: string,
  outDir: string,
): Promise<boolean> {
  const pdfPath = path.join(outDir, 'input.pdf');
  if (await convertViaUno(bin, inputPath, pdfPath)) return true;
  return convertViaCli(bin, inputPath, outDir, pdfPath);
}

function buildMinimalDocx(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>ok</w:t></w:r></w:p></w:body>
</w:document>`,
  );
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

async function doConvert(docxBuffer: Buffer): Promise<Buffer | null> {
  const bin = await resolveSoffice();
  if (!bin) return null;

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'leapbud-docx-'));
  try {
    const inputPath = path.join(tmpDir, 'input.docx');
    const pdfPath = path.join(tmpDir, 'input.pdf');
    await fsp.writeFile(inputPath, docxBuffer);
    const ok = await runSofficeConvert(bin, inputPath, tmpDir);
    if (!ok) return null;
    return await fsp.readFile(pdfPath);
  } catch {
    return null;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * docx → pdf。优先内存/磁盘缓存；转换走常驻 UNO 监听（失败再回退 CLI）。
 */
export async function convertDocxToPdf(
  docxBuffer: Buffer,
  cacheKey?: string,
): Promise<Buffer | null> {
  const key =
    cacheKey || `sha1:${createHash('sha1').update(docxBuffer).digest('hex')}`;

  const mem = cacheGet(key);
  if (mem) return mem;

  const disk = await diskCacheGet(key);
  if (disk) {
    cacheSet(key, disk);
    return disk;
  }

  const pdf = await enqueueConvert(() => doConvert(docxBuffer));
  if (pdf) {
    cacheSet(key, pdf);
    void diskCacheSet(key, pdf);
  }
  return pdf;
}

/** 启动时预热：拉起常驻 soffice + 做一次空转换 */
export function warmUpLibreOffice(): void {
  if (warmedUp) return;
  warmedUp = true;
  void (async () => {
    try {
      const bin = await resolveSoffice();
      if (!bin) return;
      await ensureListener(bin);
      await convertDocxToPdf(buildMinimalDocx(), 'warmup:empty');
      invalidatePdfCache('warmup:');
    } catch {
      /* ignore */
    }
  })();
}
