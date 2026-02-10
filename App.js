import React from 'react';
import { NotificationProvider } from './services/notifications';
import { AuthProvider } from './services/auth';
import AppNavigator from './navigation/AppNavigator';

const App = () => {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppNavigator />
      </NotificationProvider>
    </AuthProvider>
  );
};

export default App;
