const apps = [];
export function initializeApp(cfg, name = '[DEFAULT]') { const a = { cfg, name }; apps.push(a); return a; }
export const getApps = () => apps.slice();
