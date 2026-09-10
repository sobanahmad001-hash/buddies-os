// Build exactly the same engine used by the app/tests for the Supabase worker.
// Optional build dependency; install esbuild 0.25.10 outside production dependencies.
import {fileURLToPath} from 'node:url';
const {build}=await import(process.env.BUDDIES_ESBUILD_MODULE||'esbuild');
const root=fileURLToPath(new URL('../',import.meta.url));
await build({absWorkingDir:root,stdin:{contents:'export {runPaperWorker} from "./src/lib/trading-lab/paper-service";',resolveDir:root},outfile:root+'supabase/functions/trading-paper-worker/worker.js',bundle:true,platform:'node',format:'esm',target:'es2022',minify:true,banner:{js:'import process from "node:process";'},define:{'process.env.NEXT_PUBLIC_SUPABASE_URL':'process.env.SUPABASE_URL'},external:['@supabase/supabase-js','node:crypto'],plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}}]});
console.log('Built shared paper engine for the scheduled worker.');
