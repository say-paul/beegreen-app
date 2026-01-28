import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import * as SecureStore from 'expo-secure-store';

// Constants for configuration keys
const CONFIG_KEY = 'config';

/**
 * Authentication context for managing user authentication state
 * This context handles:
 * - Initial config loading from SecureStore
 * - Authentication state management
 * - Config updates after successful login
 */
export const AuthContext = createContext(null);

/**
 * Authentication state values
 */
export const AuthStatus = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
};

/**
 * AuthProvider component that wraps the app and provides authentication state
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export const AuthProvider = ({ children }) => {
  const [authStatus, setAuthStatus] = useState(AuthStatus.LOADING);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Load configuration from SecureStore on mount
   */
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const storedConfig = await SecureStore.getItemAsync(CONFIG_KEY);
        if (storedConfig) {
          const parsedConfig = JSON.parse(storedConfig);
          setConfig(parsedConfig);
          setAuthStatus(AuthStatus.AUTHENTICATED);
        } else {
          setAuthStatus(AuthStatus.UNAUTHENTICATED);
        }
      } catch (err) {
        console.error('Error loading config from SecureStore:', err);
        setError(err);
        setAuthStatus(AuthStatus.UNAUTHENTICATED);
      }
    };

    loadConfig();
  }, []);

  /**
   * Update authentication state after successful login
   * @param {Object} newConfig - The new configuration to save
   * @returns {Promise<boolean>} - Returns true if successful
   */
  const login = useCallback(async (newConfig) => {
    try {
      await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);
      setAuthStatus(AuthStatus.AUTHENTICATED);
      setError(null);
      return true;
    } catch (err) {
      console.error('Error saving config to SecureStore:', err);
      setError(err);
      return false;
    }
  }, []);

  /**
   * Update the existing configuration (e.g., after adding device)
   * @param {Object} updates - Partial config updates to merge
   * @returns {Promise<boolean>} - Returns true if successful
   */
  const updateConfig = useCallback(async (updates) => {
    try {
      const updatedConfig = { ...config, ...updates };
      await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(updatedConfig));
      setConfig(updatedConfig);
      return true;
    } catch (err) {
      console.error('Error updating config in SecureStore:', err);
      setError(err);
      return false;
    }
  }, [config]);

  /**
   * Clear authentication state (logout)
   * @returns {Promise<boolean>} - Returns true if successful
   */
  const logout = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(CONFIG_KEY);
      setConfig(null);
      setAuthStatus(AuthStatus.UNAUTHENTICATED);
      setError(null);
      return true;
    } catch (err) {
      console.error('Error clearing config from SecureStore:', err);
      setError(err);
      return false;
    }
  }, []);

  /**
   * Refresh config from SecureStore
   * Useful when config might have been updated elsewhere
   * @returns {Promise<boolean>} - Returns true if config was found
   */
  const refreshConfig = useCallback(async () => {
    try {
      const storedConfig = await SecureStore.getItemAsync(CONFIG_KEY);
      if (storedConfig) {
        const parsedConfig = JSON.parse(storedConfig);
        setConfig(parsedConfig);
        setAuthStatus(AuthStatus.AUTHENTICATED);
        return true;
      } else {
        setConfig(null);
        setAuthStatus(AuthStatus.UNAUTHENTICATED);
        return false;
      }
    } catch (err) {
      console.error('Error refreshing config from SecureStore:', err);
      setError(err);
      return false;
    }
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    // State
    authStatus,
    isLoading: authStatus === AuthStatus.LOADING,
    isAuthenticated: authStatus === AuthStatus.AUTHENTICATED,
    config,
    error,
    // Actions
    login,
    logout,
    updateConfig,
    refreshConfig,
  }), [authStatus, config, error, login, logout, updateConfig, refreshConfig]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
