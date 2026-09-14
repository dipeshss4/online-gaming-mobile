import { spawn } from 'node:child_process';
import { startProxy } from './dev-proxy.mjs';

const proxy = startProxy();
let child;
proxy.on('error', error => { console.error(error.message); process.exitCode = 1; child?.kill(); });
proxy.on('listening', () => {
  const args = process.argv.slice(2);
  child = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', ...args, ...(args.includes('--port') ? [] : ['--port', '8081'])], { stdio: 'inherit' });
  child.on('exit', code => { proxy.close(); process.exitCode = code ?? 0; });
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child?.kill(signal); proxy.close(); });
