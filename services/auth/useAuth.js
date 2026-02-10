import { useContext } from 'react';
import { AuthContext } from './AuthContext';

/**
 * Custom hook to access authentication context
 * @returns {Object} Authentication context value containing:
 *   - authStatus: Current authentication status ('loading' | 'authenticated' | 'unauthenticated')
 *   - isLoading: Boolean indicating if auth state is being loaded
 *   - isAuthenticated: Boolean indicating if user is authenticated
 *   - config: The stored configuration object or null
 *   - error: Any error that occurred during auth operations
 *   - login: Function to save config and authenticate user
 *   - logout: Function to clear config and unauthenticate user
 *   - updateConfig: Function to update existing config
 *   - refreshConfig: Function to reload config from storage
 * @throws {Error} If used outside of AuthProvider
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (context === null) {
    throw new Error(
      'useAuth must be used within an AuthProvider. ' +
      'Make sure to wrap your app with <AuthProvider>.'
    );
  }
  
  return context;
};

export default useAuth;
