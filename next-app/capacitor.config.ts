import type { CapacitorConfig } from '@capacitor/cli';

// The app has server routes (LiveKit tokens, companion, auth), so it cannot be
// exported as static files. The native shell loads the deployed site instead.
// Override with CAPACITOR_SERVER_URL (e.g. http://192.168.1.10:3000) for local
// device testing against `npm run dev`.
const PRODUCTION_URL = 'https://www.teemchat.chat';
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || PRODUCTION_URL;
const isInsecureDevUrl = serverUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'com.antigravity.virtualworld',
  appName: 'TeemChat',
  // Offline fallback bundled into the app; the live UI comes from server.url.
  webDir: 'native-shell',
  backgroundColor: '#180D26',
  // Lets the web app detect the native shell and hide the marketing landing page.
  appendUserAgent: 'TeemChatApp',
  server: {
    url: serverUrl,
    androidScheme: 'https',
    cleartext: isInsecureDevUrl,
    errorPath: 'index.html',
  },
  android: {
    allowMixedContent: isInsecureDevUrl,
    captureInput: true,
    // Unset: Capacitor enables WebView inspection for debug builds only.
  },
};

export default config;
