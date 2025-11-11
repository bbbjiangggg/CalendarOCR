import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from 'react-native';
import { purchasePro, restorePurchases } from '../utils/purchaseService';

export default function UpgradeScreen({ navigation, route }) {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const { remainingScans = 0 } = route.params || {};

  // Responsive design: detect screen size
  const { width, height } = Dimensions.get('window');
  const isSmallScreen = width <= 375 || height <= 700; // iPhone 13 mini, SE
  const isTablet = width > 600; // iPad

  const handlePurchase = async () => {
    try {
      setIsPurchasing(true);
      const success = await purchasePro();

      if (success) {
        Alert.alert(
          'Welcome to Pro! 🎉',
          'You now have unlimited scans. Enjoy!',
          [
            {
              text: 'Start Scanning',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } catch (error) {
      Alert.alert(
        'Purchase Failed',
        'Something went wrong. Please try again or contact support.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    try {
      setIsRestoring(true);
      const restored = await restorePurchases();

      if (restored) {
        Alert.alert(
          'Purchase Restored! ✓',
          'Your Pro status has been restored.',
          [
            {
              text: 'Continue',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        Alert.alert(
          'No Purchases Found',
          'We couldn\'t find any previous purchases on this account.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert('Restore Failed', 'Please try again later.', [{ text: 'OK' }]);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          isTablet && styles.contentTablet,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Close Button */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={[
          styles.header,
          isSmallScreen && styles.headerSmall,
        ]}>
          <Text style={[
            styles.emoji,
            isSmallScreen && styles.emojiSmall,
          ]}>🚀</Text>
          <Text style={[
            styles.title,
            isSmallScreen && styles.titleSmall,
          ]}>Upgrade to Pro</Text>
          <Text style={styles.subtitle}>
            {remainingScans === 0
              ? "You've used all your free scans this month"
              : `${remainingScans} free scan${remainingScans === 1 ? '' : 's'} remaining`}
          </Text>
        </View>

        {/* Features */}
        <View style={[
          styles.features,
          isSmallScreen && styles.featuresSmall,
        ]}>
          <Feature icon="∞" text="Unlimited scans" isSmallScreen={isSmallScreen} />
          <Feature icon="✓" text="No subscriptions" isSmallScreen={isSmallScreen} />
          <Feature icon="✓" text="Pay once, use forever" isSmallScreen={isSmallScreen} />
          <Feature icon="✓" text="Support development" isSmallScreen={isSmallScreen} />
        </View>

        {/* Price */}
        <View style={[
          styles.priceContainer,
          isSmallScreen && styles.priceContainerSmall,
        ]}>
          <Text style={styles.priceLabel}>One-time payment</Text>
          <Text style={[
            styles.price,
            isSmallScreen && styles.priceSmall,
          ]}>$2.99</Text>
          <Text style={styles.priceSubtext}>No hidden fees · Lifetime access</Text>
        </View>

        {/* Purchase Button */}
        <TouchableOpacity
          style={styles.purchaseButton}
          onPress={handlePurchase}
          disabled={isPurchasing}
          activeOpacity={0.8}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.purchaseButtonText}>Get Pro Now</Text>
          )}
        </TouchableOpacity>

        {/* Restore Button */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={isRestoring}
          activeOpacity={0.7}
        >
          {isRestoring ? (
            <ActivityIndicator color="#6B6B6B" />
          ) : (
            <Text style={styles.restoreButtonText}>Restore Purchase</Text>
          )}
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footerContainer}>
          <Text style={styles.footer}>Secure payment powered by</Text>
          <Text style={styles.footer}>Apple In-App Purchase</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const Feature = ({ icon, text, isSmallScreen }) => (
  <View style={[
    styles.feature,
    isSmallScreen && styles.featureSmall,
  ]}>
    <Text style={[
      styles.featureIcon,
      isSmallScreen && styles.featureIconSmall,
    ]}>{icon}</Text>
    <Text style={[
      styles.featureText,
      isSmallScreen && styles.featureTextSmall,
    ]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  contentTablet: {
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 48,
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#000000',
    fontWeight: '400',
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 48,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '400',
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 22,
  },
  features: {
    marginBottom: 48,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureIcon: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  featureText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#000000',
    marginLeft: 12,
    letterSpacing: -0.4,
  },
  priceContainer: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  priceLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B6B6B',
    marginBottom: 8,
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -1.2,
    marginBottom: 8,
  },
  priceSubtext: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B6B6B',
  },
  purchaseButton: {
    backgroundColor: '#000000',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  purchaseButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  restoreButton: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    backgroundColor: '#FFFFFF',
  },
  restoreButtonText: {
    color: '#333333',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  footerContainer: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingTop: 20,
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '400',
    color: '#6B6B6B',
    lineHeight: 18,
  },
  // Responsive styles for small screens (iPhone 13 mini, SE)
  headerSmall: {
    marginTop: 28,
    marginBottom: 36,
  },
  emojiSmall: {
    fontSize: 56,
  },
  titleSmall: {
    marginBottom: 8,
  },
  featuresSmall: {
    marginBottom: 32,
  },
  featureSmall: {
    marginBottom: 12,
  },
  featureIconSmall: {
    fontSize: 20,
    width: 28,
  },
  featureTextSmall: {
    fontSize: 16,
  },
  priceContainerSmall: {
    paddingVertical: 18,
    marginBottom: 24,
  },
  priceSmall: {
    fontSize: 40,
  },
});
