import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { useIncomingShare } from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { FEATURE_FLAGS } from './src/config/featureFlags';
import { AppProvider, useApp } from './src/context/AppContext';
import { ThemeProvider, useTheme, useThemedStyles } from './src/context/ThemeContext';
import { InstagramStudioScreen } from './src/screens/InstagramStudioScreen';
import { NewTripScreen } from './src/screens/NewTripScreen';
import { PassportScreen } from './src/screens/PassportScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { SharedTripsScreen } from './src/screens/SharedTripsScreen';
import { StudioScreen } from './src/screens/StudioScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { TripsHubScreen } from './src/screens/TripsHubScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { WorldMapScreen } from './src/screens/WorldMapScreen';
import { ThemeColors, ThemeShadows } from './src/theme/tokens';
import { IncomingSharePayload } from './src/types/models';

type MainTab = 'trips' | 'map' | 'shared' | 'studio' | 'passport';
type OverlayRoute =
  | { name: 'none' }
  | { name: 'trip'; tripId: string }
  | { name: 'ig_studio'; tripId: string; returnTo?: 'trip' | 'studio' }
  | { name: 'new_trip' }
  | { name: 'scanner'; incomingShare?: IncomingSharePayload | null }
  | { name: 'welcome' };

const MainShell: React.FC = () => {
  const { ready, profile } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [activeTab, setActiveTab] = useState<MainTab>('trips');
  const [overlay, setOverlay] = useState<OverlayRoute>({ name: 'none' });
  const { resolvedSharedPayloads, clearSharedPayloads } = useIncomingShare();
  const lastShareSigRef = useRef<string | null>(null);

  // Open the matching trip directly when the user taps a local Travel Reminder notification
  useEffect(() => {
    if (!ready || !profile) return;
    let active = true;

    Notifications.getLastNotificationResponseAsync()
      .then((res) => {
        if (!active || !res) return;
        const tripId = res.notification.request.content.data?.tripId;
        if (typeof tripId === 'string' && tripId) {
          setOverlay({ name: 'trip', tripId });
        }
      })
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const tripId = res.notification.request.content.data?.tripId;
      if (typeof tripId === 'string' && tripId) {
        setOverlay({ name: 'trip', tripId });
      }
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, [ready, profile]);

  // Route incoming Android Share -> Wanderer's Ledger payloads (PDF, screenshots, confirmation text)
  // straight into Smart Scan for 1-tap zero-typing extraction!
  // IMPORTANT: Do NOT call clearSharedPayloads() here — expo-sharing deletes the cached file
  // immediately on clearSharedPayloads(). Wait until ScannerScreen finishes reading the file!
  useEffect(() => {
    if (!ready || !profile || !resolvedSharedPayloads || resolvedSharedPayloads.length === 0) {
      lastShareSigRef.current = null;
      return;
    }

    const sig = resolvedSharedPayloads
      .map((p) => `${p.contentUri ?? ''}|${p.originalName ?? ''}|${p.value ?? ''}`)
      .join(';;');
    if (lastShareSigRef.current === sig) {
      return;
    }
    lastShareSigRef.current = sig;

    const imageUris: string[] = [];
    let pdfUri: string | undefined;
    let fileName: string | undefined;
    const textParts: string[] = [];

    for (const payload of resolvedSharedPayloads) {
      const mime = (payload.contentMimeType || payload.mimeType || '').toLowerCase();
      const origName = payload.originalName || '';
      const uri = 'contentUri' in payload ? payload.contentUri : null;

      if (uri && (mime === 'application/pdf' || origName.toLowerCase().endsWith('.pdf') || uri.toLowerCase().endsWith('.pdf'))) {
        pdfUri = uri;
        fileName = origName || undefined;
      } else if (uri && (payload.contentType === 'image' || mime.startsWith('image/'))) {
        imageUris.push(uri);
      } else if (payload.value && payload.value.trim().length > 0 && (payload.contentType === 'text' || payload.shareType === 'text')) {
        textParts.push(payload.value.trim());
      }
    }

    if (pdfUri || imageUris.length > 0 || textParts.length > 0) {
      setOverlay({
        name: 'scanner',
        incomingShare: {
          id: `share_${Date.now()}`,
          imageUris: imageUris.slice(0, 3),
          pdfUri,
          text: textParts.length > 0 ? textParts.join('\n') : undefined,
          fileName,
        },
      });
    } else {
      clearSharedPayloads();
      lastShareSigRef.current = null;
    }
  }, [ready, profile, resolvedSharedPayloads, clearSharedPayloads]);

  // Handle Android hardware Back button gracefully
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlay.name === 'ig_studio') {
        if (overlay.returnTo === 'studio') {
          setOverlay({ name: 'none' });
        } else {
          setOverlay({ name: 'trip', tripId: overlay.tripId });
        }
        return true;
      }
      if (overlay.name !== 'none') {
        setOverlay({ name: 'none' });
        return true;
      }
      if (activeTab !== 'trips') {
        setActiveTab('trips');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [overlay, activeTab]);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <Image
          source={require('./assets/splash-icon.png')}
          style={styles.splashLogo}
          resizeMode="contain"
        />
        <ActivityIndicator color={colors.coral} style={{ marginTop: 14 }} />
      </View>
    );
  }

  if (!profile) {
    return <WelcomeScreen />;
  }

  const openTrip = (tripId: string) => setOverlay({ name: 'trip', tripId });
  const openIgStudio = (tripId: string) =>
    setOverlay({ name: 'ig_studio', tripId, returnTo: 'trip' });
  const openIgStudioFromHub = (tripId: string) =>
    setOverlay({ name: 'ig_studio', tripId, returnTo: 'studio' });
  const openScanner = () => setOverlay({ name: 'scanner' });
  const openNewTrip = () => setOverlay({ name: 'new_trip' });
  const openWelcome = () => setOverlay({ name: 'welcome' });

  const handleIncomingShareConsumed = () => {
    clearSharedPayloads();
    lastShareSigRef.current = null;
  };

  const renderContent = () => {
    if (overlay.name === 'welcome') {
      return <WelcomeScreen isRevisit onDone={() => setOverlay({ name: 'none' })} />;
    }
    if (overlay.name === 'scanner') {
      return (
        <ScannerScreen
          incomingShare={overlay.incomingShare}
          onIncomingShareConsumed={handleIncomingShareConsumed}
          onClose={() => {
            handleIncomingShareConsumed();
            setOverlay({ name: 'none' });
          }}
          onSavedToTrip={(tripId) => {
            handleIncomingShareConsumed();
            setOverlay({ name: 'trip', tripId });
          }}
        />
      );
    }
    if (overlay.name === 'new_trip') {
      return (
        <NewTripScreen
          onBack={() => setOverlay({ name: 'none' })}
          onCreated={(tripId) => setOverlay({ name: 'trip', tripId })}
          onOpenScanner={openScanner}
        />
      );
    }
    if (overlay.name === 'ig_studio') {
      return (
        <InstagramStudioScreen
          tripId={overlay.tripId}
          onBack={() => {
            if (overlay.returnTo === 'studio') {
              setOverlay({ name: 'none' });
            } else {
              setOverlay({ name: 'trip', tripId: overlay.tripId });
            }
          }}
        />
      );
    }
    if (overlay.name === 'trip') {
      const backLabel =
        activeTab === 'map'
          ? 'Map'
          : activeTab === 'studio'
            ? 'Studio'
            : activeTab === 'shared'
              ? 'Shared'
              : 'Trips';
      return (
        <TripDetailScreen
          tripId={overlay.tripId}
          backLabel={backLabel}
          onBack={() => setOverlay({ name: 'none' })}
          onOpenScanner={openScanner}
          onOpenIgStudio={openIgStudio}
        />
      );
    }

    switch (activeTab) {
      case 'map':
        return <WorldMapScreen onOpenTrip={openTrip} />;
      case 'shared':
        return FEATURE_FLAGS.CLOUD_COLLAB_ENABLED ? (
          <SharedTripsScreen onOpenTrip={openTrip} />
        ) : (
          <StudioScreen
            onOpenTrip={openTrip}
            onOpenIgStudio={openIgStudioFromHub}
            onNewTrip={openNewTrip}
          />
        );
      case 'studio':
        return (
          <StudioScreen
            onOpenTrip={openTrip}
            onOpenIgStudio={openIgStudioFromHub}
            onNewTrip={openNewTrip}
          />
        );
      case 'passport':
        return <PassportScreen onOpenWelcome={openWelcome} />;
      case 'trips':
      default:
        return (
          <TripsHubScreen
            onOpenTrip={openTrip}
            onNewTrip={openNewTrip}
            onOpenScanner={openScanner}
            onOpenPassport={() => setActiveTab('passport')}
          />
        );
    }
  };

  const showBottomBar =
    overlay.name !== 'scanner' &&
    overlay.name !== 'ig_studio' &&
    overlay.name !== 'welcome';

  const isTabHighlighted = (tab: MainTab) =>
    activeTab === tab && (overlay.name === 'none' || overlay.name === 'trip');

  return (
    <View style={styles.shell}>
      <View style={{ flex: 1 }}>{renderContent()}</View>

      {showBottomBar && (
        <View style={styles.bottomNav}>
          <NavButton
            emoji="🧳"
            label="Trips"
            active={isTabHighlighted('trips')}
            styles={styles}
            onPress={() => {
              setOverlay({ name: 'none' });
              setActiveTab('trips');
            }}
          />
          <NavButton
            emoji="🗺️"
            label="Map"
            active={isTabHighlighted('map')}
            styles={styles}
            onPress={() => {
              setOverlay({ name: 'none' });
              setActiveTab('map');
            }}
          />

          {/* Center Glowing Smart Camera FAB */}
          <View style={styles.fabSlot}>
            <TouchableOpacity onPress={openScanner} activeOpacity={0.9}>
              <LinearGradient
                colors={['#FBBF24', '#F97316', '#F43F5E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fab}
              >
                <Text style={styles.fabIcon}>📷</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {FEATURE_FLAGS.CLOUD_COLLAB_ENABLED ? (
            <NavButton
              emoji="💌"
              label="Shared"
              active={isTabHighlighted('shared')}
              styles={styles}
              onPress={() => {
                setOverlay({ name: 'none' });
                setActiveTab('shared');
              }}
            />
          ) : (
            <NavButton
              emoji="🎨"
              label="Studio"
              active={isTabHighlighted('studio')}
              styles={styles}
              onPress={() => {
                setOverlay({ name: 'none' });
                setActiveTab('studio');
              }}
            />
          )}
          <NavButton
            emoji="🛂"
            label="Passport"
            active={isTabHighlighted('passport')}
            styles={styles}
            onPress={() => {
              setOverlay({ name: 'none' });
              setActiveTab('passport');
            }}
          />
        </View>
      )}
    </View>
  );
};

type AppStyles = ReturnType<typeof createStyles>;

const NavButton = ({
  emoji,
  label,
  active,
  styles,
  onPress,
}: {
  emoji: string;
  label: string;
  active: boolean;
  styles: AppStyles;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.navBtn, active && styles.navBtnActive]}
    activeOpacity={0.75}
    accessibilityRole="tab"
    accessibilityState={{ selected: active }}
  >
    <Text style={styles.navEmoji}>{emoji}</Text>
    <Text
      style={[styles.navLabel, active && styles.navLabelActive]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
    >
      {label}
    </Text>
    {active && <View style={styles.navActiveDot} />}
  </TouchableOpacity>
);

const ThemedRoot: React.FC = () => {
  const { isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <MainShell />
    </SafeAreaView>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <ThemedRoot />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const createStyles = (COLORS: ThemeColors, SHADOWS: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: COLORS.canvas,
    },
    splash: {
      flex: 1,
      backgroundColor: COLORS.canvas,
      alignItems: 'center',
      justifyContent: 'center',
    },
    splashLogo: {
      width: 120,
      height: 120,
    },
    shell: {
      flex: 1,
      backgroundColor: COLORS.canvas,
    },
    bottomNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: COLORS.navBg,
      borderTopWidth: 1,
      borderTopColor: COLORS.navBorder,
      paddingTop: 6,
      paddingBottom: 8,
      paddingHorizontal: 8,
      shadowColor: isDark ? '#000000' : '#EA580C',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 12,
      elevation: 10,
    },
    navBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 5,
      paddingHorizontal: 4,
      marginHorizontal: 2,
      borderRadius: 14,
      gap: 2,
    },
    navBtnActive: {
      backgroundColor: COLORS.coralSoft,
    },
    navEmoji: { fontSize: 20, includeFontPadding: false },
    navLabel: { fontSize: 11, fontWeight: '700', color: COLORS.inkSoft, includeFontPadding: false },
    navLabelActive: { color: COLORS.coralDark, fontWeight: '900' },
    navActiveDot: {
      width: 16,
      height: 3,
      borderRadius: 99,
      backgroundColor: COLORS.coral,
      marginTop: 1,
    },
    fabSlot: {
      flex: 1,
      alignItems: 'center',
      marginTop: -26,
    },
    fab: {
      width: 56,
      height: 56,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: COLORS.navBg,
      ...SHADOWS.fab,
    },
    fabIcon: { fontSize: 24 },
  });
