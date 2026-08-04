// app/(app)/(tabs)/alerts.tsx
// History of every alert the app has emitted. Clear wipes history + dedupe.

import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { getAlertHistory, clearAlertHistory, type AlertEntry } from '../../../src/features/alerts';

export default function AlertsScreen() {
  const { spacing } = useTheme();
  const [history, setHistory] = useState<AlertEntry[]>([]);

  const load = useCallback(() => {
    getAlertHistory().then(setHistory).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const clear = async () => {
    await clearAlertHistory();
    setHistory([]);
  };

  return (
    <Screen padded={false}>
      <FlatList
        data={history}
        keyExtractor={(item, i) => `${item.at}-${i}`}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text variant="title" weight="bold">
              Alerts
            </Text>
            {history.length ? (
              <Button title="Clear" variant="ghost" fullWidth={false} onPress={clear} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text tone="muted" style={{ marginTop: spacing.xl }} center>
            No alerts yet. Follow a vendor to get notified when they open or are nearby.
          </Text>
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }}>
            <Text weight="semibold">{item.title}</Text>
            {item.body ? (
              <Text tone="muted" variant="label" style={{ marginTop: spacing.xs }}>
                {item.body}
              </Text>
            ) : null}
            <Text tone="muted" variant="caption" style={{ marginTop: spacing.xs }}>
              {new Date(item.at).toLocaleString()}
            </Text>
          </Card>
        )}
      />
    </Screen>
  );
}
