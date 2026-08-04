import React from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { NAACP_Member, membershipTypeLabels } from '../src/mockData';

interface MembershipCardProps {
  member: NAACP_Member;
}

export default function MembershipCard({ member }: MembershipCardProps) {
  const isCurrent = member.status === 'CURRENT' || member.status === 'LIFETIME_ACTIVE';
  
  return (
    <View style={styles.cardContainer}>
      {/* Outer Card with Gold Accents */}
      <View style={[styles.card, { borderColor: '#D4AF37' }]}>
        {/* Card Header */}
        <View style={styles.header}>
          <View style={styles.logoSeal}>
            <Text style={styles.sealText}>NAACP</Text>
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>NAACP</Text>
            <Text style={styles.headerSubtitle}>NATIONAL ASSOCIATION FOR THE ADVANCEMENT OF COLORED PEOPLE</Text>
          </View>
        </View>

        {/* Card Divider Line */}
        <View style={styles.divider} />

        {/* Card Body */}
        <View style={styles.body}>
          {/* Member Meta */}
          <View style={styles.infoRow}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>MEMBER NAME</Text>
              <Text style={styles.value}>{`${member.firstName} ${member.lastName}`.toUpperCase()}</Text>
            </View>
            <View style={styles.statusBadgeContainer}>
              <View style={[styles.statusBadge, { backgroundColor: isCurrent ? '#2E7D32' : '#C62828' }]}>
                <Text style={styles.statusBadgeText}>
                  {isCurrent ? 'ACTIVE' : 'EXPIRED'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>MEMBER ID NUMBER</Text>
              <Text style={styles.memberIdValue}>{member.memberId}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.label}>UNIT NUMBER</Text>
              <Text style={styles.value}>{member.unitNumber}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>MEMBERSHIP CLASS / LEVEL</Text>
              <Text style={[styles.value, styles.levelHighlight]}>
                {membershipTypeLabels[member.membershipType].toUpperCase()}
              </Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.label}>VALID THRU</Text>
              <Text style={styles.value}>
                {member.expirationDate ? member.expirationDate : 'LIFETIME / NO EXP'}
              </Text>
            </View>
          </View>
        </View>

        {/* Card Footer / Mock Barcode */}
        <View style={styles.footer}>
          <View style={styles.barcodeContainer}>
            {/* Generating mock barcode lines */}
            <View style={styles.barcodeLines}>
              {[1, 3, 2, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4, 3, 1, 2].map((width, idx) => (
                <View 
                  key={idx} 
                  style={[
                    styles.barcodeBar, 
                    { 
                      width: width * 2, 
                      marginRight: idx % 3 === 0 ? 3 : 1,
                    }
                  ]} 
                />
              ))}
            </View>
            <Text style={styles.barcodeText}>*{member.memberId}*</Text>
          </View>
          <Text style={styles.footerNote}>Official Digital Membership Card</Text>
        </View>
      </View>
    </View>
  );
}

const { width } = Dimensions.get('window');
const cardWidth = Math.min(width - 32, 400);

const styles = StyleSheet.create({
  cardContainer: {
    alignItems: 'center',
    marginVertical: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  card: {
    width: cardWidth,
    height: 240,
    backgroundColor: '#002C6C', // Deep Imperial Blue
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoSeal: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D4AF37', // Gold
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sealText: {
    color: '#002C6C',
    fontSize: 9,
    fontWeight: 'bold',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headerSubtitle: {
    color: '#FFFFFF',
    fontSize: 6.5,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(212, 175, 55, 0.4)',
    marginVertical: 8,
  },
  body: {
    flex: 1,
    justifyContent: 'space-around',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoCol: {
    flexDirection: 'column',
  },
  label: {
    color: '#D4AF37',
    fontSize: 7.5,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    marginBottom: 1,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  memberIdValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  levelHighlight: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  statusBadgeContainer: {
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignItems: 'center',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  barcodeContainer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    padding: 4,
    paddingHorizontal: 8,
  },
  barcodeLines: {
    flexDirection: 'row',
    height: 16,
    alignItems: 'stretch',
  },
  barcodeBar: {
    backgroundColor: '#000000',
  },
  barcodeText: {
    color: '#000000',
    fontSize: 7,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
    fontWeight: 'bold',
  },
  footerNote: {
    color: '#D4AF37',
    fontSize: 7,
    fontStyle: 'italic',
  }
});
