export const whichOrdersToFlag = (riskLevel, riskSettings) => {
    const { risk } = riskLevel;
    const { flagHighRisk, flagMediumRisk } = riskSettings;

    if (risk === 'high' && flagHighRisk) return true;
    if (risk === 'medium' && flagMediumRisk) return true;

    return false;
};
