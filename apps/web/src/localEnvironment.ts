export function isLocalEnvironmentDisabled(): boolean {
  return globalThis.window?.desktopBridge?.getLocalEnvironmentEnabled() === false;
}
