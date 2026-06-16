type CapacitorConfig = {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme?: string;
    cleartext?: boolean;
  };
  plugins?: Record<string, unknown>;
};

const config: CapacitorConfig = {
  appId: "com.breedingplanner.mobile",
  appName: "Breeding Planner Mobile",
  webDir: "build",
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#07110d",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#07110d",
    },
    Keyboard: {
      resize: "body",
    },
  },
};

export default config;
