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
    // Must be true for @capacitor-community/background-geolocation, otherwise
    // location updates stop after ~5 minutes in the background.
    useLegacyBridge: true,
  },
  plugins: {
    Geolocation: {
      // Enables high-accuracy GPS
    },
  },
};

export default config;
