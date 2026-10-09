import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { getDb } from "./src/db";
import HomeScreen from "./src/screens/HomeScreen";
import CreateRegisterScreen from "./src/screens/CreateRegisterScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import NewDayScreen from "./src/screens/NewDayScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => { getDb().then(() => setReady(true)); }, []);

  if (!ready) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0F172A" }}><ActivityIndicator color="#fff" /></View>;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Create" component={CreateRegisterScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="NewDay" component={NewDayScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
