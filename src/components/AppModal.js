import React from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

// Elegant, centered modal used in place of native Alerts where we want a refined,
// on-brand look. Pass an icon (Feather name) + title + message + buttons
// ([{ label, style: 'primary'|'destructive'|'secondary', onPress }]).
export default function AppModal({
  visible,
  onRequestClose,
  icon,
  iconColor = '#16A34A',
  iconBg = '#E7F7EE',
  title,
  message,
  buttons = [],
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        {/* Absorb taps on the card so they don't dismiss via the backdrop. */}
        <Pressable style={styles.card} onPress={() => {}}>
          {icon ? (
            <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
              <Feather name={icon} size={26} color={iconColor} />
            </View>
          ) : null}

          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.actions}>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.85}
                onPress={b.onPress}
                style={[
                  styles.btn,
                  b.style === 'primary' && styles.btnPrimary,
                  b.style === 'destructive' && styles.btnDestructive,
                  (!b.style || b.style === 'secondary') && styles.btnSecondary,
                ]}
              >
                <Text
                  style={[
                    styles.btnText,
                    (b.style === 'primary' || b.style === 'destructive') && styles.btnTextOnColor,
                    (!b.style || b.style === 'secondary') && styles.btnTextSecondary,
                  ]}
                >
                  {b.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 10,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    fontWeight: '400',
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  btn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#16A34A',
  },
  btnDestructive: {
    backgroundColor: '#E5484D',
  },
  btnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  btnTextOnColor: {
    color: '#FFFFFF',
  },
  btnTextSecondary: {
    color: '#3F3F46',
  },
});
