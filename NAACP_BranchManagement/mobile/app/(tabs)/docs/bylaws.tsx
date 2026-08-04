import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { BYLAWS_SECTIONS } from '../../../src/mockData';
import { Ionicons } from '@expo/vector-icons';

export default function BylawsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Intro Text */}
      <View style={styles.introHeader}>
        <Text style={styles.introSubtitle}>OFFICIAL NAACP BYLAWS</Text>
        <Text style={styles.introTitle}>Constitution and Bylaws for Branches</Text>
        <Text style={styles.introDesc}>
          Adopted and promulgated by the National Board of Directors of the National Association for the Advancement of Colored People (NAACP). Applicable to all active local Units and Branches.
        </Text>
      </View>

      {/* Sections Map */}
      <View style={styles.sectionsList}>
        {BYLAWS_SECTIONS.map((section, index) => (
          <View key={section.id} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.numberBadge}>
                <Text style={styles.numberBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <View style={styles.divider} />
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.footerNote}>
        End of Uniform Branch Bylaws Summary. Reference standard corporate manual for detailed rules on parliamentary procedures.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5FA',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  introHeader: {
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  introSubtitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#D4AF37',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#002C6C',
    marginBottom: 8,
  },
  introDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  sectionsList: {
    gap: 16,
    marginBottom: 24,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  numberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#002C6C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadgeText: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#002C6C',
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  sectionContent: {
    fontSize: 13.5,
    color: '#334155',
    lineHeight: 20,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginVertical: 16,
    paddingHorizontal: 20,
    lineHeight: 16,
  }
});
