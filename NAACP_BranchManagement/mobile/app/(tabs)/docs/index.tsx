import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function DocsIndex() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Informative Top Card */}
      <View style={styles.infoBanner}>
        <Ionicons name="library" size={24} color="#D4AF37" style={styles.bannerIcon} />
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>GOVERNING LAWS & CIVIL COMPLIANCE</Text>
          <Text style={styles.bannerDesc}>
            Access the official guiding documents of the Association. These documents define our operational integrity, individual civil liberties, and regulatory compliance standards.
          </Text>
        </View>
      </View>

      {/* Governing Documents Selector List */}
      <View style={styles.listContainer}>
        
        {/* Document 1: Bylaws */}
        <TouchableOpacity 
          style={styles.docCard} 
          activeOpacity={0.8}
          onPress={() => router.push('/docs/bylaws')}
        >
          <View style={[styles.docIconContainer, { backgroundColor: '#E0F2FE' }]}>
            <Ionicons name="document-text" size={28} color="#002C6C" />
          </View>
          <View style={styles.docInfo}>
            <Text style={styles.docTitle}>NAACP Uniform Branch Bylaws</Text>
            <Text style={styles.docDesc}>
              Governance rules for local units including officers, committees, voting procedures, and general operating policies.
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Local Operational Governance</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* Document 2: Constitution */}
        <TouchableOpacity 
          style={styles.docCard} 
          activeOpacity={0.8}
          onPress={() => router.push('/docs/constitution')}
        >
          <View style={[styles.docIconContainer, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="book" size={26} color="#D4AF37" />
          </View>
          <View style={styles.docInfo}>
            <Text style={styles.docTitle}>NAACP National Constitution</Text>
            <Text style={styles.docDesc}>
              The primary structural document outlining the aims, national leadership, regional divisions, and sovereign rules of the Association.
            </Text>
            <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.badgeText, { color: '#B45309' }]}>Sovereign National Constitution</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

      </View>

      {/* Advisory Notice */}
      <View style={styles.noticeCard}>
        <Ionicons name="alert-circle" size={20} color="#D4AF37" style={styles.noticeIcon} />
        <Text style={styles.noticeText}>
          Any amendments or changes to these governing documents must undergo explicit resolution approval during the National Annual Convention and be ratified by the National Board.
        </Text>
      </View>
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
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#002C6C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  bannerIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    color: '#D4AF37',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  bannerDesc: {
    color: '#FFFFFF',
    fontSize: 11.5,
    lineHeight: 16,
    opacity: 0.9,
  },
  listContainer: {
    gap: 16,
    marginBottom: 24,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  docIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  docInfo: {
    flex: 1,
    paddingRight: 8,
  },
  docTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#002C6C',
    marginBottom: 4,
  },
  docDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    color: '#0369A1',
    fontWeight: 'bold',
  },
  noticeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    alignItems: 'flex-start',
  },
  noticeIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    color: '#B45309',
    lineHeight: 15,
  }
});
