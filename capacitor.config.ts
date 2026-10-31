import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.sciencebyhugs.nexus.staging',
  appName: 'Nexus by SBH',
  webDir: 'dist',
  server: { hostname: 'localhost', iosScheme: 'capacitor' },
  ios: { contentInset: 'never' },
  plugins: { PrivacyScreen: { enabled: true }, PushNotifications: { presentationOptions: ['banner', 'list', 'sound'] } },
}

export default config
