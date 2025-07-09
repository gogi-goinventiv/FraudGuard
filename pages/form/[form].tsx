import React, { useState, useRef } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
// Simple animated SVG for modal (credit card with animated crop box)
const ModalAnimation = () => (
  <div className="flex justify-center mb-4">
    <svg width="180" height="110" viewBox="0 0 180 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="20" width="160" height="80" rx="10" fill="#f3f4f6" stroke="#2563eb" strokeWidth="2"/>
      <rect x="35" y="55" width="70" height="8" rx="2" fill="#d1d5db" />
      <rect x="110" y="55" width="30" height="8" rx="2" fill="#d1d5db" />
      <rect x="35" y="70" width="40" height="6" rx="2" fill="#e5e7eb" />
      <rect x="80" y="70" width="60" height="6" rx="2" fill="#e5e7eb" />
      <rect x="35" y="80" width="30" height="5" rx="2" fill="#e5e7eb" />
      <rect x="35" y="55" width="110" height="18" rx="4" fill="#0000000" stroke="#2563eb" strokeDasharray="6 4" strokeWidth="2">
        <animate attributeName="x" values="35;50;35" dur="2s" repeatCount="indefinite" />
        <animate attributeName="width" values="110;80;110" dur="2s" repeatCount="indefinite" />
      </rect>
    </svg>
  </div>
);

const Cropper = dynamic(() => import('react-easy-crop').then(mod => mod.default), { ssr: false });

const CARD_ASPECT = 85.6 / 53.98;
const NUMBER_STRIP_ASPECT = 0.85; // width/height ratio for the number strip
const NUMBER_STRIP_HEIGHT_RATIO = 0.13; // 13% of card height
const NUMBER_STRIP_TOP_RATIO = 0.55; // 55% from top (typical number position)
const OCR_CONFIDENCE_THRESHOLD = 65;
const OCR_MAX_ATTEMPTS = 5;

const requirements = [
  'Place your card on a dark, non-reflective background.',
  'Use bright, even lighting with no shadows.',
  'Keep the card in focus and close-up.',
  'Zoom in so the card number is large and clear.',
  'Adjust the blue crop box to fit exactly around the card number (you can move and resize it).',
  'Only the highlighted area will be scanned for the last 4 digits.',
];

const tips = [
  'A solid dark tablecloth or paper is a great background.',
  'Cover the first 12 digits with your thumb or paper.',
  'Natural daylight from a window works best.',
  'Hold your phone steady and tap the screen to focus.',
];

const Modal = ({ open, onClose }) => (
  <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full animate-fadeInUp">
      <ModalAnimation />
      <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">Photo & Crop Instructions</h2>
      <ul className="space-y-3 mb-6">
        {requirements.map((req, i) => (
          <li key={i} className="flex items-center text-gray-700">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600 mr-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </span>
            {req}
          </li>
        ))}
      </ul>
      <button onClick={onClose} className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
         Got It
      </button>
    </div>
  </div>
);

function getConfidenceColor(conf) {
  if (conf >= 90) return 'bg-green-100 text-green-800 border-green-400';
  if (conf >= OCR_CONFIDENCE_THRESHOLD) return 'bg-yellow-100 text-yellow-800 border-yellow-400';
  return 'bg-red-100 text-red-800 border-red-400';
}

