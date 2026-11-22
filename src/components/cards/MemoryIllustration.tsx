import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';
import { Memory } from '../../types/models';

interface Props {
  photoUri?: string;
  illustrationKey?: Memory['illustrationKey'];
  height?: number;
}

export const MemoryIllustration: React.FC<Props> = ({
  photoUri,
  illustrationKey = 'torii',
  height = 148,
}) => {
  if (photoUri) {
    return (
      <View style={[styles.frame, { height }]}>
        <Image source={{ uri: photoUri }} style={styles.img} resizeMode="cover" />
      </View>
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      {illustrationKey === 'torii' && (
        <Svg viewBox="0 0 240 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="mTorii" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#FDE68A" />
              <Stop offset="55%" stopColor="#FCA5A5" />
              <Stop offset="100%" stopColor="#F97316" />
            </LinearGradient>
          </Defs>
          <Rect width="240" height="120" fill="url(#mTorii)" />
          <Circle cx="192" cy="30" r="18" fill="#FFFBEB" opacity={0.9} />
          <Rect x="24" y="20" width="192" height="9" rx="3" fill="#DC2626" />
          <Rect x="36" y="29" width="11" height="91" fill="#B91C1C" />
          <Rect x="193" y="29" width="11" height="91" fill="#B91C1C" />
          <Rect x="58" y="34" width="124" height="7" rx="2" fill="#EF4444" />
          <Rect x="67" y="41" width="8" height="79" fill="#DC2626" />
          <Rect x="165" y="41" width="8" height="79" fill="#DC2626" />
          <Polygon points="84,120 112,72 128,72 156,120" fill="#FEF3C7" opacity={0.88} />
        </Svg>
      )}
      {illustrationKey === 'matcha' && (
        <Svg viewBox="0 0 240 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="mTea" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#D1FAE5" />
              <Stop offset="100%" stopColor="#A7F3D0" />
            </LinearGradient>
          </Defs>
          <Rect width="240" height="120" fill="url(#mTea)" />
          <Ellipse cx="118" cy="92" rx="64" ry="14" fill="#065F46" opacity={0.18} />
          <Path d="M78 54 C78 96 158 96 158 54 Z" fill="#1E293B" />
          <Ellipse cx="118" cy="54" rx="40" ry="11" fill="#10B981" />
          <Ellipse cx="118" cy="54" rx="30" ry="7" fill="#6EE7B7" />
          <Path d="M104 40 Q98 26 106 16" stroke="#059669" strokeWidth="3" fill="none" strokeLinecap="round" opacity={0.5} />
          <Path d="M124 38 Q118 24 126 14" stroke="#059669" strokeWidth="3" fill="none" strokeLinecap="round" opacity={0.5} />
          <Circle cx="182" cy="70" r="9" fill="#F472B6" />
          <Circle cx="198" cy="75" r="9" fill="#FFFBEB" />
          <Circle cx="214" cy="80" r="9" fill="#4ADE80" />
        </Svg>
      )}
      {illustrationKey === 'tram' && (
        <Svg viewBox="0 0 240 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="mTram" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#F59E0B" />
              <Stop offset="65%" stopColor="#FDBA74" />
              <Stop offset="100%" stopColor="#FEF3C7" />
            </LinearGradient>
          </Defs>
          <Rect width="240" height="120" fill="url(#mTram)" />
          <Rect x="0" y="92" width="240" height="28" fill="#78716C" />
          <Rect x="64" y="34" width="112" height="62" rx="12" fill="#FACC15" stroke="#CA8A04" strokeWidth="3" />
          <Rect x="76" y="44" width="38" height="24" rx="4" fill="#E0F2FE" />
          <Rect x="124" y="44" width="38" height="24" rx="4" fill="#E0F2FE" />
          <Circle cx="86" cy="82" r="5" fill="#FFFBEB" />
          <Circle cx="154" cy="82" r="5" fill="#FFFBEB" />
        </Svg>
      )}
      {(illustrationKey === 'beach' || illustrationKey === 'coast' || illustrationKey === 'alpine') && (
        <Svg viewBox="0 0 240 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="mBeach" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#38BDF8" />
              <Stop offset="65%" stopColor="#FDE68A" />
              <Stop offset="100%" stopColor="#FDBA74" />
            </LinearGradient>
          </Defs>
          <Rect width="240" height="120" fill="url(#mBeach)" />
          <Circle cx="120" cy="54" r="22" fill="#FFFBEB" opacity={0.92} />
          <Rect x="0" y="72" width="240" height="24" fill="#0EA5E9" />
          <Rect x="0" y="96" width="240" height="24" fill="#FDE68A" />
          <Path d="M40 120 Q50 82 66 56" stroke="#78350F" strokeWidth="5" fill="none" strokeLinecap="round" />
          <Path d="M66 56 Q40 48 28 60" stroke="#059669" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <Path d="M66 56 Q90 46 102 58" stroke="#10B981" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FEF3C7',
  },
  img: {
    width: '100%',
    height: '100%',
  },
});
