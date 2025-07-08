import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import Sidebar from "../ui/components/Sidebar";
import { Pagination } from "../ui/components/Dashboard";
import OrdersTable from "../ui/components/OrdersTable";

const Cancelled = () => {
    const router = useRouter();
    const { shop, host } = router.query;

    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        limit: 10,
        pages: 1,
    });

    const [orders, setOrders] = useState<any[]>([]);

    const fetchOrders = async () => {
        const res = await fetch(
            `/api/orders?shop=${shop}&page=${pagination.page}&limit=${pagination.limit}&type=3`
        );
        const data = await res.json();
        setOrders(data?.orders);
        setPagination((prev) => ({ ...prev, pages: data?.pagination?.pages }));
    };

    useEffect(() => {
        if (shop) {
            fetchOrders();
        }
    }, [shop, pagination.page, pagination.limit]);

    return (
        <div className="min-h-screen bg-gray-50 flex">
            <Sidebar host={String(host)} shop={String(shop)} />
            <main className="flex-1 p-6 space-y-8">
                <h1 className="text-2xl font-bold">Cancelled Orders</h1>
                <div className="mt-4">
                    <OrdersTable
                        orders={orders}
                        shop={`${shop}`}
                        pagination={pagination}
                        setPagination={setPagination}
                        refreshOrders={fetchOrders}
                        onOrdersSelected={() => { }}
                        actionButtons={false}
                        includeRemark
                    />
                </div>
            </main>
        </div>
    );
};

export default Cancelled;
