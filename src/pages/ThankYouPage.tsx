import { Link } from 'react-router-dom';

const ThankYouPage = () => {
  // Generate a random order ID
  const orderId = `NN-${Math.floor(100000 + Math.random() * 900000)}`;
  
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-md text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Thank You for Your Order!</h1>
        
        <p className="text-gray-600 mb-6">
          Your order has been placed successfully. We've sent a confirmation email with your order details.
        </p>
        
        <div className="bg-gray-50 p-4 rounded-md mb-6">
          <p className="text-gray-500 mb-1">Order ID</p>
          <p className="text-lg font-semibold">{orderId}</p>
        </div>
        
        <p className="text-gray-600 mb-8">
          You will receive an SMS notification when your order is out for delivery.
        </p>
        
        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 justify-center">
          <Link
            to="/shop"
            className="bg-primary text-white hover:bg-opacity-90 px-6 py-3 rounded-md font-medium transition-colors"
          >
            Continue Shopping
          </Link>
          
          <Link
            to="/"
            className="border border-primary text-primary hover:bg-primary hover:text-white px-6 py-3 rounded-md font-medium transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ThankYouPage;
