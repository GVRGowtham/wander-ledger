import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shareLocalFileSafely } from '../../services/shareMediaService';

export interface ReceiptLightboxItem {
  title: string;
  date?: string;
  amountLabel?: string;
  receiptUri: string;
  receiptRawText?: string;
}

interface Props {
  item: ReceiptLightboxItem | null;
  onClose: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function guessImageMime(uri: string): { mimeType: string; uti: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return { mimeType: 'image/png', uti: 'public.png' };
  if (lower.endsWith('.webp')) return { mimeType: 'image/webp', uti: 'org.webmproject.webp' };
  return { mimeType: 'image/jpeg', uti: 'public.jpeg' };
}

/**
 * Full-screen dark lightbox for inspecting uploaded receipts & bills in full resolution.
 * Supports 2-finger pinch-to-zoom, double-tap zoom, 1-finger pan when zoomed,
 * one-handed +/- zoom controls, optional OCR text sheet, and 1-tap share.
 */
export const ReceiptLightboxModal: React.FC<Props> = ({ item, onClose }) => {
  const insets = useSafeAreaInsets();
  const [stageSize, setStageSize] = useState(() => {
    const win = Dimensions.get('window');
    return { width: win.width, height: Math.max(320, win.height - 180) };
  });
  const [zoomDisplay, setZoomDisplay] = useState(1);
  const [showOcrText, setShowOcrText] = useState(false);
  const [sharing, setSharing] = useState(false);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const txAnim = useRef(new Animated.Value(0)).current;
  const tyAnim = useRef(new Animated.Value(0)).current;

  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const stageRef = useRef(stageSize);
  stageRef.current = stageSize;

  const gestureRef = useRef({
    isPinching: false,
    pinchStartDist: 0,
    pinchStartScale: 1,
    panStartX: 0,
    panStartY: 0,
    moved: false,
    lastTapAt: 0,
  });

  const clampPan = (x: number, y: number, scale: number) => {
    if (scale <= 1.02) return { x: 0, y: 0 };
    const { width, height } = stageRef.current;
    const maxX = ((scale - 1) * width) / 2;
    const maxY = ((scale - 1) * height) / 2;
    return {
      x: clamp(x, -maxX, maxX),
      y: clamp(y, -maxY, maxY),
    };
  };

  const animateTo = (nextScale: number, nextX: number, nextY: number) => {
    const clampedScale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
    const clampedPos = clampPan(nextX, nextY, clampedScale);
    scaleRef.current = clampedScale;
    txRef.current = clampedPos.x;
    tyRef.current = clampedPos.y;
    setZoomDisplay(Math.round(clampedScale * 10) / 10);

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: clampedScale,
        useNativeDriver: true,
        friction: 8,
        tension: 90,
      }),
      Animated.spring(txAnim, {
        toValue: clampedPos.x,
        useNativeDriver: true,
        friction: 8,
        tension: 90,
      }),
      Animated.spring(tyAnim, {
        toValue: clampedPos.y,
        useNativeDriver: true,
        friction: 8,
        tension: 90,
      }),
    ]).start();
  };

  // Reset zoom/pan and OCR drawer whenever a new receipt opens or modal closes
  useEffect(() => {
    scaleRef.current = 1;
    txRef.current = 0;
    tyRef.current = 0;
    scaleAnim.setValue(1);
    txAnim.setValue(0);
    tyAnim.setValue(0);
    setZoomDisplay(1);
    setShowOcrText(false);
    setSharing(false);
  }, [item?.receiptUri, Boolean(item), scaleAnim, txAnim, tyAnim]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          gestureRef.current.moved = false;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            gestureRef.current.isPinching = true;
            gestureRef.current.pinchStartDist = Math.max(10, Math.hypot(dx, dy));
            gestureRef.current.pinchStartScale = scaleRef.current;
          } else {
            gestureRef.current.isPinching = false;
            gestureRef.current.panStartX = txRef.current;
            gestureRef.current.panStartY = tyRef.current;
          }
        },
        onPanResponderMove: (evt, gs) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            const dist = Math.max(10, Math.hypot(dx, dy));
            if (!gestureRef.current.isPinching) {
              gestureRef.current.isPinching = true;
              gestureRef.current.pinchStartDist = dist;
              gestureRef.current.pinchStartScale = scaleRef.current;
            }
            gestureRef.current.moved = true;
            const rawScale =
              gestureRef.current.pinchStartScale *
              (dist / gestureRef.current.pinchStartDist);
            const nextScale = clamp(rawScale, 0.9, MAX_ZOOM);
            scaleRef.current = nextScale;
            scaleAnim.setValue(nextScale);

            const clampedPos = clampPan(txRef.current, tyRef.current, Math.max(1, nextScale));
            txRef.current = clampedPos.x;
            tyRef.current = clampedPos.y;
            txAnim.setValue(clampedPos.x);
            tyAnim.setValue(clampedPos.y);
            return;
          }

          if (gestureRef.current.isPinching) {
            // Finger lifted mid-pinch: re-anchor pan origin cleanly
            gestureRef.current.isPinching = false;
            gestureRef.current.panStartX = txRef.current - gs.dx;
            gestureRef.current.panStartY = tyRef.current - gs.dy;
            return;
          }

          if (Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4) {
            gestureRef.current.moved = true;
          }

          if (scaleRef.current > 1.02) {
            const next = clampPan(
              gestureRef.current.panStartX + gs.dx,
              gestureRef.current.panStartY + gs.dy,
              scaleRef.current
            );
            txRef.current = next.x;
            tyRef.current = next.y;
            txAnim.setValue(next.x);
            tyAnim.setValue(next.y);
          }
        },
        onPanResponderRelease: () => {
          const wasPinching = gestureRef.current.isPinching;
          const moved = gestureRef.current.moved;
          gestureRef.current.isPinching = false;

          if (wasPinching) {
            if (scaleRef.current < 1.08) {
              animateTo(1, 0, 0);
            } else {
              const clamped = clampPan(txRef.current, tyRef.current, scaleRef.current);
              animateTo(scaleRef.current, clamped.x, clamped.y);
            }
            return;
          }

          // Detect double-tap to smoothly toggle 1x <-> 2.4x
          if (!moved) {
            const now = Date.now();
            if (now - gestureRef.current.lastTapAt < 280) {
              gestureRef.current.lastTapAt = 0;
              if (scaleRef.current > 1.15) {
                animateTo(1, 0, 0);
              } else {
                animateTo(2.4, 0, 0);
              }
            } else {
              gestureRef.current.lastTapAt = now;
            }
          } else {
            setZoomDisplay(Math.round(scaleRef.current * 10) / 10);
          }
        },
      }),
    []
  );

  const handleShareReceipt = async () => {
    if (!item?.receiptUri || sharing) return;
    setSharing(true);
    try {
      const { mimeType, uti } = guessImageMime(item.receiptUri);
      const ok = await shareLocalFileSafely({
        fileUri: item.receiptUri,
        mimeType,
        uti,
        title: `${item.title} — Receipt`,
      });
      if (!ok) {
        Alert.alert('Unable to Share', 'Could not open the share sheet for this receipt.');
      }
    } finally {
      setSharing(false);
    }
  };

  const stepZoom = (delta: number) => {
    const next = clamp(Math.round((scaleRef.current + delta) * 10) / 10, MIN_ZOOM, MAX_ZOOM);
    if (next <= 1.05) {
      animateTo(1, 0, 0);
    } else {
      animateTo(next, txRef.current, tyRef.current);
    }
  };

  if (!item) return null;

  const isZoomed = zoomDisplay > 1.05;
  const subParts = [item.date, item.amountLabel].filter(Boolean).join(' • ');

  return (
    <Modal
      visible={Boolean(item)}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* Safe-area Top Bar */}
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              🧾 {item.title}
            </Text>
            {subParts ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subParts}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.8}
            accessibilityLabel="Close full bill view"
          >
            <Text style={styles.closeX}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Full-screen Zoomable & Pannable Stage */}
        <View
          style={styles.stage}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && height > 0) {
              setStageSize({ width, height });
            }
          }}
          {...panResponder.panHandlers}
        >
          <Animated.View
            style={[
              styles.imageWrap,
              {
                width: stageSize.width,
                height: stageSize.height,
                transform: [
                  { translateX: txAnim },
                  { translateY: tyAnim },
                  { scale: scaleAnim },
                ],
              },
            ]}
          >
            <Image
              source={{ uri: item.receiptUri }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          </Animated.View>

          {!isZoomed && !showOcrText && (
            <View pointerEvents="none" style={styles.hintPill}>
              <Text style={styles.hintText}>Pinch or double-tap to zoom</Text>
            </View>
          )}
        </View>

        {/* Optional Collapsible OCR Text Overlay */}
        {showOcrText && item.receiptRawText ? (
          <View style={styles.ocrPanel}>
            <View style={styles.ocrPanelHead}>
              <Text style={styles.ocrPanelTitle}>📝 Scanned Bill Text</Text>
              <TouchableOpacity onPress={() => setShowOcrText(false)} hitSlop={8}>
                <Text style={styles.ocrPanelClose}>Hide</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.ocrScroll} showsVerticalScrollIndicator>
              <Text style={styles.ocrText} selectable>
                {item.receiptRawText}
              </Text>
            </ScrollView>
          </View>
        ) : null}

        {/* Safe-area Bottom Controls */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.zoomGroup}>
            <TouchableOpacity
              onPress={() => stepZoom(-0.75)}
              disabled={zoomDisplay <= MIN_ZOOM}
              style={[styles.ctrlBtn, zoomDisplay <= MIN_ZOOM && styles.ctrlBtnDisabled]}
              activeOpacity={0.8}
              accessibilityLabel="Zoom out"
            >
              <Text style={styles.ctrlBtnText}>−</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (isZoomed ? animateTo(1, 0, 0) : animateTo(2.4, 0, 0))}
              style={styles.zoomReadout}
              activeOpacity={0.8}
              accessibilityLabel="Toggle zoom"
            >
              <Text style={styles.zoomReadoutText}>
                {isZoomed ? `${zoomDisplay.toFixed(1)}× · Reset` : '1.0×'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => stepZoom(0.75)}
              disabled={zoomDisplay >= MAX_ZOOM}
              style={[styles.ctrlBtn, zoomDisplay >= MAX_ZOOM && styles.ctrlBtnDisabled]}
              activeOpacity={0.8}
              accessibilityLabel="Zoom in"
            >
              <Text style={styles.ctrlBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionGroup}>
            {item.receiptRawText ? (
              <TouchableOpacity
                onPress={() => setShowOcrText((prev) => !prev)}
                style={[styles.pillBtn, showOcrText && styles.pillBtnActive]}
                activeOpacity={0.8}
              >
                <Text style={styles.pillBtnText}>📝 Text</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={handleShareReceipt}
              disabled={sharing}
              style={styles.shareBtn}
              activeOpacity={0.85}
            >
              {sharing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.shareBtnText}>📤 Share</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 11, 20, 0.97)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  closeX: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  stage: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  hintPill: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 99,
  },
  hintText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  ocrPanel: {
    maxHeight: 200,
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    padding: 12,
    gap: 8,
  },
  ocrPanelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ocrPanelTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  ocrPanelClose: {
    fontSize: 12,
    fontWeight: '800',
    color: '#818CF8',
  },
  ocrScroll: {
    maxHeight: 145,
  },
  ocrText: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    color: '#CBD5E1',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  zoomGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ctrlBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlBtnDisabled: {
    opacity: 0.35,
  },
  ctrlBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F8FAFC',
    lineHeight: 20,
  },
  zoomReadout: {
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomReadoutText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillBtn: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBtnActive: {
    backgroundColor: '#312E81',
    borderColor: '#818CF8',
  },
  pillBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  shareBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 82,
  },
  shareBtnText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
