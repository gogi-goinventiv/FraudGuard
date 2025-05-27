import { createContext } from "react";

interface ManualCaptureWarningContextType {
  manualCaptureWarning: boolean;
  setManualCaptureWarning: (value: boolean) => void;
}

export const ManualCaptureWarningContext = createContext<ManualCaptureWarningContextType>({
  manualCaptureWarning: false,
  setManualCaptureWarning: () => {},
});

