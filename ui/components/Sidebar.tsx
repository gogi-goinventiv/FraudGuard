import Link from 'next/link'
import { useRouter } from 'next/router'
import React from 'react'
import { FaBookmark, FaCircle } from 'react-icons/fa'
import { FaGear } from 'react-icons/fa6'
import { MdCancel, MdPaid } from 'react-icons/md'
import { TbBasketCancel, TbCancel, TbClockCancel } from "react-icons/tb";

const Sidebar = ({ shop }: { shop: string }) => {
    const router = useRouter();
    return (
        <aside className="w-64 bg-[#0F2237] text-white flex flex-col">
            <div className="flex items-center bg-gray-100 justify-center h-24 border-b border-gray-700">
                <img src="/logo.png" alt="fraudguard-logo" className="w-24 h-24" />
            </div>
            <nav className="flex-1 px-4 py-6 space-y-2 text-lg">
                <div className={`flex items-center px-4 py-1 rounded ${router.pathname === '/dashboard' || router.pathname === '/' ? 'bg-white/10' : ''}`}>
                    <FaCircle size={20} />
                    <Link
                        href={`/dashboard?shop=${shop}`}
                        className="block text-white px-4 py-2 rounded"
                    >
                        Dashboard
                    </Link>
                </div>
                {/* <div className={`flex items-center px-4 py-1 rounded ${router.pathname === '/orders' ? 'bg-white/10' : ''}`}>
                    <FaBookmark size={15} />
                    <Link
                        href={`/?shop=${shop}`}
                        className="block text-white px-4 py-2 rounded"
                    >
                        Orders
                    </Link>
                </div> */}

                <div className={`flex items-center px-4 py-1 rounded ${router.pathname === '/cancelled' ? 'bg-white/10' : ''}`}>
                    <MdCancel size={20} />
                    <Link
                        href={`/cancelled?shop=${shop}`}
                        className="block text-white px-4 py-2 rounded"
                    >
                        Cancelled Orders
                    </Link>
                </div>

                <div className={`flex items-center px-4 py-1 rounded ${router.pathname === '/approved' ? 'bg-white/10' : ''}`}>
                    <MdPaid size={20} />
                    <Link
                        href={`/approved?shop=${shop}`}
                        className="block text-white px-4 py-2 rounded"
                    >
                        Approved Orders
                    </Link>
                </div>

                <div className={`flex items-center px-4 py-1 rounded ${router.pathname === '/settings' ? 'bg-white/10' : ''}`}>
                    <FaGear size={20} />
                    <Link
                        href={`/settings?shop=${shop}`}
                        className="block text-white px-4 py-2 rounded"
                    >
                        Settings
                    </Link>
                </div>
            </nav>
        </aside>
    )
}

export default Sidebar