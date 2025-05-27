// helpers/riskScore.js

function calculateRiskScore(order) {
    let score = 0;
  
    // Rule 1: IP mismatch with billing country can't work as shopify doesn't provide that data
    // if (order.ip !== order.billingCountry) {  // logic for IP mismatch
    //   score += 1;
    // }
  
    // Rule 2: 3 or more failed payment attempts
    if (order.failedPaymentAttempts >= 3) {
      score += 1;
    }
  
    // Rule 3: 3 or more credit card attempts
    if (order.creditCardAttempts >= 3) {
      score += 1;
    }
  
    return score;
  }
  
  function getRiskLevel(score) {
    if (score === 0) {
      return 'Low'; // Auto-capture
    }
    if (score === 1) {
      return 'Medium'; // Hold for review
    }
    return 'High'; // Hold + Flag for verification
  }
  
  export { calculateRiskScore, getRiskLevel };
  