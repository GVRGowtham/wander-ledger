import React, { useEffect, useState } from 'react';
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
import { useIncomingShare } from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { InstagramStudioScreen } from './src/screens/InstagramStudioScreen';
import { NewTripScreen } from './src/screens/NewTripScreen';
import { PassportScreen } from './src/screens/PassportScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { SharedTripsScreen } from './src/screens/SharedTripsScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { TripsHubScreen } from './src/screens/TripsHubScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { WorldMapScreen } from './src/screens/WorldMapScreen';
import { COLORS, SHADOWS } from './src/theme/tokens';
import { IncomingSharePayload } from './src/types/models';

type MainTab = 'trips' | 'map' | 'shared' | 'passport';
type OverlayRoute =
  | { name: 'none' }
  | { name: 'trip'; tripId: string }
  | { name: 'ig_studio'; tripId: string }
  | { name: 'new_trip' }
  | { name: 'scanner'; incomingShare?: IncomingSharePayload | null }
  | { name: 'welcome' };

const MainShell: React.FC = () => {
  const { ready, profile } = useApp();
  const [activeTab, setActiveTab] = useState<MainTab>('trips');
  const [overlay, setOverlay] = useState<OverlayRoute>({ name: 'none' });
  const { resolvedSharedPayloads, clearSharedPayloads } = useIncomingShare();

  // Route incoming Android Share -> Wanderer's Ledger payloads (PDF, screenshots, confirmation text)
  // straight into Smart Scan for 1-tap zero-typing extraction!
  useEffect(() => {
    if (!ready || !profile || !resolvedSharedPayloads || resolvedSharedPayloads.length === 0) {
      return;
    }

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

    clearSharedPayloads();

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
    }
  }, [ready, profile, resolvedSharedPayloads, clearSharedPayloads]);

  // Handle Android hardware Back button gracefully
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlay.name === 'ig_studio') {
        setOverlay({ name: 'trip', tripId: overlay.tripId });
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
        <ActivityIndicator color={COLORS.coral} style={{ marginTop: 14 }} />
      </View>
    );
  }

  if (!profile) {
    return <WelcomeScreen />;
  }

  const openTrip = (tripId: string) => setOverlay({ name: 'trip', tripId });
  const openIgStudio = (tripId: string) => setOverlay({ name: 'ig_studio', tripId });
  const openScanner = () => setOverlay({ name: 'scanner' });
  const openNewTrip = () => setOverlay({ name: 'new_trip' });
  const openWelcome = () => setOverlay({ name: 'welcome' });

  const renderContent = () => {
    if (overlay.name === 'welcome') {
      return <WelcomeScreen isRevisit onDone={() => setOverlay({ name: 'none' })} />;
    }
    if (overlay.name === 'scanner') {
      return (
        <ScannerScreen
          incomingShare={overlay.incomingShare}
          onClose={() => setOverlay({ name: 'none' })}
          onSavedToTrip={(tripId) => setOverlay({ name: 'trip', tripId })}
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
          onBack={() => setOverlay({ name: 'trip', tripId: overlay.tripId })}
        />
      );
    }
    if (overlay.name === 'trip') {
      return (
        <TripDetailScreen
          tripId={overlay.tripId}
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
        return <SharedTripsScreen onOpenTrip={openTrip} />;
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

  return (
    <View style={styles.shell}>
      <View style={{ flex: 1 }}>{renderContent()}</View>

      {showBottomBar && (
        <View style={styles.bottomNav}>
          <NavButton
            emoji="🧳"
            label="Trips"
            active={overlay.name === 'none' && activeTab === 'trips'}
            onPress={() => {
              setOverlay({ name: 'none' });
              setActiveTab('trips');
            }}
          />
          <NavButton
            emoji="🗺️"
            label="Map"
            active={overlay.name === 'none' && activeTab === 'map'}
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

          <NavButton
            emoji="💌"
            label="Shared"
            active={overlay.name === 'none' && activeTab === 'shared'}
            onPress={() => {
              setOverlay({ name: 'none' });
              setActiveTab('shared');
            }}
          />
          <NavButton
            emoji="🛂"
            label="Passport"
            active={overlay.name === 'none' && activeTab === 'passport'}
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

const NavButton = ({
  emoji,
  label,
  active,
  onPress,
}: {
  emoji: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity onPress={onPress} style={styles.navBtn} activeOpacity={0.75}>
    <Text style={styles.navEmoji}>{emoji}</Text>
    <Text
      style={[styles.navLabel, active && styles.navLabelActive]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <StatusBar style="dark" />
          <MainShell />
        </SafeAreaView>
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 8,
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  navBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
    gap: 2,
  },
  navEmoji: { fontSize: 20 },
  navLabel: { fontSize: 11, fontWeight: '700', color: COLORS.inkSoft },
  navLabelActive: { color: COLORS.coralDark, fontWeight: '900' },
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
    borderColor: '#FFFFFF',
    ...SHADOWS.fab,
  },
  fabIcon: { fontSize: 24 },
});
