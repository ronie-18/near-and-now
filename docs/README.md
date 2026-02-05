# Near & Now - React Grocery App

A modern grocery shopping application built with React, TypeScript, and Tailwind CSS.

## 🚀 Features

- **Responsive Design**: Works on all devices from mobile to desktop
- **Product Catalog**: Browse products by category
- **Shopping Cart**: Add, remove, and update quantities
- **User Authentication**: Login with OTP via Supabase
- **Search & Filtering**: Find products easily
- **Product Details**: Detailed product information
- **Related Products**: Discover similar items

## 📋 Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Routing**: React Router
- **State Management**: React Context API
- **Backend & Auth**: Supabase
- **Build Tool**: Vite
- **UI Components**: Custom components with Tailwind

## 🛠️ Installation

### Quick Start (Windows)

1. Simply double-click the `start.bat` file in the project root directory.
2. This will install all dependencies and start the development server automatically.

### Manual Installation

1. Install dependencies:
```bash
npm install
```

2. Update the `.env` file in the root directory with your Google Maps API key:
```
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to:
```
http://localhost:5173
```

## 🏗️ Project Structure

```
near-now-react/
├── src/
│   ├── components/
│   │   ├── auth/        # Authentication components
│   │   ├── cart/        # Shopping cart components
│   │   ├── layout/      # Layout components (Header, Footer)
│   │   ├── products/    # Product-related components
│   │   └── ui/          # UI components (buttons, modals, etc.)
│   ├── context/         # React Context providers
│   ├── hooks/           # Custom React hooks
│   ├── pages/           # Page components
│   ├── services/        # API services
│   └── utils/           # Utility functions
├── public/              # Static assets
└── index.html           # HTML entry point
```

## 🔄 Converted from Vanilla JS

This project is a React conversion of the original vanilla JavaScript Near & Now grocery app. The conversion includes:

- Component-based architecture
- React state management
- TypeScript for type safety
- Modern build tooling with Vite

## 📱 Screenshots

[Add screenshots of your app here]

## 📄 License

MIT

## 🙏 Acknowledgements

- Original vanilla JS project by [Original Author]
- Icons from Font Awesome
- UI inspiration from [Mention sources]
