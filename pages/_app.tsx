import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import React, { useState } from 'react';
import { ManualCaptureWarningContext } from '../context/manualCaptureWarning';

export default function App({ Component, pageProps }: AppProps) {
  const [manualCaptureWarning, setManualCaptureWarning] = useState(false);
  
  return (
    <React.Suspense>
      <Head>
        <meta name="shopify-api-key" content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY} />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
      </Head>
      <ManualCaptureWarningContext.Provider value={{ manualCaptureWarning, setManualCaptureWarning }}>
        <Component {...pageProps} />
      </ManualCaptureWarningContext.Provider>
    </React.Suspense>
  )
}
