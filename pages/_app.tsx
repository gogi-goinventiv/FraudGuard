import type { AppProps } from 'next/app';
import '../styles/globals.css';
import React, { useState } from 'react';
import { ManualCaptureWarningContext } from '../context/manualCaptureWarning';

export default function App({ Component, pageProps }: AppProps) {
  const [manualCaptureWarning, setManualCaptureWarning] = useState(false);
  
  return (
    <React.Suspense>
      <ManualCaptureWarningContext.Provider value={{ manualCaptureWarning, setManualCaptureWarning }}>
        <Component {...pageProps} />
      </ManualCaptureWarningContext.Provider>
    </React.Suspense>
  )
}
