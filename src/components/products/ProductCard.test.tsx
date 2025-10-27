import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductCard from './ProductCard';
import { CartContext } from '../../context/CartContext';
import { NotificationContext } from '../../context/NotificationContext';

// Mock product data
const mockProduct = {
  id: '1',
  name: 'Test Product',
  price: 100,
  category: 'test-category',
  in_stock: true,
  image: '/test-image.jpg'
};

// Mock context values
const mockCartContext = {
  cartItems: [],
  cartCount: 0,
  addToCart: vi.fn(),
  removeFromCart: vi.fn(),
  updateCartQuantity: vi.fn(),
  decreaseCartQuantity: vi.fn(),
  clearCart: vi.fn(),
  getCartTotal: vi.fn()
};

const mockNotificationContext = {
  notifications: [],
  showNotification: vi.fn(),
  removeNotification: vi.fn()
};

// Mock component wrapper with contexts
const renderWithContexts = (ui: React.ReactElement) => {
  return render(
    <NotificationContext.Provider value={mockNotificationContext}>
      <CartContext.Provider value={mockCartContext}>
        {ui}
      </CartContext.Provider>
    </NotificationContext.Provider>
  );
};

describe('ProductCard', () => {
  it('renders product information correctly', () => {
    renderWithContexts(<ProductCard product={mockProduct} />);
    
    // Check if product name is displayed
    expect(screen.getByText('Test Product')).toBeInTheDocument();
    
    // Check if price is displayed (using test-id or other selectors)
    expect(screen.getByText(/100/)).toBeInTheDocument();
    
    // Check if image is rendered with correct src
    const image = screen.getByAltText('Test Product') as HTMLImageElement;
    expect(image).toBeInTheDocument();
    expect(image.src).toContain('/test-image.jpg');
    
    // Check if Add to Cart button is present
    expect(screen.getByText('Add to Cart')).toBeInTheDocument();
  });

  it('calls addToCart when Add to Cart button is clicked', () => {
    renderWithContexts(<ProductCard product={mockProduct} />);
    
    // Find and click the Add to Cart button
    const addToCartButton = screen.getByText('Add to Cart');
    fireEvent.click(addToCartButton);
    
    // Check if addToCart was called with the correct product
    expect(mockCartContext.addToCart).toHaveBeenCalledWith(mockProduct);
    
    // Check if showNotification was called
    expect(mockNotificationContext.showNotification).toHaveBeenCalledWith(
      `${mockProduct.name} added to cart`,
      'success'
    );
  });

  it('renders quantity controls when product is in cart', () => {
    // Update mock cart context to include the product
    const updatedCartContext = {
      ...mockCartContext,
      cartItems: [{ ...mockProduct, quantity: 2 }]
    };
    
    render(
      <NotificationContext.Provider value={mockNotificationContext}>
        <CartContext.Provider value={updatedCartContext}>
          <ProductCard product={mockProduct} />
        </CartContext.Provider>
      </NotificationContext.Provider>
    );
    
    // Check if quantity is displayed
    expect(screen.getByText('2')).toBeInTheDocument();
    
    // Check if quantity controls are present
    const decreaseButton = screen.getByRole('button', { name: '-' });
    const increaseButton = screen.getByRole('button', { name: '+' });
    
    expect(decreaseButton).toBeInTheDocument();
    expect(increaseButton).toBeInTheDocument();
  });

  it('calls onQuickView when Quick View button is clicked', () => {
    const onQuickViewMock = vi.fn();
    
    renderWithContexts(
      <ProductCard product={mockProduct} onQuickView={onQuickViewMock} />
    );
    
    // Simulate hover to show Quick View button
    const productCard = screen.getByText('Test Product').closest('.product-card');
    fireEvent.mouseEnter(productCard!);
    
    // Find and click the Quick View button
    const quickViewButton = screen.getByText('Quick View');
    fireEvent.click(quickViewButton);
    
    // Check if onQuickView was called with the correct product
    expect(onQuickViewMock).toHaveBeenCalledWith(mockProduct);
  });
});
