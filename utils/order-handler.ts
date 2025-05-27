import { loadRiskConfig } from './loadRiskConfig';

/**
 * Determines whether an order should be held for manual review
 * based on additional configuration (complementing Shopify’s built-in risk flagging).
 *
 * @param riskLevel - The risk level reported by Shopify ("high", "medium", or "low").
 * @returns {Promise<boolean>} True if the order should be held, false otherwise.
 */
export async function shouldHoldOrder(riskLevel: string): Promise<boolean> {
  try {
    const config = await loadRiskConfig();

    if (riskLevel === 'high' && config.flagHighRisk) return true;
    if (riskLevel === 'medium' && config.flagMediumRisk) return true;
    if (riskLevel === 'low' && config.flagLowRisk) return true;

    return false;
  } catch (error) {
    console.error("Error determining order hold:", error);
    return false;
  }
}
