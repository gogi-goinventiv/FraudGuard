import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function SubscriptionCallback() {
  const router = useRouter();
  const { shop } = router.query;

  useEffect(() => {
    if (!shop) return;
    // Mark as applied
    fetch('/api/shop/subscription-update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop }),
    }).then(() => {
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.replace(`/dashboard?shop=${shop}`);
      }, 2000);
    });
  }, [shop, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="bg-white p-8 rounded shadow text-center">
        <h1 className="text-2xl font-bold mb-2">Plan Approved!</h1>
        <p className="mb-4">Thank you for approving your new plan. Redirecting to your dashboard...</p>
      </div>
    </div>
  );
} 