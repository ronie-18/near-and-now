# Getting Started with Near & Now React

This guide will help you understand the project structure and how to continue development.

## 🚀 Quick Start

1. Run the application:
   - **Windows**: Double-click `start.bat`
   - **Manual**: Run `npm install` followed by `npm run dev`

2. Open your browser and navigate to `http://localhost:5173`

## 📁 Project Structure

```
near-now-react/
├── src/
│   ├── components/        # Reusable UI components
│   ├── context/           # React Context providers
│   ├── pages/             # Page components
│   ├── services/          # API services
│   ├── utils/             # Utility functions
│   ├── App.tsx            # Main App component
│   └── main.tsx           # Entry point
├── public/                # Static assets
└── index.html             # HTML entry point
```

## 🧩 Key Components

1. **Layout Components**
   - `Header.tsx`: Navigation bar with search, cart, and user menu
   - `Footer.tsx`: Footer with links and newsletter signup
   - `Layout.tsx`: Page wrapper that includes header and footer

2. **Product Components**
   - `ProductCard.tsx`: Individual product display
   - `ProductGrid.tsx`: Grid layout for products
   - `QuickViewModal.tsx`: Quick product preview

3. **Cart Components**
   - `CartSidebar.tsx`: Slide-in cart panel
   - `CartItem.tsx`: Individual cart item

4. **Auth Components**
   - `AuthModal.tsx`: Login/registration modal
   - `UserDropdown.tsx`: User account dropdown menu

## 🔄 State Management

The application uses React Context API for state management:

- `AuthContext.tsx`: User authentication state
- `CartContext.tsx`: Shopping cart state
- `NotificationContext.tsx`: Toast notifications

## 📄 Pages

- `HomePage.tsx`: Landing page with featured products
- `ShopPage.tsx`: Main product listing with filters
- `CategoryPage.tsx`: Products filtered by category
- `ProductDetailPage.tsx`: Individual product details

## 🌐 API Integration

The app uses Supabase for backend services:

- `supabase.ts`: API client and data fetching functions

## 🎨 Styling

The project uses Tailwind CSS for styling:

- Utility-first CSS approach
- Responsive design
- Custom animations

## 📱 Responsive Design

The application is fully responsive:
- Mobile-first approach
- Tailwind breakpoints
- Custom mobile navigation

## 🔍 Next Steps

1. **Complete the implementation** of placeholder components
2. **Add more pages** like checkout, user profile, etc.
3. **Enhance the UI** with more animations and transitions
4. **Add testing** with Jest and React Testing Library
5. **Optimize performance** with code splitting and lazy loading

## 🐛 Troubleshooting

If you encounter any issues:

1. Check the browser console for errors
2. Verify your environment variables in `.env`
3. Make sure all dependencies are installed
4. Try clearing your browser cache

## 📚 Resources

- [React Documentation](https://reactjs.org/docs/getting-started.html)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Supabase Documentation](https://supabase.io/docs)
- [React Router Documentation](https://reactrouter.com/docs/en/v6)
