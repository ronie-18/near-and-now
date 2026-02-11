import { useState } from 'react';
import { Settings, Save, Store, Mail, CreditCard, Truck as TruckIcon, Bell } from 'lucide-react';

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', label: 'General', icon: <Settings size={20} /> },
    { id: 'store', label: 'Store Info', icon: <Store size={20} /> },
    { id: 'email', label: 'Email', icon: <Mail size={20} /> },
    { id: 'payment', label: 'Payment', icon: <CreditCard size={20} /> },
    { id: 'delivery', label: 'Delivery', icon: <TruckIcon size={20} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={20} /> }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage system settings and preferences</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
            <Settings size={64} className="mx-auto text-gray-400 mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Settings Management</h2>
            <p className="text-gray-600 mb-6">
              This section will allow you to configure system settings, store information, payment gateways, delivery options, and notification preferences.
            </p>
            <div className="bg-white border border-blue-200 rounded-lg p-4 max-w-2xl mx-auto">
              <p className="text-sm text-blue-800">
                <strong>Coming Soon:</strong> Settings configuration is under development. You'll be able to:
              </p>
              <ul className="text-sm text-blue-700 mt-2 text-left list-disc list-inside space-y-1">
                <li>Configure general system settings</li>
                <li>Update store information and branding</li>
                <li>Set up email templates and SMTP settings</li>
                <li>Configure payment gateway integrations</li>
                <li>Manage delivery settings and zones</li>
                <li>Configure notification preferences</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
