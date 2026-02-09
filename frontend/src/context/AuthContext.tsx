import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  sendOTP,
  verifyOTP,
  getCurrentUserFromSession,
  updateCustomerProfile,
  type AppUser,
  type Customer
} from '../services/authService';

// Define auth context interface
interface AuthContextType {
  user: AppUser | null;
  customer: Customer | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sendOTPCode: (phone: string) => Promise<void>;
  verifyOTPCode: (phone: string, otp: string, userData?: {
    name: string;
    email?: string;
    landmark: string;
    delivery_instructions: string;
  }) => Promise<void>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (data: any) => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider props
interface AuthProviderProps {
  children: ReactNode;
}

// Auth provider component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Restore session from localStorage on mount (no Supabase call - app_users has no anon access)
  useEffect(() => {
    const restoreSession = () => {
      try {
        setIsLoading(true);

        let storedUserId = localStorage.getItem('userId');
        let storedToken = localStorage.getItem('userToken');
        let storedUser = localStorage.getItem('userData');
        let storedCustomer = localStorage.getItem('customerData');

        // Migrate from sessionStorage if user had old session (one-time)
        if (!storedUserId && !storedToken) {
          const ssUserId = sessionStorage.getItem('userId');
          const ssToken = sessionStorage.getItem('userToken');
          const ssUser = sessionStorage.getItem('userData');
          const ssCustomer = sessionStorage.getItem('customerData');
          if (ssUserId && ssToken) {
            localStorage.setItem('userId', ssUserId);
            localStorage.setItem('userToken', ssToken);
            if (ssUser) localStorage.setItem('userData', ssUser);
            if (ssCustomer) localStorage.setItem('customerData', ssCustomer);
            sessionStorage.removeItem('userId');
            sessionStorage.removeItem('userToken');
            sessionStorage.removeItem('userData');
            sessionStorage.removeItem('customerData');
            storedUserId = ssUserId;
            storedToken = ssToken;
            storedUser = ssUser;
            storedCustomer = ssCustomer;
          }
        }

        if (storedUserId && storedToken && storedUser) {
          try {
            const userData = JSON.parse(storedUser) as AppUser;
            const customerData = storedCustomer ? (JSON.parse(storedCustomer) as Customer) : null;
            setUser(userData);
            setCustomer(customerData);
            setIsAuthenticated(true);
          } catch {
            localStorage.removeItem('userId');
            localStorage.removeItem('userToken');
            localStorage.removeItem('userData');
            localStorage.removeItem('customerData');
            setUser(null);
            setCustomer(null);
            setIsAuthenticated(false);
          }
        } else {
          setUser(null);
          setCustomer(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error restoring session:', error);
        setUser(null);
        setCustomer(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  // Send OTP to phone number
  const sendOTPCode = async (phone: string) => {
    try {
      setIsLoading(true);
      await sendOTP(phone);
    } catch (error) {
      console.error('Error sending OTP:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP and login/register
  const verifyOTPCode = async (phone: string, otp: string, userData?: {
    name: string;
    email?: string;
    landmark: string;
    delivery_instructions: string;
  }) => {
    try {
      setIsLoading(true);
      const response = await verifyOTP(phone, otp, userData);

      setUser(response.user);
      setCustomer(response.customer || null);
      setIsAuthenticated(true);

      // Store full session in localStorage (persists until user explicitly logs out)
      localStorage.setItem('userId', response.user.id);
      localStorage.setItem('userToken', response.token);
      localStorage.setItem('userData', JSON.stringify(response.user));
      localStorage.setItem('customerData', response.customer ? JSON.stringify(response.customer) : '');
    } catch (error) {
      console.error('Error verifying OTP:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout
  const logoutUser = async () => {
    try {
      setIsLoading(true);

      // Clear stored session (user explicitly logged out)
      localStorage.removeItem('userId');
      localStorage.removeItem('userToken');
      localStorage.removeItem('userData');
      localStorage.removeItem('customerData');

      setUser(null);
      setCustomer(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Error logging out:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Update user profile
  const updateUserProfile = async (data: any) => {
    try {
      setIsLoading(true);

      if (!user) {
        throw new Error('No user logged in');
      }

      await updateCustomerProfile(user.id, data);

      // Try to refresh from server; fallback to optimistic update for localStorage persistence
      const userData = await getCurrentUserFromSession(user.id);
      if (userData) {
        setUser(userData.user);
        setCustomer(userData.customer || null);
        localStorage.setItem('userData', JSON.stringify(userData.user));
        localStorage.setItem('customerData', userData.customer ? JSON.stringify(userData.customer) : '');
      } else {
        // Persist optimistic update (getCurrentUserFromSession may fail if anon lacks DB access)
        const updatedUser = { ...user, ...(data.name && { name: data.name }), ...(data.email !== undefined && { email: data.email }) };
        const updatedCustomer = customer ? { ...customer, ...data } : customer;
        setUser(updatedUser);
        setCustomer(updatedCustomer);
        localStorage.setItem('userData', JSON.stringify(updatedUser));
        localStorage.setItem('customerData', updatedCustomer ? JSON.stringify(updatedCustomer) : '');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Context value
  const value = {
    user,
    customer,
    isLoading,
    isAuthenticated,
    sendOTPCode,
    verifyOTPCode,
    logoutUser,
    updateUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
