import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAppBridge } from '@shopify/app-bridge-react';
import { getSessionToken } from '@shopify/app-bridge/utilities';
import { Redirect } from '@shopify/app-bridge/actions';
import DashboardPage from './dashboard';
import SkeletonLoader from '../ui/components/SkeletonLoader';

export default function Home() {
  const router = useRouter();
  const { shop, host } = router.query;
  const app = useAppBridge();
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  
  const MIN_LOADING_TIME = 1000;

  useEffect(() => {
    if (!shop || !app) return;

    // Check if we're embedded
    if (window.top === window.self) {
      // Not embedded – redirect to embedded version
      const redirect = Redirect.create(app);
      redirect.dispatch(
        Redirect.Action.ADMIN_PATH, 
        `/apps/${process.env.NEXT_PUBLIC_APP_NAME || 'your-app'}`
      );
      return;
    }

    const checkOnboardingStatus = async () => {
      const startTime = Date.now();
      
      try {
        // Get session token for authenticated requests
        const sessionToken = await getSessionToken(app);
        
        // Process queue with session token
        await fetch(`/api/process-queue`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`
          },
          body: JSON.stringify({ shop }),
        });

        // Check onboarding status with session token
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
  }, [shop, host, app]);

  if (isLoading) return <SkeletonLoader />;
  
  return <DashboardPage onboardingRequired={onboardingRequired} />;
}
