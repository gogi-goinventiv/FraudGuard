import React from 'react'

const SkeletonLoader = () => {
  return (
    <div className="min-h-screen bg-gray-50">
    {/* Header */}
    <div className="flex items-center bg-white p-4 border-b">
      <div className="w-10 h-10 bg-blue-900 rounded-md animate-pulse"></div>
      <div className="ml-4 h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
      <div className="ml-auto w-6 h-6 bg-gray-200 rounded-full animate-pulse"></div>
    </div>

    {/* Dashboard Layout */}
    <div className="flex">
      {/* Sidebar */}
      <div className="w-40 bg-[#0F2237] min-h-screen p-2">
        <div className="space-y-4 mt-4">
          <div className="bg-[#0F2237] p-3 rounded">
            <div className="h-4 w-24 bg-gray-300 bg-opacity-30 rounded animate-pulse"></div>
          </div>
          <div className="p-3">
            <div className="h-4 w-24 bg-gray-300 bg-opacity-30 rounded animate-pulse"></div>
          </div>
          <div className="p-3">
            <div className="h-4 w-24 bg-gray-300 bg-opacity-30 rounded animate-pulse"></div>
          </div>
          <div className="p-3">
            <div className="h-4 w-24 bg-gray-300 bg-opacity-30 rounded animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-4 rounded-md shadow-sm">
            <div className="h-4 w-32 bg-gray-200 rounded mb-4 animate-pulse"></div>
            <div className="h-6 w-16 bg-gray-300 rounded animate-pulse"></div>
          </div>
          <div className="bg-white p-4 rounded-md shadow-sm">
            <div className="h-4 w-32 bg-gray-200 rounded mb-4 animate-pulse"></div>
            <div className="h-6 w-6 bg-gray-300 rounded animate-pulse"></div>
          </div>
        </div>

        {/* Flagged Orders Section */}
        <div className="bg-white rounded-md shadow-sm p-4 mb-8">
          <div className="h-5 w-40 bg-gray-200 rounded mb-6 animate-pulse"></div>

          {/* Table Controls */}
          <div className="flex justify-between mb-4">
            <div className="flex space-x-2">
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-36 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="h-8 w-12 bg-gray-200 rounded animate-pulse"></div>
          </div>

          {/* Table Header */}
          <div className="flex border-b pb-2 mt-4">
            <div className="w-8"></div>
            <div className="w-1/6">
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="w-1/6">
              <div className="h-4 w-14 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="w-1/6">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="w-1/6">
              <div className="h-4 w-14 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="w-2/6">
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="w-1/6">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>

          {/* Table Rows */}
          {[...Array(3)].map((_, index) => (
            <div key={index} className="flex items-center border-b py-3">
              <div className="w-8">
                <div className="h-4 w-4 bg-gray-200 rounded animate-pulse mx-auto"></div>
              </div>
              <div className="w-1/6">
                <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="w-1/6">
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="w-1/6">
                <div className="h-4 w-12 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="w-1/6">
                <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="w-2/6">
                <div className="space-y-2">
                  <div className="h-3 w-32 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-40 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-36 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
              <div className="w-1/6">
                <div className="h-6 w-20 bg-gray-200 rounded animate-pulse ml-auto"></div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <div className="flex space-x-2">
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="flex items-center space-x-1">
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-8 bg-blue-500 rounded animate-pulse"></div>
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  )
}

export default SkeletonLoader