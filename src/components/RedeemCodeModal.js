import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { redeemCode } from '../utils/referralService';

const CODE_LENGTH = 6;

/**
 * Focused bottom-sheet for a NEW user to redeem a friend's invite code.
 *
 * Design notes:
 *  • No autoFocus — the sheet slides up calmly; the keyboard only appears when
 *    the user taps the code field.
 *  • Segmented 6-cell code input (a single hidden TextInput drives six visual
 *    cells) for a polished, App-Store-standard entry experience.
 *
 * The reward (3 scans) is granted on the user's FIRST SAVE, so the success copy
 * says "when you save your first event" rather than implying instant scans.
 *
 * Props: visible, onClose, onSuccess()
 */
export default function RedeemCodeModal({ visible, onClose, onSuccess }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const reset = () => {
    setCode('');
    setError('');
    setLoading(false);
    setDone(false);
    setFocused(false);
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    onClose && onClose();
  };

  const handleChange = (text) => {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
    setCode(cleaned);
    if (error) setError('');
  };

  const handleRedeem = async () => {
    Keyboard.dismiss();
    setLoading(true);
    setError('');
    const result = await redeemCode(code);
    setLoading(false);

    if (result.success) {
      setDone(true);
      onSuccess && onSuccess();
      setTimeout(handleClose, 1800);
    } else {
      setError(result.message || 'Could not redeem that code.');
    }
  };

  const canRedeem = code.length === CODE_LENGTH && !loading;

  const renderCells = () => (
    <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
      <View style={styles.cellRow}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => {
          const char = code[i] || '';
          const isActive = focused && i === Math.min(code.length, CODE_LENGTH - 1);
          return (
            <View
              key={i}
              style={[
                styles.cell,
                char && styles.cellFilled,
                isActive && styles.cellActive,
                error && styles.cellError,
              ]}
            >
              <Text style={styles.cellChar}>{char}</Text>
            </View>
          );
        })}

        {/* Hidden input laid over the cells; tapping the row focuses it. */}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          keyboardType="ascii-capable"
          returnKeyType="done"
          caretHidden
          contextMenuHidden
          editable={!loading}
          onSubmitEditing={() => canRedeem && handleRedeem()}
        />
      </View>
    </TouchableWithoutFeedback>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {done ? (
            <View style={styles.successWrap}>
              <View style={styles.iconCircle}>
                <Feather name="check" size={30} color="#FF6B6B" />
              </View>
              <Text style={styles.title}>Code applied</Text>
              <Text style={styles.subtitle}>
                You’ll get 3 free scans when you save your first event.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.iconCircle}>
                <Feather name="gift" size={26} color="#FF6B6B" />
              </View>
              <Text style={styles.title}>Enter invite code</Text>
              <Text style={styles.subtitle}>
                A friend’s code gives you 3 free scans.
              </Text>

              {renderCells()}

              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.button, !canRedeem && styles.buttonDisabled]}
                onPress={handleRedeem}
                disabled={!canRedeem}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Redeem code</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleClose} disabled={loading}>
                <Text style={styles.cancelText}>Not now</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const CELL_SIZE = 48;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E0E0E0',
    marginBottom: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF0F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  cellRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE + 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: {
    borderColor: '#B0B0B0',
    backgroundColor: '#FFFFFF',
  },
  cellActive: {
    borderColor: '#FF6B6B',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  cellError: {
    borderColor: '#E5484D',
  },
  cellChar: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  errorText: {
    fontSize: 13,
    color: '#E5484D',
    marginTop: 14,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  button: {
    width: '100%',
    backgroundColor: '#000000',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#C8C8C8',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B6B6B',
    marginTop: 18,
    letterSpacing: -0.2,
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
