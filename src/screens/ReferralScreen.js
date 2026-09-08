import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Share,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { syncReferralBonus } from '../utils/purchaseService';
import { APP_STORE_URL } from '../utils/config';

/**
 * Invite hub: shows the user's own referral code, a share button, and stats.
 * Redeeming a friend's code lives in RedeemCodeModal (separate flow), so this
 * screen stays focused on sharing + earning.
 */
export default function ReferralScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null); // { code, bonusScans, referrals }
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // syncReferralBonus() both refreshes the local scan cache and returns the
    // full status (code + stats), so one call serves display and caching.
    const s = await syncReferralBonus();
    setStatus(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = async () => {
    if (!status?.code) return;
    await Clipboard.setStringAsync(status.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!status?.code) return;
    try {
      await Share.share({
        message:
          `I use CalendarOCR to turn event posters into calendar events 📸→📅. ` +
          `Use my code ${status.code} for 3 free scans: ${APP_STORE_URL}`,
      });
    } catch (err) {
      // User dismissed the share sheet — no action needed.
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={24} color="#000000" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FF6B6B" />
        </View>
      ) : !status?.code ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            Couldn’t load your invite code.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.giftCircle}>
              <Feather name="gift" size={30} color="#FF6B6B" />
            </View>
            <Text style={styles.title}>Give 3, get 3</Text>
            <Text style={styles.subtitle}>
              When a friend redeems your code, you both get 3 free scans —
              added instantly.
            </Text>
          </View>

          {/* Code card */}
          <TouchableOpacity
            style={styles.codeCard}
            onPress={handleCopy}
            activeOpacity={0.8}
          >
            <Text style={styles.codeLabel}>YOUR CODE</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeText}>{status.code}</Text>
              <Feather
                name={copied ? 'check' : 'copy'}
                size={20}
                color={copied ? '#FF6B6B' : '#9A9A9A'}
              />
            </View>
            <Text style={styles.copyHint}>
              {copied ? 'Copied ✓' : 'Tap to copy'}
            </Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity
            style={styles.shareButton}
            onPress={handleShare}
            activeOpacity={0.9}
          >
            <Feather name="share" size={18} color="#FFFFFF" style={styles.shareIcon} />
            <Text style={styles.shareText}>Share invite</Text>
          </TouchableOpacity>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{status.referrals}</Text>
              <Text style={styles.statLabel}>
                friend{status.referrals === 1 ? '' : 's'} joined
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{status.bonusScans}</Text>
              <Text style={styles.statLabel}>bonus scans</Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 36,
  },
  giftCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF0F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 22,
  },
  codeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    paddingVertical: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9A9A9A',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  codeText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 6,
  },
  copyHint: {
    fontSize: 13,
    fontWeight: '500',
    color: '#B0B0B0',
    marginTop: 10,
    letterSpacing: -0.1,
  },
  shareButton: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  shareIcon: {
    marginRight: 8,
  },
  shareText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E5E5',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FF6B6B',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B6B6B',
    marginTop: 4,
    letterSpacing: -0.1,
  },
  errorText: {
    fontSize: 15,
    color: '#6B6B6B',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
});
