import React, { useEffect, useState, useRef } from 'react';
import { toast, ToastContainer } from 'react-toastify';

const CONCURRENCY_LIMIT = 5;

async function fetchWithConcurrencyLimit(tasks, limit) {
  const results = [];
  let i = 0;

  async function worker() {
    while (i < tasks.length) {
      const current = i++;
      results[current] = await tasks[current]();
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
}

const Badge = ({ status }: { status: string }) => {
  let color = 'bg-gray-300 text-gray-800';
  if (status === 'ACTIVE') color = 'bg-green-100 text-green-800';
  if (status === 'CANCELLED') color = 'bg-red-100 text-red-800';
  if (status === 'PENDING') color = 'bg-yellow-100 text-yellow-800';
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${color}`}>{status}</span>
  );
};

const FieldLabel = ({ children, tooltip }: { children: React.ReactNode, tooltip?: string }) => (
  <div className="flex items-center gap-1">
    <span className="text-gray-700 font-medium">{children}</span>
    {tooltip && (
      <span className="text-xs text-gray-400" title={tooltip}>ⓘ</span>
    )}
  </div>
);

const SectionCard = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="w-full bg-white rounded-xl shadow p-6 mb-6 border border-gray-100">
    <h2 className="text-lg font-semibold mb-4 text-gray-800">{title}</h2>
    {children}
  </div>
);

const AdminTrialExtension = () => {
  const [merchants, setMerchants] = useState<{ db: string; name?: string }[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<{ db: string; name?: string } | null>(null);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [extensionDays, setExtensionDays] = useState(0);
  const [subscription, setSubscription] = useState<any>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [confirmationUrl, setConfirmationUrl] = useState<string | null>(null);
  const [noActiveSub, setNoActiveSub] = useState(false);
  const [customPrice, setCustomPrice] = useState('');
  const [customInterval, setCustomInterval] = useState('EVERY_30_DAYS');
  const [lifetimeFree, setLifetimeFree] = useState(false);
  const [lifetimeSuccess, setLifetimeSuccess] = useState(false);
  const [endingLifetime, setEndingLifetime] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [planExtensionMessage, setPlanExtensionMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const fetchMerchants = async () => {
      const response = await fetch('/api/shop/stores');
      const dbs: string[] = await response.json();
      if (isMounted) setMerchants(dbs.map(db => ({ db })));
      const tasks = dbs.map((db, idx) => async () => {
        try {
          const res = await fetch(`/api/shop/shop-name?shop=${db}.myshopify.com`);
          const data = await res.json();
          if (data.error) {
            if (isMounted) setMerchants(prev => prev.map((m, i) => i === idx ? { ...m, name: undefined } : m));
            return;
          }
          if (isMounted) setMerchants(prev => prev.map((m, i) => i === idx ? { ...m, name: data.name || undefined } : m));
        } catch {
          if (isMounted) setMerchants(prev => prev.map((m, i) => i === idx ? { ...m, name: undefined } : m));
        }
      });
      await fetchWithConcurrencyLimit(tasks, CONCURRENCY_LIMIT);
    };
    fetchMerchants();
    return () => { isMounted = false; };
  }, []);

  // Fetch subscription details when merchant changes
  useEffect(() => {
    if (!selectedMerchant) {
      setSubscription(null);
      setSubError(null);
      setNoActiveSub(false);
      return;
    }
    setSubLoading(true);
    setSubError(null);
    setSubscription(null);
    setNoActiveSub(false);
    fetch(`/api/shop/subscription-details?shop=${selectedMerchant.db}.myshopify.com`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setSubError(data.error);
          setSubscription(null);
        } else if (data.subscriptions && data.subscriptions.length > 0) {
          setSubscription(data.subscriptions[0]);
        } else {
          setSubscription(null);
          setNoActiveSub(true);
        }
        setSubLoading(false);
      })
      .catch(err => {
        setSubError('Failed to fetch subscription details');
        setSubscription(null);
        setNoActiveSub(false);
        setSubLoading(false);
      });
  }, [selectedMerchant]);

  // Helper to fetch logs
  const fetchLogs = async (shop: string) => {
    setLogsLoading(true);
    const res = await fetch(`/api/shop/history?shop=${shop}`);
    const data = await res.json();
    setLogs(data.logs || []);
    setLogsLoading(false);
  };

  // Fetch logs when merchant changes
  useEffect(() => {
    if (!selectedMerchant) {
      setLogs([]);
      return;
    }
    fetchLogs(`${selectedMerchant.db}.myshopify.com`);
  }, [selectedMerchant]);

  // Helper to log actions and refresh logs
  const logAction = async (action: string, details: string) => {
    if (!selectedMerchant) return;
    await fetch('/api/shop/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: `${selectedMerchant.db}.myshopify.com`, action, details })
    });
    await fetchLogs(`${selectedMerchant.db}.myshopify.com`);
  };

  // Filter merchants by search (case-insensitive, matches name)
  const filteredMerchants = merchants.filter(m =>
    m.name && m.name.toLowerCase().includes(search.toLowerCase())
  );

  // Handle selection
  const handleSelect = (merchant: { db: string; name?: string }) => {
    setSelectedMerchant(merchant);
    setSearch(merchant.name || '');
    setShowDropdown(false);
  };

  // Handle input focus/blur for dropdown
  const handleBlur = () => setTimeout(() => setShowDropdown(false), 100);
  const handleFocus = () => setShowDropdown(true);

  // Calculate remaining trial days from createdAt and trialDays
  function getRemainingTrialDays(createdAt: string, trialDays: number) {
    if (!createdAt || typeof trialDays !== 'number') return 0;
    const start = new Date(createdAt);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const left = trialDays - daysPassed;
    return left > 0 ? left : 0;
  }

  const plan = subscription?.name || 'N/A';
  const status = subscription?.status || 'N/A';
  const trialDays = subscription?.trialDays ?? 0;
  const createdAt = subscription?.createdAt;
  const price = subscription?.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || 'N/A';
  const currency = subscription?.lineItems?.[0]?.plan?.pricingDetails?.price?.currencyCode || '';
  const interval = subscription?.lineItems?.[0]?.plan?.pricingDetails?.interval || '';
  const trialDaysLeft = createdAt ? getRemainingTrialDays(createdAt, trialDays) : 0;
  const newTrialDays = trialDaysLeft + Number(extensionDays);

  // Clear lifetime success message on merchant or input changes
  useEffect(() => { setLifetimeSuccess(false); }, [selectedMerchant, lifetimeFree, extensionDays, customPrice, customInterval]);

  // Add effect to check lifetime free status on merchant selection
  const checkLifetimeFree = async (shop: string | null) => {
    if (!shop) {
      setLifetimeFree(false);
      return;
    }
    try {
      const res = await fetch(`/api/shop/is-lifetime-free?shop=${shop}`);
      const data = await res.json();
      setLifetimeFree(!!data.lifetimeFree);
    } catch {
      setLifetimeFree(false);
    }
  };

  useEffect(() => {
    if (!selectedMerchant) {
      setLifetimeFree(false);
      return;
    }
    checkLifetimeFree(`${selectedMerchant.db}.myshopify.com`);
  }, [selectedMerchant]);

  const handleExtendTrial = async () => {
    if (!selectedMerchant || !extensionDays) return;
    setProcessing(true);
    setProcessError(null);
    setConfirmationUrl(null);
    setLifetimeSuccess(false);
    try {
      const res = await fetch('/api/shop/subscription-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: `${selectedMerchant.db}.myshopify.com`,
          extendDays: Number(extensionDays),
          price: customPrice || price,
          interval: customInterval || interval
        })
      });
      const data = await res.json();
      if (data.error) {
        setProcessError(data.error);
      } else if (data.confirmationUrl) {
        setConfirmationUrl(data.confirmationUrl);
        toast.success('Trial extended successfully. Waiting for merchant to approve.');
        await logAction(noActiveSub ? 'Create Plan' : 'Extend Trial', `Trial days: ${extensionDays}, Price: ${customPrice || price}, Interval: ${customInterval || interval}`);
      }
    } catch (err) {
      setProcessError('Failed to extend trial.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSetLifetimeFree = async () => {
    if (!selectedMerchant) return;
    setProcessing(true);
    setProcessError(null);
    setLifetimeSuccess(false);
    try {
      const res = await fetch('/api/shop/lifetime-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: `${selectedMerchant.db}.myshopify.com` })
      });
      const data = await res.json();
      if (data.success) {
        setLifetimeSuccess(true);
        await logAction('Set Lifetime Free', 'Shop marked as lifetime free');
        await checkLifetimeFree(`${selectedMerchant.db}.myshopify.com`);
      } else {
        setProcessError(data.error || 'Failed to set as lifetime free.');
      }
    } catch (err) {
      setProcessError('Failed to set as lifetime free.');
    } finally {
      setProcessing(false);
    }
  };

  const handleEndLifetimeFree = async () => {
    if (!selectedMerchant) return;
    setEndingLifetime(true);
    setProcessError(null);
    setLifetimeSuccess(false);
    try {
      const res = await fetch('/api/shop/lifetime-free', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: `${selectedMerchant.db}.myshopify.com` })
      });
      const data = await res.json();
      if (data.success) {
        setLifetimeSuccess(false);
        toast.success('Lifetime free status ended. Merchant can now be billed again.');
        await logAction('End Lifetime Free', 'Shop lifetime free status removed');
        await checkLifetimeFree(`${selectedMerchant.db}.myshopify.com`);
      } else {
        setProcessError(data.error || 'Failed to end lifetime free.');
      }
    } catch (err) {
      setProcessError('Failed to end lifetime free.');
    } finally {
      setEndingLifetime(false);
    }
  };

  // Helper to parse details string into key-value pairs
  function parseDetails(details: string) {
    const result: { [key: string]: string } = {};
    details.split(',').forEach(part => {
      const [k, v] = part.split(':').map(s => s.trim());
      if (k && v) result[k] = v;
    });
    return result;
  }

  // Helper to map action to icon, title, and badge color
  function getActionMeta(action: string) {
    if (action === 'Set Lifetime Free') return { icon: '🎁', title: 'Lifetime Discount', badge: 'applied', badgeColor: 'bg-green-100 text-green-800' };
    if (action === 'Extend Trial') return { icon: '⏳', title: 'Trial Extension', badge: 'applied', badgeColor: 'bg-blue-100 text-blue-800' };
    if (action === 'Create Plan') return { icon: '📝', title: 'Custom Discount', badge: 'applied', badgeColor: 'bg-yellow-100 text-yellow-800' };
    return { icon: '🔔', title: action, badge: '', badgeColor: 'bg-gray-200 text-gray-700' };
  }

  // Helper to format details for display
  function formatDetail(key: string, value: string) {
    if (key.toLowerCase().includes('trial')) return { label: 'Trial Days', value };
    if (key.toLowerCase().includes('price')) return { label: 'Monthly Price', value: `$${parseFloat(value).toFixed(2)}` };
    if (key.toLowerCase().includes('interval')) {
      let intervalLabel = value === 'EVERY_30_DAYS' ? 'Monthly' : value === 'ANNUAL' ? 'Annual' : value;
      return { label: 'Billing Interval', value: intervalLabel };
    }
    return { label: key.charAt(0).toUpperCase() + key.slice(1), value };
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 py-8 px-2 flex flex-col items-center">
      <ToastContainer />
      <div className="flex flex-col items-center w-full mb-8">
        <img src="/logo.png" alt="FraudGuard Logo" className="w-24 h-24 mb-2 drop-shadow" />
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight text-center">Merchant Trial & Subscription Management</h1>
      </div>
      <div className="w-full max-w-6xl flex flex-col md:flex-row gap-8 items-start justify-center">
        <div className="flex-1 flex flex-col items-center w-full">
          <SectionCard title="1. Search & Select Merchant">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                placeholder="Type to search merchant..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setShowDropdown(true);
                  setSelectedMerchant(null);
                }}
                onFocus={handleFocus}
                onBlur={handleBlur}
                autoComplete="off"
              />
              {showDropdown && filteredMerchants.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded shadow max-h-48 overflow-y-auto mt-1 animate-fade-in">
                  {filteredMerchants.map(merchant => (
                    <li
                      key={merchant.db}
                      className="px-4 py-2 cursor-pointer hover:bg-blue-100 transition-colors"
                      onMouseDown={() => handleSelect(merchant)}
                    >
                      {merchant.name}
                    </li>
                  ))}
                </ul>
              )}
              {showDropdown && filteredMerchants.length === 0 && (
                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded shadow mt-1 px-4 py-2 text-gray-500 animate-fade-in">
                  No merchants found
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="2. Subscription Details">
            <div className="min-h-[80px]">
              {!selectedMerchant && <div className="text-gray-500">Select a merchant to view subscription details.</div>}
              {subLoading && <div className="text-gray-500">Loading subscription details...</div>}
              {subError && <div className="text-red-500">{subError}</div>}
              {noActiveSub && !subLoading && !subError && (
                <div className="text-yellow-600">No active subscription found. You can create a new plan below.</div>
              )}
              {selectedMerchant && !subLoading && !subError && subscription && (
                <>
                  <div className="mb-1 flex items-center gap-2"><span className="font-medium">Plan:</span> {plan}</div>
                  <div className="mb-1 flex items-center gap-2"><span className="font-medium">Status:</span> <Badge status={status} /></div>
                  <div className="mb-1"><span className="font-medium">Trial Days Left:</span> {trialDaysLeft}</div>
                  <div className="mb-1"><span className="font-medium">Price:</span> {price} {currency}</div>
                  <div className="mb-1"><span className="font-medium">Interval:</span> {interval === 'EVERY_30_DAYS' ? 'Monthly' : interval === 'ANNUAL' ? 'Annual' : interval}</div>
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="3. Actions & Plan Management">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="lifetimeFree"
                checked={lifetimeFree}
                disabled
              />
              <label htmlFor="lifetimeFree" className="text-gray-700 font-medium">Lifetime Free (read-only)</label>
              <span className="text-xs text-gray-400" title="Lifetime free disables all billing for this merchant. Status is managed by the buttons below.">ⓘ</span>
            </div>
            {lifetimeFree && (
              <button
                className="w-full py-2 mt-2 bg-red-600 text-white rounded-lg hover:bg-red-800 transition-colors text-lg font-semibold shadow-sm disabled:opacity-60"
                disabled={!selectedMerchant || subLoading || !!subError || processing || endingLifetime}
                onClick={handleEndLifetimeFree}
              >
                {endingLifetime ? 'Ending Lifetime Free...' : 'End Lifetime Free'}
              </button>
            )}
            {!lifetimeFree && (
              <button
                className="w-full py-2 mt-2 bg-green-700 text-white rounded-lg hover:bg-green-900 transition-colors text-lg font-semibold shadow-sm disabled:opacity-60"
                disabled={!selectedMerchant || subLoading || !!subError || processing || endingLifetime}
                onClick={handleSetLifetimeFree}
              >
                {processing ? 'Processing...' : 'Set as Lifetime Free'}
              </button>
            )}
            {!lifetimeFree && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <FieldLabel tooltip="How many extra trial days to add to the current plan?">Extend Trial By (days)</FieldLabel>
                    <input
                      type="number"
                      min={0}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all mt-1"
                      value={extensionDays}
                      onChange={e => setExtensionDays(Number(e.target.value))}
                      disabled={!selectedMerchant || subLoading || !!subError || processing}
                    />
                  </div>
                  <div>
                    <FieldLabel tooltip="Set the recurring charge amount for the plan.">Set Charge Amount</FieldLabel>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all mt-1"
                      value={customPrice}
                      onChange={e => setCustomPrice(e.target.value)}
                      placeholder={price}
                      disabled={!selectedMerchant || subLoading || !!subError || processing}
                    />
                  </div>
                  <div>
                    <FieldLabel tooltip="Choose how often the merchant will be billed.">Billing Interval</FieldLabel>
                    <select
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all mt-1"
                      value={customInterval}
                      onChange={e => setCustomInterval(e.target.value)}
                      disabled={!selectedMerchant || subLoading || !!subError || processing}
                    >
                      <option value="EVERY_30_DAYS">Monthly</option>
                      <option value="ANNUAL">Annual</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-blue-50 rounded border border-blue-200">
                  <div className="font-medium mb-1">Preview New Plan</div>
                  <div><span className="font-medium">Plan:</span> {plan}</div>
                  <div><span className="font-medium">Total Trial Days:</span> {newTrialDays}</div>
                  <div><span className="font-medium">Price:</span> {customPrice || price} {currency}</div>
                  <div><span className="font-medium">Interval:</span> {customInterval === 'EVERY_30_DAYS' ? 'Monthly' : customInterval === 'ANNUAL' ? 'Annual' : customInterval}</div>
                </div>
                <button
                  className="w-full py-2 mt-4 bg-[#0F2237] text-white rounded-lg hover:bg-[#183a5a] transition-colors text-lg font-semibold shadow-sm disabled:opacity-60"
                  disabled={!selectedMerchant || subLoading || !!subError || processing}
                  onClick={handleExtendTrial}
                >
                  {processing ? 'Processing...' : noActiveSub ? 'Create Plan' : 'Extend Trial'}
                </button>
              </>
            )}
            {processError && <div className="text-red-500 text-center mt-2">{processError}</div>}
            {/* {
              planExtensionMessage && (
                <div className="text-green-600 text-center mt-2">{planExtensionMessage}</div>
              )
            } */}
            {lifetimeSuccess && <div className="text-green-600 text-center mt-2">Shop is now lifetime free!</div>}
          </SectionCard>
        </div>
        <div className="w-full md:w-96 bg-white rounded-xl shadow p-6 border border-gray-100 h-[700px] overflow-y-auto mt-8 md:mt-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Recent Actions</h2>
            <a href="#" className="text-sm text-blue-600 hover:underline flex items-center gap-1">View All <span aria-hidden>↗</span></a>
          </div>
          {logs.length === 0 && !logsLoading && (
            <div className="text-gray-400 text-center mt-8">No history yet for this merchant.</div>
          )}
          <ul className="space-y-4">
            {logs.map(log => {
              const detailsObj = parseDetails(log.details || '');
              const meta = getActionMeta(log.action);
              return (
                <li key={log._id} className="flex items-center gap-4 bg-blue-50 rounded-2xl p-4 shadow-sm border border-blue-100">
                  <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-white text-2xl shadow border border-blue-100">
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 text-base">{meta.title}</span>
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-semibold ${meta.badgeColor}`}>{meta.badge}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <span className="inline-flex items-center gap-1"><span aria-hidden>👤</span> Admin</span>
                      <span aria-hidden className="mx-1">·</span>
                      <span className="inline-flex items-center gap-1"><span aria-hidden>📅</span> {new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                    {Object.keys(detailsObj).length > 0 && (
                      <ul className="text-sm text-gray-700 grid grid-cols-1 gap-1 mt-1">
                        {Object.entries(detailsObj).map(([k, v]) => {
                          const { label, value } = formatDetail(k, v);
                          return (
                            <li key={k} className="flex gap-2">
                              <span className="font-medium text-gray-600">{label}:</span>
                              <span className="text-gray-900">{value}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminTrialExtension;
