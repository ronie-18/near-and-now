import { Shield, Lock, Eye, FileText, UserCheck, AlertCircle } from 'lucide-react';
import { useEffect } from 'react';

const PrivacyPolicyPage = () => {
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
              <Shield className="w-10 h-10" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Privacy Policy</h1>
            <p className="text-lg text-white text-opacity-90">
              How we collect, use, and protect your personal information
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
            <div className="bg-purple-50 border-l-4 border-purple-500 p-6 rounded-r-lg">
              <p className="text-gray-700 leading-relaxed">
                At <span className="font-semibold text-primary">Near & Now</span>, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services. Please read this policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site.
              </p>
            </div>
          </section>

          {/* Information We Collect */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <FileText className="w-6 h-6 text-purple-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Information We Collect</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-3">Personal Information</h3>
                <p className="text-gray-600 mb-4">
                  We may collect personal information that you voluntarily provide to us when you:
                </p>
                <ul className="space-y-2 text-gray-600 pl-6 list-disc">
                  <li>Register on our website</li>
                  <li>Place an order</li>
                  <li>Subscribe to our newsletter</li>
                  <li>Participate in contests or surveys</li>
                  <li>Contact our customer service</li>
                </ul>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-xl font-semibold text-gray-800 mb-3">Information Automatically Collected</h3>
                <p className="text-gray-600 mb-4">
                  When you access our website, we may automatically collect:
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="font-semibold text-gray-800 mb-2">Device Information</p>
                    <p className="text-sm text-gray-600">Browser type, operating system, device type, and mobile device identifiers</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="font-semibold text-gray-800 mb-2">Usage Data</p>
                    <p className="text-sm text-gray-600">Pages visited, time spent, click-through paths, and interaction with features</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="font-semibold text-gray-800 mb-2">Location Data</p>
                    <p className="text-sm text-gray-600">IP address and approximate location based on IP</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="font-semibold text-gray-800 mb-2">Cookies & Similar Technologies</p>
                    <p className="text-sm text-gray-600">Information collected through cookies, web beacons, and similar tracking technologies</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* How We Use Your Information */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <Eye className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">How We Use Your Information</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Provide and Improve Services</h3>
                    <p className="text-gray-600">
                      To process orders, deliver products, provide customer support, and enhance your shopping experience.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Personalization</h3>
                    <p className="text-gray-600">
                      To personalize your shopping experience, recommend products, and provide tailored content.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Communication</h3>
                    <p className="text-gray-600">
                      To send transactional emails, order updates, promotional offers, and newsletters (if you've opted in).
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">4</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Security and Fraud Prevention</h3>
                    <p className="text-gray-600">
                      To protect our website, verify accounts, and prevent fraudulent transactions.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">5</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Analytics and Improvement</h3>
                    <p className="text-gray-600">
                      To analyze usage patterns, conduct research, and improve our website and services.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Information Sharing */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                <UserCheck className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Information Sharing</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <p className="text-gray-600 mb-6">
                We may share your information with the following third parties:
              </p>

              <div className="space-y-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-gray-800 mb-2">Service Providers</h3>
                  <p className="text-sm text-gray-600">
                    Payment processors, delivery partners, customer service providers, and marketing services that help us operate our business.
                  </p>
                </div>

                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-gray-800 mb-2">Business Partners</h3>
                  <p className="text-sm text-gray-600">
                    Trusted third parties who assist us in offering products, services, or joint marketing campaigns.
                  </p>
                </div>

                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-gray-800 mb-2">Legal Requirements</h3>
                  <p className="text-sm text-gray-600">
                    When required by law, court order, or governmental regulation, or to protect our rights, property, or safety.
                  </p>
                </div>
              </div>

              <div className="mt-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r">
                <p className="text-gray-700">
                  <strong>Important:</strong> We do not sell your personal information to third parties for their marketing purposes without your explicit consent.
                </p>
              </div>
            </div>
          </section>

          {/* Data Security */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                <Lock className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Data Security</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <p className="text-gray-600 mb-6">
                We implement appropriate technical and organizational measures to protect your personal information:
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <span className="text-red-500 mr-3 text-lg">🔒</span>
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-1">Encryption</h4>
                    <p className="text-sm text-gray-600">All sensitive data is encrypted during transmission</p>
                  </div>
                </div>
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <span className="text-red-500 mr-3 text-lg">🛡️</span>
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-1">Secure Networks</h4>
                    <p className="text-sm text-gray-600">Protected infrastructure and regular security audits</p>
                  </div>
                </div>
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <span className="text-red-500 mr-3 text-lg">👤</span>
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-1">Access Controls</h4>
                    <p className="text-sm text-gray-600">Limited employee access to personal information</p>
                  </div>
                </div>
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <span className="text-red-500 mr-3 text-lg">🔍</span>
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-1">Regular Monitoring</h4>
                    <p className="text-sm text-gray-600">Continuous monitoring for unauthorized access</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-r">
                <p className="text-gray-700">
                  <strong>Note:</strong> While we strive to use commercially acceptable means to protect your personal information, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.
                </p>
              </div>
            </div>
          </section>

          {/* Your Rights */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                <UserCheck className="w-6 h-6 text-orange-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Your Rights</h2>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <p className="text-gray-600 mb-6">
                You have certain rights regarding your personal information:
              </p>

              <div className="space-y-4">
                <div className="flex items-start">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span className="text-gray-700"><strong>Access:</strong> You can request access to your personal information.</span>
                </div>
                <div className="flex items-start">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span className="text-gray-700"><strong>Correction:</strong> You can request correction of inaccurate information.</span>
                </div>
                <div className="flex items-start">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span className="text-gray-700"><strong>Deletion:</strong> You can request deletion of your personal information.</span>
                </div>
                <div className="flex items-start">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span className="text-gray-700"><strong>Opt-out:</strong> You can opt-out of marketing communications.</span>
                </div>
                <div className="flex items-start">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span className="text-gray-700"><strong>Data Portability:</strong> You can request a copy of your data in a structured format.</span>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-gray-700">
                  To exercise any of these rights, please contact us at <a href="mailto:privacy@nearnow.com" className="text-primary hover:underline">privacy@nearnow.com</a>. We will respond to your request within 30 days.
                </p>
              </div>
            </div>
          </section>

          {/* Cookies */}
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                <AlertCircle className="w-6 h-6 text-indigo-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800">Cookies Policy</h2>
            </div>

            <div className="bg-indigo-50 border-l-4 border-indigo-500 p-6 rounded-r-lg">
              <p className="text-gray-700 mb-4">
                We use cookies and similar tracking technologies to track activity on our website and hold certain information. Cookies are files with a small amount of data that may include an anonymous unique identifier.
              </p>
              <p className="text-gray-700">
                You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our website.
              </p>
            </div>
          </section>

          {/* Changes to Policy */}
          <section className="mb-12">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-lg">
              <h3 className="font-semibold text-gray-800 mb-2">Changes to This Privacy Policy</h3>
              <p className="text-gray-700">
                We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.
              </p>
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <div className="bg-gradient-to-r from-primary to-secondary text-white rounded-lg p-8">
              <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
              <p className="mb-6">
                If you have any questions about this Privacy Policy, please contact us:
              </p>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <p className="font-semibold mb-2">Email</p>
                  <a href="mailto:privacy@nearnow.com" className="hover:underline text-white text-opacity-90">
                    privacy@nearnow.com
                  </a>
                </div>
                <div>
                  <p className="font-semibold mb-2">Phone</p>
                  <a href="tel:+919876543210" className="hover:underline text-white text-opacity-90">
                    +91 98765 43210
                  </a>
                </div>
                <div>
                  <p className="font-semibold mb-2">Address</p>
                  <p className="text-sm text-white text-opacity-90">
                    123 Main Street<br />New Delhi, India
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
