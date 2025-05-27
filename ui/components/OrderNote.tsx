export default function OrderNote({ riskLevel, isReturning }: { riskLevel: string, isReturning: boolean }) {
  return (
    <div className="text-sm text-gray-600 mt-1">
      {riskLevel === 'medium' && (
        <span className="italic text-yellow-600">Suggested: Medium Risk – could be legit.</span>
      )}
      {isReturning && (
        <span className="ml-2 italic text-blue-600">Returning customer</span>
      )}
    </div>
  );
}
