export const whichOrdersToSendEmail = (riskLevel, riskSettings) => {
    const { risk } = riskLevel;
    const { emailHighRisk, emailMediumRisk } = riskSettings;

    if (risk === 'high' && emailHighRisk) return true;
    if (risk === 'medium' && emailMediumRisk) return true;

    return false;
};