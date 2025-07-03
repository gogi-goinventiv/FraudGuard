import router from 'next/router';
import React, { useState } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password.');
      return;
    }
    if (email === 'admin@fraudguard.com' && password === 'admin') {
      toast.success('Login successful!');
      // TODO: Redirect to admin dashboard or set auth state
      router.push('/admin/options');
    } else {
      toast.error('Invalid email or password.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-lg shadow-md flex flex-col items-center">
        <img src="/logo.png" alt="FraudGuard Logo" className="w-20 h-20 mb-6" />
        <h1 className="text-2xl font-semibold mb-6 text-gray-800">Admin Login</h1>
        <form className="w-full flex flex-col gap-4" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="submit"
            className="w-full py-2 mt-2 bg-[#0F2237] text-white rounded hover:bg-[#183a5a] transition-colors"
          >
            Login
          </button>
        </form>
        <ToastContainer position="top-center" autoClose={2000} hideProgressBar={true} />
      </div>
    </div>
  );
};

export default AdminLogin;
