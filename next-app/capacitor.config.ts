import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.antigravity.virtualworld',
  appName: 'TeemChat',
  webDir: 'out',
  backgroundColor: '#180D26',
  server: {
    androidScheme: 'https',
    cleartext: true,
    ...(serverUrl ? { url: serverUrl } : {}),
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production',
  },
};

export default config;
