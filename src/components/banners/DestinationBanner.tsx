import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';
import { TripVibe } from '../../types/models';

interface Props {
  vibe: TripVibe;
  coverPhotoUri?: string;
  height?: number;
}

export const DestinationBanner: React.FC<Props> = ({
  vibe,
  coverPhotoUri,
  height = 136,
}) => {
  if (coverPhotoUri) {
    return (
      <View style={[styles.container, { height }]}>
        <Image source={{ uri: coverPhotoUri }} style={styles.photo} resizeMode="cover" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      {vibe === 'japan' && <JapanSvg />}
      {vibe === 'coastal' && <CoastalSvg />}
      {vibe === 'alpine' && <AlpineSvg />}
      {vibe === 'tropical' && <TropicalSvg />}
      {vibe === 'desert' && <DesertSvg />}
      {vibe === 'city' && <CitySvg />}
    </View>
  );
};

const JapanSvg = () => (
  <Svg viewBox="0 0 320 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <Defs>
      <LinearGradient id="skyJp" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#FB7185" />
        <Stop offset="55%" stopColor="#FDBA74" />
        <Stop offset="100%" stopColor="#FEF3C7" />
      </LinearGradient>
    </Defs>
    <Rect width="320" height="120" fill="url(#skyJp)" />
    <Circle cx="250" cy="36" r="22" fill="#FFF7ED" opacity={0.92} />
    <Ellipse cx="68" cy="28" rx="26" ry="8" fill="#FFFFFF" opacity={0.55} />
    <Ellipse cx="88" cy="24" rx="18" ry="7" fill="#FFFFFF" opacity={0.65} />
    <Ellipse cx="195" cy="22" rx="22" ry="6" fill="#FFFFFF" opacity={0.45} />
    {/* Mt. Fuji */}
    <Path d="M88 120 L168 38 L248 120 Z" fill="#4338CA" opacity={0.85} />
    <Path d="M168 38 L146 60 L158 56 L168 64 L178 56 L190 60 Z" fill="#FFFFFF" />
    {/* Warm foreground hills */}
    <Path d="M0 120 Q60 76 132 120 Z" fill="#F97316" opacity={0.62} />
    <Path d="M198 120 Q264 78 320 108 L320 120 Z" fill="#EA580C" opacity={0.68} />
    {/* Torii Gate */}
    <G transform="translate(34, 62)">
      <Rect x="0" y="6" width="46" height="5.5" rx="2.5" fill="#DC2626" />
      <Rect x="4" y="16" width="38" height="3.5" fill="#DC2626" />
      <Rect x="8" y="10" width="5" height="44" fill="#B91C1C" />
      <Rect x="33" y="10" width="5" height="44" fill="#B91C1C" />
    </G>
    <Circle cx="112" cy="48" r="2.5" fill="#FFE4E6" />
    <Circle cx="136" cy="30" r="2" fill="#FFE4E6" />
    <Circle cx="284" cy="54" r="2.5" fill="#FFE4E6" />
  </Svg>
);

const CoastalSvg = () => (
  <Svg viewBox="0 0 320 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <Defs>
      <LinearGradient id="skyCoast" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#38BDF8" />
        <Stop offset="60%" stopColor="#7DD3FC" />
        <Stop offset="100%" stopColor="#FEF3C7" />
      </LinearGradient>
    </Defs>
    <Rect width="320" height="120" fill="url(#skyCoast)" />
    <Circle cx="72" cy="34" r="19" fill="#FEF08A" opacity={0.95} />
    {/* Sea */}
    <Rect x="0" y="76" width="320" height="44" fill="#0284C7" />
    <Path d="M0 90 Q40 84 80 90 T160 90 T240 90 T320 90" stroke="#7DD3FC" strokeWidth="2.5" fill="none" opacity={0.65} />
    <Path d="M20 104 Q60 98 100 104 T180 104 T260 104 T340 104" stroke="#BAE6FD" strokeWidth="2" fill="none" opacity={0.5} />
    {/* Mediterranean Cliff & Terracotta Houses */}
    <Path d="M175 120 L195 52 L265 40 L320 56 L320 120 Z" fill="#D97706" opacity={0.85} />
    <Rect x="206" y="48" width="22" height="20" fill="#FFFBEB" />
    <Polygon points="204,48 217,39 230,48" fill="#EA580C" />
    <Rect x="234" y="42" width="24" height="24" fill="#FEF3C7" />
    <Polygon points="232,42 246,32 260,42" fill="#DC2626" />
    <Rect x="266" y="50" width="22" height="18" fill="#FFEDD5" />
    <Polygon points="264,50 277,42 290,50" fill="#F97316" />
    {/* Sailboat */}
    <Polygon points="92,86 106,56 108,86" fill="#FFFFFF" />
    <Path d="M84 86 L116 86 L110 93 L90 93 Z" fill="#F43F5E" />
  </Svg>
);

const AlpineSvg = () => (
  <Svg viewBox="0 0 320 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <Defs>
      <LinearGradient id="skyAlp" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#6366F1" />
        <Stop offset="60%" stopColor="#A5B4FC" />
        <Stop offset="100%" stopColor="#E0E7FF" />
      </LinearGradient>
    </Defs>
    <Rect width="320" height="120" fill="url(#skyAlp)" />
    <Circle cx="255" cy="30" r="16" fill="#FEF9C3" opacity={0.95} />
    {/* Peaks */}
    <Polygon points="10,120 90,34 170,120" fill="#312E81" opacity={0.85} />
    <Polygon points="90,34 72,58 84,54 92,62 102,55 110,59" fill="#FFFFFF" />
    <Polygon points="110,120 205,24 300,120" fill="#4338CA" />
    <Polygon points="205,24 184,52 198,48 208,58 218,49 228,54" fill="#FFFFFF" />
    {/* Pine trees */}
    <Polygon points="44,120 56,82 68,120" fill="#065F46" />
    <Polygon points="66,120 76,90 86,120" fill="#047857" />
    <Polygon points="256,120 270,78 284,120" fill="#065F46" />
    <Polygon points="280,120 292,88 304,120" fill="#059669" />
  </Svg>
);

const TropicalSvg = () => (
  <Svg viewBox="0 0 320 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <Defs>
      <LinearGradient id="skyTrop" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#06B6D4" />
        <Stop offset="55%" stopColor="#67E8F9" />
        <Stop offset="100%" stopColor="#FEF08A" />
      </LinearGradient>
    </Defs>
    <Rect width="320" height="120" fill="url(#skyTrop)" />
    <Circle cx="160" cy="54" r="24" fill="#FDE047" opacity={0.92} />
    {/* Lagoon */}
    <Rect x="0" y="76" width="320" height="44" fill="#0D9488" />
    <Path d="M0 98 Q80 86 160 100 T320 96 L320 120 L0 120 Z" fill="#FDE68A" />
    {/* Palm Silhouette Left */}
    <Path d="M36 120 Q46 80 62 56" stroke="#78350F" strokeWidth="6" fill="none" strokeLinecap="round" />
    <Path d="M62 56 Q34 46 22 62" stroke="#059669" strokeWidth="5" fill="none" strokeLinecap="round" />
    <Path d="M62 56 Q84 42 98 54" stroke="#10B981" strokeWidth="5" fill="none" strokeLinecap="round" />
    <Path d="M62 56 Q56 32 76 34" stroke="#059669" strokeWidth="4.5" fill="none" strokeLinecap="round" />
    {/* Palm Right */}
    <Path d="M286 120 Q276 86 264 62" stroke="#78350F" strokeWidth="5" fill="none" strokeLinecap="round" />
    <Path d="M264 62 Q290 50 304 64" stroke="#059669" strokeWidth="4.5" fill="none" strokeLinecap="round" />
    <Path d="M264 62 Q242 48 228 60" stroke="#10B981" strokeWidth="4.5" fill="none" strokeLinecap="round" />
  </Svg>
);

const DesertSvg = () => (
  <Svg viewBox="0 0 320 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <Defs>
      <LinearGradient id="skyDes" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#EA580C" />
        <Stop offset="55%" stopColor="#FB923C" />
        <Stop offset="100%" stopColor="#FDE68A" />
      </LinearGradient>
    </Defs>
    <Rect width="320" height="120" fill="url(#skyDes)" />
    <Circle cx="160" cy="46" r="24" fill="#FFFBEB" opacity={0.92} />
    {/* Dunes */}
    <Path d="M0 120 Q80 62 175 95 T320 82 L320 120 Z" fill="#D97706" />
    <Path d="M0 120 Q110 78 215 106 T320 96 L320 120 Z" fill="#B45309" />
    {/* Palace dome silhouette */}
    <G transform="translate(218, 46)" opacity={0.85}>
      <Path d="M12 36 Q26 10 40 36 Z" fill="#7C2D12" />
      <Rect x="6" y="36" width="40" height="18" fill="#7C2D12" />
      <Rect x="2" y="20" width="4" height="34" fill="#7C2D12" />
      <Rect x="46" y="20" width="4" height="34" fill="#7C2D12" />
    </G>
  </Svg>
);

const CitySvg = () => (
  <Svg viewBox="0 0 320 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <Defs>
      <LinearGradient id="skyCity" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#312E81" />
        <Stop offset="60%" stopColor="#7C3AED" />
        <Stop offset="100%" stopColor="#FB7185" />
      </LinearGradient>
    </Defs>
    <Rect width="320" height="120" fill="url(#skyCity)" />
    <Circle cx="268" cy="28" r="14" fill="#FEF9C3" opacity={0.9} />
    <Circle cx="46" cy="24" r="1.8" fill="#FFFFFF" />
    <Circle cx="94" cy="18" r="1.5" fill="#FFFFFF" />
    <Circle cx="182" cy="22" r="2" fill="#FFFFFF" />
    {/* Skyline */}
    <Rect x="18" y="64" width="28" height="56" fill="#1E1B4B" />
    <Rect x="52" y="42" width="32" height="78" fill="#312E81" />
    <Rect x="90" y="54" width="26" height="66" fill="#1E1B4B" />
    <Rect x="122" y="26" width="30" height="94" fill="#312E81" />
    <Polygon points="137,10 132,26 142,26" fill="#FDE047" />
    <Rect x="158" y="48" width="36" height="72" fill="#1E1B4B" />
    <Rect x="200" y="38" width="28" height="82" fill="#312E81" />
    <Rect x="234" y="58" width="34" height="62" fill="#1E1B4B" />
    <Rect x="274" y="46" width="32" height="74" fill="#312E81" />
    {/* Glowing windows */}
    <Rect x="60" y="52" width="5" height="6" fill="#FDE047" />
    <Rect x="70" y="64" width="5" height="6" fill="#FDE047" />
    <Rect x="130" y="38" width="6" height="6" fill="#FDE047" />
    <Rect x="140" y="52" width="6" height="6" fill="#FDE047" />
    <Rect x="208" y="48" width="5" height="6" fill="#FDE047" />
  </Svg>
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#FED7AA',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
});
