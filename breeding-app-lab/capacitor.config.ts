import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.breedingplanner.lab",
  appName: "Breeding Planner Lab",
  webDir: "build",
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      // The Serpentora ground, matching drawable*/splash.png. This was #0f172a
      // (slate) while the splash art itself was the stock Capacitor logo on
      // white, so the launch flashed white and then settled on a dark colour
      // that belonged to neither the art nor the brand.
      backgroundColor: "#07110D",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#07110D",
    },
    Keyboard: {
      resize: "body",
    },
  },
};

export default config;
