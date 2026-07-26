// app/index.tsx
// Entry route. The root layout's gate handles redirection, so this is just a
// themed splash while auth status resolves.

import { View } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { useTheme } from '../src/theme/ThemeProvider';

export default function Index() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
