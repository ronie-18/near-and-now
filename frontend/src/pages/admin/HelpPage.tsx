import { HelpCircle, Book, MessageCircle, FileText, Video, Mail } from 'lucide-react';

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
      items: [
        'How to add a new product?',
        'How to update order status?',
        'How to manage categories?',
        'How to export reports?',
        'How to create admin accounts?'
      ]
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

      {/* Coming Soon Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-4">
          <HelpCircle size={24} className="text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Help Center Under Development</h3>
            <p className="text-blue-800 text-sm">
              Our comprehensive help center is currently under development. In the meantime, you can:
            </p>
            <ul className="text-blue-700 text-sm mt-2 list-disc list-inside space-y-1">
              <li>Contact support via email for immediate assistance</li>
              <li>Refer to the admin panel tooltips and inline help text</li>
              <li>Check the documentation files in the project repository</li>
            </ul>
            <div className="mt-4">
              <a
                href="mailto:support@nearandnow.com"
                className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
              >
                <Mail size={16} className="mr-2" />
                support@nearandnow.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpPage;
