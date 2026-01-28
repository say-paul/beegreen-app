import React from 'react';
import { NotificationProvider } from './services/notifications';
import AppNavigator from './navigation/AppNavigator';

const App = () => {
  return (
    <NotificationProvider>
      <AppNavigator />
    </NotificationProvider>
  );
};

export default App;
