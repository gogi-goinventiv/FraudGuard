import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DashboardPage from './dashboard';
import SkeletonLoader from '../ui/components/SkeletonLoader';

export default function Home() {
  const router = useRouter();
  const { shop } = router.query;
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  
  // Minimum loading time in milliseconds for smooth UX
  const MIN_LOADING_TIME = 1000;

  useEffect(() => {
    if (!shop) return;

    let startTime = Date.now();

    const checkOnboardingStatus = async () => {
      try {
        // run process-queue once
        await fetch(`/api/process-queue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shop }) });

        const response = await fetch(`/api/shop/onboarding?shop=${shop}`);
        const data = await response.json();

        // Calculate elapsed time and remaining time to meet minimum loading duration
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsedTime);

        // Use timeout to ensure minimum loading duration
        setTimeout(() => {
          setOnboardingRequired(!data.result?.onboardingComplete);
          setIsLoading(false);
        }, remainingTime);
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        // Even on error, ensure minimum loading time
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsedTime);

        setTimeout(() => {
          setIsLoading(false);
        }, remainingTime);
      }
    };

    checkOnboardingStatus();
  }, [shop]);

  if (isLoading) return <SkeletonLoader />;

  return (
    <>
      <DashboardPage onboardingRequired={onboardingRequired} />
    </>
  );
}