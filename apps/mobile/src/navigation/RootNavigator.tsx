import React from 'react';
import { Pressable, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../store/auth';
import { colors, radius, spacing } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import AddExpenseScreen from '../screens/AddExpenseScreen';
import AddIncomeScreen from '../screens/AddIncomeScreen';
import IncomesScreen from '../screens/IncomesScreen';
import PortfoliosScreen from '../screens/PortfoliosScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ClarificationScreen from '../screens/ClarificationScreen';
import CreditsScreen from '../screens/CreditsScreen';
import InvestmentsScreen from '../screens/InvestmentsScreen';
import ScanReceiptScreen from '../screens/ScanReceiptScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import ParticipantsScreen from '../screens/ParticipantsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

const TAB_ICON: Record<string, string> = {
  Главная: '▣',
  Расходы: '○',
  Доходы: '+',
  Портфели: '◈',
  Аналитика: '▥',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderTopColor: colors.border,
          height: 74,
          paddingTop: spacing(0.8),
          paddingBottom: spacing(1.15),
          shadowColor: colors.shadow,
          shadowOpacity: 0.18,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: -10 },
          elevation: 12,
        },
        tabBarLabelStyle: { fontWeight: '800', fontSize: 11, marginTop: 2 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarIcon: ({ color, focused }) => (
          <Text style={{ fontSize: focused ? 22 : 20, color, fontWeight: '900' }}>{TAB_ICON[route.name] ?? '•'}</Text>
        ),
      })}
    >
      <Tab.Screen name="Главная" component={DashboardScreen} />
      <Tab.Screen name="Расходы" component={ExpensesScreen} />
      <Tab.Screen name="Доходы" component={IncomesScreen} />
      <Tab.Screen name="Портфели" component={PortfoliosScreen} />
      <Tab.Screen name="Аналитика" component={AnalyticsScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const status = useAuth((s) => s.status);

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '900' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {status === 'authenticated' ? (
          <>
            <Stack.Screen
              name="Tabs"
              component={MainTabs}
              options={({ navigation }) => ({
                headerShown: true,
                title: '',
                headerRight: () => (
                  <Pressable
                    onPress={() => navigation.navigate('Settings')}
                    hitSlop={12}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: radius.xl,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.card,
                      shadowColor: colors.shadow,
                      shadowOpacity: 0.12,
                      shadowRadius: 14,
                      shadowOffset: { width: 0, height: 8 },
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>⚙️</Text>
                  </Pressable>
                ),
              })}
            />
            <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'Новый расход' }} />
            <Stack.Screen name="AddIncome" component={AddIncomeScreen} options={{ title: 'Доход' }} />
            <Stack.Screen name="ScanReceipt" component={ScanReceiptScreen} options={{ title: 'Сканировать чек' }} />
            <Stack.Screen name="Clarification" component={ClarificationScreen} options={{ title: 'Требует уточнения' }} />
            <Stack.Screen name="Credits" component={CreditsScreen} options={{ title: 'Кредиты' }} />
            <Stack.Screen name="Investments" component={InvestmentsScreen} options={{ title: 'Инвестиции' }} />
            <Stack.Screen name="Categories" component={CategoriesScreen} options={{ title: 'Категории' }} />
            <Stack.Screen name="Participants" component={ParticipantsScreen} options={{ title: 'Участники' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Настройки' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Регистрация' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
