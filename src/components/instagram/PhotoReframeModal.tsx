import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  clamp,
  computeCroppedImageLayout,
  DEFAULT_PHOTO_CROP,
  ImageDimensions,
  PhotoCrop,
  sanitizeCrop,
} from '../../services/igStudioHelpers';
import { COLORS } from '../../theme/tokens';

export interface SwapCandidate {
  id: string;
  title: string;
  photoUri?: string;
  isCurrent: boolean;
}

interface Props {
  visible: boolean;
  photoUri?: string;
  title: string;
  slotAspectRatio: number;
  imageDimensions?: ImageDimensions;
  initialCrop: PhotoCrop;
  swapCandidates?: SwapCandidate[];
  onSwapMemory?: (targetMemoryId: string) => void;
  onApply: (crop: PhotoCrop) => void;
  onClose: () => void;
}

const ZOOM_PRESETS = [1, 1.25, 1.5, 2.0, 2.5];

export const PhotoReframeModal: React.FC<Props> = ({
  visible,
  photoUri,
  title,
  slotAspectRatio,
  imageDimensions,
  initialCrop,
  swapCandidates,
  onSwapMemory,
  onApply,
  onClose,
}) => {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [crop, setCrop] = useState<PhotoCrop>(() => sanitizeCrop(initialCrop));
  const [dims, setDims] = useState<ImageDimensions>(
    imageDimensions ?? { width: 1200, height: 900 }
  );
  const [dragging, setDragging] = useState(false);

  // Sync local state whenever modal opens or photo changes
  useEffect(() => {
    if (visible) {
      setCrop(sanitizeCrop(initialCrop));
    }
  }, [visible, initialCrop, photoUri]);

  useEffect(() => {
    if (imageDimensions && imageDimensions.width > 0 && imageDimensions.height > 0) {
      setDims(imageDimensions);
      return;
    }
    if (visible && photoUri) {
      Image.getSize(
        photoUri,
        (w, h) => {
          if (w > 0 && h > 0) setDims({ width: w, height: h });
        },
        () => {}
      );
    }
  }, [visible, photoUri, imageDimensions]);

  const safeRatio = clamp(slotAspectRatio || 1, 0.45, 2.8);
  const maxFrameW = Math.min(340, screenW - 44);
  const maxFrameH = Math.min(310, Math.max(180, screenH * 0.36));

  let frameW = maxFrameW;
  let frameH = frameW / safeRatio;
  if (frameH > maxFrameH) {
    frameH = maxFrameH;
    frameW = frameH * safeRatio;
  }
  frameW = Math.round(frameW);
  frameH = Math.round(frameH);

  const layout = useMemo(
    () => computeCroppedImageLayout(frameW, frameH, dims.width, dims.height, crop),
    [frameW, frameH, dims.width, dims.height, crop]
  );

  // Keep fresh refs for PanResponder without recreating it every frame
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const dragStartRef = useRef({ offsetX: 0, offsetY: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        setDragging(true);
        dragStartRef.current = {
          offsetX: cropRef.current.offsetX,
          offsetY: cropRef.current.offsetY,
        };
      },
      onPanResponderMove: (_evt, g) => {
        const { maxShiftX, maxShiftY } = layoutRef.current;
        const nextX =
          maxShiftX > 0.5
            ? clamp(dragStartRef.current.offsetX + g.dx / maxShiftX, -1, 1)
            : cropRef.current.offsetX;
        const nextY =
          maxShiftY > 0.5
            ? clamp(dragStartRef.current.offsetY + g.dy / maxShiftY, -1, 1)
            : cropRef.current.offsetY;
        setCrop((prev) => ({
          ...prev,
          offsetX: Number(nextX.toFixed(3)),
          offsetY: Number(nextY.toFixed(3)),
        }));
      },
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
    })
  ).current;

  const applyAnchorPreset = (targetY: number) => {
    Haptics.selectionAsync().catch(() => {});
    setCrop((prev) => {
      // If vertical pan isn't possible at current zoom (landscape photo in tall slot or exact match),
      // gently bump zoom to 1.25x so the Top/Bottom anchor visibly shifts framing.
      const testLayout = computeCroppedImageLayout(frameW, frameH, dims.width, dims.height, prev);
      const nextZoom =
        targetY !== 0 && testLayout.maxShiftY < 8 ? Math.max(prev.zoom, 1.28) : prev.zoom;
      return sanitizeCrop({
        offsetX: 0,
        offsetY: targetY,
        zoom: nextZoom,
      });
    });
  };

  const nudgeZoom = (delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    setCrop((prev) =>
      sanitizeCrop({
        ...prev,
        zoom: Number((prev.zoom + delta).toFixed(2)),
      })
    );
  };

  const handleReset = () => {
    Haptics.selectionAsync().catch(() => {});
    setCrop({ ...DEFAULT_PHOTO_CROP });
  };

  const canPanHoriz = layout.maxShiftX > 1;
  const canPanVert = layout.maxShiftY > 1;
  const panHint =
    canPanHoriz && canPanVert
      ? 'Drag photo in any direction to frame faces'
      : canPanVert
      ? 'Drag up or down to position faces • Zoom in to pan sideways'
      : canPanHoriz
      ? 'Drag left or right to reframe • Zoom in to adjust height'
      : 'Zoom in above 1.0× to pan & focus on faces';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: Math.max(24, insets.top + 12),
            paddingBottom: Math.max(20, insets.bottom + 12),
          },
        ]}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerGhostBtn} activeOpacity={0.8}>
              <Text style={styles.headerGhostText}>Cancel</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                ✂️ Reframe Photo
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onApply(sanitizeCrop(crop));
              }}
              style={styles.doneBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.doneBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>

          {/* Interactive Exact-Ratio Crop Frame */}
          <View style={styles.stageArea}>
            <View
              style={[styles.cropViewport, { width: frameW, height: frameH }]}
              {...panResponder.panHandlers}
            >
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  fadeDuration={0}
                  resizeMethod="scale"
                  style={{
                    position: 'absolute',
                    width: layout.width,
                    height: layout.height,
                    left: layout.left,
                    top: layout.top,
                  }}
                />
              ) : null}

              {/* Rule-of-thirds guides */}
              <View
                pointerEvents="none"
                style={[styles.gridOverlay, { opacity: dragging ? 0.7 : 0.25 }]}
              >
                <View style={[styles.gridLineH, { top: '33.3%' }]} />
                <View style={[styles.gridLineH, { top: '66.6%' }]} />
                <View style={[styles.gridLineV, { left: '33.3%' }]} />
                <View style={[styles.gridLineV, { left: '66.6%' }]} />
              </View>

              <View pointerEvents="none" style={styles.zoomBadge}>
                <Text style={styles.zoomBadgeText}>{crop.zoom.toFixed(2)}×</Text>
              </View>
            </View>

            <Text style={styles.panHint}>{panHint}</Text>
          </View>

          {/* 1-Tap Anchor Presets */}
          <View style={styles.controlBlock}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>QUICK FOCUS</Text>
              <TouchableOpacity onPress={handleReset}>
                <Text style={styles.resetLink}>🔄 Reset</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.presetRow}>
              <TouchableOpacity
                onPress={() => applyAnchorPreset(0.88)}
                style={[styles.presetBtn, crop.offsetY >= 0.5 && styles.presetBtnActive]}
              >
                <Text
                  style={[styles.presetBtnText, crop.offsetY >= 0.5 && styles.presetBtnTextActive]}
                >
                  ⬆️ Top / Faces
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => applyAnchorPreset(0)}
                style={[
                  styles.presetBtn,
                  Math.abs(crop.offsetY) < 0.25 && Math.abs(crop.offsetX) < 0.25 && styles.presetBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.presetBtnText,
                    Math.abs(crop.offsetY) < 0.25 &&
                      Math.abs(crop.offsetX) < 0.25 &&
                      styles.presetBtnTextActive,
                  ]}
                >
                  🎯 Center
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => applyAnchorPreset(-0.88)}
                style={[styles.presetBtn, crop.offsetY <= -0.5 && styles.presetBtnActive]}
              >
                <Text
                  style={[styles.presetBtnText, crop.offsetY <= -0.5 && styles.presetBtnTextActive]}
                >
                  ⬇️ Bottom
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Zoom Controls */}
          <View style={styles.controlBlock}>
            <Text style={styles.sectionLabel}>ZOOM</Text>
            <View style={styles.zoomRow}>
              <TouchableOpacity
                onPress={() => nudgeZoom(-0.15)}
                style={styles.zoomStepBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.zoomStepText}>−</Text>
              </TouchableOpacity>

              <View style={styles.zoomPillsWrap}>
                {ZOOM_PRESETS.map((z) => {
                  const active = Math.abs(crop.zoom - z) < 0.08;
                  return (
                    <TouchableOpacity
                      key={z}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setCrop((prev) => sanitizeCrop({ ...prev, zoom: z }));
                      }}
                      style={[styles.zoomPill, active && styles.zoomPillActive]}
                    >
                      <Text style={[styles.zoomPillText, active && styles.zoomPillTextActive]}>
                        {z === 1 ? '1×' : `${z}×`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={() => nudgeZoom(0.15)}
                style={styles.zoomStepBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.zoomStepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Optional Swap Photo in Slot */}
          {swapCandidates && swapCandidates.length > 1 && onSwapMemory ? (
            <View style={styles.controlBlock}>
              <Text style={styles.sectionLabel}>⇄ SWAP PHOTO IN THIS SLOT</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              >
                {swapCandidates.map((cand) => (
                  <TouchableOpacity
                    key={cand.id}
                    disabled={cand.isCurrent}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      onSwapMemory(cand.id);
                    }}
                    style={[styles.swapCard, cand.isCurrent && styles.swapCardCurrent]}
                    activeOpacity={0.85}
                  >
                    {cand.photoUri ? (
                      <Image
                        source={{ uri: cand.photoUri }}
                        style={styles.swapThumb}
                        resizeMode="cover"
                        fadeDuration={0}
                      />
                    ) : (
                      <View style={styles.swapFallback}>
                        <Text>🌅</Text>
                      </View>
                    )}
                    <Text style={styles.swapTitle} numberOfLines={1}>
                      {cand.isCurrent ? 'Current' : cand.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  sheet: {
    backgroundColor: '#18181B',
    borderRadius: 24,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerGhostBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerGhostText: { fontSize: 12, fontWeight: '700', color: '#E4E4E7' },
  headerTitle: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
  headerSub: { fontSize: 11, fontWeight: '600', color: '#A1A1AA', marginTop: 1 },
  doneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: COLORS.coral,
  },
  doneBtnText: { fontSize: 12, fontWeight: '900', color: '#FFFFFF' },

  stageArea: {
    alignItems: 'center',
    gap: 8,
  },
  cropViewport: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#09090B',
    borderWidth: 2,
    borderColor: '#FDBA74',
    position: 'relative',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  zoomBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  zoomBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  panHint: { fontSize: 11, fontWeight: '600', color: '#D4D4D8', textAlign: 'center' },

  controlBlock: { gap: 7 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    color: '#A1A1AA',
  },
  resetLink: { fontSize: 11, fontWeight: '800', color: '#FDBA74' },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    backgroundColor: '#27272A',
    borderWidth: 1,
    borderColor: '#3F3F46',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  presetBtnActive: {
    backgroundColor: 'rgba(249, 115, 22, 0.22)',
    borderColor: COLORS.coral,
  },
  presetBtnText: { fontSize: 11, fontWeight: '800', color: '#E4E4E7' },
  presetBtnTextActive: { color: '#FDBA74' },

  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoomStepBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#27272A',
    borderWidth: 1,
    borderColor: '#3F3F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomStepText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', lineHeight: 20 },
  zoomPillsWrap: { flex: 1, flexDirection: 'row', gap: 5 },
  zoomPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#27272A',
    borderWidth: 1,
    borderColor: '#3F3F46',
    alignItems: 'center',
  },
  zoomPillActive: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral,
  },
  zoomPillText: { fontSize: 11, fontWeight: '800', color: '#D4D4D8' },
  zoomPillTextActive: { color: '#FFFFFF' },

  swapCard: {
    width: 68,
    backgroundColor: '#27272A',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1.5,
    borderColor: '#3F3F46',
    alignItems: 'center',
    gap: 3,
  },
  swapCardCurrent: {
    borderColor: COLORS.coral,
    opacity: 0.65,
  },
  swapThumb: { width: 58, height: 42, borderRadius: 8 },
  swapFallback: {
    width: 58,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#3F3F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapTitle: { fontSize: 9, fontWeight: '800', color: '#E4E4E7' },
});
