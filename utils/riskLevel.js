import { calculateRiskScore, getRiskLevel } from './riskScore';

export default function calculateRiskLevel(order) {
    // Calculate the risk score
    const score = calculateRiskScore(order);

    // Determine the risk level based on the score
    const riskLevel = getRiskLevel(score);

    // Attach the risk level to the order
    order.riskLevel = riskLevel;
    console.info(`Calculated risk level for order ${order.id}: ${riskLevel}`);
    return order;
}


