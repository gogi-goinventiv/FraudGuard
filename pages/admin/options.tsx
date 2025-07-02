import React from 'react';
import Link from 'next/link';

const AdminOptions = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-lg shadow-md flex flex-col items-center">
        <img src="/logo.png" alt="FraudGuard Logo" className="w-20 h-20 mb-6" />
        <h1 className="text-2xl font-semibold mb-8 text-gray-800">Admin Options</h1>
        <div className="w-full flex flex-col gap-4">
          <Link href="/admin/trial-extension" className="w-full">
            <button className="w-full py-2 bg-[#0F2237] text-white rounded hover:bg-[#183a5a] transition-colors">Merchant Trial Extension</button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminOptions;
