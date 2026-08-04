import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { MOCK_MEMBERS, MOCK_BRANCHES, MOCK_AREA_CONFERENCES } from '../../src/mockData';
import { Ionicons } from '@expo/vector-icons';

export default function UnitScreen() {
  // Use the default member
  const member = MOCK_MEMBERS[0];
  const branch = MOCK_BRANCHES.find(b => b.unitNumber === member.unitNumber)!;
  const areaConf = MOCK_AREA_CONFERENCES.find(a => a.id === branch.areaConferenceId)!;

  const makeCall = () => {
    Linking.openURL(`tel:${branch.phone.replace(/[^0-9]/g, '')}`).catch(() => {
      Alert.alert("Error", "Unable to open phone dialer.");
    });
  };

  const sendEmail = () => {
    Linking.openURL(`mailto:${branch.contactEmail}`).catch(() => {
      Alert.alert("Error", "Unable to open mail client.");
    });
  };

  const openMap = () => {
    const query = encodeURIComponent(branch.address);
    Linking.openURL(`https://maps.google.com/?q=${query}`).catch(() => {
      Alert.alert("Error", "Unable to open map application.");
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Branch Header Banner */}
      <View style={styles.branchBanner}>
        <View style={styles.bannerSeal}>
          <Ionicons name="business" size={32} color="#D4AF37" />
        </View>
        <Text style={styles.branchName}>{branch.name.toUpperCase()}</Text>
        <Text style={styles.unitSub}>NAACP OFFICIAL UNIT {branch.unitNumber}</Text>
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Active & Fully Compliant</Text>
        </View>
      </View>

      {/* Quick Contact Bar */}
      <View style={styles.contactBar}>
        <TouchableOpacity style={styles.contactButton} onPress={makeCall}>
          <Ionicons name="call" size={18} color="#002C6C" />
          <Text style={styles.contactButtonText}>Call</Text>
        </TouchableOpacity>
        <View style={styles.contactDivider} />
        <TouchableOpacity style={styles.contactButton} onPress={sendEmail}>
          <Ionicons name="mail" size={18} color="#002C6C" />
          <Text style={styles.contactButtonText}>Email</Text>
        </TouchableOpacity>
        <View style={styles.contactDivider} />
        <TouchableOpacity style={styles.contactButton} onPress={openMap}>
          <Ionicons name="map" size={18} color="#002C6C" />
          <Text style={styles.contactButtonText}>Directions</Text>
        </TouchableOpacity>
      </View>

      {/* Unit Metadata Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>UNIT DETAILS</Text>
        
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="person-circle-outline" size={20} color="#002C6C" style={styles.infoIcon} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Branch President</Text>
              <Text style={styles.infoValue}>{branch.presidentName}</Text>
            </View>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Ionicons name="globe-outline" size={20} color="#002C6C" style={styles.infoIcon} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Assigned Area Conference</Text>
              <Text style={styles.infoValue}>{areaConf.name}</Text>
            </View>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Ionicons name="ribbon-outline" size={20} color="#002C6C" style={styles.infoIcon} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>NAACP Region</Text>
              <Text style={styles.infoValue}>{areaConf.regionCode} (Southwest Region)</Text>
            </View>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color="#002C6C" style={styles.infoIcon} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Mailing Address</Text>
              <Text style={styles.infoValue}>{branch.address}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Meeting Schedule */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>GENERAL BODY MEETINGS</Text>
        <View style={styles.meetingCard}>
          <Ionicons name="calendar" size={24} color="#D4AF37" style={styles.meetingIcon} />
          <View style={styles.meetingText}>
            <Text style={styles.meetingTitle}>Monthly General Meeting</Text>
            <Text style={styles.meetingTime}>Every 3rd Tuesday at 7:00 PM</Text>
            <Text style={styles.meetingDesc}>All members are highly encouraged to attend. Virtual link is distributed via email.</Text>
          </View>
        </View>
      </View>

      {/* Executive Committee List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>BRANCH EXEC LEADERSHIP</Text>
        <View style={styles.leadershipList}>
          <View style={styles.leaderRow}>
            <Text style={styles.leaderRole}>President</Text>
            <Text style={styles.leaderName}>{branch.presidentName}</Text>
          </View>
          <View style={styles.leaderDivider} />
          <View style={styles.leaderRow}>
            <Text style={styles.leaderRole}>First Vice President</Text>
            <Text style={styles.leaderName}>Rev. William Lawson</Text>
          </View>
          <View style={styles.leaderDivider} />
          <View style={styles.leaderRow}>
            <Text style={styles.leaderRole}>Secretary</Text>
            <Text style={styles.leaderName}>Yolanda Saunders</Text>
          </View>
          <View style={styles.leaderDivider} />
          <View style={styles.leaderRow}>
            <Text style={styles.leaderRole}>Treasurer</Text>
            <Text style={styles.leaderName}>Deacon Thomas Washington</Text>
          </View>
          <View style={styles.leaderDivider} />
          <View style={styles.leaderRow}>
            <Text style={styles.leaderRole}>Legal Redress Chair</Text>
            <Text style={styles.leaderName}>Atty. Gary L. Bledsoe</Text>
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
  branchBanner: {
    backgroundColor: '#002C6C',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
  },
  bannerSeal: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  branchName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
  },
  unitSub: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
    letterSpacing: 1.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: 'rgba(46, 125, 50, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  statusText: {
    color: '#81C784',
    fontSize: 11,
    fontWeight: 'bold',
  },
  contactBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  contactButtonText: {
    color: '#002C6C',
    fontWeight: 'bold',
    fontSize: 13,
  },
  contactDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E2E8F0',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoIcon: {
    marginRight: 12,
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  meetingCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    alignItems: 'center',
  },
  meetingIcon: {
    marginRight: 16,
  },
  meetingText: {
    flex: 1,
  },
  meetingTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#002C6C',
  },
  meetingTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D4AF37',
    marginTop: 2,
  },
  meetingDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 16,
  },
  leadershipList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  leaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  leaderRole: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  leaderName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  leaderDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  }
});
