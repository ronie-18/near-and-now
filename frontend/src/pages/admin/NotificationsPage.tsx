import { useState } from 'react';
import { Bell, Check, Filter, Search } from 'lucide-react';

const NotificationsPage = () => {
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Mock notifications data
  const notifications = [
    {
      id: 1,
      type: 'order',
      title: 'New order received',
      message: 'Order #12345 has been placed by John Doe',
      time: '10 minutes ago',
      read: false,
      priority: 'high'
    },
    {
      id: 2,
      type: 'stock',
      title: 'Low stock alert',
      message: 'Product "Organic Apples" is running low (5 units remaining)',
      time: '1 hour ago',
      read: false,
      priority: 'medium'
    },
    {
      id: 3,
      type: 'user',
      title: 'New user registered',
      message: 'John Doe has created an account',
      time: '3 hours ago',
      read: true,
      priority: 'low'
    }
  ];

  const filteredNotifications = notifications.filter(notif => {
    if (filter === 'unread' && notif.read) return false;
    if (filter === 'read' && !notif.read) return false;
    if (searchTerm && !notif.message.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-600 mt-1">View and manage all notifications</p>
        </div>
        <div className="flex items-center space-x-2">
          <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center">
            <Check size={18} className="mr-2" />
            Mark all as read
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 md:space-x-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Filter */}
          <div className="flex items-center space-x-2">
            <Filter size={20} className="text-gray-400" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Notifications</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>
        </div>
      </div>

      {/* Coming Soon Message */}
      <div className="bg-white p-12 rounded-lg shadow-sm text-center">
        <Bell size={64} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Notifications System</h2>
        <p className="text-gray-600 mb-6">
          This page will display all system notifications including new orders, stock alerts, user registrations, and other important events.
          {filteredNotifications.length > 0 && (
            <span className="block mt-2 text-sm text-gray-500">
              {filteredNotifications.length} sample notification(s) ready for when the system is connected.
            </span>
          )}
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-2xl mx-auto">
          <p className="text-sm text-blue-800">
            <strong>Coming Soon:</strong> Real-time notifications system is under development. You'll be able to:
          </p>
          <ul className="text-sm text-blue-700 mt-2 text-left list-disc list-inside space-y-1">
            <li>View all system notifications in one place</li>
            <li>Filter notifications by type, status, and date</li>
            <li>Mark notifications as read/unread</li>
            <li>Receive real-time notifications for important events</li>
            <li>Configure notification preferences</li>
            <li>Export notification history</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
