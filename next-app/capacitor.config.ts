import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.antigravity.virtualworld',
  appName: 'TeemChat',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
