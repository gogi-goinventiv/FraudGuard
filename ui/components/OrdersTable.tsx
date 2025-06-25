import { useEffect, useState } from "react";
import calculateRiskLevel from "../../utils/riskLevel";
import {
  shouldSendVerificationEmail,
  sendVerificationEmail,
} from "../../utils/verification";
import { MdKeyboardArrowLeft, MdKeyboardArrowRight } from "react-icons/md";
import { Pagination } from "./Dashboard";
import { SCORE_THRESHOLD_HIGH_RISK, SCORE_THRESHOLD_MEDIUM_RISK } from '../../config/constants';

interface OrdersTableProps {
  orders: any[];
  shop: string;
  refreshOrders?: () => Promise<void>;
  onOrdersSelected?: (selectedOrders: string[]) => void;
  pagination: Pagination;
  setPagination: (pagination: Pagination) => void;
  actionButtons?: Boolean;
  includeRemark?: Boolean;
}

export default function OrdersTable({
  orders,
  shop,
  refreshOrders,
  onOrdersSelected,
  pagination,
  setPagination,
  actionButtons,
  includeRemark,
}: OrdersTableProps) {
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  const filteredOrders = orders;

  useEffect(() => {
    onOrdersSelected(selectedOrders);
  }, [selectedOrders, onOrdersSelected]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectAll(e.target.checked);
    if (e.target.checked) {
      setSelectedOrders(filteredOrders.map((order) => order.id));
    } else {
      setSelectedOrders([]);
    }
  };

  const handleSelectOrder = (
    e: React.ChangeEvent<HTMLInputElement>,
    orderId: string
  ) => {
    if (e.target.checked) {
      setSelectedOrders([...selectedOrders, orderId]);
    } else {
      setSelectedOrders(selectedOrders.filter((id) => id !== orderId));
    }
  };

  useEffect(() => {
    if (selectedOrders.length !== filteredOrders.length) {
      setSelectAll(false);
    } else if (
      filteredOrders.length > 0 &&
      selectedOrders.length === filteredOrders.length
    ) {
      setSelectAll(true);
    }
  }, [selectedOrders, filteredOrders]);

  const handlePageChange = (page: number) => {
    if (page < 1 || page > pagination.pages) return;
    setPagination({ ...pagination, page });
  };

  return (
    <div className="bg-white rounded shadow">
      <table className="w-full text-sm text-left text-gray-700">
        <thead>
          <tr>
            {actionButtons && <th className="p-4">
              <input
                className="w-4 h-4 cursor-pointer"
                type="checkbox"
                checked={selectAll}
                onChange={handleSelectAll}
              />
            </th>}
            <th className="p-4 text-lg text-black font-medium">Order</th>
            <th className="p-4 text-lg text-black font-medium">Date</th>
            <th className="p-4 text-lg text-black font-medium">Order Amount</th>
            <th className="p-4 text-lg text-black font-medium">Status</th>
            <th className="p-4 text-lg text-black font-medium">
              Reason for Flag
            </th>
            <th className="p-4 text-lg text-black font-medium">Tier</th>
            <th className="p-4 text-lg text-black font-medium">Verification</th>
          </tr>
        </thead>
        <tbody>
          {filteredOrders.length > 0 ? (
            filteredOrders.map((order, index) => {
              const { score } = order?.guard?.riskLevel;
              const risk = order?.guard?.shopifyRisk?.assessments?.[0]?.riskLevel;
              return (
                <tr key={index} className="border-t hover:bg-gray-50">
                  {actionButtons && <td className="p-4">
                    <input
                      className="w-4 h-4 cursor-pointer"
                      type="checkbox"
                      checked={selectedOrders.includes(order.id)}
                      onChange={(e) => handleSelectOrder(e, order.id)}
                    />
                  </td>}
                  <td className="p-4">{order.name}</td>
                  <td className="p-4">
                    {new Date(order.receivedAt).toLocaleDateString("en-GB")}
                  </td>
                  <td className="p-4">${order?.total_price}</td>
                  <td className="p-4 min-w-[10vw]">
                    <span className="font-bold text-[#437fc4] mr-2">{`FraudGuard: `}</span>
                    {typeof score === "number" ? (
                      score < SCORE_THRESHOLD_MEDIUM_RISK ? (
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-900">
                          LOW RISK
                        </span>
                      ) : score < SCORE_THRESHOLD_HIGH_RISK ? (
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-orange-100 text-yellow-900">
                          MEDIUM RISK
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-red-50 text-red-900">
                          HIGH RISK
                        </span>
                      )
                    ) : null}
                    <br />
                    <br />
                    <span className="font-bold text-[#95BF47] mr-2">{`Shopify: `}</span>
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-medium ${risk === "HIGH"
                        ? "bg-red-50 text-red-900"
                        : risk === "MEDIUM" || risk === "PENDING"
                          ? "bg-orange-100 text-yellow-900"
                          : "bg-green-100 text-green-900"
                        }`}
                    >
                      {order?.guard?.shopifyRisk?.assessments?.[0]?.riskLevel === 'NONE' ? 'LOW' : order?.guard?.shopifyRisk?.assessments?.[0]?.riskLevel} RISK
                    </span>
                  </td>

                  <td className="p-4 max-w-[15vw] leading-relaxed">
                    <div>
                      <span className="font-bold text-[#437fc4]">FraudGuard:</span><br />
                      <ul className="list-disc list-inside">
                        {(order?.guard?.riskLevel?.reason || []).length === 0 ? (
                          <li>Looks safe — no explicit fraud indicators.</li>
                        ) : (
                          order.guard.riskLevel.reason.map((reason: string, index: number) => {
                            const mappings: { [key: string]: string } = {
                              "IP mismatch with billing country": "IP mismatch",
                              "3 or more failed payment attempts": "Multiple failed payment attempts",
                              "3 or more credit card attempts": "Multiple failed credit card attempts"
                            };

                            const shortText = mappings[reason] || reason;
                            return (
                              <li key={index}>
                                <span title={reason} className="cursor-help">
                                  {shortText}
                                </span>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    </div>

                    <div className="mt-2">
                      <span className="font-bold text-[#95BF47]">Shopify:</span><br />
                      {(() => {
                        const facts = order?.guard?.shopifyRisk?.assessments?.[0]?.facts || [];
                        const flaggedFacts = facts.filter(
                          (fact: { sentiment: string; description: string }) =>
                            fact.sentiment === "NEGATIVE" ||
                            fact.description ===
                            "Some characteristics of this order are similar to fraudulent orders observed in the past"
                        );

                        return flaggedFacts.length === 0 ? (
                          <ul className="list-disc list-inside">
                            <li>No reason — appears safe</li>
                          </ul>
                        ) : (
                          <ul className="list-disc list-inside">
                            {flaggedFacts.map((fact: { description: string }, index: number) => (
                              <li key={index}>{fact.description}</li>
                            ))}
                          </ul>
                        );
                      })()}
                    </div>
                  </td>

                  <td className="p-4">
                    <div className={`text-center rounded-md p-1 ${order?.guard?.tier === 1 ? 'bg-amber-200 text-amber-900' : order?.guard?.tier === 2 ? 'bg-orange-200 text-yellow-900' : 'bg-red-200 text-red-900'}`}>
                      {order?.guard?.tier === 1 ? 'Tier 1' : order?.guard?.tier === 2 ? 'Tier 2' : 'No Tier'}
                    </div>
                  </td>

                  <td className="p-4">
                    <div
                      className={`text-center rounded-md p-1 ${order?.guard?.status === "verified" || order?.guard?.remark === "verified"
                        ? "bg-green-200 text-green-900"
                        : order?.guard?.status === "unverified" || order?.guard?.remark === "unverified"
                          ? "bg-red-200 text-red-900"
                          : "bg-gray-200 text-gray-900"
                        }`}
                    >
                      {includeRemark && order?.guard?.remark && order?.guard?.remark !== order?.guard?.status ? `${order?.guard?.remark.charAt(0).toUpperCase() +
                        order?.guard?.remark.slice(1)} & ${order?.guard?.status}` : order?.guard?.status.charAt(0).toUpperCase() +
                      order?.guard?.status.slice(1)}
                    </div>

                    <div className="mt-2 text-xs text-gray-600">
                      {order?.guard?.email?.lastSentAt ? (
                        (() => {
                          // Handle different date formats
                          let timeAgo;
                          if (typeof order.guard.email.lastSentAt === 'number') {
                            // If it's already calculated as days
                            const days = order.guard.email.lastSentAt;
                            timeAgo = days === 0
                              ? "Email sent today"
                              : days === 1
                                ? "Email sent 1 day ago"
                                : `Email sent ${days} days ago`;
                          } else {
                            // If it's a date string, calculate time ago
                            const lastSentDate = new Date(order.guard.email.lastSentAt);
                            const now = new Date();
                            const diffTime = Math.abs(now.getTime() - lastSentDate.getTime());

                            const seconds = Math.floor(diffTime / 1000);
                            const minutes = Math.floor(diffTime / (1000 * 60));
                            const hours = Math.floor(diffTime / (1000 * 60 * 60));
                            const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                            if (seconds < 60) {
                              timeAgo = seconds === 1
                                ? "Email sent 1 second ago"
                                : `Email sent ${seconds} seconds ago`;
                            } else if (minutes < 60) {
                              timeAgo = minutes === 1
                                ? "Email sent 1 minute ago"
                                : `Email sent ${minutes} minutes ago`;
                            } else if (hours < 24) {
                              timeAgo = hours === 1
                                ? "Email sent 1 hour ago"
                                : `Email sent ${hours} hours ago`;
                            } else {
                              timeAgo = days === 1
                                ? "Email sent 1 day ago"
                                : `Email sent ${days} days ago`;
                            }
                          }

                          return (
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                              {timeAgo}
                            </span>
                          );
                        })()
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">
                          No email sent
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={4}>No orders found </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="py-3 flex items-center justify-between border-t">
        <div className="flex">
          <button
            className="px-3 py-1 text-md font-medium rounded text-blue-600 mr-2"
            onClick={() => handlePageChange(pagination.page - 1)}
          >
            Previous
          </button>
          <button
            className="px-3 py-1 text-md font-medium rounded text-blue-600"
            onClick={() => handlePageChange(pagination.page + 1)}
          >
            Next
          </button>
        </div>
        <div className="flex items-center space-x-2">
          {pagination.page > 2 && (
            <>
              <button
                className={`px-3 py-1 text-md font-medium rounded ${pagination.page === 1
                  ? "bg-blue-600 text-white"
                  : "text-blue-600"
                  }`}
                onClick={() => setPagination({ ...pagination, page: 1 })}
              >
                1
              </button>
              {pagination.page > 3 && <span className="px-2">...</span>}
            </>
          )}

          {Array.from({ length: pagination.pages }, (_, i) => i + 1)
            .filter(
              (page) =>
                page === pagination.page ||
                page === pagination.page - 1 ||
                page === pagination.page + 1
            )
            .map((page) => (
              <button
                key={page}
                className={`px-3 py-1 text-md font-medium rounded ${page === pagination.page
                  ? "bg-blue-600 text-white"
                  : "text-blue-600"
                  }`}
                onClick={() => setPagination({ ...pagination, page })}
              >
                {page}
              </button>
            ))}

          {pagination.page < pagination.pages - 1 && (
            <>
              {pagination.page < pagination.pages - 2 && (
                <span className="px-2">...</span>
              )}
              <button
                className={`px-3 py-1 text-md font-medium rounded ${pagination.page === pagination.pages
                  ? "bg-blue-600 text-white"
                  : "text-blue-600"
                  }`}
                onClick={() =>
                  setPagination({ ...pagination, page: pagination.pages })
                }
              >
                {pagination.pages}
              </button>
            </>
          )}
        </div>

        <div className="text-sm text-gray-400 mr-4">
          <MdKeyboardArrowLeft
            size={25}
            onClick={() => handlePageChange(1)}
            className="inline-block cursor-pointer mr-2"
          />
          <MdKeyboardArrowRight
            size={25}
            onClick={() => handlePageChange(pagination.pages)}
            className="inline-block cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
