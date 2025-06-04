import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DashboardPage from './dashboard';
import SkeletonLoader from '../ui/components/SkeletonLoader';
import { createApp } from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';

export default function Home() {
  const router = useRouter();
  const { shop, host } = router.query;
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingRequired, setOnboardingRequired] = useState(false);

  const MIN_LOADING_TIME = 1000;

  useEffect(() => {
    if (!shop) return;

    let startTime = Date.now();

    const checkOnboardingStatus = async () => {
      try {
        await fetch(`/api/process-queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop }),
        });

        const response = await fetch(`/api/shop/onboarding?shop=${shop}`);
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
  }, [shop, host]);

  if (isLoading) return <SkeletonLoader />;
  return <DashboardPage onboardingRequired={onboardingRequired} />;
}
