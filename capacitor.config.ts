import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ekta.enterprises',
  appName: 'Ekta Enterprises',
  webDir: 'dist',
  server: {
    // Replace with your actual server URL (the same one your browser uses)
    url: 'https://test.ekta-enterprises.com',
    cleartext: true, // Allow HTTP connections
  },
  android: {
    allowMixedContent: true,
    useLegacyBridge: false,
  },
  plugins: {
    Geolocation: {
      // Enables high-accuracy GPS
    },
    BackgroundRunner: {
      label: 'com.ekta.enterprises.check.location',
      src: 'background.js',        // We'll create this file
      event: 'locationUpdate',
      repeat: true,
      interval: 2,                  // Run every 2 minutes
      autoStart: true,
    },
  },
};

export default config;
