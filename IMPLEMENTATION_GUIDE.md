# Implementation Guide for Near & Now React

This guide provides detailed instructions for implementing the remaining components and features of the Near & Now React grocery app.

## 📋 Table of Contents

1. [Getting Started](#getting-started)
2. [Component Implementation](#component-implementation)
3. [State Management](#state-management)
4. [API Integration](#api-integration)
5. [Styling Guidelines](#styling-guidelines)
6. [Testing Strategy](#testing-strategy)

## Getting Started

Before you begin implementing components, make sure you:

1. Have reviewed the project structure in `GETTING_STARTED.md`
2. Understand the development roadmap in `DEVELOPMENT_ROADMAP.md`
3. Have the development environment set up and running

## Component Implementation

### Step 1: Implement Context Providers

The context providers are the foundation of the application's state management. Start by implementing:

1. **AuthContext.tsx** - User authentication state
2. **CartContext.tsx** - Shopping cart state
3. **NotificationContext.tsx** - Toast notifications

### Step 2: Implement Layout Components

Layout components provide the structure for the application:

1. **Header.tsx** - Navigation bar with search, cart, and user menu
2. **Footer.tsx** - Footer with links and newsletter signup
3. **Layout.tsx** - Page wrapper that includes header and footer

### Step 3: Implement Product Components

Product components display and manage product data:

1. **ProductCard.tsx** - Individual product display
2. **ProductGrid.tsx** - Grid layout for products
3. **QuickViewModal.tsx** - Quick product preview
4. **ProductFilters.tsx** - Filters for product listings

### Step 4: Implement Cart Components

Cart components manage the shopping cart:

1. **CartSidebar.tsx** - Slide-in cart panel
2. **CartItem.tsx** - Individual cart item
3. **CartSummary.tsx** - Order summary with totals

### Step 5: Implement Auth Components

Auth components handle user authentication:

1. **AuthModal.tsx** - Login/registration modal
2. **UserDropdown.tsx** - User account dropdown menu
3. **ProfileForm.tsx** - User profile form

### Step 6: Implement Page Components

Page components represent the different pages of the application:

1. **HomePage.tsx** - Landing page with featured products
2. **ShopPage.tsx** - Main product listing with filters
3. **CategoryPage.tsx** - Products filtered by category
4. **ProductDetailPage.tsx** - Individual product details
5. **CheckoutPage.tsx** - Checkout process
6. **ProfilePage.tsx** - User profile management
7. **OrderHistoryPage.tsx** - Order history listing

## Component Implementation Template

When implementing a new component, follow this template:

```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; // Import contexts as needed
import { useCart } from '../context/CartContext';
import { useNotification } from '../context/NotificationContext';

interface ComponentProps {
  // Define props here
}

const ComponentName: React.FC<ComponentProps> = ({ /* destructure props */ }) => {
  // Local state
  const [localState, setLocalState] = useState(initialValue);
  
  // Context hooks
  const { user } = useAuth();
  const { cartItems } = useCart();
  const { showNotification } = useNotification();
  
  // Effects
  useEffect(() => {
    // Side effects here
  }, [dependencies]);
  
  // Event handlers
  const handleEvent = () => {
    // Handle events
  };
  
  // Render
  return (
    <div className="component-wrapper">
      {/* Component JSX */}
    </div>
  );
};

export default ComponentName;
```

## State Management

### Using Context

1. **Import context hooks** at the top of your component:
   ```tsx
   import { useAuth } from '../context/AuthContext';
   import { useCart } from '../context/CartContext';
   import { useNotification } from '../context/NotificationContext';
   ```

2. **Use context hooks** in your component:
   ```tsx
   const { user, isAuthenticated, loginWithPhone } = useAuth();
   const { cartItems, addToCart, removeFromCart } = useCart();
   const { showNotification } = useNotification();
   ```

### Local State

Use local state for component-specific state that doesn't need to be shared:

```tsx
const [isOpen, setIsOpen] = useState(false);
const [quantity, setQuantity] = useState(1);
```

## API Integration

### Supabase Integration

1. **Import Supabase functions** from the service:
   ```tsx
   import { getAllProducts, getProductsByCategory, searchProducts } from '../services/supabase';
   ```

2. **Fetch data** in useEffect:
   ```tsx
   useEffect(() => {
     const fetchProducts = async () => {
       try {
         setLoading(true);
         const products = await getAllProducts();
         setProducts(products);
       } catch (error) {
         console.error('Error fetching products:', error);
         showNotification('Failed to load products', 'error');
       } finally {
         setLoading(false);
       }
     };
     
     fetchProducts();
   }, [showNotification]);
   ```

## Styling Guidelines

### Tailwind CSS Classes

Use Tailwind utility classes directly in your components:

```tsx
<div className="flex items-center justify-between p-4 bg-white rounded-lg shadow-md">
  <h2 className="text-xl font-bold text-gray-800">Title</h2>
  <button className="px-4 py-2 bg-primary text-white rounded-md hover:bg-secondary">
    Action
  </button>
</div>
```

### Responsive Design

Use Tailwind's responsive prefixes for responsive design:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
  {/* Grid items */}
</div>
```

### Animation Classes

Use the custom animation classes defined in style.css:

```tsx
<div className="animate-float">Floating element</div>
<div className="animate-spin-slow">Spinning element</div>
```

## Testing Strategy

### Component Testing

1. **Create test files** alongside components:
   ```
   ComponentName.tsx
   ComponentName.test.tsx
   ```

2. **Test component rendering**:
   ```tsx
   import { render, screen } from '@testing-library/react';
   import ComponentName from './ComponentName';
   
   test('renders component correctly', () => {
     render(<ComponentName />);
     expect(screen.getByText('Expected Text')).toBeInTheDocument();
   });
   ```

3. **Test user interactions**:
   ```tsx
   import { render, screen, fireEvent } from '@testing-library/react';
   import ComponentName from './ComponentName';
   
   test('handles button click', () => {
     render(<ComponentName />);
     fireEvent.click(screen.getByText('Button Text'));
     expect(screen.getByText('Result Text')).toBeInTheDocument();
   });
   ```

## Conclusion

By following this implementation guide, you should be able to successfully implement all the remaining components and features of the Near & Now React grocery app. Remember to:

1. Start with the foundation (context providers)
2. Build up the layout components
3. Implement product and cart functionality
4. Add authentication and user management
5. Create page components
6. Polish with animations and optimizations

Good luck with your implementation!
