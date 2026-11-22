import React, { useState } from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { COLORS } from '../../theme/tokens';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Android edge-to-edge & keyboard-safe bottom sheet modal:
 * - Always sits cleanly ABOVE the Android system navigation bar (back/home/recents) via safe-area insets.
 * - Dynamically lifts above the soft keyboard when any TextInput is focused so typed text
 *   is always visible and scrollable, without double-offsetting on ROMs that resize dialogs.
 */
export const BottomSheetModal: React.FC<Props> = ({
  visible,
  title,
  onClose,
  children,
  footer,
}) => {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const screenHeight = Dimensions.get('screen').height;
  const [backdropHeight, setBackdropHeight] = useState<number>(screenHeight);

  const topSafe = Math.max(insets.top, 24) + 12;
  const navBarSafe = Math.max(insets.bottom, 16);

  // Detect whether Android already shrank the Modal window for the keyboard
  const osAlreadyShrank = Math.max(0, screenHeight - backdropHeight);
  const effectiveKeyboardPad =
    keyboardHeight > 0 ? Math.max(0, keyboardHeight - osAlreadyShrank) : 0;

  // When keyboard is closed, push the entire sheet above Android's Back/Home/Recents bar.
  // When keyboard is open, push the entire sheet cleanly above the keyboard.
  const backdropBottomPad =
    keyboardHeight > 0 ? effectiveKeyboardPad : navBarSafe;

  const availableHeight = Math.max(
    240,
    backdropHeight - topSafe - backdropBottomPad - 8
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View
        onLayout={(e) => setBackdropHeight(e.nativeEvent.layout.height)}
        style={[
          styles.backdrop,
          {
            paddingTop: topSafe,
            paddingBottom: backdropBottomPad,
          },
        ]}
      >
        {/* Tap dimmed area above the sheet to dismiss */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.dismissArea} />
        </TouchableWithoutFeedback>

        <View
          style={[
            styles.sheet,
            {
              maxHeight: availableHeight,
            },
          ]}
        >
          <View style={styles.handleBar} />
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.75}
            >
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={styles.scrollContent}
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.footerWrap}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,25,23,0.52)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
    minHeight: 24,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginHorizontal: 6,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 10,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#E7E5E4',
    alignSelf: 'center',
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.ink,
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeX: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.inkMuted,
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  footerWrap: {
    paddingTop: 6,
  },
});
