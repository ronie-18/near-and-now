import { Truck, Clock, Package, MapPin, IndianRupee, CheckCircle } from 'lucide-react';
import { useEffect } from 'react';

const ShippingPolicyPage = () => {
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
              <Truck className="w-10 h-10" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Shipping Policy</h1>
            <p className="text-lg text-white text-opacity-90">
              Fast, reliable delivery right to your doorstep
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
            <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-r-lg">
              <p className="text-gray-700 leading-relaxed">
                At <span className="font-semibold text-primary">Near & Now</span>, we are committed to delivering your groceries fresh and fast. This shipping policy outlines our delivery process, timelines, and areas we serve.
              </p>
            </div>
          </section>

          {/* Delivery Areas */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                <MapPin className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Delivery Areas</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <p className="text-gray-600 mb-4">
                We currently deliver to the following areas:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                    <h3 className="font-semibold text-gray-800">Metropolitan Cities</h3>
                  </div>
                  <p className="text-sm text-gray-600">Delhi NCR, Mumbai, Bangalore, Chennai, Kolkata, Hyderabad, Pune</p>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center mb-2">
                    <CheckCircle className="w-5 h-5 text-blue-600 mr-2" />
                    <h3 className="font-semibold text-gray-800">Tier 2 Cities</h3>
                  </div>
                  <p className="text-sm text-gray-600">Jaipur, Ahmedabad, Lucknow, Chandigarh, Kochi, and 50+ more cities</p>
                </div>
              </div>
              <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r">
                <p className="text-sm text-gray-700">
                  <strong>Note:</strong> Enter your pincode during checkout to confirm delivery availability in your area.
                </p>
              </div>
            </div>
          </section>

          {/* Delivery Timeframes */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Delivery Timeframes</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-6 shadow-lg">
                <div className="flex items-center justify-center w-16 h-16 bg-white bg-opacity-20 rounded-full mb-4 mx-auto">
                  <Truck className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-center mb-2">Express Delivery</h3>
                <p className="text-center text-3xl font-bold mb-2">2 Hours</p>
                <p className="text-center text-sm text-white text-opacity-90">
                  For orders placed before 8 PM
                </p>
                <div className="mt-4 pt-4 border-t border-white border-opacity-20">
                  <p className="text-xs text-center">Available in select areas</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-6 shadow-lg">
                <div className="flex items-center justify-center w-16 h-16 bg-white bg-opacity-20 rounded-full mb-4 mx-auto">
                  <Package className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-center mb-2">Standard Delivery</h3>
                <p className="text-center text-3xl font-bold mb-2">Same Day</p>
                <p className="text-center text-sm text-white text-opacity-90">
                  Delivered within 6-8 hours
                </p>
                <div className="mt-4 pt-4 border-t border-white border-opacity-20">
                  <p className="text-xs text-center">Most popular option</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-6 shadow-lg">
                <div className="flex items-center justify-center w-16 h-16 bg-white bg-opacity-20 rounded-full mb-4 mx-auto">
                  <Clock className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-center mb-2">Scheduled Delivery</h3>
                <p className="text-center text-3xl font-bold mb-2">Next Day</p>
                <p className="text-center text-sm text-white text-opacity-90">
                  Choose your preferred time slot
                </p>
                <div className="mt-4 pt-4 border-t border-white border-opacity-20">
                  <p className="text-xs text-center">Plan ahead and save</p>
                </div>
              </div>
            </div>
          </section>

          {/* Shipping Charges */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                <IndianRupee className="w-6 h-6 text-orange-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Shipping Charges</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Order Value</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Delivery Type</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Shipping Fee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-800">Above ₹999</td>
                      <td className="px-6 py-4 text-gray-600">All Types</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                          FREE
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-800">₹500 - ₹999</td>
                      <td className="px-6 py-4 text-gray-600">Standard / Scheduled</td>
                      <td className="px-6 py-4 text-gray-800 font-medium">₹40</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-800">₹500 - ₹999</td>
                      <td className="px-6 py-4 text-gray-600">Express (2 Hours)</td>
                      <td className="px-6 py-4 text-gray-800 font-medium">₹80</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-800">Below ₹500</td>
                      <td className="px-6 py-4 text-gray-600">Standard / Scheduled</td>
                      <td className="px-6 py-4 text-gray-800 font-medium">₹60</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-800">Below ₹500</td>
                      <td className="px-6 py-4 text-gray-600">Express (2 Hours)</td>
                      <td className="px-6 py-4 text-gray-800 font-medium">₹100</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg p-6 text-center">
              <p className="text-2xl font-bold mb-2">🎉 Special Offer!</p>
              <p className="text-lg">Get FREE delivery on all orders above ₹999</p>
            </div>
          </section>

          {/* Order Tracking */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <Package className="w-6 h-6 text-purple-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Order Tracking</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <p className="text-gray-600 mb-6">
                Track your order in real-time with our easy tracking system:
              </p>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                    <span className="text-white font-bold">1</span>
                  </div>
                  <div className="flex-grow">
                    <h3 className="font-semibold text-gray-800 mb-1">Order Confirmation</h3>
                    <p className="text-sm text-gray-600">You'll receive a confirmation email with your order details and tracking number</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                    <span className="text-white font-bold">2</span>
                  </div>
                  <div className="flex-grow">
                    <h3 className="font-semibold text-gray-800 mb-1">Order Processing</h3>
                    <p className="text-sm text-gray-600">Our team carefully picks and packs your items</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                    <span className="text-white font-bold">3</span>
                  </div>
                  <div className="flex-grow">
                    <h3 className="font-semibold text-gray-800 mb-1">Out for Delivery</h3>
                    <p className="text-sm text-gray-600">Your order is on its way! Track your delivery partner's location</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                    <span className="text-white font-bold">4</span>
                  </div>
                  <div className="flex-grow">
                    <h3 className="font-semibold text-gray-800 mb-1">Delivered</h3>
                    <p className="text-sm text-gray-600">Enjoy your fresh groceries!</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Delivery Guidelines */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                <CheckCircle className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Delivery Guidelines</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 space-y-4">
              <div className="flex items-start p-4 bg-blue-50 rounded-lg">
                <span className="text-blue-600 mr-3 text-lg">📦</span>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Package Handling</h4>
                  <p className="text-sm text-gray-600">All items are carefully packaged to ensure freshness and prevent damage</p>
                </div>
              </div>
              <div className="flex items-start p-4 bg-green-50 rounded-lg">
                <span className="text-green-600 mr-3 text-lg">🧊</span>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Temperature Control</h4>
                  <p className="text-sm text-gray-600">Perishable items are delivered in insulated bags with ice packs</p>
                </div>
              </div>
              <div className="flex items-start p-4 bg-yellow-50 rounded-lg">
                <span className="text-yellow-600 mr-3 text-lg">✅</span>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Quality Check</h4>
                  <p className="text-sm text-gray-600">Please check your items upon delivery. Report any issues immediately</p>
                </div>
              </div>
              <div className="flex items-start p-4 bg-purple-50 rounded-lg">
                <span className="text-purple-600 mr-3 text-lg">📱</span>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">Contactless Delivery</h4>
                  <p className="text-sm text-gray-600">We offer contactless delivery for your safety and convenience</p>
                </div>
              </div>
            </div>
          </section>

          {/* Important Notes */}
          <section className="mb-12">
            <div className="bg-orange-50 border-l-4 border-orange-400 p-6 rounded-r-lg">
              <h3 className="font-semibold text-gray-800 mb-3">Important Information</h3>
              <ul className="space-y-2 text-gray-700 text-sm">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Delivery times are estimates and may vary due to traffic, weather, or high demand</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Please ensure someone is available to receive the delivery</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>We may contact you if we need additional delivery instructions</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Perishable items cannot be left unattended</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Contact */}
          <section>
            <div className="bg-gradient-to-r from-primary to-secondary text-white rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Need Help with Your Delivery?</h2>
              <p className="mb-6">Our customer support team is here to assist you</p>
              <div className="flex flex-wrap justify-center gap-6">
                <div>
                  <p className="text-sm mb-1 text-white text-opacity-75">Email</p>
                  <a href="mailto:delivery@nearnow.com" className="font-semibold hover:underline">
                    delivery@nearnow.com
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

export default ShippingPolicyPage;