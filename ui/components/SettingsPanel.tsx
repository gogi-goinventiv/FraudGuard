import { useEffect, useState } from "react";
import { IoIosArrowDown } from 'react-icons/io';
import { TiWarningOutline } from "react-icons/ti";
import { useRouter } from 'next/router';

export default function SettingsPanel({ shop, host }: { shop: string, host: string }) {
  const [flagRiskLevel, setFlagRiskLevel] = useState("high+medium");
  const [emailRiskLevel, setEmailRiskLevel] = useState("high+medium");
  const [autoCancelHighRisk, setAutoCancelHighRisk] = useState(false);
  const [autoCancelUnverified, setAutoCancelUnverified] = useState(false);
  const [autoApproveVerified, setAutoApproveVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manualCaptureStatus, setManualCaptureStatus] = useState(false);

  const router = useRouter();

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/risk-settings?shop=${shop}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-shopify-shop-domain': shop
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch risk settings");
      }
      const data = await res.json();

      if (!data) {
        setFlagRiskLevel("high+medium");
        setEmailRiskLevel("high+medium");
        setAutoCancelHighRisk(false);
        setAutoCancelUnverified(false);
        setAutoApproveVerified(false);
        return;
      }

      if (data.flagHighRisk && data.flagMediumRisk) setFlagRiskLevel("high+medium");
      else if (data.flagHighRisk && !data.flagMediumRisk) setFlagRiskLevel("high");
      else if (!data.flagHighRisk && data.flagMediumRisk) setFlagRiskLevel("medium");

      if (data.emailHighRisk && data.emailMediumRisk) setEmailRiskLevel("high+medium");
      else if (data.emailHighRisk && !data.emailMediumRisk) setEmailRiskLevel("high");
      else if (!data.emailHighRisk && data.emailMediumRisk) setEmailRiskLevel("medium");

      // Set auto-cancel and auto-approve settings
      setAutoCancelHighRisk(data.autoCancelHighRisk || false);
      setAutoCancelUnverified(data.autoCancelUnverified || false);
      setAutoApproveVerified(data.autoApproveVerified || false);
    } catch (err: any) {
      setError(err.message);
      setFlagRiskLevel("high+medium");
      setEmailRiskLevel("high+medium");
      setAutoCancelHighRisk(false);
      setAutoCancelUnverified(false);
      setAutoApproveVerified(false);
    } finally {
      setLoading(false);
    }
  };

  const updateFlagRiskLevel = async (newLevel: string) => {
    updateSetting("flag", newLevel);
  };

  const updateEmailRiskLevel = async (newLevel: string) => {
    updateSetting("email", newLevel);
  };

  const updateSetting = async (settingType: "flag" | "email" | "autoAction", newLevel: string | boolean, actionType?: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings/risk-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shopify-shop-domain": shop
        },
        body: JSON.stringify({
          settingType,
          riskLevel: newLevel,
          actionType,
          shop
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update risk settings");
      }

      if (settingType === "flag") {
        setFlagRiskLevel(newLevel as string);
      } else if (settingType === "email") {
        setEmailRiskLevel(newLevel as string);
      }
      // No need to update state for autoAction as it's handled in the onChange event
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoActionChange = async (action: string, value: boolean) => {
    const prevValue =
      action === 'autoCancelHighRisk' ? autoCancelHighRisk :
        action === 'autoCancelUnverified' ? autoCancelUnverified :
          autoApproveVerified;

    // Optimistically update the UI
    if (action === 'autoCancelHighRisk') setAutoCancelHighRisk(value);
    else if (action === 'autoCancelUnverified') setAutoCancelUnverified(value);
    else if (action === 'autoApproveVerified') setAutoApproveVerified(value);

    // Send update to server
    try {
      await updateSetting("autoAction", value, action);
    } catch (err) {
      // Revert to previous state if there's an error
      if (action === 'autoCancelHighRisk') setAutoCancelHighRisk(prevValue);
      else if (action === 'autoCancelUnverified') setAutoCancelUnverified(prevValue);
      else if (action === 'autoApproveVerified') setAutoApproveVerified(prevValue);
    }
  };

  const getManualCaptureStatus = async () => {
    const response = await fetch(`/api/shop/onboarding?shop=${shop}`);
    const data = await response.json();
    if (!data.result?.manualCaptureEnabled) setManualCaptureStatus(false);
    setManualCaptureStatus(data.result?.manualCaptureEnabled);
  }

  const updateManualCaptureStatus = async (value: boolean) => {
    const response = await fetch(`/api/shop/onboarding?shop=${shop}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ manualCaptureEnabled: value })
    });
    const data = await response.json();
    if (!data.result?.manualCaptureEnabled) setManualCaptureStatus(false);
    setManualCaptureStatus(data.result?.manualCaptureEnabled);
    router.replace('/settings?shop=' + shop + '&host=' + host);
  }

  useEffect(() => {
    if (shop) {
      fetchSettings();
      getManualCaptureStatus();
    }
  }, [shop, manualCaptureStatus]);

  useEffect(() => {
    const condition =
      (flagRiskLevel === "high+medium" || flagRiskLevel === "high") &&
      emailRiskLevel === "medium";

    if (!condition && autoCancelHighRisk) {
      // Optimistically update UI
      setAutoCancelHighRisk(false);

      // Update the server
      updateSetting("autoAction", false, "autoCancelHighRisk").catch(() => {
        // Optional: Revert if server update fails
        setAutoCancelHighRisk(true);
      });
    }
  }, [flagRiskLevel, emailRiskLevel]);

  return (
    <div className="p-4 rounded">
      {
        <>
          <div className={`flex items-center p-4 ${manualCaptureStatus ? 'bg-green-50 border-l-4 border-green-500' : 'bg-amber-50 border-l-4 border-amber-500'} rounded-md shadow-sm`}>
            <div className="flex flex-grow items-center justify-between">
              <label className="flex items-center cursor-pointer">
                <div className="mr-2">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={manualCaptureStatus}
                    onChange={(e) => updateManualCaptureStatus(e.target.checked)}
                  />
                  <div className={`relative w-11 h-6 bg-gray-300 rounded-full peer peer-focus:ring-2 ${manualCaptureStatus ? 'peer-focus:ring-green-300' : 'peer-focus:ring-amber-300'} peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${manualCaptureStatus ? 'peer-checked:bg-green-500' : 'peer-checked:bg-amber-500'}`}></div>
                </div>
                <span className={`text-lg font-medium ${manualCaptureStatus ? 'text-green-600' : 'text-amber-600'}`}>Confirm manual capture mode</span>
              </label>
              <span className={`text-sm ${manualCaptureStatus ? 'text-green-600' : 'text-amber-600'} font-medium`}>
                {manualCaptureStatus ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
          </div>
        </>
      }

      <label className="block mt-8">
        <span className="text-lg font-medium">Which orders to flag</span>
        <div className="relative w-full mt-4">
          <select
            className="w-full py-2 px-4 pr-8 appearance-none bg-transparent border border-gray-300 rounded-md focus:outline-none"
            value={flagRiskLevel}
            onChange={(e) => updateFlagRiskLevel(e.target.value)}
            disabled={loading}
          >
            <option value="high">High Only</option>
            <option value="high+medium">High risk and medium risk</option>
            <option value="medium">Medium Only</option>
          </select>
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
            <IoIosArrowDown className="w-4 h-4 text-gray-500" />
          </div>
        </div>

        <div className="mt-4">
          <span className="text-lg font-medium">Verification emails</span>
          <div className="relative w-full mt-4">
            <select
              className="w-full py-2 px-4 pr-8 appearance-none bg-transparent border border-gray-300 rounded-md focus:outline-none"
              value={emailRiskLevel}
              onChange={(e) => updateEmailRiskLevel(e.target.value)}
              disabled={loading}
            >
              <option value="high">High Only</option>
              <option value="high+medium">High risk and medium risk</option>
              <option value="medium">Medium Only</option>
            </select>
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <IoIosArrowDown className="w-4 h-4 text-gray-500" />
            </div>
          </div>
        </div>

        <div className="mt-6 border-t pt-4">
          <span className="text-lg font-medium">Automated actions</span>

          {(flagRiskLevel === "high+medium" || flagRiskLevel === "high") && (emailRiskLevel === "medium") && <div className="flex items-center mt-4">
            <input
              className="mr-2"
              type="checkbox"
              id="autoCancelHighRisk"
              checked={autoCancelHighRisk}
              onChange={(e) => handleAutoActionChange('autoCancelHighRisk', e.target.checked)}
              disabled={loading}
            />
            <label htmlFor="autoCancelHighRisk">Auto-Cancel High-Risk Orders</label>
          </div>}

          <div className="flex flex-col mt-4">
            <div>
              <input
                className="mr-2"
                type="checkbox"
                id="autoCancelUnverified"
                checked={autoCancelUnverified}
                onChange={(e) => handleAutoActionChange('autoCancelUnverified', e.target.checked)}
                disabled={loading}
              />
              <label htmlFor="autoCancelUnverified">Auto-Cancel Unverified Orders</label>
            </div>
            <div className="flex mt-2">
              <TiWarningOutline size={25} className="mr-2 text-amber-500" />
              <span className="text-sm text-amber-500 font-semibold">When this option is enabled, any time a customer fails to provide correct details, the order will be auto-cancelled.</span>
            </div>
          </div>

          <div className="flex items-center mt-4">
            <input
              className="mr-2"
              type="checkbox"
              id="autoApproveVerified"
              checked={autoApproveVerified}
              onChange={(e) => handleAutoActionChange('autoApproveVerified', e.target.checked)}
              disabled={loading}
            />
            <label htmlFor="autoApproveVerified">Auto-Approve Verified Orders</label>
          </div>
        </div>
      </label>

      {loading && <p className="text-sm text-gray-500 my-4">Updating...</p>}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}