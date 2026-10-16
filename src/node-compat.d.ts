// Minimal platform boundary for offline checkJs without an additional dependency.
// Node APIs remain permissive; project functions and their callers are checked.
declare const process: any;
declare const Buffer: any;
declare module 'node:child_process' {
  export const spawn: any;
  export const spawnSync: any;
}
declare module 'node:crypto' {
  export const createHash: any;
  export const randomUUID: any;
}
declare module 'node:fs' {
  export const accessSync: any;
  export const appendFileSync: any;
  export const chmodSync: any;
  export const closeSync: any;
  export const constants: any;
  export const existsSync: any;
  export const fstatSync: any;
  export const linkSync: any;
  export const lstatSync: any;
  export const mkdirSync: any;
  export const mkdtempSync: any;
  export const openSync: any;
  export const readFileSync: any;
  export const readSync: any;
  export const readdirSync: any;
  export const realpathSync: any;
  export const renameSync: any;
  export const rmSync: any;
  export const rmdirSync: any;
  export const statSync: any;
  export const unlinkSync: any;
  export const writeFileSync: any;
}
declare module 'node:os' {
  export function homedir(): string;
  export function tmpdir(): string;
}
declare module 'node:path' {
  export function basename(...paths: string[]): string;
  export const delimiter: any;
  export function dirname(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
  export function join(...paths: string[]): string;
  export function parse(...paths: string[]): any;
  export const posix: any;
  export function relative(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export const sep: any;
  export const win32: any;
}
declare module 'node:process' {
  export const stdin: any;
  export const stdout: any;
}
declare module 'node:readline' {
  export const createInterface: any;
}
declare module 'node:string_decoder' {
  export const StringDecoder: any;
}
declare module 'node:url' {
  export function fileURLToPath(path: string | URL): string;
  export function pathToFileURL(path: string | URL): URL;
}
declare module 'node:util' {
  export const isDeepStrictEqual: any;
}

interface Error { code?: string; }
declare function setTimeout(callback: (...args: any[]) => void, ms?: number): number & { unref(): void };
