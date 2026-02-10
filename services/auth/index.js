/**
 * Authentication service exports
 * 
 * This module provides authentication state management for the BeeGreen app.
 * It handles:
 * - Loading MQTT configuration from SecureStore
 * - Managing authentication state (loading, authenticated, unauthenticated)
 * - Providing login/logout functionality
 * - Updating configuration after device setup
 * 
 * Usage:
 * 1. Wrap your app with AuthProvider in App.js
 * 2. Use the useAuth hook to access auth state and actions in components
 * 
 * @example
 * // In App.js
 * import { AuthProvider } from './services/auth';
 * 
 * const App = () => (
 *   <AuthProvider>
 *     <AppNavigator />
 *   </AuthProvider>
 * );
 * 
 * @example
 * // In a component
 * import { useAuth } from './services/auth';
 * 
 * const MyComponent = () => {
 *   const { isAuthenticated, login, config } = useAuth();
 *   
 *   const handleLogin = async (newConfig) => {
 *     const success = await login(newConfig);
 *     if (success) {
 *       // User is now authenticated, navigation will update automatically
 *     }
 *   };
 * };
 */

export { AuthProvider, AuthContext, AuthStatus } from './AuthContext';
export { useAuth } from './useAuth';
