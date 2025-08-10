import { promises as fs } from "fs";
export async function readJson(path: string) { return JSON.parse(await fs.readFile(path, "utf8")); }
export async function writeJson(path: string, obj: any) {
  await fs.mkdir(require("path").dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(obj, null, 2));
}
