import { HelpCircle, Book, MessageCircle, FileText, Video, Mail } from 'lucide-react';

const faqs = [
  {
    q: 'How do I add a new product?',
    a: 'Go to Products → Add Product. Fill in the product details (name, price, category, images), set stock status, and save. You can also use Quick Add from the product list.',
  },
  {
    q: 'How do I update order status?',
    a: 'Open Orders, click on an order to view details, then use the status dropdown to change it (e.g. pending → store_accepted → preparing → ready_for_pickup → in_transit → delivered).',
  },
  {
    q: 'How do I manage categories?',
    a: 'Go to Categories to add, edit, or delete categories. Categories control how products are grouped. Only categories with products are shown to customers.',
  },
  {
    q: 'How do I export reports?',
    a: 'In Reports, select the time period (7/30/90/365 days), then click Export to download the report as JSON with revenue, orders, and product data.',
  },
  {
    q: 'How do I create admin accounts?',
    a: 'Super admins can go to Admin Management → Create Admin. Set email, password, role (super_admin or admin), and permissions. Admins can have granular permissions like products:read, orders:update, etc.',
  },
  {
    q: 'How do I assign a delivery partner?',
    a: 'Delivery assignment is managed from the Delivery page (coming soon). Currently, delivery partners can be configured in the database and linked to store orders.',
  },
];

const HelpPage = () => {
  const helpSections = [
    {
      icon: <Book size={32} className="text-primary" />,
      title: 'Documentation',
      description: 'Comprehensive guides and tutorials',
      items: [
        'Getting Started Guide',
        'Product Management',
        'Order Processing',
        'Customer Management',
        'Reports & Analytics'
      ]
    },
    {
      icon: <Video size={32} className="text-primary" />,
      title: 'Video Tutorials',
      description: 'Step-by-step video guides',
      items: [
        'Dashboard Overview',
        'Adding Products',
        'Managing Orders',
        'Using Reports',
        'Admin Management'
      ]
    },
    {
      icon: <FileText size={32} className="text-primary" />,
      title: 'FAQs',
      description: 'Frequently asked questions',
      items: faqs.map(f => f.q)
    },
    {
      icon: <MessageCircle size={32} className="text-primary" />,
      title: 'Support',
      description: 'Get help from our team',
      items: [
        'Live Chat Support',
        'Email Support',
        'Ticket System',
        'Community Forum',
        'Contact Information'
      ]
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Help & Support</h1>
        <p className="text-gray-600 mt-1">Find answers and get help with the admin panel</p>
      </div>

      {/* Help Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {helpSections.map((section, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                {section.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{section.title}</h3>
                <p className="text-gray-600 mb-4">{section.description}</p>
                <ul className="space-y-2">
                  {section.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="text-sm text-gray-700 flex items-center">
                      <span className="w-1.5 h-1.5 bg-primary rounded-full mr-2"></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FAQ with Answers */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">FAQ with Answers</h3>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <details key={i} className="group border border-gray-200 rounded-lg p-4">
              <summary className="font-medium text-gray-800 cursor-pointer list-none flex justify-between items-center">
                {faq.q}
                <span className="text-gray-400 text-sm group-open:rotate-180">▼</span>
              </summary>
              <p className="text-gray-600 mt-2 text-sm">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* Contact Support */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-4">
          <HelpCircle size={24} className="text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Need More Help?</h3>
            <p className="text-blue-800 text-sm">
              Contact our support team for assistance:
            </p>
            <div className="mt-4">
              <a
                href="mailto:support@nearandnow.com"
                className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
              >
                <Mail size={16} className="mr-2" />
                support@nearandnow.com
              </a>
            </div>
            <p className="text-blue-700 text-sm mt-2">
              Refer to the docs/ folder in the project repository for schema details and setup guides.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpPage;
