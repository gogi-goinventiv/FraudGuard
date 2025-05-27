// pages/api/utils/riskLevel.js

import { CARD_ATTEMPTS, FAILED_PAYMENT_ATTEMPTS } from "../../../config/constants";
import clientPromise from "../../../lib/mongo";

function hasMultipleFailedPaymentAttempts(transactionsData) {
    let failCount = 0;

    for (const transaction of transactionsData?.transactions) {
        if (transaction.status === "failure") {
            failCount++;
            if (failCount >= FAILED_PAYMENT_ATTEMPTS) return true;
        }
    }

    return false;
}

function hasUsedMultipleCreditCards(transactionsData) {
    const uniqueCards = new Set();

    for (const transaction of transactionsData?.transactions) {
        // Check if payment details exist
        if (transaction.payment_details && transaction.payment_details.credit_card_number) {
            // Add the card number to our set
            uniqueCards.add(transaction.payment_details.credit_card_number);

            // Return true as soon as we find 2 different cards
            if (uniqueCards.size >= CARD_ATTEMPTS) {
                return true;
            }
        }
    }

    return false;
}

export const getRiskLevel = async (order, shop, accessToken, shopifyRiskAssessments, orderTxnDetails) => {

    let score = 0;
    let reason = [];

    let client;

    try {

        client = await clientPromise;
        const db = client.db(shop.split('.')[0]);
        const accountNumbersToCheck = orderTxnDetails.map(txn => txn.accountNumber);

        const wasFlaggedBefore = await db.collection('orders').findOne({
            shop,
            'guard.txnDetails.accountNumber': { $in: accountNumbersToCheck }
        });

        const hasBeenUsedBefore = !!wasFlaggedBefore;


        // Rule 1: IP mismatch with billing country
        const { browser_ip } = order || order?.client_details;
        if (browser_ip) {
            const ipLocationResponse = await fetch(`https://ipwho.is/${browser_ip}`);
            const ipLocationData = await ipLocationResponse.json();
            if (!ipLocationData) return;
            console.log("ipLocationData", ipLocationData, order?.billing_address?.country);
            if (ipLocationData?.country !== order?.billing_address?.country) {
                score += 1;
                reason.push("IP mismatch with billing country");
            }
        }
        const orderId = order?.id.toString().split('/').pop();
        const transactionResponse = await fetch(`https://${shop}/admin/api/2025-04/orders/${orderId}/transactions.json`, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            }
        });

        const transactionData = await transactionResponse.json();

        // Rule 2: 3 or more failed payment attempts
        if (hasMultipleFailedPaymentAttempts(transactionData)) {
            score += 1;
            reason.push(`${FAILED_PAYMENT_ATTEMPTS} or more failed payment attempts`);
        }

        // Rule 3: 2 or more credit card attempts
        if (hasUsedMultipleCreditCards(transactionData)) {
            score += 1;
            reason.push(`${CARD_ATTEMPTS} or more credit card attempts`);
        }

        // return risk level based on score
        // if (score === 0) return { score, reason, risk: 'low' };
        // if (score === 1) return { score, reason, risk: 'medium' };
        // return { score, reason, risk: 'high' };

        if (shopifyRiskAssessments?.assessments?.[0].riskLevel === 'HIGH') return { score, reason, risk: 'high' };
        if (shopifyRiskAssessments?.assessments?.[0].riskLevel === 'MEDIUM') return { score, reason, risk: 'medium' };

        if (score < 2) {
            if (hasBeenUsedBefore) {
                reason.push('Past fraudulent behaviour');
                return { score, reason, risk: 'medium' };
            }
            return { score, reason, risk: 'low' };
        }                                                            // Scores 0-1 are low
        if (score < 3) return { score, reason, risk: 'medium' };     // Scores 2 are medium
        return { score, reason, risk: 'high' };                      // Scores 3+ are high

    } catch (error) {
        console.error(error);
    }
};