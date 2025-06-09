import type { AppProps } from 'next/app';
import '../styles/globals.css';
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { AppProvider } from '@shopify/app-bridge-react';
import { ManualCaptureWarningContext } from '../context/manualCaptureWarning';

export default function App({ Component, pageProps }: AppProps) {
  const [manualCaptureWarning, setManualCaptureWarning] = useState(false);
  const router = useRouter();
  
  // Extract host and shop from query parameters
  const { host, shop } = router.query;

  // App Bridge configuration
  const appBridgeConfig = {
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!,
    host: host as string,
    forceRedirect: true,
  };

  // If we have Shopify parameters, wrap with App Bridge Provider
  if (host && shop && process.env.NEXT_PUBLIC_SHOPIFY_API_KEY) {
    return (
      <React.Suspense>
        <Provider config={appBridgeConfig}>
          <ManualCaptureWarningContext.Provider value={{ manualCaptureWarning, setManualCaptureWarning }}>
            <Component {...pageProps} />
          </ManualCaptureWarningContext.Provider>
        </Provider>
      </React.Suspense>
    );
  }

  // Fallback for when Shopify parameters aren't available or for non-Shopify pages
  return (
    <React.Suspense>
      <ManualCaptureWarningContext.Provider value={{ manualCaptureWarning, setManualCaptureWarning }}>
        <Component {...pageProps} />
      </ManualCaptureWarningContext.Provider>
    </React.Suspense>
  );
}
