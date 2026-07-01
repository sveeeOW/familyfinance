import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { StartupLoader } from './src/components/StartupLoader';
import { OnboardingOverlay } from './src/components/OnboardingOverlay';
import { useAuth } from './src/store/auth';

export default function App() {
  const { status, bootstrap } = useAuth();
  const [minSplashDone, setMinSplashDone] = useState(false);

  useEffect(() => {
    bootstrap();
    const timer = setTimeout(() => setMinSplashDone(true), 1200);
    return () => clearTimeout(timer);
  }, [bootstrap]);

  const showLoader = status === 'loading' || !minSplashDone;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {showLoader ? (
        <StartupLoader />
      ) : (
        <>
          <RootNavigator />
          <OnboardingOverlay />
        </>
      )}
    </SafeAreaProvider>
  );
}
