import { useRouter } from 'next/router'
import React, { useState, useCallback, useEffect, ChangeEvent } from 'react'
import Head from 'next/head';

interface VerificationFormData {
  lastFourDigits: string;
  zipCode: string;
  billing_first_name?: string;
  billing_last_name?: string;
  billing_address1?: string;
  billing_city?: string;
  billing_zip?: string;
  billing_province?: string;
  billing_country?: string;
}

interface FormErrors {
  zipCode: string;
  billing_first_name?: string;
  billing_last_name?: string;
  billing_address1?: string;
  billing_city?: string;
  billing_zip?: string;
  billing_province?: string;
  billing_country?: string;
}

interface ApiError {
  error: string;
  message?: string;
  details?: string;
}

const ValidationForm: React.FC = () => {
  const router = useRouter()
  const { token } = router.query

  const [formState, setFormState] = useState<VerificationFormData>({
    lastFourDigits: '',
    zipCode: '',
    billing_first_name: '',
    billing_last_name: '',
    billing_address1: '',
    billing_city: '',
    billing_zip: '',
    billing_province: '',
    billing_country: '',
  });

  const [errors, setErrors] = useState<FormErrors>({
    zipCode: '',
    billing_first_name: '',
    billing_last_name: '',
    billing_address1: '',
    billing_city: '',
    billing_zip: '',
    billing_province: '',
    billing_country: '',
  });

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [addressOptions, setAddressOptions] = useState<any>({});
  const [addressLoading, setAddressLoading] = useState<boolean>(true);

  const [cardPhoto, setCardPhoto] = useState<File | null>(null);
  const [cardPhotoPreview, setCardPhotoPreview] = useState<string | null>(null);
  const [cardPhotoError, setCardPhotoError] = useState<string>('');
  const [ocrDigits, setOcrDigits] = useState<string>('');
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [ocrCandidates, setOcrCandidates] = useState<string[]>([]);
  const [ocrRawText, setOcrRawText] = useState<string>('');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrMostLikelyLast4, setOcrMostLikelyLast4] = useState<string | null>(null);
  const [ocrDetectedLast4, setOcrDetectedLast4] = useState<string | null>(null);
  const [ocrCardholderName, setOcrCardholderName] = useState<string | null>(null);
  const [ocrTextLines, setOcrTextLines] = useState<string[]>([]);
  const [manualNameRequired, setManualNameRequired] = useState<boolean>(false);
  const [manualCardholderName, setManualCardholderName] = useState<string>('');
  const [manualLastFourRequired, setManualLastFourRequired] = useState<boolean>(false);
  const [manualLastFourDigits, setManualLastFourDigits] = useState<string>('');

  const addressFieldLabels: Record<string, string> = {
    billing_address1: 'Street Address',
    billing_city: 'City',
    billing_zip: 'Zip Code',
    billing_province: 'State/Province',
    billing_country: 'Country',
  };

  const addressFieldKeys = Object.keys(addressFieldLabels);

  const [selectedAddressField, setSelectedAddressField] = useState<string>('');

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

    setFormState(prev => ({
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

  const handleCardPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setCardPhotoError('');
    setOcrDigits('');
    setOcrCandidates([]);
    setOcrRawText('');
    setOcrConfidence(null);
    setOcrMostLikelyLast4(null);
    setOcrDetectedLast4(null);
    setOcrCardholderName(null);
    setOcrTextLines([]);
    setManualNameRequired(false);
    setManualCardholderName('');
    setManualLastFourRequired(false);
    setManualLastFourDigits('');
    setCardPhotoPreview(null);
    setOcrLoading(false);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setCardPhotoError('Only JPG, PNG, or WEBP images are allowed.');
      return;
    }

    // Validate size
    if (file.size > 5 * 1024 * 1024) {
      setCardPhotoError('File size must be less than 5MB.');
      return;
    }
    
    // Check blur
    setOcrLoading(true);
    const blurry = await isImageBlurry(file);
    if (blurry) {
      setCardPhotoError('Image appears blurry. Please upload a clearer photo.');
      setOcrLoading(false);
      return;
    }
    setCardPhoto(file);
    setCardPhotoPreview(URL.createObjectURL(file));
    setOcrLoading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      const res = await fetch('/api/ocr', { method: 'POST', body: uploadFormData });
      if (!res.ok) throw new Error('OCR failed');
      const data = await res.json();
      setOcrRawText(data.rawText || '');
      setOcrConfidence(data.confidence || null);
      setOcrCandidates(data.last4Candidates || []);
      setOcrMostLikelyLast4(data.mostLikelyLast4 || null);
      setOcrDetectedLast4(data.detectedLast4 || null);
      setOcrCardholderName(data.cardholderName || null);
      setOcrTextLines(data.textLines || []);
      setManualNameRequired(!!data.manualNameRequired);
      setManualLastFourRequired(!data.detectedLast4 || data.detectedLast4.length !== 4);
      if (data.detectedLast4) {
        setOcrDigits(data.detectedLast4);
        setCardPhotoError('');
      } else {
        setOcrDigits('');
        setCardPhotoError('Could not detect last 4 digits in the card photo. Please try another photo.');
      }
    } catch (err) {
      setCardPhotoError('OCR failed. Please try another photo.');
    } finally {
      setOcrLoading(false);
    }
  };

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {
      zipCode: validateZipCode(formState.zipCode),
      ...(selectedAddressField ? { [selectedAddressField]: !formState[selectedAddressField as keyof VerificationFormData] ? 'Required' : '' } : {})
    };
    setErrors(newErrors);
    // Card photo validation
    let cardPhotoValid = true;
    if (!cardPhoto) {
      setCardPhotoError('Please upload a card photo.');
      cardPhotoValid = false;
    } else if (!ocrDetectedLast4) {
      setCardPhotoError('Could not detect last 4 digits in the card photo. Please try another photo.');
      cardPhotoValid = false;
    } else if (cardPhotoError) {
      cardPhotoValid = false;
    }
    return !Object.values(newErrors).some(error => error) && cardPhotoValid;
  }, [formState, validateZipCode, selectedAddressField, cardPhoto, ocrDetectedLast4, cardPhotoError]);

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
    // Use manual values if present
    const submissionState = {
      ...formState,
      lastFourDigits: manualLastFourRequired && manualLastFourDigits ? manualLastFourDigits : (ocrDetectedLast4 || ''),
      cardholderName: manualNameRequired && manualCardholderName ? manualCardholderName : (ocrCardholderName || ''),
    };
    try {
      const response = await fetch('/api/validation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(submissionState)
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
  }, [formState, token, validateForm, handleApiError, manualLastFourRequired, manualLastFourDigits, ocrDetectedLast4, manualNameRequired, manualCardholderName, ocrCardholderName]);

  const getErrorMessageClass = useCallback((hasAttempts: boolean) => {
    return hasAttempts 
      ? "bg-yellow-100 border border-yellow-400 text-yellow-800"
      : "bg-red-100 border border-red-400 text-red-700";
  }, []);

  const isFormDisabled = attemptsRemaining === 0;

  // Utility: shuffle array
  function shuffle(arr: string[]) {
    return arr.sort(() => Math.random() - 0.5);
  }

  useEffect(() => {
    async function fetchOrderData() {
      if (!token || Array.isArray(token)) return;
      setAddressLoading(true);
      try {
        // Replace this with your real endpoint
        const orderRes = await fetch('/sample/order.json');
        if (!orderRes.ok) throw new Error('Order fetch failed');
        const orderJson = await orderRes.json();
        const billing = orderJson.order?.billing_address || {};
        const fakeNames = ['John', 'Jane', 'Alex', 'Chris', 'Sam', 'Taylor'];
        const fakeLastNames = ['Smith', 'Johnson', 'Lee', 'Brown', 'Davis', 'Clark'];
        const fakeStreets = ['123 Main St', '456 Oak Ave', '789 Pine Rd', '321 Maple Dr'];
        const fakeCities = ['Dallas', 'Austin', 'Houston', 'Plano', 'Frisco', 'Irving'];
        const fakeZips = ['75001', '75002', '75003', '75004', '75005', '75006'];
        const fakeProvinces = ['Texas', 'California', 'Florida', 'New York', 'Illinois'];
        const fakeCountries = ['United States', 'Canada', 'Mexico', 'United Kingdom', 'Australia'];
        setAddressOptions({
          billing_first_name: shuffle([billing.first_name, ...fakeNames.filter(n => n !== billing.first_name)].slice(0, 4)),
          billing_last_name: shuffle([billing.last_name, ...fakeLastNames.filter(n => n !== billing.last_name)].slice(0, 4)),
          billing_address1: shuffle([billing.address1, ...fakeStreets.filter(s => s !== billing.address1)].slice(0, 4)),
          billing_city: shuffle([billing.city, ...fakeCities.filter(c => c !== billing.city)].slice(0, 4)),
          billing_zip: shuffle([billing.zip, ...fakeZips.filter(z => z !== billing.zip)].slice(0, 4)),
          billing_province: shuffle([billing.province, ...fakeProvinces.filter(p => p !== billing.province)].slice(0, 4)),
          billing_country: shuffle([billing.country, ...fakeCountries.filter(c => c !== billing.country)].slice(0, 4)),
        });
      } catch (e) {
        setAddressOptions({});
      } finally {
        setAddressLoading(false);
      }
    }
    fetchOrderData();
  }, [token]);

  // Helper: check if image is blurry (simple variance check)
  async function isImageBlurry(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(true);
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let sum = 0, sumSq = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
          const v = (imageData.data[i] + imageData.data[i+1] + imageData.data[i+2]) / 3;
          sum += v; sumSq += v * v;
        }
        const n = imageData.data.length / 4;
        const mean = sum / n;
        const variance = sumSq / n - mean * mean;
        resolve(variance < 200); // threshold: tweak as needed
      };
      img.onerror = () => resolve(true);
      img.src = URL.createObjectURL(file);
    });
  }

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

                {/* Address Confirmation Section */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-blue-800 mb-2 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    Address Confirmation
                  </h2>
                  <p className="text-sm text-blue-700 mb-4">Please select a billing address detail to confirm.</p>
                  {addressLoading ? (
                    <div className="text-gray-500 text-sm">Loading address confirmation questions...</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {/* Field selector */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select a billing address element *</label>
                        <select
                          value={selectedAddressField}
                          onChange={e => {
                            setSelectedAddressField(e.target.value);
                            setFormState(prev => ({ ...prev, [e.target.value]: '' }));
                          }}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors bg-white border-gray-300 focus:ring-blue-200"
                          disabled={isFormDisabled}
                        >
                          <option value="" disabled>Select an element</option>
                          {addressFieldKeys.map(key => (
                            <option key={key} value={key}>{addressFieldLabels[key]}</option>
                          ))}
                        </select>
                      </div>
                      
                      {selectedAddressField && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {addressFieldLabels[selectedAddressField]} *
                          </label>
                          
                            <input
                              type="text"
                              name={selectedAddressField}
                              value={formState[selectedAddressField as keyof VerificationFormData] || ''}
                              onChange={e => setFormState(prev => ({ ...prev, [selectedAddressField]: e.target.value }))}
                              disabled={isFormDisabled}
                              placeholder={`Enter your ${addressFieldLabels[selectedAddressField]}`}
                              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors bg-white ${
                                errors[selectedAddressField as keyof FormErrors]
                                  ? 'border-red-500 focus:ring-red-200'
                                  : 'border-gray-300 focus:ring-blue-200'
                              } ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            />
                      
                          {errors[selectedAddressField as keyof FormErrors] && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              {errors[selectedAddressField as keyof FormErrors]}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Photo Upload Section */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-yellow-800 mb-2 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    Card Photo Upload
                  </h2>
                  <p className="text-sm text-yellow-700 mb-4">Upload a photo of your card showing the last 4 digits (and name if possible). Only JPG, PNG, or WEBP. Max 5MB.</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleCardPhotoChange}
                    disabled={isFormDisabled}
                    className="mb-2"
                  />
                  {cardPhotoPreview && (
                    <div className="mb-2">
                      <img src={cardPhotoPreview} alt="Card preview" className="max-h-40 rounded border" />
                    </div>
                  )}
                  {ocrLoading && <div className="text-sm text-gray-600">Analyzing image...</div>}
                  {cardPhotoError && <div className="text-sm text-red-600">{cardPhotoError}</div>}
                  {(ocrDetectedLast4 && ocrConfidence !== null && ocrConfidence > 40 && !cardPhotoError) && (
                    <div className="text-sm text-green-700 font-bold mt-1">
                      Last 4 digits found: <span className="font-mono">{ocrDetectedLast4}</span>
                      <span className="ml-2 text-gray-500 font-normal">(confidence: {Math.round(ocrConfidence)}%)</span>
                    </div>
                  )}
                  {(ocrCardholderName && ocrConfidence !== null && ocrConfidence > 40 && !cardPhotoError) && (
                    <div className="text-sm text-green-700 font-bold mt-1">
                      Cardholder name found: <span className="font-mono">{ocrCardholderName}</span>
                    </div>
                  )}
                  <div className="mt-2">
                    <div className="text-sm text-yellow-800 font-semibold mb-1">Enter the last 4 digits as they appear on the card (optional, overrides detected):</div>
                    <input
                      type="text"
                      className="border rounded px-2 py-1 w-32 font-mono"
                      placeholder="Last 4 digits"
                      value={manualLastFourDigits}
                      onChange={e => setManualLastFourDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      autoComplete="off"
                    />
                    {manualLastFourDigits && (
                      <div className="text-sm text-green-700 font-bold mt-1">
                        Last 4 digits (manual): <span className="font-mono">{manualLastFourDigits}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="text-sm text-yellow-800 font-semibold mb-1">Enter the cardholder name as it appears on the card (optional, overrides detected):</div>
                    <input
                      type="text"
                      className="border rounded px-2 py-1 w-full font-mono"
                      placeholder="Enter cardholder name"
                      value={manualCardholderName}
                      onChange={e => setManualCardholderName(e.target.value)}
                      autoComplete="off"
                    />
                    {manualCardholderName && (
                      <div className="text-sm text-green-700 font-bold mt-1">
                        Cardholder name (manual): <span className="font-mono">{manualCardholderName}</span>
                      </div>
                    )}
                  </div>
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