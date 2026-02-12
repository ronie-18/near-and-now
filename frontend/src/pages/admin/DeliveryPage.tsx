import { useState } from 'react';
import { Truck, Search, Plus } from 'lucide-react';

const DeliveryPage = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Delivery Partners</h1>
          <p className="text-gray-600 mt-1">Manage and track delivery partners</p>
        </div>
        <button className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 flex items-center">
          <Plus size={20} className="mr-2" />
          Add Delivery Partner
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search delivery partners..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Coming Soon Message */}
      <div className="bg-white p-12 rounded-lg shadow-sm text-center">
        <Truck size={64} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Delivery Management</h2>
        <p className="text-gray-600 mb-6">
          This page will allow you to manage delivery partners, track their status, and monitor delivery performance.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-2xl mx-auto">
          <p className="text-sm text-blue-800">
            <strong>Coming Soon:</strong> This feature is under development. You'll be able to:
          </p>
          <ul className="text-sm text-blue-700 mt-2 text-left list-disc list-inside space-y-1">
            <li>View and manage delivery partners</li>
            <li>Track delivery partner status and availability</li>
            <li>Monitor delivery performance metrics</li>
            <li>Assign deliveries to partners</li>
            <li>View delivery history and analytics</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DeliveryPage;
