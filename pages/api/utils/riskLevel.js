// pages/api/utils/riskLevel.js

import { CARD_ATTEMPTS, FAILED_PAYMENT_ATTEMPTS, SCORE_THRESHOLD_HIGH_RISK, SCORE_THRESHOLD_MEDIUM_RISK } from "../../../config/constants";
import clientPromise from "../../../lib/mongo";
// import currencyCodes from "currency-codes";

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

        // Rule 4: Currency mismatch with billing country (removed as of now)
        // const currency = order?.currency?.trim();
        // const billingCountry = order?.billing_address?.country?.trim();
        // const currencyInfo = currencyCodes.code(currency); // e.g. { code: 'USD', countries: ['United States', ...] }

        // if (currencyInfo && billingCountry && !currencyInfo.countries?.includes(billingCountry)) {
        //     score += 1;
        //     reason.push("Currency mismatch with billing country");
        // }

        // Rule 5: Shipping address is 349+ km from IP geolocation
        const facts = shopifyRiskAssessments?.assessments?.[0]?.facts || [];

        let distance = null;
        let distanceDescription = null;

        for (const fact of facts) {
            const desc = fact.description || "";

            // Match distances like "2237 km" or "500 miles"
            const match = desc.match(/(\d+)\s*(km|miles)/i);

            if (match) {
                const value = parseInt(match[1], 10);
                const unit = match[2].toLowerCase();

                // Convert to kilometers if in miles
                const distanceInKm = unit === "miles" ? value * 1.60934 : value;

                if (distanceInKm > 349) {
                    distance = distanceInKm;
                    distanceDescription = desc;
                    break; // Stop at the first suspicious one
                }
            }
        }

        if (distance !== null) {
            score += 1;
            reason.push(distanceDescription);
        }

        // Rule 6: Detection of suspicious proxy use (WEB PROXY)
        const proxyFact = facts.find(
            (fact) =>
                fact.sentiment === "NEGATIVE" &&
                fact.description?.toLowerCase().includes("proxy")
        );

        if (proxyFact) {
            score += 1;
            reason.push(proxyFact.description);
        }

        // return risk level based on score
        // if (score === 0) return { score, reason, risk: 'low' };
        // if (score === 1) return { score, reason, risk: 'medium' };
        // return { score, reason, risk: 'high' };

        if (shopifyRiskAssessments?.assessments?.[0].riskLevel === 'HIGH') return { score, reason, risk: 'high' };
        if (shopifyRiskAssessments?.assessments?.[0].riskLevel === 'MEDIUM') return { score, reason, risk: 'medium' };

        if (score < SCORE_THRESHOLD_MEDIUM_RISK) {
            if (hasBeenUsedBefore) {
                reason.push('Past fraudulent behaviour');
                score = SCORE_THRESHOLD_MEDIUM_RISK;
                return { score, reason, risk: 'medium' };
            }
            return { score, reason, risk: 'low' };
        }                                                            // Scores 0-2 are low
        if (score < SCORE_THRESHOLD_HIGH_RISK) return { score, reason, risk: 'medium' };     // Scores 3 are medium
        return { score, reason, risk: 'high' };                      // Scores 4+ are high

    } catch (error) {
        console.error(error);
    }
};
