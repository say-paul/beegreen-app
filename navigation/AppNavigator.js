import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createDrawerNavigator } from "@react-navigation/drawer";
import * as SecureStore from "expo-secure-store";
import { MaterialIcons } from "@expo/vector-icons";
import DevicePage from "../components/DevicePage";
import SchedulerPage from "../components/SchedulerPage";
import ControlPage from "../components/ControlPage";
//import TimelinePage from "../components/TimelinePage";
import AccountInfoPage from "../components/AccountInfoPage";
import LoginPage from "../components/LoginPage";

const Drawer = createDrawerNavigator();

const AppNavigator = () => {
  const [isReady, setIsReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState(null);
  const [hasAccount, setHasAccount] = useState(false);

  useEffect(() => {
    const checkConfig = async () => {
      const config = await SecureStore.getItemAsync("config");
      if (config) {
        setHasAccount(true);
        setInitialRoute("Device Add"); // Default to Device Page
      } else {
        setHasAccount(false);
        setInitialRoute("Login"); // Show Login if no account
      }
      setIsReady(true);
    };

    checkConfig();
  }, []);

  if (!isReady) {
    return null; // Show a loading screen or splash screen
  }

  return (
    <NavigationContainer>
      <Drawer.Navigator initialRouteName={initialRoute}>
        {hasAccount ? (
          <>
		  
		    <Drawer.Screen
              name="Device Add"
              component={DevicePage}
              options={{
                drawerIcon: ({ color, size }) => (
                  <MaterialIcons name="login" size={size} color={color} />
                ),
              }}
            />
           
            <Drawer.Screen
              name="Scheduler"
              component={SchedulerPage}
              options={{
                drawerIcon: ({ color, size }) => (
                  <MaterialIcons name="schedule" size={size} color={color} />
                ),
              }}
            />
            <Drawer.Screen
              name="Control"
              component={ControlPage}
              options={{
                drawerIcon: ({ color, size }) => (
                  <MaterialIcons name="settings" size={size} color={color} />
                ),
              }}
            />
            
            <Drawer.Screen
              name="Account Info"
              component={AccountInfoPage}
              options={{
                drawerIcon: ({ color, size }) => (
                  <MaterialIcons name="account-circle" size={size} color={color} />
                ),
              }}
            />
          </>
        ) : (
          <Drawer.Screen
            name="Login"
            component={LoginPage}
            options={{
              drawerIcon: ({ color, size }) => (
                <MaterialIcons name="login" size={size} color={color} />
              ),
            }}
          />
        )}
      </Drawer.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;