import { Link, useLocation } from 'react-router-dom';
import { Mail, Phone, MapPin, Facebook, Twitter, Instagram, Linkedin, Send } from 'lucide-react';
import { useState, useCallback } from 'react';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Check if current path matches the link
  const isActiveLink = (path: string) => {
    return location.pathname === path;
  };

  // Handle newsletter subscription
  const handleNewsletterSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email) return;

    setSubscribeStatus('loading');

    // Simulate API call
    setTimeout(() => {
      // TODO: Implement actual newsletter subscription logic
      console.log('Subscribing email:', email);
      setSubscribeStatus('success');
      setEmail('');

      // Reset status after 3 seconds
      setTimeout(() => {
        setSubscribeStatus('idle');
      }, 3000);
    }, 1000);
  }, [email]);

  const quickLinks = [
    { name: 'Home', path: '/' },
    { name: 'Shop', path: '/shop' },
    { name: 'About Us', path: '/about' },
    { name: 'Contact', path: '/contact' },
    { name: 'FAQ', path: '/faq' },
  ];

  const categories = [
    { name: 'Staples', path: '/category/staples' },
    { name: 'Spices', path: '/category/spices' },
    { name: 'Oils', path: '/category/oils' },
    { name: 'Bakery', path: '/category/bakery' },
    { name: 'Dairy Products', path: '/category/dairy-products' },
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

          {/* Categories */}
          <div>
            <h3 className="text-lg font-bold mb-4 text-white">Categories</h3>
            <ul className="space-y-2.5">
              {categories.map((category) => (
                <li key={category.path}>
                  <Link
                    to={category.path}
                    className={`text-sm transition-all duration-200 inline-flex items-center group ${
                      isActiveLink(category.path)
                        ? 'text-primary font-medium'
                        : 'text-gray-300 hover:text-white hover:translate-x-1'
                    }`}
                  >
                    <span className={`w-0 h-0.5 bg-primary transition-all duration-200 mr-0 ${
                      isActiveLink(category.path) ? 'w-4 mr-2' : 'group-hover:w-4 group-hover:mr-2'
                    }`}></span>
                    {category.name}
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
                    <span className="text-sm">123 Main Street, New Delhi, India</span>
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:support@nearnow.com"
                    className="flex items-start text-gray-300 hover:text-white transition-colors group"
                  >
                    <Mail className="h-5 w-5 mr-3 mt-0.5 text-primary flex-shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-sm">support@nearnow.com</span>
                  </a>
                </li>
                <li>
                  <a
                    href="tel:+919876543210"
                    className="flex items-start text-gray-300 hover:text-white transition-colors group"
                  >
                    <Phone className="h-5 w-5 mr-3 mt-0.5 text-primary flex-shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-sm">+91 98765 43210</span>
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
              {subscribeStatus === 'loading' && (
                <p className="text-xs text-gray-400 mt-2">Subscribing...</p>
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
              {legalLinks.map((link, index) => (
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