import { FaCircleInfo } from "react-icons/fa6";

interface RiskStatsProps {
  riskPrevented: number;
  ordersOnHold: number;
}

export default function RiskStats({ riskStats }: { riskStats: RiskStatsProps }) {
  return (
    <div className="flex">
      <div className="flex flex-col h-24 justify-evenly bg-white px-4 py-2 w-2/5 rounded shadow mr-6">
        <div className="flex items-center space-x-1">
          <h2 className="text-xl font-bold text-black mr-1">Risk prevented</h2>
          <FaCircleInfo
            size={16}
            className="text-gray-500 cursor-help mt-1"
            title="This amount is calculated based solely on cancelled orders."
          />
        </div>
        <p className="text-2xl font-semibold text-gray-800">{`$ ${riskStats.riskPrevented.toFixed(1)}`}</p>
      </div>

      <div className="flex flex-col h-24 justify-evenly bg-white px-4 py-3 w-3/5 rounded shadow">
        <h2 className="text-xl font-bold text-black">Orders On hold</h2>
        <p className="text-2xl font-semibold text-gray-800">
          {riskStats.ordersOnHold}
        </p>
      </div>
    </div>
  );
}
