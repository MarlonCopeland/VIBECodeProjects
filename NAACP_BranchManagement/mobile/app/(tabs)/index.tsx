import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { MOCK_MEMBERS, MOCK_BRANCHES, membershipStatusLabels, membershipTypeLabels } from '../../src/mockData';
import MembershipCard from '../../components/MembershipCard';
import { Ionicons } from '@expo/vector-icons';

export default function MemberHome() {
  // Let's use the first mock member as the logged-in member
  const [currentMember, setCurrentMember] = useState(MOCK_MEMBERS[0]);
  
  // Find member's branch
  const memberBranch = MOCK_BRANCHES.find(b => b.unitNumber === currentMember.unitNumber);

  const handleRenewPress = () => {
    Alert.alert(
      "Membership Renewal",
      "You are currently a Lifetime Member with active status. No renewal is necessary at this time.",
      [{ text: "OK" }]
    );
  };

  const handleShareCard = () => {
    Alert.alert("Digital ID Card", "Card saved offline to your secure wallet.");
  };

  const switchMember = () => {
    // Helper to toggle between a lifetime and expired member to demonstrate app behavior
    const currentIndex = MOCK_MEMBERS.findIndex(m => m.id === currentMember.id);
    const nextIndex = (currentIndex + 1) % MOCK_MEMBERS.length;
    setCurrentMember(MOCK_MEMBERS[nextIndex]);
  };

  const isCurrent = currentMember.status === 'CURRENT' || currentMember.status === 'LIFETIME_ACTIVE';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header Profile Summary */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={40} color="#002C6C" />
        </View>
        <View style={styles.profileText}>
          <Text style={styles.profileName}>{`${currentMember.firstName} ${currentMember.lastName}`}</Text>
          <Text style={styles.profileStatusSub}>
            Member Since {new Date(currentMember.joinDate).getFullYear()}
          </Text>
        </View>
        <TouchableOpacity style={styles.switchBtn} onPress={switchMember} activeOpacity={0.7}>
          <Ionicons name="swap-horizontal" size={20} color="#D4AF37" />
          <Text style={styles.switchBtnText}>Switch</Text>
        </TouchableOpacity>
      </View>

      {/* Interactive ID Card */}
      <MembershipCard member={currentMember} />

      {/* Quick Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionButton} onPress={handleShareCard}>
          <Ionicons name="download-outline" size={20} color="#002C6C" />
          <Text style={styles.actionText}>Save Wallet</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[
            styles.actionButton, 
            !isCurrent && styles.renewButtonHighlight
          ]} 
          onPress={handleRenewPress}
        >
          <Ionicons name="refresh-outline" size={20} color={isCurrent ? "#002C6C" : "#FFFFFF"} />
          <Text style={[styles.actionText, !isCurrent && styles.renewTextHighlight]}>
            {isCurrent ? 'Renew / Update' : 'RENEW NOW'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Detailed Member Credentials */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MEMBERSHIP CREDENTIALS</Text>
        
        <View style={styles.credentialCard}>
          <View style={styles.credentialRow}>
            <View style={styles.credentialItem}>
              <Text style={styles.credLabel}>Membership Status</Text>
              <View style={[styles.badge, { backgroundColor: isCurrent ? '#E8F5E9' : '#FFEBEE' }]}>
                <Text style={[styles.badgeText, { color: isCurrent ? '#2E7D32' : '#C62828' }]}>
                  {membershipStatusLabels[currentMember.status]}
                </Text>
              </View>
            </View>
            <View style={styles.credentialItem}>
              <Text style={styles.credLabel}>Member ID</Text>
              <Text style={styles.credVal}>{currentMember.memberId}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.credentialRow}>
            <View style={styles.credentialItem}>
              <Text style={styles.credLabel}>Membership Classification</Text>
              <Text style={styles.credVal}>{membershipTypeLabels[currentMember.membershipType]}</Text>
            </View>
            <View style={styles.credentialItem}>
              <Text style={styles.credLabel}>Date of Birth</Text>
              <Text style={styles.credVal}>{currentMember.dateOfBirth}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.credentialRow}>
            <View style={styles.credentialItem}>
              <Text style={styles.credLabel}>Assigned Unit Number</Text>
              <Text style={styles.credVal}>Unit {currentMember.unitNumber}</Text>
            </View>
            <View style={styles.credentialItem}>
              <Text style={styles.credLabel}>Assigned Branch</Text>
              <Text style={styles.credVal}>{memberBranch?.name || 'Loading...'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.credentialRow}>
            <View style={styles.credentialItem}>
              <Text style={styles.credLabel}>Email Address</Text>
              <Text style={styles.credVal}>{currentMember.email}</Text>
            </View>
            <View style={styles.credentialItem}>
              <Text style={styles.credLabel}>Expiration Date</Text>
              <Text style={styles.credVal}>
                {currentMember.expirationDate ? currentMember.expirationDate : 'Never (Lifetime)'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Membership Perks */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MEMBER BENEFITS</Text>
        <View style={styles.perkItem}>
          <Ionicons name="checkbox" size={22} color="#D4AF37" style={styles.perkIcon} />
          <View style={styles.perkTextContainer}>
            <Text style={styles.perkTitle}>Voting Power</Text>
            <Text style={styles.perkDesc}>Participate in local Branch elections, constitutional amendments, and resolutions.</Text>
          </View>
        </View>

        <View style={styles.perkItem}>
          <Ionicons name="checkbox" size={22} color="#D4AF37" style={styles.perkIcon} />
          <View style={styles.perkTextContainer}>
            <Text style={styles.perkTitle}>Crisis Magazine Subscription</Text>
            <Text style={styles.perkDesc}>Official digital and print issues of the premier journal of civil rights and history.</Text>
          </View>
        </View>

        <View style={styles.perkItem}>
          <Ionicons name="checkbox" size={22} color="#D4AF37" style={styles.perkIcon} />
          <View style={styles.perkTextContainer}>
            <Text style={styles.perkTitle}>National Mobilization Network</Text>
            <Text style={styles.perkDesc}>Direct action alerts, legal advocacy updates, and community organizing coalitions.</Text>
          </View>
        </View>
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
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#002C6C',
  },
  profileStatusSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#002C6C',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  switchBtnText: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#002C6C',
    borderRadius: 8,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  renewButtonHighlight: {
    backgroundColor: '#002C6C',
    borderColor: '#D4AF37',
  },
  actionText: {
    color: '#002C6C',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 6,
  },
  renewTextHighlight: {
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  credentialCard: {
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
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  credentialItem: {
    flex: 1,
  },
  credLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 4,
  },
  credVal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  perkItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'flex-start',
  },
  perkIcon: {
    marginTop: 2,
    marginRight: 12,
  },
  perkTextContainer: {
    flex: 1,
  },
  perkTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#002C6C',
    marginBottom: 2,
  },
  perkDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
});
