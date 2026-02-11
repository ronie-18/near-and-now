import { useState } from 'react';
import { Tag, Search, Plus, Percent, Calendar, Users } from 'lucide-react';

const OffersPage = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Offers & Coupons</h1>
          <p className="text-gray-600 mt-1">Manage offers and coupons for customers</p>
        </div>
        <button className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 flex items-center">
          <Plus size={20} className="mr-2" />
          Create Offer
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search offers and coupons..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Coming Soon Message */}
      <div className="bg-white p-12 rounded-lg shadow-sm text-center">
        <Tag size={64} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Offers Management</h2>
        <p className="text-gray-600 mb-6">
          This page will allow you to create and manage offers, coupons, and promotional campaigns for your customers.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-2xl mx-auto">
          <p className="text-sm text-blue-800">
            <strong>Coming Soon:</strong> This feature is under development. You'll be able to:
          </p>
          <ul className="text-sm text-blue-700 mt-2 text-left list-disc list-inside space-y-1">
            <li>Create and manage discount coupons</li>
            <li>Set up promotional offers and campaigns</li>
            <li>Control which offers are available to customers</li>
            <li>Track offer usage and redemption rates</li>
            <li>Set expiration dates and usage limits</li>
            <li>Target specific customer segments</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default OffersPage;
