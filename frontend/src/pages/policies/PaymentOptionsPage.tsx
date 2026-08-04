import { CreditCard, Wallet, Banknote, Smartphone, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';

const PaymentOptionsPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary to-secondary text-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white bg-opacity-20 rounded-full mb-6">
              <CreditCard className="w-10 h-10" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Payment Options</h1>
            <p className="text-lg text-white text-opacity-90">
              Flexible, secure ways to pay for your order
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <section className="mb-12">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Banknote className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">Cash on Delivery</h3>
                  <p className="text-sm text-gray-600">
                    Pay in cash when your order arrives at your doorstep.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">UPI / Online Payment</h3>
                  <p className="text-sm text-gray-600">
                    Pay instantly and securely via UPI, cards, or net banking, processed through our
                    payment partner.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Wallet className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">Near & Now Wallet</h3>
                  <p className="text-sm text-gray-600">
                    Pay from your in-app wallet balance for a faster checkout.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 flex items-start gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">Split Payment</h3>
                  <p className="text-sm text-gray-600">
                    Split your order total between cash and UPI at checkout.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 flex items-start gap-4">
              <ShieldCheck className="w-8 h-8 text-primary flex-shrink-0" />
              <p className="text-gray-700">
                All online payments are processed through a PCI-DSS compliant payment gateway. Near
                & Now never stores your card, UPI, or bank details.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PaymentOptionsPage;
