// Download the fixed model once on the app host, never in each user's browser.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, copyFile, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICE_MODEL, VOICE_REVISION } from '../lib/voiceModel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const revision = VOICE_REVISION;
const model = VOICE_MODEL;
const voice = path.join(root, 'public', 'voice');
const files = [
  ...['config.json', 'tokenizer.json', 'tokenizer_config.json', 'preprocessor_config.json', 'generation_config.json'].map(name => ({name})),
  {name:'onnx/encoder_model_quantized.onnx',size:23200856,sha:'d0d4e59e2842617b39787cece73d7e8f76f99b1697d3386c0e682eca2269f4a1'},
  {name:'onnx/decoder_model_merged_quantized.onnx',size:53707027,sha:'a25afc5858a20aabb7652cb2d555996ebe10691a69bbdb423d5073d52f060325'},
];
async function valid(file, destination) {
  try {
    if (!file.sha) {JSON.parse(await readFile(destination, 'utf8'));return true;}
    if ((await stat(destination)).size !== file.size) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(destination)) hash.update(chunk);
    return hash.digest('hex') === file.sha;
  } catch { return false; }
}
async function download(file) {
  const destination = path.join(voice, 'models', model, file.name);
  if (await valid(file, destination)) return;
  await mkdir(path.dirname(destination), {recursive:true});
  console.log(`Installing voice file: ${file.name}`);
  const response = await fetch(`https://huggingface.co/${model}/resolve/${revision}/${file.name}`, {signal:AbortSignal.timeout(600000)});
  if (!response.ok) throw new Error(`Voice download failed (${response.status}): ${file.name}. Run npm run setup:voice to retry.`);
  const partial = `${destination}.partial`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  if (!await valid(file, partial)) throw new Error(`Voice file verification failed: ${file.name}`);
  await rename(partial, destination);
  console.log(`Verified voice file: ${file.name}`);
}
await Promise.all(files.map(download));
await mkdir(path.join(voice,'runtime'), {recursive:true});
for (const filename of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  await copyFile(path.join(root,'node_modules/@huggingface/transformers/dist',filename), path.join(voice,'runtime',filename));
}
await writeFile(path.join(voice,'ready.json'),JSON.stringify({model,revision,runtime:'3.8.1'}));
console.log('Local voice model ready. Browsers now load voice files from this app, without external model downloads.');
