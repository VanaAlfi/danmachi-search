// vinext's immediate process.exit(0) can race native handle cleanup on Windows.
// Let a successful build drain naturally; failures retain their normal exit.
const originalExit = process.exit.bind(process);
if (process.platform === 'win32') {
  process.exit = (code) => {
    if (code === 0) { process.exitCode = 0; return; }
    return originalExit(code);
  };
}
process.argv = [process.execPath, 'vinext', 'build'];
await import(new URL('./cli.js', import.meta.resolve('vinext')).href);
