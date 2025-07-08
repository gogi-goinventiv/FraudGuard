import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useState } from "react";
import { PiGearSixBold } from "react-icons/pi";
import { ToastContainer, toast } from "react-toastify";
import OrdersTable from "./OrdersTable";
import Sidebar from "./Sidebar";
import { sendVerificationEmail } from "../../utils/verification";
import Link from "next/link";
import RiskStats from "./RiskStats";
import { ManualCaptureWarningContext } from '../../context/manualCaptureWarning';
import { createApp } from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';

export interface Pagination {
  page: number;
  limit: number;
  pages: number;
}

export default function Dashboard({ onboardingRequired }: { onboardingRequired: boolean }) {
  const router = useRouter();
  const { shop, host } = router.query;
  
  // Create App Bridge app instance
  const app = createApp({
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!,
    host: host as string || '',
    forceRedirect: true,
  });
  const [orders, setOrders] = useState<any[]>([]);
  const [riskStats, setRiskStats] = useState({
    riskPrevented: 0,
    ordersOnHold: 0,
  });
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [isLoading, setIsLoading] = useState({
    email: false,
    approve: false,
    cancel: false,
    initialData: true, // New loading state for initial data fetch
  });
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    pages: 1,
  });

  const [isDashboardReady, setIsDashboardReady] = useState(false);
  const { manualCaptureWarning, setManualCaptureWarning } = useContext(ManualCaptureWarningContext);
  const [justProcessedUpdate, setJustProcessedUpdate] = useState(false);

  // Loading state to track all necessary data loading processes
  const [loadingStates, setLoadingStates] = useState({
    onboardingChecked: false,
    manualCaptureChecked: false,
    ordersLoaded: false,
    riskStatsLoaded: false
  });

  const getManualCaptureStatus = async () => {
    try {
      const response = await fetch(`/api/shop/onboarding?shop=${shop}`);
      const data = await response.json();
      if (!data.result?.manualCaptureEnabled) setManualCaptureWarning(false);
      setManualCaptureWarning(data.result?.manualCaptureEnabled);
      
      // Update loading state
      setLoadingStates(prev => ({ ...prev, manualCaptureChecked: true }));
    } catch (error) {
      console.error("Error checking manual capture status:", error);
      // Mark as checked even if there's an error to avoid blocking the UI
      setLoadingStates(prev => ({ ...prev, manualCaptureChecked: true }));
    }
  }

  useEffect(() => {
    if (onboardingRequired) {
      router.push(`/settings?shop=${shop}&host=${host}&onboarding=true`);
    } else {
      setLoadingStates(prev => ({ ...prev, onboardingChecked: true }));
    }
  }, [onboardingRequired, router, shop]);

  useEffect(() => {
    if (shop) {
      getManualCaptureStatus();
    }
  }, [shop]);

  // Effect to determine when dashboard is ready to display
  useEffect(() => {
    const { onboardingChecked, manualCaptureChecked, ordersLoaded, riskStatsLoaded } = loadingStates;
    
    if (onboardingChecked && manualCaptureChecked && ordersLoaded && riskStatsLoaded) {
      setIsLoading(prev => ({ ...prev, initialData: false }));
      setIsDashboardReady(true);
    }
  }, [loadingStates]);

  const fetchOrders = async () => {
    try {
      const res = await fetch(
        `/api/orders?shop=${shop}&page=${pagination.page}&limit=${pagination.limit}&type=1`
      );
      const data = await res.json();
      setOrders(data?.orders || []);
      setPagination((prev) => ({ ...prev, pages: data?.pagination?.pages || 1 }));
      
      // Update loading state
      setLoadingStates(prev => ({ ...prev, ordersLoaded: true }));
    } catch (error) {
      console.error("Error fetching orders:", error);
      // Mark as loaded even if there's an error to avoid blocking the UI
      setLoadingStates(prev => ({ ...prev, ordersLoaded: true }));
    }
  }



  const fetchRiskStats = async () => {
    try {
      const riskPreventedRes = await fetch(`/api/get-risk-stats?shop=${shop}&id=risk-prevented`);
      const riskPreventedData = await riskPreventedRes.json();
      
      const ordersOnHoldRes = await fetch(`/api/get-risk-stats?shop=${shop}&id=risk-orders`);
      const ordersOnHoldData = await ordersOnHoldRes.json();
      
      setRiskStats({
        riskPrevented: riskPreventedData?.result?.amount || 0,
        ordersOnHold: ordersOnHoldData?.result?.count || 0,
      });
      
      // Update loading state
      setLoadingStates(prev => ({ ...prev, riskStatsLoaded: true }));
    } catch (error) {
      console.error("Error fetching risk stats:", error);
      // Mark as loaded even if there's an error to avoid blocking the UI
      setLoadingStates(prev => ({ ...prev, riskStatsLoaded: true }));
    }
  }

  const refreshOrders = useCallback(async () => {
    if (!shop) return;
    try {
      await fetchOrders();
      await fetchRiskStats();
      
      // Check subscription status in order
      await checkSubscriptionStatus();
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  }, [shop, pagination.page, pagination.limit]);

  const checkSubscriptionStatus = async () => {
    try {
      // Step 1: Check if shop is lifetime free
      const lifetimeFreeRes = await fetch(`/api/shop/is-lifetime-free?shop=${shop}`);
      const lifetimeFreeData = await lifetimeFreeRes.json();
      const isLifetimeFreeShop = lifetimeFreeData.lifetimeFree;
      
      // If lifetime free, skip all other checks
      if (isLifetimeFreeShop) {
        console.log('Dashboard - Shop is lifetime free, skipping subscription checks');
        return;
      }

      // Step 2: Check for subscription updates
      const updateRes = await fetch(`/api/shop/subscription-update?shop=${shop}`);
      const updateData = await updateRes.json();
      console.log('Dashboard - Subscription update data:', updateData);
      
      if (updateData && updateData.length > 0 && updateData[0].applied === false) {
        console.log('Dashboard - Found pending subscription update:', updateData[0]);
        
        // Redirect first, then update
        if (updateData[0].redirectUrl) {
          // Use App Bridge redirect (preferred for embedded apps)
          try {
            const redirect = Redirect.create(app);
            redirect.dispatch(Redirect.Action.REMOTE, updateData[0].redirectUrl);
          } catch (redirectError) {
            console.error('App Bridge redirect failed, trying direct redirect:', redirectError);
            try {
              // Fallback: Direct window.location
              window.location.href = updateData[0].redirectUrl;
            } catch (directError) {
              console.error('Direct redirect also failed:', directError);
              // Final fallback: Create and click a link
              const link = document.createElement('a');
              link.href = updateData[0].redirectUrl;
              link.target = '_blank';
              link.click();
            }
          }
        } else {
          console.error('No redirect URL found in subscription update data');
        }
        
        // Update after redirect
        await fetch('/api/shop/subscription-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop, id: updateData[0].id }),
        });
        
        // Set flag to prevent immediate subscription check
        setJustProcessedUpdate(true);
        
        // Reset flag after 30 seconds to allow normal checks again
        setTimeout(() => setJustProcessedUpdate(false), 30000);
        return; // Skip other checks if there's a pending update
      }

      // Step 3: Check for active subscriptions
      const subscriptionRes = await fetch(`/api/shop/subscription-details?shop=${shop}`);
      const subscriptionData = await subscriptionRes.json();
      console.log('Dashboard - Subscription details:', subscriptionData);
      
      if (subscriptionData.subscriptions && subscriptionData.subscriptions.length === 0) {
        console.log('Dashboard - No active subscriptions found, redirecting to generic plan');
        // Create generic subscription plan
        const createRes = await fetch('/api/shop/subscription-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            shop, 
            extendDays: 14, // Default trial period
            price: process.env.SHOPIFY_BILLING_AMOUNT || '19.99',
            interval: process.env.SHOPIFY_BILLING_INTERVAL || 'EVERY_30_DAYS'
          }),
        });
        
        const createData = await createRes.json();
        if (createData.confirmationUrl) {
          console.log('Dashboard - Redirecting to subscription confirmation:', createData.confirmationUrl);
          const redirect = Redirect.create(app);
          redirect.dispatch(Redirect.Action.REMOTE, createData.confirmationUrl);
        }
      } else {
        console.log('Dashboard - Active subscription found, proceeding normally');
      }
    } catch (error) {
      console.error('Dashboard - Error checking subscription status:', error);
    }
  };

  useEffect(() => {
    if (shop) {
      refreshOrders();
      const intervalId = setInterval(refreshOrders, 30000);
      return () => clearInterval(intervalId);
    }
  }, [shop, refreshOrders]);

  const handleOrdersSelected = (orders) => {
    setSelectedOrders(orders);
  };

  const validateOrderSelection = (selectedOrders) => {
    if (selectedOrders.length === 0) {
      toast.warn("No orders selected", { autoClose: 1000 });
      return false;
    }
    return true;
  };

  const updateLoadingState = (action, isLoading) => {
    setIsLoading((prev) => ({ ...prev, [action]: isLoading }));
  };

  const handleResendVerificationEmail = async () => {
    if (!validateOrderSelection(selectedOrders)) return;

    updateLoadingState("email", true);

    try {
      for (const orderId of selectedOrders) {
        const currentOrder = orders.find((o) => o.id === orderId);
        const res = await sendVerificationEmail(currentOrder, shop);

        if (res.success) {
          toast.success(
            `Verification email sent to ${currentOrder.email} for order ${currentOrder.name}`
          );
        } else {
          toast.error(`${res.message} for order ${currentOrder.name}`);
        }
      }
      await refreshOrders();
    } catch (error) {
      toast.error(`Error sending verification email: ${error}`);
    } finally {
      updateLoadingState("email", false);
    }
  };

  const handleApprove = async () => {
    if (!validateOrderSelection(selectedOrders)) return;

    updateLoadingState("approve", true);

    try {
      for (const orderId of selectedOrders) {
        const currentOrder = orders.find((o) => o.id === orderId);
        const res = await fetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, shop, orderAmount: currentOrder?.total_price, isManuallyApproved: true, admin_graphql_api_id: currentOrder?.admin_graphql_api_id }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Capture failed");
        }
        toast.success(`Payment captured for order ${orderId}`);
      }
      await refreshOrders();
    } catch (err) {
      toast.error(err.message);
    } finally {
      updateLoadingState("approve", false);
    }
  };

  const handleCancel = async () => {
    if (!validateOrderSelection(selectedOrders)) return;

    updateLoadingState("cancel", true);

    try {
      for (const orderId of selectedOrders) {
        const currentOrder = orders.find((o) => o.id === orderId);
        const res = await fetch("/api/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, shop, orderAmount: currentOrder?.total_price, isManuallyCancelled: true, admin_graphql_api_id: currentOrder?.admin_graphql_api_id }),
        });

        await res.json();

        if (!res.ok) {
          throw new Error("Cancellation failed");
        }
        toast.success(`Order cancelled for order ${orderId}`);
      }
      await refreshOrders();
    } catch (err) {
      toast.error(err.message);
    } finally {
      updateLoadingState("cancel", false);
    }
  };

  // Loading content component (to be used within the layout)
  const LoadingContent = () => (
    <div className="flex-1 p-6 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-700">Loading FraudGuard dashboard...</h2>
      </div>
    </div>
  );

  // We'll always show the sidebar, but conditionally show loading or dashboard content
  if (!isDashboardReady || isLoading.initialData) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar host={String(host)} shop={String(shop)} />
        <LoadingContent />
      </div>
    );
  }

  return (
    <>
      {
        !manualCaptureWarning && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 mt-5 min-h-10 w-[90vw] sm:w-[70vw] md:w-[60vw] lg:w-[40vw] rounded-lg bg-amber-200 flex items-center justify-center px-4 text-center">
            <span className="font-bold text-amber-600">
              ⚠️ Please enable Manual Payment Capture in your Shopify Settings for FraudGuard to work properly.
            </span>
          </div>
        )
      }
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar host={String(host)} shop={String(shop)} />
        <ToastContainer />

        <main className="flex-1 p-6 space-y-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl">Dashboard</h1>
            <Link href={`/settings?shop=${shop}&host=${host}`}>
              <PiGearSixBold className="text-gray-500 cursor-pointer" size={20} />
            </Link>
          </div>

          <RiskStats riskStats={riskStats} />

          <div className="flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-900">
                Flagged Orders
              </h2>
            </div>

            <div className="space-x-2">
              <button
                disabled={isLoading.approve}
                onClick={handleApprove}
                className="btn btn-sm border px-3 py-1 rounded bg-white text-sm"
              >
                {isLoading.approve ? "Approving..." : "Approve"}
              </button>

              <button
                disabled={isLoading.cancel}
                onClick={handleCancel}
                className="btn btn-sm border px-3 py-1 rounded bg-white text-sm"
              >
                {isLoading.cancel ? "Cancelling..." : "Cancel"}
              </button>

              <button
                disabled={isLoading.email}
                onClick={handleResendVerificationEmail}
                className="btn btn-sm border px-3 py-1 rounded bg-white text-sm"
              >
                {isLoading.email ? "Sending..." : "Resend Verification"}
              </button>

              <select
                name="page-limit"
                id="page-limit"
                className="btn btn-sm border outline-none p-1 rounded bg-white text-sm"
                value={pagination.limit}
                onChange={(e) => setPagination({ ...pagination, limit: Number(e.target.value) })}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>

            <div className="mt-4">
              <OrdersTable
                onOrdersSelected={handleOrdersSelected}
                orders={orders}
                shop={String(shop)}
                pagination={pagination}
                refreshOrders={refreshOrders}
                setPagination={setPagination}
                actionButtons={true}
              />
            </div>
          </div>
        </main>
      </div>
    </>
  );
};