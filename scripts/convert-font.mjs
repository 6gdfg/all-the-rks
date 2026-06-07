import { mkdir, readFile, writeFile } from "node:fs/promises";
import ttf2woff2 from "ttf2woff2";

const source = "cmdysj.ttf";
const target = "public/fonts/cmdysj.woff2";

await mkdir("public/fonts", { recursive: true });

const input = await readFile(source);
await writeFile(target, ttf2woff2(input));

console.log(`Converted ${source} -> ${target}`);
