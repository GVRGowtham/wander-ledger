import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { NewTripScreen } from './src/screens/NewTripScreen';
import { PassportScreen } from './src/screens/PassportScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { SharedTripsScreen } from './src/screens/SharedTripsScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { TripsHubScreen } from './src/screens/TripsHubScreen';
import { WorldMapScreen } from './src/screens/WorldMapScreen';
import { COLORS, SHADOWS } from './src/theme/tokens';

type MainTab = 'trips' | 'map' | 'shared' | 'passport';
type OverlayRoute =
  | { name: 'none' }
  | { name: 'trip'; tripId: string }
  | { name: 'new_trip' }
  | { name: 'scanner' };

const MainShell: React.FC = () => {
  const { ready, profile } = useApp();
  const [activeTab, setActiveTab] = useState<MainTab>('trips');
  const [overlay, setOverlay] = useState<OverlayRoute>({ name: 'none' });

  // Handle Android hardware Back button gracefully
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
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
        <Text style={{ fontSize: 40 }}>✈️</Text>
        <ActivityIndicator color={COLORS.coral} style={{ marginTop: 12 }} />
      </View>
    );
  }

  if (!profile) {
    return <LoginScreen />;
  }

  const openTrip = (tripId: string) => setOverlay({ name: 'trip', tripId });
  const openScanner = () => setOverlay({ name: 'scanner' });
  const openNewTrip = () => setOverlay({ name: 'new_trip' });

  const renderContent = () => {
    if (overlay.name === 'scanner') {
      return (
        <ScannerScreen
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
    if (overlay.name === 'trip') {
      return (
        <TripDetailScreen
          tripId={overlay.tripId}
          onBack={() => setOverlay({ name: 'none' })}
          onOpenScanner={openScanner}
        />
      );
    }

    switch (activeTab) {
      case 'map':
        return <WorldMapScreen onOpenTrip={openTrip} />;
      case 'shared':
        return <SharedTripsScreen onOpenTrip={openTrip} />;
      case 'passport':
        return <PassportScreen />;
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

  const showBottomBar = overlay.name !== 'scanner';

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
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
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
    paddingBottom: 8,
    paddingHorizontal: 6,
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
