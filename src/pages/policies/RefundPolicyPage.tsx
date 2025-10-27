import { RefreshCcw, AlertCircle, Clock, CheckCircle, DollarSign } from 'lucide-react';
import { useEffect } from 'react';

const RefundPolicyPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const lastUpdated = "October 26, 2025";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary to-secondary text-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white bg-opacity-20 rounded-full mb-6">
              <RefreshCcw className="w-10 h-10" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Refund Policy</h1>
            <p className="text-lg text-white text-opacity-90">
              Our commitment to customer satisfaction
            </p>
            <p className="text-sm text-white text-opacity-75 mt-4">
              Last Updated: {lastUpdated}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Introduction */}
          <section className="mb-12">
            <div className="bg-orange-50 border-l-4 border-orange-500 p-6 rounded-r-lg">
              <p className="text-gray-700 leading-relaxed">
                At <span className="font-semibold text-primary">Near & Now</span>, we strive to ensure your complete satisfaction with every purchase. This refund policy outlines our procedures for returns, exchanges, and refunds to ensure a smooth shopping experience.
              </p>
            </div>
          </section>

          {/* Refund Eligibility */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                <CheckCircle className="w-6 h-6 text-orange-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Refund Eligibility</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <p className="text-gray-600 mb-6">
                You may be eligible for a return and refund if:
              </p>

              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Damaged or Defective Products</h3>
                    <p className="text-gray-600">
                      Products that arrive damaged, spoiled, or defective are eligible for an immediate refund or replacement.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Incorrect Items</h3>
                    <p className="text-gray-600">
                      If you receive items that don't match your order, we'll arrange for a return and correct replacement.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Missing Items</h3>
                    <p className="text-gray-600">
                      If items are missing from your order, we'll either deliver the missing items or provide a refund.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Quality Issues</h3>
                    <p className="text-gray-600">
                      Products that don't meet our quality standards are eligible for return and refund.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0" />
                  <p className="text-gray-700">
                    <strong>Important:</strong> All return requests must be made within 24 hours of delivery for perishable items and within 7 days for non-perishable items.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Non-Returnable Items */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Non-Returnable Items</h2>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-gray-700 mb-4 font-medium">The following items cannot be returned:</p>
              <div className="space-y-3">
                <div className="flex items-start">
                  <span className="text-red-500 font-bold mr-3">✗</span>
                  <span className="text-gray-700">Products that have been opened, partially consumed, or used (except in case of defects)</span>
                </div>
                <div className="flex items-start">
                  <span className="text-red-500 font-bold mr-3">✗</span>
                  <span className="text-gray-700">Perishable goods like fresh fruits, vegetables, and dairy products after 24 hours of delivery</span>
                </div>
                <div className="flex items-start">
                  <span className="text-red-500 font-bold mr-3">✗</span>
                  <span className="text-gray-700">Items with broken seals, unless they arrived damaged</span>
                </div>
                <div className="flex items-start">
                  <span className="text-red-500 font-bold mr-3">✗</span>
                  <span className="text-gray-700">Personal hygiene products</span>
                </div>
                <div className="flex items-start">
                  <span className="text-red-500 font-bold mr-3">✗</span>
                  <span className="text-gray-700">Gift cards or promotional vouchers</span>
                </div>
              </div>
            </div>
          </section>

          {/* Refund Process */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <RefreshCcw className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Refund Process</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <p className="text-gray-600 mb-6">
                Here's how our refund process works:
              </p>

              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                    <span className="text-white font-bold">1</span>
                  </div>
                  <div className="flex-grow">
                    <h3 className="font-semibold text-gray-800 mb-1">Submit a Request</h3>
                    <p className="text-sm text-gray-600">Contact our customer service team through the app, website, or phone to report the issue</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                    <span className="text-white font-bold">2</span>
                  </div>
                  <div className="flex-grow">
                    <h3 className="font-semibold text-gray-800 mb-1">Verification</h3>
                    <p className="text-sm text-gray-600">Our team will verify your claim, which may include requesting photos of the damaged/defective items</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                    <span className="text-white font-bold">3</span>
                  </div>
                  <div className="flex-grow">
                    <h3 className="font-semibold text-gray-800 mb-1">Return Pickup (if applicable)</h3>
                    <p className="text-sm text-gray-600">For eligible items, we'll arrange a pickup at no additional cost</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                    <span className="text-white font-bold">4</span>
                  </div>
                  <div className="flex-grow">
                    <h3 className="font-semibold text-gray-800 mb-1">Refund Processing</h3>
                    <p className="text-sm text-gray-600">Once approved, refunds will be processed to your original payment method</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Refund Timeline */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <Clock className="w-6 h-6 text-purple-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Refund Timeline</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-6 shadow-lg">
                <div className="flex items-center justify-center w-16 h-16 bg-white bg-opacity-20 rounded-full mb-4 mx-auto">
                  <Clock className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-center mb-2">Processing Time</h3>
                <p className="text-center text-3xl font-bold mb-2">24-48 Hours</p>
                <p className="text-center text-sm text-white text-opacity-90">
                  For refund approval
                </p>
              </div>

              <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-6 shadow-lg">
                <div className="flex items-center justify-center w-16 h-16 bg-white bg-opacity-20 rounded-full mb-4 mx-auto">
                  <DollarSign className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-center mb-2">Credit/Debit Cards</h3>
                <p className="text-center text-3xl font-bold mb-2">3-5 Days</p>
                <p className="text-center text-sm text-white text-opacity-90">
                  To reflect in your account
                </p>
              </div>

              <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-6 shadow-lg">
                <div className="flex items-center justify-center w-16 h-16 bg-white bg-opacity-20 rounded-full mb-4 mx-auto">
                  <RefreshCcw className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-center mb-2">UPI/Wallet</h3>
                <p className="text-center text-3xl font-bold mb-2">24 Hours</p>
                <p className="text-center text-sm text-white text-opacity-90">
                  For digital payment methods
                </p>
              </div>
            </div>
          </section>

          {/* Exchanges */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                <RefreshCcw className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Exchanges</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 space-y-4">
              <div className="flex items-start p-4 bg-green-50 rounded-lg">
                <span className="text-green-600 mr-3 text-lg">🔄</span>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Same-Item Exchange</h4>
                  <p className="text-sm text-gray-600">If you received a damaged or defective item, we can replace it with the same product</p>
                </div>
              </div>
              <div className="flex items-start p-4 bg-green-50 rounded-lg">
                <span className="text-green-600 mr-3 text-lg">🔀</span>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Different-Item Exchange</h4>
                  <p className="text-sm text-gray-600">You can exchange for a different product of equal or higher value (paying the difference)</p>
                </div>
              </div>
              <div className="flex items-start p-4 bg-green-50 rounded-lg">
                <span className="text-green-600 mr-3 text-lg">⏱️</span>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Exchange Timeline</h4>
                  <p className="text-sm text-gray-600">Exchanges are typically processed within 24 hours of approval</p>
                </div>
              </div>
            </div>
          </section>

          {/* Cancellation Policy */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mr-4">
                <AlertCircle className="w-6 h-6 text-yellow-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Order Cancellation</h2>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-lg">
              <h3 className="font-semibold text-gray-800 mb-3">Cancellation Policy</h3>
              <ul className="space-y-2 text-gray-700 text-sm">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Orders can be cancelled within 30 minutes of placing them</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Once an order is marked "Processing" or "Out for Delivery," it cannot be cancelled</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Refunds for cancelled orders will be processed within 24 hours</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Frequent cancellations may affect your account status</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Contact */}
          <section>
            <div className="bg-gradient-to-r from-primary to-secondary text-white rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Need Help with Returns or Refunds?</h2>
              <p className="mb-6">Our customer support team is here to assist you</p>
              <div className="flex flex-wrap justify-center gap-6">
                <div>
                  <p className="text-sm mb-1 text-white text-opacity-75">Email</p>
                  <a href="mailto:refunds@nearnow.com" className="font-semibold hover:underline">
                    refunds@nearnow.com
                  </a>
                </div>
                <div>
                  <p className="text-sm mb-1 text-white text-opacity-75">Phone</p>
                  <a href="tel:+919876543210" className="font-semibold hover:underline">
                    +91 98765 43210
                  </a>
                </div>
                <div>
                  <p className="text-sm mb-1 text-white text-opacity-75">Hours</p>
                  <p className="font-semibold">24/7 Support</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default RefundPolicyPage;
