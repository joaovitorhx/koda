import { copyFile, access } from 'node:fs/promises';
for (const [source, target] of [
  ['.env.example', '.env.local'],
  ['server/.env.example', 'server/.env'],
]) {
  try {
    await access(target);
    console.log(`${target} já existe; preservado.`);
  } catch {
    await copyFile(source, target);
    console.log(`${target} criado. Preencha os valores indicados.`);
  }
}
