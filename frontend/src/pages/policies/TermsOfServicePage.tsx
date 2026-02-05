import { FileText, AlertCircle, ShoppingCart, CreditCard, Ban, Scale } from 'lucide-react';
import { useEffect } from 'react';

const TermsOfServicePage = () => {
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
                            <FileText className="w-10 h-10" />
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold mb-4">Terms of Service</h1>
                        <p className="text-lg text-white text-opacity-90">
                            Please read these terms carefully before using our services
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
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-lg">
                            <p className="text-gray-700 leading-relaxed">
                                Welcome to <span className="font-semibold text-primary">Near & Now</span>! These Terms of Service govern your use of our website and services. By accessing or using our platform, you agree to be bound by these terms. If you disagree with any part of these terms, please do not use our services.
                            </p>
                        </div>
                    </section>

                    {/* Account Terms */}
                    <section className="mb-12">
                        <div className="flex items-center mb-6">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                                <AlertCircle className="w-6 h-6 text-blue-600" />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-800">Account Terms</h2>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 space-y-4">
                            <div className="flex items-start">
                                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                                    <span className="text-white text-sm font-bold">1</span>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-800 mb-2">Account Creation</h3>
                                    <p className="text-gray-600">
                                        You must be at least 18 years old to create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                                    <span className="text-white text-sm font-bold">2</span>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-800 mb-2">Account Security</h3>
                                    <p className="text-gray-600">
                                        You must immediately notify us of any unauthorized use of your account or any other breach of security. We will not be liable for any loss or damage arising from your failure to protect your account information.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                                    <span className="text-white text-sm font-bold">3</span>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-800 mb-2">Accurate Information</h3>
                                    <p className="text-gray-600">
                                        You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Orders and Payments */}
                    <section className="mb-12">
                        <div className="flex items-center mb-6">
                            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                                <ShoppingCart className="w-6 h-6 text-green-600" />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-800">Orders and Payments</h2>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                                <div className="flex items-center mb-4">
                                    <CreditCard className="w-6 h-6 text-primary mr-3" />
                                    <h3 className="text-xl font-semibold text-gray-800">Payment Terms</h3>
                                </div>
                                <ul className="space-y-3 text-gray-600">
                                    <li className="flex items-start">
                                        <span className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                                        <span>All prices are listed in Indian Rupees (₹) and include applicable taxes unless otherwise stated</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                                        <span>Payment must be received before order processing and shipment</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                                        <span>We accept major credit cards, debit cards, UPI, and other payment methods</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                                        <span>Payment information is processed securely through third-party payment gateways</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                                <h3 className="text-xl font-semibold text-gray-800 mb-4">Order Processing</h3>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-green-50 rounded-lg">
                                        <p className="font-semibold text-gray-800 mb-2">✓ Order Confirmation</p>
                                        <p className="text-sm text-gray-600">You will receive an email confirmation once your order is placed</p>
                                    </div>
                                    <div className="p-4 bg-blue-50 rounded-lg">
                                        <p className="font-semibold text-gray-800 mb-2">✓ Order Acceptance</p>
                                        <p className="text-sm text-gray-600">We reserve the right to refuse or cancel any order</p>
                                    </div>
                                    <div className="p-4 bg-yellow-50 rounded-lg">
                                        <p className="font-semibold text-gray-800 mb-2">✓ Price Changes</p>
                                        <p className="text-sm text-gray-600">Prices are subject to change without prior notice</p>
                                    </div>
                                    <div className="p-4 bg-purple-50 rounded-lg">
                                        <p className="font-semibold text-gray-800 mb-2">✓ Product Availability</p>
                                        <p className="text-sm text-gray-600">Items are subject to availability and may be substituted</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Prohibited Activities */}
                    <section className="mb-12">
                        <div className="flex items-center mb-6">
                            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                                <Ban className="w-6 h-6 text-red-600" />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-800">Prohibited Activities</h2>
                        </div>

                        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                            <p className="text-gray-700 mb-4 font-medium">You agree NOT to:</p>
                            <div className="space-y-3">
                                <div className="flex items-start">
                                    <span className="text-red-500 font-bold mr-3">✗</span>
                                    <span className="text-gray-700">Violate any laws or regulations in your jurisdiction</span>
                                </div>
                                <div className="flex items-start">
                                    <span className="text-red-500 font-bold mr-3">✗</span>
                                    <span className="text-gray-700">Attempt to gain unauthorized access to our systems or other users' accounts</span>
                                </div>
                                <div className="flex items-start">
                                    <span className="text-red-500 font-bold mr-3">✗</span>
                                    <span className="text-gray-700">Transmit any viruses, malware, or harmful code</span>
                                </div>
                                <div className="flex items-start">
                                    <span className="text-red-500 font-bold mr-3">✗</span>
                                    <span className="text-gray-700">Harass, abuse, or harm other users or our staff</span>
                                </div>
                                <div className="flex items-start">
                                    <span className="text-red-500 font-bold mr-3">✗</span>
                                    <span className="text-gray-700">Use automated systems (bots, scrapers) without authorization</span>
                                </div>
                                <div className="flex items-start">
                                    <span className="text-red-500 font-bold mr-3">✗</span>
                                    <span className="text-gray-700">Resell or commercially exploit our products or services</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Intellectual Property */}
                    <section className="mb-12">
                        <div className="flex items-center mb-6">
                            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                                <Scale className="w-6 h-6 text-purple-600" />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-800">Intellectual Property</h2>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                            <p className="text-gray-600 mb-4">
                                All content on this website, including but not limited to text, graphics, logos, images, and software, is the property of Near & Now or its content suppliers and is protected by intellectual property laws.
                            </p>
                            <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r">
                                <p className="text-gray-700">
                                    <strong className="text-purple-700">Important:</strong> You may not reproduce, distribute, modify, or create derivative works of any content without our express written permission.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Limitation of Liability */}
                    <section className="mb-12">
                        <div className="flex items-center mb-6">
                            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                                <AlertCircle className="w-6 h-6 text-orange-600" />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-800">Limitation of Liability</h2>
                        </div>

                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
                            <div className="space-y-4 text-gray-700">
                                <p>
                                    <strong className="text-orange-800">Disclaimer:</strong> Our services are provided "as is" without warranties of any kind, either express or implied.
                                </p>
                                <p>
                                    Near & Now shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the service.
                                </p>
                                <p>
                                    We are not responsible for delays or failures in delivery due to circumstances beyond our control, including but not limited to natural disasters, strikes, or government restrictions.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Termination */}
                    <section className="mb-12">
                        <div className="flex items-center mb-6">
                            <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center mr-4">
                                <Ban className="w-6 h-6 text-gray-600" />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-800">Termination</h2>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                            <p className="text-gray-600 mb-4">
                                We reserve the right to terminate or suspend your account and access to our services at our sole discretion, without notice, for conduct that we believe:
                            </p>
                            <ul className="space-y-2 text-gray-600">
                                <li className="flex items-start">
                                    <span className="w-2 h-2 bg-gray-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                                    <span>Violates these Terms of Service</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-2 h-2 bg-gray-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                                    <span>Is harmful to other users, us, or third parties</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-2 h-2 bg-gray-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                                    <span>Violates any law or regulation</span>
                                </li>
                            </ul>
                        </div>
                    </section>

                    {/* Governing Law */}
                    <section className="mb-12">
                        <div className="flex items-center mb-6">
                            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                                <Scale className="w-6 h-6 text-indigo-600" />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-800">Governing Law</h2>
                        </div>

                        <div className="bg-indigo-50 border-l-4 border-indigo-500 p-6 rounded-r-lg">
                            <p className="text-gray-700">
                                These Terms of Service shall be governed by and construed in accordance with the laws of India. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the courts in New Delhi, India.
                            </p>
                        </div>
                    </section>

                    {/* Changes to Terms */}
                    <section className="mb-12">
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-lg">
                            <h3 className="font-semibold text-gray-800 mb-2">Changes to These Terms</h3>
                            <p className="text-gray-700">
                                We reserve the right to modify these Terms of Service at any time. We will notify you of any material changes by posting the new terms on this page and updating the "Last Updated" date. Your continued use of the service after such changes constitutes acceptance of the new terms.
                            </p>
                        </div>
                    </section>

                    {/* Contact Information */}
                    <section className="mb-12">
                        <div className="bg-gradient-to-r from-primary to-secondary text-white rounded-lg p-8">
                            <h2 className="text-2xl font-bold mb-4">Questions About Our Terms?</h2>
                            <p className="mb-6">
                                If you have any questions about these Terms of Service, please contact us:
                            </p>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div>
                                    <p className="font-semibold mb-2">Email</p>
                                    <a href="mailto:legal@nearnow.com" className="hover:underline text-white text-opacity-90">
                                        legal@nearnow.com
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

                    {/* Acceptance */}
                    <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-r-lg">
                        <p className="text-gray-700">
                            <strong className="text-green-700">By using Near & Now,</strong> you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TermsOfServicePage;