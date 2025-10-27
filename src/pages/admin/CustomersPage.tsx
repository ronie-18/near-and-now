import { useState } from 'react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { Search, Filter, Eye, ChevronLeft, ChevronRight, Mail, Phone, Calendar, MapPin } from 'lucide-react';

// Mock customer data
const mockCustomers = [
  { 
    id: 'C001', 
    name: 'John Doe', 
    email: 'john.doe@example.com', 
    phone: '+91 98765 43210', 
    joinDate: '2025-01-15', 
    orders: 12,
    totalSpent: '₹15,250',
    status: 'Active',
    location: 'Kolkata, West Bengal'
  },
  { 
    id: 'C002', 
    name: 'Jane Smith', 
    email: 'jane.smith@example.com', 
    phone: '+91 87654 32109', 
    joinDate: '2025-02-20', 
    orders: 8,
    totalSpent: '₹9,800',
    status: 'Active',
    location: 'Mumbai, Maharashtra'
  },
  { 
    id: 'C003', 
    name: 'Robert Johnson', 
    email: 'robert.j@example.com', 
    phone: '+91 76543 21098', 
    joinDate: '2025-03-10', 
    orders: 15,
    totalSpent: '₹22,500',
    status: 'Active',
    location: 'Delhi, Delhi'
  },
  { 
    id: 'C004', 
    name: 'Emily Davis', 
    email: 'emily.d@example.com', 
    phone: '+91 65432 10987', 
    joinDate: '2025-03-25', 
    orders: 3,
    totalSpent: '₹4,200',
    status: 'Inactive',
    location: 'Bangalore, Karnataka'
  },
  { 
    id: 'C005', 
    name: 'Michael Wilson', 
    email: 'michael.w@example.com', 
    phone: '+91 54321 09876', 
    joinDate: '2025-04-05', 
    orders: 10,
    totalSpent: '₹12,800',
    status: 'Active',
    location: 'Chennai, Tamil Nadu'
  },
  { 
    id: 'C006', 
    name: 'Sarah Brown', 
    email: 'sarah.b@example.com', 
    phone: '+91 43210 98765', 
    joinDate: '2025-04-18', 
    orders: 6,
    totalSpent: '₹7,500',
    status: 'Active',
    location: 'Hyderabad, Telangana'
  },
  { 
    id: 'C007', 
    name: 'David Miller', 
    email: 'david.m@example.com', 
    phone: '+91 32109 87654', 
    joinDate: '2025-05-02', 
    orders: 0,
    totalSpent: '₹0',
    status: 'Inactive',
    location: 'Pune, Maharashtra'
  },
  { 
    id: 'C008', 
    name: 'Lisa Taylor', 
    email: 'lisa.t@example.com', 
    phone: '+91 21098 76543', 
    joinDate: '2025-05-15', 
    orders: 4,
    totalSpent: '₹5,600',
    status: 'Active',
    location: 'Ahmedabad, Gujarat'
  },
  { 
    id: 'C009', 
    name: 'James Anderson', 
    email: 'james.a@example.com', 
    phone: '+91 10987 65432', 
    joinDate: '2025-06-01', 
    orders: 7,
    totalSpent: '₹9,200',
    status: 'Active',
    location: 'Jaipur, Rajasthan'
  },
  { 
    id: 'C010', 
    name: 'Patricia Thomas', 
    email: 'patricia.t@example.com', 
    phone: '+91 09876 54321', 
    joinDate: '2025-06-20', 
    orders: 9,
    totalSpent: '₹11,400',
    status: 'Active',
    location: 'Lucknow, Uttar Pradesh'
  },
];

const CustomersPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const itemsPerPage = 8;

  // Filter customers based on search term and status
  const filteredCustomers = mockCustomers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         customer.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'All' || customer.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  // Pagination
  const indexOfLastCustomer = currentPage * itemsPerPage;
  const indexOfFirstCustomer = indexOfLastCustomer - itemsPerPage;
  const currentCustomers = filteredCustomers.slice(indexOfFirstCustomer, indexOfLastCustomer);
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  // Get unique statuses
  const statuses = ['All', ...new Set(mockCustomers.map(customer => customer.status))];

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Customers</h1>
        <p className="text-gray-600">Manage your customer database</p>
      </div>

      {/* Customer Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Customers</p>
              <p className="text-xl font-bold text-gray-800">{mockCustomers.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-600">Active Customers</p>
              <p className="text-xl font-bold text-gray-800">
                {mockCustomers.filter(customer => customer.status === 'Active').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Orders</p>
              <p className="text-xl font-bold text-gray-800">
                {mockCustomers.reduce((total, customer) => total + customer.orders, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <Search size={18} className="text-gray-400" />
            </span>
            <input
              type="text"
              placeholder="Search customers by name, email, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center">
            <Filter size={18} className="text-gray-400 mr-2" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="py-2 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              {statuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Contact</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3">Join Date</th>
                <th className="px-6 py-3">Orders</th>
                <th className="px-6 py-3">Total Spent</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {currentCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{customer.id}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mr-3">
                        <span className="text-primary font-medium">{customer.name.split(' ').map(n => n[0]).join('')}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-800">{customer.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">
                      <div className="flex items-center mb-1">
                        <Mail size={14} className="mr-1" />
                        <span>{customer.email}</span>
                      </div>
                      <div className="flex items-center">
                        <Phone size={14} className="mr-1" />
                        <span>{customer.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <MapPin size={14} className="mr-1" />
                      <span>{customer.location}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar size={14} className="mr-1" />
                      <span>{customer.joinDate}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{customer.orders}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{customer.totalSpent}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${customer.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {customer.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    <button className="text-primary hover:text-primary/80">
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {indexOfFirstCustomer + 1} to {Math.min(indexOfLastCustomer, filteredCustomers.length)} of {filteredCustomers.length} customers
            </div>
            <div className="flex space-x-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded ${currentPage === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-200'}`}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded ${currentPage === page ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded ${currentPage === totalPages ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-200'}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default CustomersPage;
