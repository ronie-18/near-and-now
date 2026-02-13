import { Link } from 'react-router-dom';
import { HelpCircle, Package, CreditCard, MapPin, Phone, Mail } from 'lucide-react';

const HelpPage = () => {
  const faqs = [
    {
      question: 'How do I track my order?',
      answer: 'You can track your order from the Orders page—click "Track Order" on any order. You can also visit /track and enter your order number to track without logging in.',
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept Cash on Delivery (COD), UPI, credit/debit cards, net banking, and wallet payments.',
    },
    {
      question: 'How can I change my delivery address?',
      answer: 'You can update your saved addresses in Profile → Addresses. For an existing order, please contact support before the order is shipped.',
    },
    {
      question: 'What is your delivery radius?',
      answer: 'We deliver within a 1–5 km radius from our partner stores. Your delivery address is checked at checkout.',
    },
    {
      question: 'How do I contact customer support?',
      answer: 'Reach us by email or phone. Our team typically responds within 24 hours.',
    },
  ];

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <HelpCircle className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-800">Help Center</h1>
          <p className="text-gray-600 mt-2">Find answers and get support</p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Package className="w-6 h-6 text-primary" />
              Order & Delivery
            </h2>
            <div className="bg-white rounded-lg shadow-md divide-y divide-gray-200">
              {faqs.slice(0, 4).map((faq, i) => (
                <details key={i} className="group p-4">
                  <summary className="font-medium text-gray-800 cursor-pointer list-none flex justify-between items-center">
                    {faq.question}
                    <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <p className="text-gray-600 mt-2 text-sm">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-primary" />
              Payments
            </h2>
            <p className="text-gray-600">We accept Cash on Delivery, UPI, cards, net banking, and wallets. Payment is processed securely at checkout.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-primary" />
              Address & Location
            </h2>
            <p className="text-gray-600">Use the location picker at checkout to pin your delivery address accurately. You can save multiple addresses (Home, Work, Other) for faster checkout.</p>
          </section>

          <section className="bg-primary/5 rounded-lg p-6 border border-primary/20">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Contact Support</h2>
            <p className="text-gray-600 mb-4">Need more help? Our team is here for you.</p>
            <div className="space-y-2">
              <a
                href="mailto:support@nearandnow.com"
                className="flex items-center gap-2 text-primary hover:text-secondary font-medium"
              >
                <Mail className="w-5 h-5" />
                support@nearandnow.com
              </a>
              <a
                href="tel:+919876543210"
                className="flex items-center gap-2 text-primary hover:text-secondary font-medium"
              >
                <Phone className="w-5 h-5" />
                +91 98765 43210
              </a>
            </div>
          </section>

          <div className="text-center">
            <Link
              to="/"
              className="text-primary hover:text-secondary font-medium"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpPage;
