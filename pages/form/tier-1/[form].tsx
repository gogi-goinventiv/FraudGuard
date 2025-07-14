import { useRouter } from 'next/router'
import React, { useState, useCallback } from 'react'
import Head from 'next/head';

interface FormData {
  lastFourDigits: string;
  zipCode: string;
}

interface FormErrors {
  lastFourDigits: string;
  zipCode: string;
}

interface ApiError {
  error: string;
  message?: string;
  details?: string;
}

const ValidationForm: React.FC = () => {
  const router = useRouter()
  const { token } = router.query

  const [formData, setFormData] = useState<FormData>({
    lastFourDigits: '',
    zipCode: ''
  });

  const [errors, setErrors] = useState<FormErrors>({
    lastFourDigits: '',
    zipCode: ''
  });

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  const validateLastFourDigits = useCallback((value: string): string => {
    if (!value.trim()) return 'Last 4 digits are required';
    // if (!/^\d{4}$/.test(value)) return 'Must be exactly 4 digits';
    return '';
  }, []);

  const validateZipCode = useCallback((value: string, isRequired: boolean = false): string => {
    if (isRequired && !value.trim()) return 'Zip code is required';
    if (value && !/^\d{5}(-\d{4})?$/.test(value)) return 'Invalid zip code format';
    return '';
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    let processedValue = value;
    if (name === 'lastFourDigits') {
      processedValue = value.slice(0, 4);
    } else if (name === 'zipCode') {
      processedValue = value.replace(/\D/g, '').slice(0, 10);
    }

    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));

    setErrors(prev => ({
      ...prev,
      [name]: ''
    }));

    if (serverError) {
      setServerError('');
      setAttemptsRemaining(null);
    }
  }, [serverError]);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {
      lastFourDigits: validateLastFourDigits(formData.lastFourDigits),
      zipCode: validateZipCode(formData.zipCode)
    };

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error);
  }, [formData, validateLastFourDigits, validateZipCode]);

  const handleApiError = useCallback(async (response: Response) => {
    try {
      const errorData: ApiError = await response.json();
      
      switch (response.status) {
        case 400:
          if (errorData.message === 'Zip code is required') {
            setErrors(prev => ({ ...prev, zipCode: errorData.message }));
            return;
          }
          setServerError(errorData.message || errorData.error || 'Invalid information provided');
          break;
          
        case 401:
          setServerError('Authentication failed. Invalid or expired token.');
          break;
          
        case 404:
          setServerError(errorData.error === 'Order not found' 
            ? 'Order not found or invalid token' 
            : 'Verification service failed. Please try again later.');
          break;
          
        case 422:
          const message = errorData.message || errorData.error || 'Invalid information provided';
          setServerError(message);
          
          if (message.includes('attempt')) {
            const match = message.match(/(\d+)\s+attempt/);
            if (match) {
              setAttemptsRemaining(parseInt(match[1]));
            }
          }
          break;
          
        case 429:
          setServerError(errorData.message || errorData.error || 'Too many attempts. Please try again later.');
          setAttemptsRemaining(0);
          break;
          
        case 500:
        default:
          setServerError('Server error. Please try again later.');
          break;
      }
    } catch (parseError) {
      setServerError('An unexpected error occurred. Please try again.');
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    setServerError('');
    setAttemptsRemaining(null);

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/tier-1/validation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setIsSubmitted(true);
      } else {
        await handleApiError(response);
      }
    } catch (error) {
      console.error('Network error:', error);
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, token, validateForm, handleApiError]);

  const getErrorMessageClass = useCallback((hasAttempts: boolean) => {
    return hasAttempts 
      ? "bg-yellow-100 border border-yellow-400 text-yellow-800"
      : "bg-red-100 border border-red-400 text-red-700";
  }, []);

  const isFormDisabled = attemptsRemaining === 0;

  return (
    <>
      <Head>
        <title>Card Verification</title>
        <meta name="description" content="Verify your payment card information securely" />
      </Head>
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-800">Card Verification</h1>
              <p className="text-gray-600 mt-2">Please verify your payment method</p>
            </div>

            {isSubmitted ? (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg">
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-semibold">Verification Successful!</p>
                    <p className="text-sm">Your card has been verified successfully.</p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {serverError && (
                  <div className={`px-4 py-3 rounded-lg ${getErrorMessageClass(attemptsRemaining !== null && attemptsRemaining > 0)}`}>
                    <div className="flex items-start">
                      <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="font-semibold">
                          {attemptsRemaining === 0 ? 'Maximum Attempts Reached' : 'Verification Failed'}
                        </p>
                        <p className="text-sm">{serverError}</p>
                        {attemptsRemaining !== null && attemptsRemaining > 0 && (
                          <p className="text-sm font-medium mt-1">
                            {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="lastFourDigits" className="block text-sm font-medium text-gray-700 mb-2">
                    Last 4 Digits of Card *
                  </label>
                  <input
                    type="text"
                    id="lastFourDigits"
                    name="lastFourDigits"
                    value={formData.lastFourDigits}
                    onChange={handleInputChange}
                    placeholder="1234"
                    disabled={isFormDisabled}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${
                      errors.lastFourDigits 
                        ? 'border-red-500 focus:ring-red-200' 
                        : 'border-gray-300 focus:ring-blue-200'
                    } ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                  {errors.lastFourDigits && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {errors.lastFourDigits}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 mb-2">
                    Billing Zip Code
                  </label>
                  <input
                    type="text"
                    id="zipCode"
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={handleInputChange}
                    placeholder="12345 or 12345-6789"
                    disabled={isFormDisabled}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${
                      errors.zipCode 
                        ? 'border-red-500 focus:ring-red-200' 
                        : 'border-gray-300 focus:ring-blue-200'
                    } ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                  {errors.zipCode && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {errors.zipCode}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || isFormDisabled}
                  className={`w-full py-3 px-4 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    isSubmitting || isFormDisabled
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                  }`}
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Verifying...
                    </div>
                  ) : isFormDisabled ? (
                    'Verification Disabled'
                  ) : (
                    'Verify Card'
                  )}
                </button>
              </form>
            )}

            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-center text-gray-500">
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-center">
                  Your information is secure and encrypted. We never store your full card details.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default ValidationForm;