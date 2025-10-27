import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthModal from '../components/auth/AuthModal';

const LoginPage = () => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(true);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Login / Register</h1>
        
        <p className="text-gray-600 mb-6">
          Please login or register to continue shopping with Near & Now.
        </p>
        
        <button
          onClick={() => setIsAuthModalOpen(true)}
          className="w-full bg-primary hover:bg-secondary text-white py-3 rounded-md transition-colors mb-4"
        >
          Login with Phone Number
        </button>
        
        <div className="text-center">
          <Link to="/" className="text-primary hover:text-secondary">
            Back to Home
          </Link>
        </div>
      </div>
      
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </div>
  );
};

export default LoginPage;
