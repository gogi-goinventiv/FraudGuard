import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DashboardPage from './dashboard';
import SkeletonLoader from '../ui/components/SkeletonLoader';
import { createApp } from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';
import { getSessionToken } from '@shopify/app-bridge/utilities';

export default function Home() {
  const router = useRouter();
  const { shop, host } = router.query;
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [isLifetimeFree, setIsLifetimeFree] = useState<boolean | null>(null);
  const [subscriptionUpdate, setSubscriptionUpdate] = useState<any>(null);
  const [justProcessedUpdate, setJustProcessedUpdate] = useState(false);

  const MIN_LOADING_TIME = 1000;

  const app = createApp({
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!,
    host: host as string || 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvdXZzemgxLW01',
    forceRedirect: true,
  });



  useEffect(() => {
    if (!shop) return;

    const initializeApp = async () => {
      try {
        // Step 1: Check if shop is lifetime free
        const lifetimeFreeRes = await fetch(`/api/shop/is-lifetime-free?shop=${shop}`);
        const lifetimeFreeData = await lifetimeFreeRes.json();
        const isLifetimeFreeShop = lifetimeFreeData.lifetimeFree;
        setIsLifetimeFree(isLifetimeFreeShop);
        
        // If lifetime free, skip all other checks
        if (isLifetimeFreeShop) {
          console.log('Shop is lifetime free, skipping subscription checks');
          return;
        }

        // Step 2: Check for subscription updates
        const updateRes = await fetch(`/api/shop/subscription-update?shop=${shop}`);
        const updateData = await updateRes.json();
        console.log('Index page - Subscription update data:', updateData);
        
        if (updateData && updateData.length > 0 && updateData[0].applied === false) {
          console.log('Index page - Found pending subscription update:', updateData[0]);
          setSubscriptionUpdate(updateData[0]);
          return; // Skip other checks if there's a pending update
        }

        // Step 3: Check for active subscriptions
        const subscriptionRes = await fetch(`/api/shop/subscription-details?shop=${shop}`);
        const subscriptionData = await subscriptionRes.json();
        console.log('Index page - Subscription details:', subscriptionData);
        
        if (subscriptionData.subscriptions && subscriptionData.subscriptions.length === 0) {
          console.log('Index page - No active subscriptions found, redirecting to generic plan');
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
            console.log('Index page - Redirecting to subscription confirmation:', createData.confirmationUrl);
            const redirect = Redirect.create(app);
            redirect.dispatch(Redirect.Action.REMOTE, createData.confirmationUrl);
          }
        } else {
          console.log('Index page - Active subscription found, proceeding normally');
        }
      } catch (error) {
        console.error('Index page - Error during initialization:', error);
      }
    };

    initializeApp();
  }, [shop]);

  useEffect(() => {
    const handleSubscriptionUpdate = async () => {
      if (!shop || isLifetimeFree === null) return;

      if (subscriptionUpdate) {
        // Redirect first, then update
        try {
          // Method 1: Use Shopify App Bridge redirect (preferred for embedded apps)
          const redirect = Redirect.create(app);
          redirect.dispatch(Redirect.Action.REMOTE, subscriptionUpdate.redirectUrl);
        } catch (redirectError) {
          console.error('App Bridge redirect failed, trying direct redirect:', redirectError);
          try {
            // Method 2: Direct window.location as fallback
            window.location.href = subscriptionUpdate.redirectUrl;
          } catch (directError) {
            console.error('Direct redirect also failed:', directError);
            // Method 3: Create and click a link
            const link = document.createElement('a');
            link.href = subscriptionUpdate.redirectUrl;
            link.target = '_blank';
            link.click();
          }
        }
        
        // Update after redirect
        await fetch('/api/shop/subscription-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop, id: subscriptionUpdate.id }),
        });
        
        // Set flag to prevent immediate subscription check
        setJustProcessedUpdate(true);
        
        // Reset flag after 30 seconds to allow normal checks again
        setTimeout(() => setJustProcessedUpdate(false), 30000);
        return;
      }

      // Handle billing redirect if required (but not for lifetime free users)
      if (!isLifetimeFree && router.query.billingRequired === '1' && router.query.billingUrl) {
        const redirect = Redirect.create(app);
        redirect.dispatch(Redirect.Action.REMOTE, router.query.billingUrl as string);
        return;
      }

      // Ensure we are running inside the Shopify Admin iframe
      if (window.top === window.self) {
        // Not embedded – redirect to embedded version
        const redirect = Redirect.create(app);
        redirect.dispatch(Redirect.Action.ADMIN_PATH, `/apps/${process.env.NEXT_PUBLIC_APP_NAME || 'your-app'}`); 
        return;
      }

      let startTime = Date.now();

      const checkOnboardingStatus = async () => {
        try {
      
          const sessionToken = await getSessionToken(app);
          
          await fetch(`/api/process-queue`, {
            method: 'POST',
             headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ shop }),
          });

          const response = await fetch(`/api/shop/onboarding?shop=${shop}`, {
            headers: {
              'Authorization': `Bearer ${sessionToken}`
            }
          });
          const data = await response.json();

          const elapsedTime = Date.now() - startTime;
          const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsedTime);

          setTimeout(() => {
            setOnboardingRequired(!data.result?.onboardingComplete);
            setIsLoading(false);
          }, remainingTime);
        } catch (error) {
          console.error("Error checking onboarding status:", error);
          const elapsedTime = Date.now() - startTime;
          const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsedTime);

          setTimeout(() => {
            setIsLoading(false);
          }, remainingTime);
        }
      };

      checkOnboardingStatus();
    };

    handleSubscriptionUpdate();
  }, [shop, host, isLifetimeFree]);

  if (router.query.billingRequired === '1' && isLifetimeFree === false) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px' }}>
        <h1>Subscription Required</h1>
        <p>
          A subscription is required to use this app.<br />
          You are being redirected to the subscription page...
        </p>
      </div>
    );
  }

  if (isLoading || isLifetimeFree === null) return <SkeletonLoader />;
  return <DashboardPage onboardingRequired={onboardingRequired} />;
}