import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme, useThemedStyles } from '../../context/ThemeContext';
import {
  buildSuggestedCurrencies,
  CURRENCY_BY_CODE,
  searchCurrencies,
} from '../../services/currencyDirectory';
import { ThemeColors } from '../../theme/tokens';

interface CurrencySuggestionsBarProps {
  value: string;
  onSelect: (currencyCode: string) => void;
  tripCurrencies?: string[];
  homeCurrency?: string;
  needsPick?: boolean;
  label?: string;
}

/**
 * Full-width horizontal 1-tap currency chip bar with live autocomplete search.
 * Prioritizes the current trip's currencies, then Home Currency, then popular currencies.
 */
export const CurrencySuggestionsBar: React.FC<CurrencySuggestionsBarProps> = ({
  value,
  onSelect,
  tripCurrencies = [],
  homeCurrency,
  needsPick = false,
  label,
}) => {
  const styles = useThemedStyles(createStyles);
  const trimmed = (value || '').trim();
  const upper = trimmed.toUpperCase();
  const isExactKnown = upper.length === 3 && Boolean(CURRENCY_BY_CODE[upper]);

  const prioritized = useMemo(() => {
    const out: string[] = [];
    for (const c of tripCurrencies) {
      const u = c.trim().toUpperCase();
      if (u.length === 3 && !out.includes(u)) out.push(u);
    }
    const h = (homeCurrency || '').trim().toUpperCase();
    if (h.length === 3 && !out.includes(h)) out.push(h);
    return out;
  }, [tripCurrencies, homeCurrency]);

  const isFiltering = trimmed.length > 0 && !isExactKnown;

  const chips = useMemo(() => {
    if (isFiltering) {
      return searchCurrencies(trimmed, prioritized, 6);
    }
    return buildSuggestedCurrencies(tripCurrencies, homeCurrency, 6);
  }, [isFiltering, trimmed, prioritized, tripCurrencies, homeCurrency]);

  if (chips.length === 0) return null;

  const heading =
    label ??
    (needsPick && !upper
      ? 'Pick currency (multi-currency trip):'
      : isFiltering
        ? 'Matching currencies:'
        : tripCurrencies.length > 0
          ? 'Tap currency:'
          : 'Quick currencies:');

  return (
    <View style={styles.barWrap}>
      <Text style={[styles.barLabel, needsPick && !upper && styles.barLabelWarn]}>
        {heading}
      </Text>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {chips.map((c) => {
          const active = upper === c.code;
          return (
            <TouchableOpacity
              key={c.code}
              onPress={() => onSelect(c.code)}
              style={[
                styles.chip,
                active && styles.chipActive,
                needsPick && !upper && !active && styles.chipAttention,
              ]}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {c.flag} {c.code}
                {isFiltering ? ` · ${c.name}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

interface CurrencyFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  tripCurrencies?: string[];
  homeCurrency?: string;
  needsPick?: boolean;
  placeholder?: string;
  showChips?: boolean;
}

/**
 * Reusable Currency text input (with optional integrated CurrencySuggestionsBar).
 * Allows typing 3-letter ISO codes OR partial currency/country names to filter chips.
 */
export const CurrencyField: React.FC<CurrencyFieldProps> = ({
  label = 'CURRENCY',
  value,
  onChange,
  tripCurrencies = [],
  homeCurrency,
  needsPick = false,
  placeholder,
  showChips = true,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const emptyPrompt = needsPick && !value.trim();

  return (
    <View style={styles.fieldWrap}>
      {label ? (
        <Text style={[styles.fieldLabel, emptyPrompt && styles.barLabelWarn]}>
          {label}
          {emptyPrompt ? ' *' : ''}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.toUpperCase().replace(/[^A-Z ]/g, '').slice(0, 12))}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={placeholder ?? (emptyPrompt ? 'Pick' : homeCurrency || 'USD')}
        placeholderTextColor={emptyPrompt ? colors.coral : colors.inkSoft}
        style={[styles.input, emptyPrompt && styles.inputWarn]}
      />
      {showChips && (
        <CurrencySuggestionsBar
          value={value}
          onSelect={onChange}
          tripCurrencies={tripCurrencies}
          homeCurrency={homeCurrency}
          needsPick={needsPick}
        />
      )}
    </View>
  );
};

const createStyles = (COLORS: ThemeColors) =>
  StyleSheet.create({
    fieldWrap: {
      gap: 4,
    },
    fieldLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: COLORS.inkMuted,
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    input: {
      backgroundColor: COLORS.cardWarm,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      fontWeight: '700',
      color: COLORS.ink,
    },
    inputWarn: {
      borderColor: COLORS.coral,
      borderWidth: 1.5,
      backgroundColor: COLORS.coralSoft,
    },
    barWrap: {
      gap: 5,
      marginTop: 2,
    },
    barLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: COLORS.inkMuted,
      letterSpacing: 0.3,
    },
    barLabelWarn: {
      color: COLORS.coralDark,
    },
    chipsRow: {
      gap: 6,
      paddingRight: 8,
    },
    chip: {
      backgroundColor: COLORS.cardWarm,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 99,
    },
    chipAttention: {
      borderColor: COLORS.coralBorder,
      backgroundColor: COLORS.coralSoft,
    },
    chipActive: {
      backgroundColor: COLORS.indigo,
      borderColor: COLORS.indigo,
    },
    chipText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: COLORS.ink,
    },
    chipTextActive: {
      color: '#FFFFFF',
    },
  });