const CreditCardCrop = () => {
  const [modalOpen, setModalOpen] = useState(true);
  const [image, setImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [ocrError, setOcrError] = useState(null);
  const [ocrAttempts, setOcrAttempts] = useState(0);
  const [manualEntry, setManualEntry] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputFileRef = useRef(null);

  const onFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        setOcrError('File is too large (max 10MB).');
      return;
    }
      if (!file.type.startsWith('image/')) {
        setOcrError('Please select a valid image file.');
      return;
      }
      setImage(URL.createObjectURL(file));
      setOcrResult(null);
      setOcrError(null);
      setOcrAttempts(0);
      setShowManual(false);
      setManualEntry('');
    }
  };

  const getCroppedImg = async (imageSrc, cropPixels) => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise(resolve => { image.onload = resolve; });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context.');

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = cropPixels.width;
    canvas.height = cropPixels.height;

    ctx.drawImage(
      image,
      cropPixels.x * scaleX,
      cropPixels.y * scaleY,
      cropPixels.width * scaleX,
      cropPixels.height * scaleY,
      0, 0,
      cropPixels.width,
      cropPixels.height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas to Blob conversion failed.'));
      }, 'image/jpeg', 0.95);
    });
  };

  const handleAnalyze = async () => {
    if (!image || !croppedAreaPixels) return;
    
    setLoading(true);
    setOcrError(null);
    
    try {
      const croppedBlob = await getCroppedImg(image, croppedAreaPixels);
      if (!(croppedBlob instanceof Blob)) throw new Error('Cropped image is not a valid Blob');
      const formData = new FormData();
      formData.append('file', croppedBlob, 'card-crop.jpg');
      
      const res = await fetch('/api/ocr', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Server error');
      
      if (data.last4 && data.confidence >= OCR_CONFIDENCE_THRESHOLD) {
        setOcrResult({ last4: data.last4, confidence: data.confidence });
        setShowManual(false);
      } else {
        const newAttempts = ocrAttempts + 1;
        setOcrAttempts(newAttempts);
        const errorMessage = data.confidence ? `Confidence too low: ${data.confidence}%.` : 'Could not detect digits.';
        if (newAttempts >= OCR_MAX_ATTEMPTS) {
          setShowManual(true);
          setOcrError('Please enter the last 4 digits manually.');
        } else {
          setOcrError(`${errorMessage} Please try again.`);
        }
      }
    } catch (error) {
      const newAttempts = ocrAttempts + 1;
      setOcrAttempts(newAttempts);
      if (newAttempts >= OCR_MAX_ATTEMPTS) {
        setShowManual(true);
        setOcrError('Maximum attempts reached. Please enter manually.');
      } else {
        setOcrError(`OCR failed: ${error.message}. Please adjust and retry.`);
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleManualSubmit = () => {
    if (manualEntry.match(/^\d{4}$/)) {
      setOcrResult({ last4: manualEntry, confidence: 100 });
      setShowManual(false);
      setOcrError(null);
    }
  };

  const handleRetry = () => {
    inputFileRef.current?.click();
  };

  // Use the areaPixels directly from the cropper
  const onCropComplete = React.useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  return (
    <>
      <Head><title>Card Photo Upload</title></Head>
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} />
        {!modalOpen && (
          <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 sm:p-8 flex flex-col items-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Upload and Crop Card</h1>
            <p className="text-gray-600 mb-6 text-center">Isolate the last 4 digits for verification.</p>
            
            <input ref={inputFileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            
            {!image && (
              <button onClick={() => inputFileRef.current?.click()} className="w-full flex flex-col items-center px-4 py-5 bg-gray-50 rounded-lg shadow-inner tracking-wide border border-dashed border-gray-300 cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition mb-4">
                <svg className="w-8 h-8 text-blue-500 mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                <span className="text-base font-medium text-blue-700">Select Image</span>
              </button>
            )}
            
            {image && (
              <div className="w-full flex flex-col items-center">
                <div className="relative w-full rounded-lg overflow-hidden border-2 border-blue-200">
                  <div className="relative" style={{ paddingTop: `${(1 / CARD_ASPECT) * 100}%` }}>
                    <Cropper
                      image={image}
                      crop={crop}
                      zoom={zoom}
                      aspect={3.5} // Default to a wide rectangle, but user can resize
                      cropShape="rect"
                      showGrid={false}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                      restrictPosition={true}
                      minZoom={1}
                      maxZoom={5}
                      rotation={0}
                      style={{ cropAreaStyle: { borderRadius: 8, border: '2px solid #2563eb' } }}
                      zoomSpeed={1}
                      classes={{}}
                      mediaProps={{}}
                      cropperProps={{}}
                      keyboardStep={1}
                    />
                  </div>
                </div>
                
                <div className="w-full flex items-center mt-4">
                  <span className="text-sm text-gray-600 mr-2">Zoom</span>
                  <input type="range" min={1} max={5} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                </div>
                
                <button onClick={handleAnalyze} disabled={loading} className="w-full mt-4 px-6 py-3 rounded-lg font-semibold text-white transition-colors bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                  {loading ? 'Analyzing...' : 'Analyze Image'}
                </button>
                <button onClick={() => inputFileRef.current?.click()} className="w-full mt-2 text-sm text-blue-600 hover:underline">Change Image</button>
                <div className="text-sm text-gray-500 mb-4 text-center mt-6">{`Hint: `}{tips[ocrAttempts % tips.length]}</div>
              </div>
            )}
            
            {loading && <div className="mt-4 text-blue-600 flex items-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>Processing...</div>}

            {ocrResult && (
              <div className="mt-6 w-full flex flex-col items-center text-center">
                <div className={`flex items-center px-4 py-2 rounded-lg border mb-2 ${getConfidenceColor(ocrResult.confidence)}`}>
                  <span className="font-mono text-lg mr-2 tracking-widest">•••• {ocrResult.last4}</span>
                  <span className="ml-2 text-xs font-medium">({ocrResult.confidence}%)</span>
                    </div>
                  </div>
                )}

            {ocrError && (
              <div className="mt-4 w-full bg-red-50 border border-red-300 text-red-800 rounded-lg px-4 py-3 text-center transition-all duration-300">
                <div className="font-medium">{ocrError}</div>
                {!showManual && <div className="text-xs mt-1">Attempt {ocrAttempts} of {OCR_MAX_ATTEMPTS}</div>}
                    </div>
                  )}
            
            {showManual && (
              <div className="mt-6 w-full flex flex-col items-center animate-fadeInUp">
                  <input
                  type="tel"
                  maxLength={4}
                  pattern="\d{4}"
                  value={manualEntry}
                  onChange={(e) => setManualEntry(e.target.value.replace(/\D/g, ''))}
                  className="border-2 border-gray-300 rounded-lg w-32 px-4 py-2 text-center text-xl font-mono mb-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none"
                  placeholder="1234"
                />
                
                <div className="flex space-x-3">
                  <button onClick={handleManualSubmit} disabled={manualEntry.length !== 4} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400">Submit</button>
                  <button onClick={handleRetry} className="px-5 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition">Try New Photo</button>
                </div>
                    </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default CreditCardCrop;