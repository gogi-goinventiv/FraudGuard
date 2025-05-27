import calculateRiskLevel from './riskLevel';

// Function to determine if verification email should be sent based on risk level and settings
export function shouldSendVerificationEmail(order: any, riskSettings: any): boolean {
  const { risk } = order?.guard?.riskLevel;

  console.log('risk-settings', riskSettings);
  
  if (risk === 'high' && riskSettings.flagHighRisk) {
    return true;
  }
  
  if (risk === 'medium' && riskSettings.flagMediumRisk) {
    return true;
  }
  
  return false;
}

// Function to send verification email
export async function sendVerificationEmail(order: any, shop: string | string[]): Promise<{ success: boolean, message: string }> {
  try {
    const response = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        order,
        shop 
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send verification email');
    }
    
    return { success: true, message: 'Verification email sent successfully' };
  } catch (error) {
    console.error('Error sending verification email:', error);
    return { success: false, message: error.message };
  }
}