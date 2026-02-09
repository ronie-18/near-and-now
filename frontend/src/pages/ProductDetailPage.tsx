import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ProductGrid from '../components/products/ProductGrid';
import { getAllProducts, Product } from '../services/supabase';
import { useCart } from '../context/CartContext';
import { useNotification } from '../context/NotificationContext';
import { formatPrice, formatCategoryName } from '../utils/formatters';

const ProductDetailPage = () => {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  
  const { addToCart, cartItems } = useCart();
  const { showNotification } = useNotification();
  
  // Check if product is in cart (consider isLoose when product is loaded)
  const productInCart = product
    ? cartItems.find(
        item =>
          item.id === product.id &&
          (product.isLoose ? item.isLoose : !item.isLoose)
      )
    : null;
  const cartQuantity = productInCart?.quantity || 0;

  // Fetch product details
  useEffect(() => {
    const fetchProductDetails = async () => {
      if (!productId) return;
      
      try {
        setLoading(true);
        const allProducts = await getAllProducts();
        
        // Find the current product
        const currentProduct = allProducts.find(p => p.id === productId) || null;
        setProduct(currentProduct);
        
        // Find related products (same category)
        if (currentProduct) {
          const related = allProducts
            .filter(p => p.category === currentProduct.category && p.id !== currentProduct.id)
            .slice(0, 4);
          setRelatedProducts(related);
        }
      } catch (error) {
        console.error('Error fetching product details:', error);
        // Error handling without notification
      } finally {
        setLoading(false);
      }
    };

    fetchProductDetails();
  }, [productId]);

  // Handle quantity change
  const incrementQuantity = () => {
    setQuantity(prev => prev + 1);
  };

  const decrementQuantity = () => {
    setQuantity(prev => (prev > 1 ? prev - 1 : 1));
  };

  // Handle add to cart
  const handleAddToCart = () => {
    if (!product) return;
    
    const added = addToCart(product, quantity, product.isLoose ?? false);
    if (added) {
      showNotification(`${product.name} added to cart`, 'success');
    }
  };

  if (loading) {
    return (
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
            
            <div className="flex flex-col md:flex-row gap-8">
              <div className="md:w-1/2">
                <div className="bg-gray-200 rounded-lg h-96"></div>
              </div>
              
              <div className="md:w-1/2">
                <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-6 bg-gray-200 rounded w-1/2 mb-6"></div>
                
                <div className="h-24 bg-gray-200 rounded mb-6"></div>
                
                <div className="h-10 bg-gray-200 rounded mb-4"></div>
                <div className="h-12 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>
    );
  }

  if (!product) {
    return (
        <div className="container mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Product Not Found</h1>
          <p className="text-gray-600 mb-6">
            The product you are looking for does not exist or has been removed.
          </p>
          <Link
            to="/shop"
            className="bg-primary hover:bg-secondary text-white px-6 py-3 rounded-md font-medium transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
    );
  }

  return (
      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumbs */}
        <nav className="flex mb-6 text-sm">
          <ol className="flex items-center space-x-2">
            <li>
              <Link to="/" className="text-gray-500 hover:text-primary">
                Home
              </Link>
            </li>
            <li className="text-gray-500">/</li>
            <li>
              <Link to="/shop" className="text-gray-500 hover:text-primary">
                Shop
              </Link>
            </li>
            <li className="text-gray-500">/</li>
            <li>
              <Link
                to={`/category/${product.category}`}
                className="text-gray-500 hover:text-primary"
              >
                {formatCategoryName(product.category)}
              </Link>
            </li>
            <li className="text-gray-500">/</li>
            <li className="text-gray-700 font-medium truncate max-w-xs">
              {product.name}
            </li>
          </ol>
        </nav>
        
        <div className="flex flex-col md:flex-row gap-8 mb-12">
          {/* Product Image */}
          <div className="md:w-1/2">
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <img
                src={product.image || 'https://via.placeholder.com/600x600?text=No+Image'}
                alt={product.name}
                className="w-full h-auto object-contain aspect-square"
              />
            </div>
          </div>
          
          {/* Product Details */}
          <div className="md:w-1/2">
            <div className="bg-white rounded-lg shadow-md p-6">
              {/* Category */}
              <div className="text-sm text-primary font-medium mb-2">
                {formatCategoryName(product.category)}
              </div>
              
              {/* Product Name */}
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                {product.name}
              </h1>
              
              {/* Price */}
              <div className="text-2xl font-bold text-primary mb-4">
                {formatPrice(product.price)}
                {(product.size || product.weight) && (
                  <span className="text-sm text-gray-500 ml-2">
                    {product.size || product.weight}
                  </span>
                )}
              </div>
              
              {/* Description */}
              {product.description && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-800 mb-2">Description</h3>
                  <p className="text-gray-600">{product.description}</p>
                </div>
              )}
              
              {/* Cart Status */}
              {cartQuantity > 0 && (
                <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md">
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      <strong>{cartQuantity}</strong> already in your cart
                    </span>
                  </div>
                </div>
              )}
              
              {/* Quantity Selector */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-2">Quantity</h3>
                <div className="flex items-center">
                  <button 
                    onClick={decrementQuantity}
                    className="w-10 h-10 rounded-l-md border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </button>
                  <div className="w-14 h-10 border-t border-b border-gray-300 flex items-center justify-center text-gray-800">
                    {quantity}
                  </div>
                  <button 
                    onClick={incrementQuantity}
                    className="w-10 h-10 rounded-r-md border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleAddToCart}
                  className="flex-1 bg-primary hover:bg-secondary text-white py-3 rounded-md transition-colors flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Add to Cart
                </button>
                
                <button
                  className="flex-1 border border-primary text-primary hover:bg-primary hover:text-white py-3 rounded-md transition-colors flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  Add to Wishlist
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              Related Products
            </h2>
            <ProductGrid products={relatedProducts} />
          </div>
        )}
      </div>
  );
};

export default ProductDetailPage;
