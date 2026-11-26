import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, useThemedStyles } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/tokens';
import {
  lookupPropertyAddresses,
  openPropertyInGoogleMaps,
  PlaceSuggestion,
} from '../../services/placeLookupService';

interface Props {
  label?: string;
  propertyName: string;
  regionHint?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

/**
 * Editable property Location / Address field with:
 * - 1-tap clear (✕) so OCR or old addresses can be wiped instantly
 * - Zero-cost OpenStreetMap (Photon) address lookup with tappable suggestion chips
 * - Zero-cost 1-tap "🗺️ Google Maps" button that opens the native Google Maps app
 */
export const PlaceAddressHelper: React.FC<Props> = ({
  label = 'Location / Address (Optional)',
  propertyName,
  regionHint,
  value,
  onChangeText,
  placeholder = 'e.g., Madikeri, Coorg (or tap Find)',
}) => {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [searching, setSearching] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    forName: string;
    suggestions: PlaceSuggestion[];
    statusMessage: string | null;
  }>({ forName: '', suggestions: [], statusMessage: null });

  const isCurrentLookup = lookupResult.forName === propertyName;
  const suggestions = isCurrentLookup ? lookupResult.suggestions : [];
  const statusMessage = isCurrentLookup ? lookupResult.statusMessage : null;

  const handleLookup = async () => {
    if (!propertyName.trim() && !value.trim()) {
      setLookupResult({
        forName: propertyName,
        suggestions: [],
        statusMessage: 'Enter a hotel or stay name first, then tap Find Address.',
      });
      return;
    }
    setSearching(true);
    setLookupResult({ forName: propertyName, suggestions: [], statusMessage: null });
    try {
      const outcome = await lookupPropertyAddresses(
        propertyName.trim() || value.trim(),
        regionHint
      );
      if (outcome.status === 'found' && outcome.results.length > 0) {
        setLookupResult({
          forName: propertyName,
          suggestions: outcome.results,
          statusMessage: null,
        });
      } else if (outcome.status === 'offline_or_error') {
        setLookupResult({
          forName: propertyName,
          suggestions: [],
          statusMessage:
            'Offline or lookup unavailable — type an area/address or open Google Maps.',
        });
      } else {
        setLookupResult({
          forName: propertyName,
          suggestions: [],
          statusMessage:
            'Not listed on OpenStreetMap — type the area/address or verify in Google Maps.',
        });
      }
    } finally {
      setSearching(false);
    }
  };

  const handleOpenMaps = async () => {
    Haptics.selectionAsync().catch(() => {});
    await openPropertyInGoogleMaps(propertyName || value, value, regionHint);
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
          multiline={false}
          returnKeyType="done"
        />
        {value.trim().length > 0 && (
          <TouchableOpacity
            onPress={() => {
              onChangeText('');
              Haptics.selectionAsync().catch(() => {});
            }}
            style={styles.clearBtn}
            accessibilityLabel="Clear location"
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={handleLookup}
          disabled={searching}
          style={[styles.actionChip, styles.findChip, searching && { opacity: 0.7 }]}
          activeOpacity={0.82}
        >
          {searching ? (
            <ActivityIndicator size="small" color={isDark ? '#7DD3FC' : '#0369A1'} />
          ) : (
            <Text style={styles.findChipText}>🔍 Find Address</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleOpenMaps}
          style={[styles.actionChip, styles.mapsChip]}
          activeOpacity={0.82}
        >
          <Text style={styles.mapsChipText}>🗺️ Google Maps</Text>
        </TouchableOpacity>
      </View>

      {suggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          <Text style={styles.suggestionsHeader}>Tap to fill address:</Text>
          {suggestions.map((s, idx) => (
            <TouchableOpacity
              key={`${s.address}_${idx}`}
              onPress={() => {
                onChangeText(s.address);
                setLookupResult({ forName: propertyName, suggestions: [], statusMessage: null });
                Haptics.selectionAsync().catch(() => {});
              }}
              style={styles.suggestionRow}
              activeOpacity={0.8}
            >
              <Text style={styles.suggestionText} numberOfLines={2}>
                📍 {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {statusMessage && (
        <Text style={styles.statusHint}>{statusMessage}</Text>
      )}
    </View>
  );
};

const createStyles = (COLORS: ThemeColors, _SHADOWS: unknown, isDark: boolean) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: COLORS.inkSoft,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.canvas,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 12,
      paddingHorizontal: 10,
    },
    input: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 13.5,
      fontWeight: '600',
      color: COLORS.ink,
    },
    clearBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: COLORS.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
    },
    clearBtnText: {
      fontSize: 11,
      fontWeight: '900',
      color: COLORS.inkMuted,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    actionChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      minHeight: 34,
    },
    findChip: {
      backgroundColor: COLORS.skySoft,
      borderColor: COLORS.skyBorder,
    },
    findChipText: {
      fontSize: 12,
      fontWeight: '800',
      color: isDark ? '#7DD3FC' : '#0369A1',
    },
    mapsChip: {
      backgroundColor: COLORS.emeraldSoft,
      borderColor: COLORS.emeraldBorder,
    },
    mapsChipText: {
      fontSize: 12,
      fontWeight: '800',
      color: COLORS.emeraldText,
    },
    suggestionsBox: {
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.skyBorder,
      borderRadius: 12,
      padding: 8,
      gap: 6,
    },
    suggestionsHeader: {
      fontSize: 10.5,
      fontWeight: '800',
      color: isDark ? '#7DD3FC' : '#0369A1',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    suggestionRow: {
      backgroundColor: COLORS.surfaceMuted,
      borderRadius: 9,
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
    },
    suggestionText: {
      fontSize: 12,
      fontWeight: '600',
      color: COLORS.ink,
      lineHeight: 16,
    },
    statusHint: {
      fontSize: 11.5,
      color: COLORS.inkMuted,
      fontStyle: 'italic',
      lineHeight: 16,
    },
  });
