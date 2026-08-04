// app/(app)/(tabs)/index.tsx
// Home screen. A neutral landing surface that shows the signed-in identity and
// which feature modules are active — a good starting canvas for a real app.

import { View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { useAuth } from '../../../src/features/auth/AuthContext';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { enabledFeatures } from '../../../src/config/features';
import { BACKEND } from '../../../src/config/env';

export default function HomeScreen() {
  const { user } = useAuth();
  const { spacing } = useTheme();

  return (
    <Screen scroll>
      <Text variant="title" weight="bold">
        {`Hi, ${user?.displayName ?? 'there'}`}
      </Text>
      <Text tone="muted" style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}>
        {`You're running the UnjadedDigital template on the "${BACKEND}" backend.`}
      </Text>

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        ACTIVE MODULES
      </Text>
      <View style={{ gap: spacing.md }}>
        {enabledFeatures().map((f) => (
          <Card key={f.id}>
            <Text weight="semibold">{f.title}</Text>
            <Text tone="muted" variant="label" style={{ marginTop: spacing.xs }}>
              {f.description}
            </Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
