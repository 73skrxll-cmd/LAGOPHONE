const path = require('node:path');

// Windows PowerShell 5.1 must not inherit PowerShell 7's module search path.
// Preserve the rest of the environment, including injected authentication/proxy settings.
function windowsPowerShellEnvironment(inherited = process.env) {
  const environment = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (!['psmodulepath', 'psmoduleanalysiscachepath'].includes(key.toLowerCase())) environment[key] = value;
  }
  const get = name => Object.entries(inherited).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  const systemRoot = get('SystemRoot') || 'C:\\Windows';
  const programFiles = get('ProgramFiles') || 'C:\\Program Files';
  environment.PSModulePath = [
    path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'),
    path.win32.join(programFiles, 'WindowsPowerShell', 'Modules'),
  ].join(';');
  return environment;
}
function windowsPowerShellExecutable(inherited = process.env) {
  const root = Object.entries(inherited).find(([key]) => key.toLowerCase() === 'systemroot')?.[1] || 'C:\\Windows';
  return path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}
module.exports = { windowsPowerShellEnvironment, windowsPowerShellExecutable };
