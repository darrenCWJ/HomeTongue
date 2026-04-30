import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hometongue.app',
  appName: 'HomeTongue',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
