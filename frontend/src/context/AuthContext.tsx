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

  // Check for existing session on mount
  useEffect(() => {
    const checkUser = async () => {
      try {
        setIsLoading(true);

        // Check for stored session
        const storedUserId = sessionStorage.getItem('userId');
        const storedToken = sessionStorage.getItem('userToken');

        if (storedUserId && storedToken) {
          const userData = await getCurrentUserFromSession(storedUserId);

          if (userData) {
            setUser(userData.user);
            setCustomer(userData.customer || null);
            setIsAuthenticated(true);
          } else {
            // Invalid session, clear storage
            sessionStorage.removeItem('userId');
            sessionStorage.removeItem('userToken');
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
        console.error('Error checking authentication:', error);
        setUser(null);
        setCustomer(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();
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

      // Store session
      sessionStorage.setItem('userId', response.user.id);
      sessionStorage.setItem('userToken', response.token);
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

      // Clear session storage
      sessionStorage.removeItem('userId');
      sessionStorage.removeItem('userToken');

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

      // Refresh user data
      const userData = await getCurrentUserFromSession(user.id);
      if (userData) {
        setUser(userData.user);
        setCustomer(userData.customer || null);
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
