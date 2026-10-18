import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const dotnet = process.env.DOTNET_EXE;
const assembly = process.env.DOTNET_DLL;
if (!dotnet || !assembly) {
    console.error('DOTNET_EXE and DOTNET_DLL must be configured.');
    process.exit(1);
}

const child = spawn(dotnet, [assembly], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
});
let stopping = false;
let stopFileSeen = false;
const stopFile = process.env.SOLUTIONDEPLOY_STOP_FILE;
const watchdog = setInterval(() => {
    if (!stopFileSeen && stopFile && existsSync(stopFile)) {
        stopFileSeen = true;
        console.info('SolutionDeploy stop file detected; waiting for the API host to shut down gracefully.');
        const fallback = setTimeout(() => {
            if (child.exitCode === null) child.kill('SIGTERM');
        }, 30000);
        fallback.unref();
    }
}, 250);
const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    if (child.exitCode === null) child.kill(signal);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('exit', () => stop('SIGTERM'));
child.on('error', (error) => {
    clearInterval(watchdog);
    console.error(`Failed to start the WebBookmarks API: ${error.message}`);
    process.exitCode = 1;
});
child.on('exit', (code, signal) => {
    clearInterval(watchdog);
    process.exitCode = code ?? (signal ? 1 : 0);
});
