import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ekta_enterprises.app',
  appName: 'Ekta Enterprises',
  webDir: 'dist',
  server: {
    url: 'https://app.ekta-enterprises.com',
    cleartext: true
  }
};

export default config;