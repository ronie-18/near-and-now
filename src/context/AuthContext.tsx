import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, User, loginWithOTP, verifyOTP, getCurrentUser, logout } from '../services/supabase';

// Define auth context interface
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithPhone: (phone: string) => Promise<void>;
  verifyOTPCode: (phone: string, otp: string) => Promise<void>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (data: Partial<User>) => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider props
interface AuthProviderProps {
  children: ReactNode;
}

// Auth provider component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Check for existing session on mount
  useEffect(() => {
    const checkUser = async () => {
      try {
        setIsLoading(true);
        const currentUser = await getCurrentUser();
        
        if (currentUser) {
          setUser({
            id: currentUser.id,
            phone: currentUser.phone,
            email: currentUser.email,
            name: currentUser.user_metadata?.name
          });
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            phone: session.user.phone,
            email: session.user.email,
            name: session.user.user_metadata?.name
          });
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
        setIsLoading(false);
      }
    );

    checkUser();

    // Cleanup subscription
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Login with phone number
  const loginWithPhone = async (phone: string) => {
    try {
      setIsLoading(true);
      await loginWithOTP(phone);
    } catch (error) {
      console.error('Error logging in with phone:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP code
  const verifyOTPCode = async (phone: string, otp: string) => {
    try {
      setIsLoading(true);
      const { session, user } = await verifyOTP(phone, otp);
      
      if (user) {
        setUser({
          id: user.id,
          phone: user.phone,
          email: user.email,
          name: user.user_metadata?.name
        });
        setIsAuthenticated(true);
      }
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
      await logout();
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Error logging out:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Update user profile
  const updateUserProfile = async (data: Partial<User>) => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.updateUser({
        data
      });
      
      if (error) throw error;
      
      // Update local user state
      if (user) {
        setUser({
          ...user,
          ...data
        });
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
    isLoading,
    isAuthenticated,
    loginWithPhone,
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
