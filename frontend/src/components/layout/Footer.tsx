import { Link, useLocation } from 'react-router-dom';
import { Mail, Phone, MapPin, Facebook, Twitter, Instagram, Linkedin, Send } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { subscribeToNewsletter } from '../../services/supabase';
import { useNotification } from '../../context/NotificationContext';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const location = useLocation();
  const { showNotification } = useNotification();
  const [email, setEmail] = useState('');
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Check if current path matches the link
  const isActiveLink = (path: string) => {
    return location.pathname === path;
  };

  // Handle newsletter subscription
  const handleNewsletterSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email) {
      showNotification('Please enter your email address', 'error');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showNotification('Please enter a valid email address', 'error');
      setSubscribeStatus('error');
      return;
    }

    try {
      setSubscribeStatus('loading');

      // Subscribe to newsletter
      await subscribeToNewsletter(email);

      setSubscribeStatus('success');
      showNotification('Successfully subscribed to newsletter! 🎉', 'success');
      setEmail('');

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Reset status after 3 seconds
      timeoutRef.current = setTimeout(() => {
        setSubscribeStatus('idle');
        timeoutRef.current = null;
      }, 3000);
    } catch (error: any) {
      console.error('Error subscribing to newsletter:', error);
      setSubscribeStatus('error');

      // Show user-friendly error message
      const errorMessage = error?.message || 'Failed to subscribe. Please try again.';
      showNotification(errorMessage, 'error');

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Reset error status after 3 seconds
      timeoutRef.current = setTimeout(() => {
        setSubscribeStatus('idle');
        timeoutRef.current = null;
      }, 3000);
    }
  }, [email, showNotification]);

  const quickLinks = [
    { name: 'Home', path: '/' },
    { name: 'Shop', path: '/shop' },
    { name: 'About Us', path: '/about' },
    { name: 'Contact', path: '/contact' },
    { name: 'FAQ', path: '/faq' },
  ];

  const customerService = [
    { name: 'Help Center', path: '/help' },
    { name: 'Track Order', path: '/track-order' },
    { name: 'Returns & Refunds', path: '/returns' },
    { name: 'Payment Options', path: '/payment-options' },
    { name: 'Delivery Info', path: '/delivery-info' },
  ];

  const socialLinks = [
    {
      name: 'Facebook',
      url: 'https://facebook.com',
      icon: <Facebook className="h-5 w-5" />,
      color: 'hover:text-blue-500'
    },
    {
      name: 'Twitter',
      url: 'https://twitter.com',
      icon: <Twitter className="h-5 w-5" />,
      color: 'hover:text-sky-400'
    },
    {
      name: 'Instagram',
      url: 'https://instagram.com',
      icon: <Instagram className="h-5 w-5" />,
      color: 'hover:text-pink-500'
    },
    {
      name: 'LinkedIn',
      url: 'https://linkedin.com',
      icon: <Linkedin className="h-5 w-5" />,
      color: 'hover:text-blue-600'
    },
  ];

  const legalLinks = [
    { name: 'Privacy Policy', path: '/privacy' },
    { name: 'Terms of Service', path: '/terms' },
    { name: 'Shipping Policy', path: '/shipping' },
    { name: 'Refund Policy', path: '/refund' },
  ];

  return (
    <footer className="bg-gradient-to-b from-gray-800 to-gray-900 text-white">
      {/* Main Footer Content */}
      <div className="container mx-auto px-4 pt-12 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* About Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <img
                src="/Logo.png"
                alt="Near & Now Logo"
                className="h-12 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div>
                <h3 className="text-xl font-bold text-white">Near & Now</h3>
                <p className="text-xs text-gray-400 italic">Digital Dukan, Local Dil Se</p>
              </div>
            </div>

            <p className="text-gray-300 text-sm leading-relaxed">
              Your neighborhood grocery store, now online. Fresh products, fast delivery, and the best prices in town.
            </p>

            {/* Social Links */}
            <div>
              <h4 className="text-sm font-semibold mb-3 text-gray-200">Follow Us</h4>
              <div className="flex space-x-3">
                {socialLinks.map((social) => (
                  <a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-gray-300 transition-all duration-300 ${social.color} hover:bg-gray-600 hover:scale-110 hover:shadow-lg`}
                    aria-label={social.name}
                  >
                    {social.icon}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-bold mb-4 text-white">Quick Links</h3>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className={`text-sm transition-all duration-200 inline-flex items-center group ${
                      isActiveLink(link.path)
                        ? 'text-primary font-medium'
                        : 'text-gray-300 hover:text-white hover:translate-x-1'
                    }`}
                  >
                    <span className={`w-0 h-0.5 bg-primary transition-all duration-200 mr-0 ${
                      isActiveLink(link.path) ? 'w-4 mr-2' : 'group-hover:w-4 group-hover:mr-2'
                    }`}></span>
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Customer Service */}
          <div>
            <h3 className="text-lg font-bold mb-4 text-white">Customer Service</h3>
            <ul className="space-y-2.5">
              {customerService.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className={`text-sm transition-all duration-200 inline-flex items-center group ${
                      isActiveLink(link.path)
                        ? 'text-primary font-medium'
                        : 'text-gray-300 hover:text-white hover:translate-x-1'
                    }`}
                  >
                    <span className={`w-0 h-0.5 bg-primary transition-all duration-200 mr-0 ${
                      isActiveLink(link.path) ? 'w-4 mr-2' : 'group-hover:w-4 group-hover:mr-2'
                    }`}></span>
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info & Newsletter */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold mb-4 text-white">Contact Us</h3>
              <ul className="space-y-3">
                <li>
                  <a
                    href="https://maps.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start text-gray-300 hover:text-white transition-colors group"
                  >
                    <MapPin className="h-5 w-5 mr-3 mt-0.5 text-primary flex-shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-sm">Kolkata, West Bengal</span>
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:snearandnowofficial2025@gmail.com"
                    className="flex items-start text-gray-300 hover:text-white transition-colors group"
                  >
                    <Mail className="h-5 w-5 mr-3 mt-0.5 text-primary flex-shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-sm">nearandnowofficial2025@gmail.com</span>
                  </a>
                </li>
                <li>
                  <a
                    href="tel:+919477035649"
                    className="flex items-start text-gray-300 hover:text-white transition-colors group"
                  >
                    <Phone className="h-5 w-5 mr-3 mt-0.5 text-primary flex-shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-sm">+91 94770 35649</span>
                  </a>
                </li>
              </ul>
            </div>

            {/* Newsletter */}
            <div>
              <h4 className="text-sm font-semibold mb-3 text-gray-200">Newsletter</h4>
              <p className="text-xs text-gray-400 mb-3">
                Subscribe for exclusive deals and updates
              </p>
              <form onSubmit={handleNewsletterSubmit} className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                  className="w-full px-4 py-2.5 pr-12 text-sm text-gray-800 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  required
                  disabled={subscribeStatus === 'loading'}
                />
                <button
                  type="submit"
                  disabled={subscribeStatus === 'loading'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 bg-primary hover:bg-secondary text-white p-2 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                  aria-label="Subscribe to newsletter"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>

              {/* Subscription Status Messages */}
              {subscribeStatus === 'success' && (
                <p className="text-xs text-green-400 mt-2 flex items-center">
                  <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Successfully subscribed!
                </p>
              )}
              {subscribeStatus === 'error' && (
                <p className="text-xs text-red-400 mt-2 flex items-center">
                  <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  Subscription failed. Please try again.
                </p>
              )}
              {subscribeStatus === 'loading' && (
                <p className="text-xs text-gray-400 mt-2 flex items-center">
                  <svg className="animate-spin h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Subscribing...
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-700">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            {/* Copyright */}
            <p className="text-sm text-gray-400 text-center md:text-left">
              &copy; {currentYear} <span className="text-white font-medium">Near & Now</span>. All rights reserved.
            </p>

            {/* Legal Links */}
            <div className="flex flex-wrap justify-center gap-4 md:gap-6">
              {legalLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`text-sm transition-colors ${
                    isActiveLink(link.path)
                      ? 'text-primary font-medium'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </div>

            {/* Payment Methods */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400">We Accept:</span>
              <div className="flex space-x-2">
                <div className="w-10 h-6 bg-white rounded flex items-center justify-center text-xs font-bold text-gray-800">
                  VISA
                </div>
                <div className="w-10 h-6 bg-white rounded flex items-center justify-center text-xs font-bold text-gray-800">
                  MC
                </div>
                <div className="w-10 h-6 bg-white rounded flex items-center justify-center text-xs font-bold text-blue-600">
                  UPI
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;