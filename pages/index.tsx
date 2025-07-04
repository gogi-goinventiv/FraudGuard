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

  const MIN_LOADING_TIME = 1000;

  const app = createApp({
        apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!,
        host: host as string || 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvdXZzemgxLW01',
        forceRedirect: true,
      });

  useEffect(() => {
    if (!shop) return;

    // Check if shop is lifetime free
    fetch(`/api/shop/is-lifetime-free?shop=${shop}`)
      .then(res => res.json())
      .then(data => {
        setIsLifetimeFree(data.lifetimeFree);
      })
      .catch(() => setIsLifetimeFree(false));
  }, [shop]);

  useEffect(() => {
    if (!shop || isLifetimeFree === null) return;

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